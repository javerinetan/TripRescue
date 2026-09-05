// Supplier, x402 and payment routes (Javerine's ownership per docs/BUILD_PLAN.md).
//
// Flow, matching the canonical sequence in docs/BUILD_PLAN.md:
//   POST /api/recovery/analyze                        cascade assessment
//   POST /api/recovery/plans                          three whole-trip strategies
//   POST /api/recovery/offers                         discovery + economic decision
//   GET  /api/suppliers/registry                      runtime discovery
//   GET  /api/suppliers/:s/offers/:o/resource         402 challenge, later delivery
//   POST /api/payments/prepare                        mandate re-check + sign intent
//   POST /api/payments/execute                        supplier submits + verifies
//
// The agent is not pre-provisioned with suppliers: it learns them from the
// registry and learns their price from the 402 challenge.

import { Router } from "express";
import {
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_SIGNATURE,
  NETWORK_TESTNET,
  buildPaymentRequirements,
  encodeHeader,
  invoiceIdFor,
  parsePaymentSignature,
  toContractRequirement,
} from "./x402.js";
import { buildReservationHold, getOffer, getOfferForSupplier, listOffers } from "./suppliers.js";
import {
  DEMO_MANDATE,
  evaluatePurchase,
  formatSgd,
  getMandate,
  configureMandate,
  recordSpend,
  releaseSpend,
  remainingBudget,
  resetMandates,
} from "./mandate.js";
import {
  bindIdempotencyKey,
  claimIdempotencyKey,
  createExecution,
  fingerprint,
  getExecution,
  getRequirement,
  isExpired,
  newId,
  resetExecutions,
  saveRequirement,
  updateExecution,
} from "./executions.js";
import { publicWallets, signPaymentIntent, submitSignedBlob, verifySettlement } from "./xrpl.js";
import { analyzeCancellation, demoItinerary, generateRecoveryPlans } from "./recovery.js";
import { FAULT_MODES, clearFault, currentFault, setFault, shouldFail } from "./faults.js";
import { NoCompliantOfferError, decideSupplierOffer } from "./agent.js";
import { DEFAULT_PRIORITY, getPriority, listPriorities, rankerFor } from "./priorities.js";
import { describeProposal, interpretRequest, llmConfigured } from "./interpret.js";
import { DEFAULT_INCIDENT, TRIPS, getIncident, listIncidents, plansForIncident } from "./scenarios.js";
import { assessClaim } from "./claims.js";

const CONTRACT_VERSION = "1.0.0";
const DEMO_RECOVERY_ID = "recovery-tokyo-001";

// Which incident is currently surfaced. Trip Rescue is a monitor, so the
// disruption arrives rather than being chosen mid-flow; this is the demo's way
// of deciding which one arrives.
let activeIncidentId = DEFAULT_INCIDENT;

/**
 * Compares the client's echoed `accepted` block against the requirement this
 * supplier issued. Returns a reason string on mismatch, or null when it agrees.
 */
function acceptedMismatch(accepted, requirement) {
  if (!accepted || typeof accepted !== "object") return "PAYMENT-SIGNATURE did not echo an accepted requirement.";
  const checks = [
    [accepted.network === requirement.network, "network"],
    [String(accepted.amount) === String(requirement.amountDrops), "amount"],
    [accepted.payTo === requirement.destination, "destination"],
    [accepted.extra?.invoiceId === requirement.memo, "invoiceId"],
  ];
  const failed = checks.find(([ok]) => !ok);
  return failed ? `The accepted requirement disagrees on ${failed[1]}.` : null;
}

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    contractVersion: CONTRACT_VERSION,
    error: { code, message, retryable: status === 402 || status === 502, ...extra },
  });
}

export function createRouter() {
  const router = Router();

  // --- Runtime service discovery -------------------------------------------
  // The registry the agent reads to learn which suppliers exist at all.
  router.get("/suppliers/registry", (_req, res) => {
    res.json({
      contractVersion: CONTRACT_VERSION,
      suppliers: listOffers(getIncident(activeIncidentId).supplierCategory).map((offer) => ({
        id: offer.id,
        supplierId: offer.supplierId,
        title: offer.title,
        description: offer.description,
        price: offer.price,
        expiresAt: null,
        resourcePath: offer.resourcePath,
        supportsX402: true,
        arrivalTime: offer.arrivalTime,
        riskScore: offer.riskScore,
        preservesBookingIds: offer.preservesBookingIds,
      })),
    });
  });

  // What is still recoverable once the trip is back together.
  router.get("/recovery/claim", (req, res) => {
    const incident = getIncident(activeIncidentId);
    const assessments = analyzeCancellation({
      bookings: demoItinerary,
      canceledBookingId: incident.bookingId,
      replacementArrivalTime: incident.replacementArrivalTime,
    });
    const authorised = DEMO_MANDATE.maximumAdditionalSpend.minorUnits;
    const left = remainingBudget(DEMO_MANDATE.id) ?? authorised;
    res.json({
      contractVersion: CONTRACT_VERSION,
      ...assessClaim({
        bookings: demoItinerary,
        assessments,
        spentMinorUnits: Math.max(0, (getMandate(DEMO_MANDATE.id)?.maximumAdditionalSpend.minorUnits ?? authorised) - left),
      }),
    });
  });

  // --- Monitoring home ------------------------------------------------------

  router.get("/trips", (_req, res) => {
    const incident = getIncident(activeIncidentId);
    res.json({
      contractVersion: CONTRACT_VERSION,
      trips: TRIPS.map((trip) => ({
        ...trip,
        alert: trip.id === incident.tripId
          ? {
            incidentId: incident.id,
            severity: incident.severity,
            headline: incident.headline,
            detail: incident.detail,
            source: incident.source,
            detectedMinutesAgo: incident.detectedMinutesAgo,
          }
          : null,
      })),
      incidents: listIncidents(),
      activeIncidentId: incident.id,
    });
  });

  // Choose which monitored incident is live. A demo affordance, not a product
  // feature: in production the feeds decide this.
  router.post("/incidents/active", (req, res) => {
    const incident = getIncident(req.body?.incidentId);
    activeIncidentId = incident.id;
    resetMandates();
    resetExecutions();
    clearFault();
    res.json({ contractVersion: CONTRACT_VERSION, activeIncidentId: incident.id, incident });
  });

  // --- Traveller priorities -------------------------------------------------

  router.get("/priorities", (_req, res) => {
    res.json({ contractVersion: CONTRACT_VERSION, priorities: listPriorities(), default: DEFAULT_PRIORITY });
  });

  // Free text in, a proposed mandate out. The traveller still has to confirm it;
  // this endpoint never writes the mandate itself.
  router.post("/mandates/interpret", async (req, res) => {
    const result = await interpretRequest(req.body?.text);
    res.json({
      contractVersion: CONTRACT_VERSION,
      source: result.source,
      model: result.model ?? null,
      llmConfigured: llmConfigured(),
      proposal: result.proposal,
      preview: describeProposal(result.proposal),
      reasons: result.reasons,
      rejected: result.rejected,
    });
  });

  // Authorising a strategy writes the mandate. Priority sets the defaults; the
  // traveller may tighten or loosen the budget before authorising.
  router.post("/mandates/configure", (req, res) => {
    const priority = req.body?.priority ?? DEFAULT_PRIORITY;
    const overrides = {};
    const budget = req.body?.maximumAdditionalSpend?.minorUnits;
    if (Number.isInteger(budget) && budget > 0) {
      overrides.maximumAdditionalSpend = { currency: "SGD", minorUnits: budget };
    }
    if (typeof req.body?.arrivalDeadline === "string" && Number.isFinite(Date.parse(req.body.arrivalDeadline))) {
      overrides.arrivalDeadline = req.body.arrivalDeadline;
    }
    if (Array.isArray(req.body?.preserveBookingIds) && req.body.preserveBookingIds.length > 0) {
      overrides.preserveBookingIds = req.body.preserveBookingIds;
    }
    const mandate = configureMandate({
      priority,
      category: getIncident(activeIncidentId).supplierCategory,
      ...overrides,
    });
    res.json({
      contractVersion: CONTRACT_VERSION,
      mandate,
      remaining: { currency: "SGD", minorUnits: remainingBudget(mandate.id) },
    });
  });

  // --- Recovery domain (Min Xie's engine, exposed over HTTP) ----------------

  router.post("/recovery/analyze", (req, res) => {
    const { trigger, bookings } = req.body ?? {};
    const itinerary = Array.isArray(bookings) && bookings.length > 0 ? bookings : demoItinerary;
    const incident = getIncident(trigger?.incidentId ?? activeIncidentId);
    const canceledBookingId = trigger?.bookingId ?? incident.bookingId;
    const replacementArrivalTime = trigger?.replacementArrivalTime ?? incident.replacementArrivalTime;

    if (!itinerary.some((booking) => booking.id === canceledBookingId)) {
      return fail(res, 400, "invalid-request", `${canceledBookingId} is not in this itinerary.`);
    }

    res.json({
      contractVersion: CONTRACT_VERSION,
      recoveryId: DEMO_RECOVERY_ID,
      incident,
      bookings: itinerary,
      assessments: analyzeCancellation({ bookings: itinerary, canceledBookingId, replacementArrivalTime }),
    });
  });

  router.post("/recovery/plans", (req, res) => {
    const mandate = req.body?.mandate ?? getMandate(DEMO_MANDATE.id);
    if (!mandate) return fail(res, 404, "not-found", "No mandate supplied and no demo mandate registered.");

    const plans = plansForIncident(activeIncidentId, mandate);
    const compliant = plans.filter((plan) => plan.mandateCompliant);
    // Recommend the compliant plan that matches the traveller's priority, and
    // fall back to the lowest-risk compliant plan when that kind is not viable.
    const priority = getPriority(mandate.priority ?? DEFAULT_PRIORITY);
    const preferred = compliant.find((plan) => plan.kind === priority.preferredPlanKind);
    const recommended = preferred ?? compliant.slice().sort((a, b) => a.riskScore - b.riskScore)[0] ?? null;

    res.json({
      contractVersion: CONTRACT_VERSION,
      recoveryId: req.body?.recoveryId ?? DEMO_RECOVERY_ID,
      plans,
      recommendedPlanId: recommended?.id ?? null,
    });
  });

  // Discovery plus the economic decision. The ranking lives in agent.js, which
  // falls back to a deterministic safest-offer choice when the AI ranker is
  // unavailable or returns something incomplete.
  router.post("/recovery/offers", async (req, res) => {
    const mandateId = req.body?.mandateId ?? DEMO_MANDATE.id;
    const mandate = getMandate(mandateId);
    if (!mandate) return fail(res, 404, "not-found", `Mandate ${mandateId} is unknown.`);

    const plans = plansForIncident(activeIncidentId, mandate);
    const plan = plans.find(({ id }) => id === req.body?.planId) ?? plans[0];
    if (!plan) return fail(res, 404, "not-found", "No plan is available for this incident.");

    const offers = listOffers(getIncident(activeIncidentId).supplierCategory);
    try {
      const ranker = rankerFor(mandate.priority ?? DEFAULT_PRIORITY);
      const decision = await decideSupplierOffer({ offers, plan, mandate, ranker });

      const refused = offers.length - 1;
      decision.reasons.push(
        `${refused} of ${offers.length} discovered offers were refused by the mandate.`,
      );
      res.json({
        contractVersion: CONTRACT_VERSION,
        offers: offers.map((offer) => ({ ...offer, expiresAt: null })),
        decision,
      });
    } catch (error) {
      if (error instanceof NoCompliantOfferError) {
        return fail(res, 403, "mandate-violation", error.message, {
          details: { violations: error.violations },
        });
      }
      throw error;
    }
  });

  // --- Deliberate fault injection (demo only) -------------------------------
  router.post("/demo/fault", (req, res) => {
    const result = setFault(req.body?.mode ?? FAULT_MODES.NONE);
    if (!result.ok) {
      return fail(res, 400, "invalid-request", `Unknown fault mode. Allowed: ${result.allowed.join(", ")}.`);
    }
    if (result.mode === FAULT_MODES.BUDGET_EXHAUSTED) {
      // Spend the mandate down so the next purchase must be refused.
      const left = remainingBudget(DEMO_MANDATE.id) ?? 0;
      recordSpend(DEMO_MANDATE.id, Math.max(0, left - 100));
    }
    res.json({
      contractVersion: CONTRACT_VERSION,
      mode: result.mode,
      remaining: { currency: "SGD", minorUnits: remainingBudget(DEMO_MANDATE.id) },
    });
  });

  router.get("/demo/fault", (_req, res) => {
    res.json({ contractVersion: CONTRACT_VERSION, mode: currentFault(), modes: Object.values(FAULT_MODES) });
  });

  // Restores mandate budget and clears executions so the demo can be re-run.
  // Settled XRPL transactions are of course untouched; only local state resets.
  router.post("/demo/reset", (_req, res) => {
    resetMandates();
    resetExecutions();
    clearFault();
    activeIncidentId = DEFAULT_INCIDENT;
    res.json({ contractVersion: CONTRACT_VERSION, reset: true, mandate: DEMO_MANDATE });
  });

  router.get("/mandates/:mandateId", (req, res) => {
    const mandate = getMandate(req.params.mandateId);
    if (!mandate) return fail(res, 404, "not-found", `Mandate ${req.params.mandateId} is unknown.`);
    res.json({
      contractVersion: CONTRACT_VERSION,
      mandate,
      remaining: { currency: "SGD", minorUnits: remainingBudget(req.params.mandateId) },
    });
  });

  // --- Protected supplier resource -----------------------------------------
  router.get("/suppliers/:supplierId/offers/:offerId/resource", async (req, res) => {
    const { supplierId, offerId } = req.params;
    const offer = getOfferForSupplier(supplierId, offerId);
    if (!offer) return fail(res, 404, "not-found", `Offer ${offerId} is unknown for ${supplierId}.`);

    if (shouldFail(FAULT_MODES.SUPPLIER_UNAVAILABLE)) {
      return fail(res, 503, "supplier-unavailable", `${supplierId} is not responding. No payment was attempted.`);
    }

    const recoveryId = String(req.query.recoveryId || DEMO_RECOVERY_ID);
    const wallets = publicWallets();
    if (!wallets.configured) {
      return fail(res, 502, "settlement-failed", "Supplier wallet is not configured. Run npm run wallet:setup.");
    }

    const signatureHeader = req.get(HEADER_SIGNATURE);

    // No payment proof yet: issue the challenge.
    if (!signatureHeader) {
      const requirements = buildPaymentRequirements({
        offer,
        payTo: wallets.merchantAddress,
        sourceTag: 20260530,
        recoveryId,
      });
      const requirementId = newId("requirement");
      const contractRequirement = toContractRequirement(requirements, { requirementId });
      saveRequirement({
        ...contractRequirement,
        offerId: offer.id,
        supplierId: offer.supplierId,
        recoveryId,
        priceMinorUnits: offer.price.minorUnits,
      });

      res.set(HEADER_REQUIRED, encodeHeader(requirements));
      return res.status(402).json({
        contractVersion: CONTRACT_VERSION,
        error: {
          code: "payment-required",
          message: "A verified XRPL Testnet payment is required.",
          retryable: true,
        },
        paymentRequirement: contractRequirement,
      });
    }

    // Payment proof presented: verify on-ledger before releasing anything.
    const parsed = parsePaymentSignature(signatureHeader);
    if (!parsed.ok) return fail(res, 400, "invalid-request", parsed.reason);

    const executionId = String(req.query.executionId || "");
    const execution = getExecution(executionId);
    if (!execution) return fail(res, 404, "not-found", `Execution ${executionId} is unknown.`);
    if (execution.offerId !== offer.id) {
      return fail(res, 422, "payment-mismatch", "This execution paid for a different offer.");
    }
    if (execution.status === "delivered") {
      // Idempotent re-delivery: same hold, no second payment.
      res.set(HEADER_RESPONSE, encodeHeader({ settled: true, transactionHash: execution.transactionHash }));
      return res.json({ contractVersion: CONTRACT_VERSION, receipt: execution.receipt });
    }
    if (execution.status !== "settled") {
      return fail(res, 402, "payment-required", "This execution has not settled yet.");
    }

    const requirement = getRequirement(execution.requirementId);

    // The client echoes back the requirement it claims to have accepted. It must
    // match what this supplier actually issued, or the proof is for something else.
    const mismatch = acceptedMismatch(parsed.accepted, requirement);
    if (mismatch) return fail(res, 422, "payment-mismatch", mismatch);

    const verified = await verifySettlement(execution.transactionHash, {
      amountDrops: requirement.amountDrops,
      destination: requirement.destination,
      invoiceId: requirement.memo,
    }).catch((error) => ({ ok: false, reason: error.message }));

    if (!verified.ok) return fail(res, 422, "payment-mismatch", verified.reason);

    const receipt = {
      executionId: execution.executionId,
      planId: execution.planId,
      offerId: offer.id,
      status: "delivered",
      transactionHash: verified.hash,
      explorerUrl: verified.explorerUrl,
      deliveredResource: buildReservationHold(offer),
    };
    updateExecution(execution.executionId, { status: "delivered", receipt });

    res.set(HEADER_RESPONSE, encodeHeader({ settled: true, transactionHash: verified.hash }));
    return res.json({ contractVersion: CONTRACT_VERSION, receipt });
  });

  // --- Prepare payment ------------------------------------------------------
  router.post("/payments/prepare", async (req, res) => {
    const { requirementId, planId = "plan-reliable-001", mandateId = DEMO_MANDATE.id } = req.body ?? {};
    const requirement = getRequirement(requirementId);
    if (!requirement) return fail(res, 404, "not-found", `Requirement ${requirementId} is unknown.`);
    if (isExpired(requirement)) {
      return fail(res, 410, "requirement-expired", "This payment requirement has expired. Request the resource again.");
    }

    const offer = getOffer(requirement.offerId);
    // Server-side truth wins over anything the client sent.
    const violations = evaluatePurchase({ mandateId, offer, network: NETWORK_TESTNET });
    if (violations.length > 0) {
      return fail(res, 403, "mandate-violation", violations[0].explanation, { details: { violations } });
    }

    let intent;
    try {
      intent = await signPaymentIntent({
        amountDrops: requirement.amountDrops,
        destination: requirement.destination,
        invoiceId: requirement.memo,
      });
    } catch (error) {
      return fail(res, 502, "settlement-failed", error.message);
    }

    const executionId = newId("execution");
    createExecution({
      executionId,
      planId,
      mandateId,
      offerId: offer.id,
      requirementId,
      signedTxBlob: intent.signedTxBlob,
      expectedHash: intent.hash,
      status: "pending-payment",
      fingerprint: fingerprint({
        requirementId,
        offerId: offer.id,
        amountDrops: requirement.amountDrops,
        destination: requirement.destination,
      }),
    });

    // Note: signedTxBlob and seeds are deliberately not in this response.
    res.json({
      contractVersion: CONTRACT_VERSION,
      executionId,
      planId,
      offerId: offer.id,
      mandateId,
      preview: intent.preview,
      offer: { title: offer.title, price: offer.price, supplierId: offer.supplierId },
      budget: {
        authorized: getMandate(mandateId).maximumAdditionalSpend,
        remainingAfter: {
          currency: "SGD",
          minorUnits: remainingBudget(mandateId) - offer.price.minorUnits,
        },
      },
    });
  });

  // --- Execute payment ------------------------------------------------------
  router.post("/payments/execute", async (req, res) => {
    const { executionId, idempotencyKey } = req.body ?? {};
    const execution = getExecution(executionId);
    if (!execution) return fail(res, 404, "not-found", `Execution ${executionId} is unknown.`);

    const key = idempotencyKey || execution.executionId;
    const claim = claimIdempotencyKey(key, execution.fingerprint);
    if (claim.status === "conflict") {
      return fail(res, 409, "execution-conflict", "This idempotency key was already used with different parameters.");
    }
    if (claim.status === "replay" && claim.execution.receipt) {
      return res.json({ contractVersion: CONTRACT_VERSION, receipt: claim.execution.receipt, replayed: true });
    }
    if (execution.status === "settled" || execution.status === "delivered") {
      return res.json({ contractVersion: CONTRACT_VERSION, receipt: execution.receipt, replayed: true });
    }
    bindIdempotencyKey(key, execution.executionId);

    const requirement = getRequirement(execution.requirementId);
    if (isExpired(requirement)) {
      updateExecution(execution.executionId, { status: "failed" });
      return fail(res, 410, "requirement-expired", "The payment requirement expired before execution.");
    }

    const offer = getOffer(execution.offerId);
    // Re-check the mandate immediately before money moves.
    const violations = evaluatePurchase({ mandateId: execution.mandateId, offer, network: NETWORK_TESTNET });
    if (violations.length > 0) {
      updateExecution(execution.executionId, { status: "failed" });
      return fail(res, 403, "mandate-violation", violations[0].explanation, { details: { violations } });
    }

    // Reserve budget before submitting so a concurrent execution cannot double spend.
    recordSpend(execution.mandateId, offer.price.minorUnits);

    let settled;
    try {
      if (shouldFail(FAULT_MODES.SETTLEMENT_FAIL)) {
        throw new Error("XRPL settlement returned tecUNFUNDED_PAYMENT (injected fault).");
      }
      settled = await submitSignedBlob(execution.signedTxBlob, {
        executionId: execution.executionId,
        offerId: offer.id,
        invoiceId: requirement.memo,
      });
    } catch (error) {
      releaseSpend(execution.mandateId, offer.price.minorUnits);
      updateExecution(execution.executionId, { status: "failed" });
      return fail(res, 502, "settlement-failed", error.message);
    }

    const receipt = {
      executionId: execution.executionId,
      planId: execution.planId,
      offerId: offer.id,
      status: "settled",
      transactionHash: settled.hash,
      explorerUrl: settled.explorerUrl,
    };
    updateExecution(execution.executionId, {
      status: "settled",
      transactionHash: settled.hash,
      receipt,
    });

    res.json({
      contractVersion: CONTRACT_VERSION,
      receipt,
      spent: offer.price,
      remaining: { currency: "SGD", minorUnits: remainingBudget(execution.mandateId) },
      remainingLabel: formatSgd(remainingBudget(execution.mandateId)),
    });
  });

  return router;
}
