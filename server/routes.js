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
  acceptedRequirementsMatch,
  buildPaymentRequirements,
  buildPaymentSignature,
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
  getDecision,
  isExpired,
  newId,
  resetExecutions,
  saveDecision,
  saveRequirement,
  updateExecution,
} from "./executions.js";
import { publicWallets, signPaymentIntent, submitSignedBlob, verifySettlement } from "./xrpl.js";
import { analyzeCancellation, demoItinerary, generateRecoveryPlans } from "./recovery.js";
import { FAULT_MODES, clearFault, currentFault, setFault, shouldFail } from "./faults.js";
import { NoCompliantOfferError, decideSupplierOffer } from "./agent.js";
import { DEFAULT_PRIORITY, getPriority, listPriorities, rankerFor } from "./priorities.js";
import { createModelRanker } from "./model-ranker.js";
import { describeProposal, interpretRequest, llmConfigured } from "./interpret.js";
import { DEFAULT_INCIDENT, TRIPS, getIncident, listIncidents, plansForIncident, policyFor } from "./scenarios.js";
import { summariseChanges } from "./changes.js";
import { assessClaim } from "./claims.js";

const CONTRACT_VERSION = "1.0.0";
const DEMO_RECOVERY_ID = "recovery-tokyo-001";
const modelRanker = createModelRanker();

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

export function createRouter({
  publicWallets: getPublicWallets = publicWallets,
  signPaymentIntent: signIntent = signPaymentIntent,
  submitSignedBlob: submitBlob = submitSignedBlob,
  verifySettlement: verifyPayment = verifySettlement,
  ranker: injectedRanker = undefined,
} = {}) {
  const router = Router();
  const settlements = new Map();
  const ranker = injectedRanker ?? modelRanker;
  const getWallets = getPublicWallets;

  async function settleExecution(execution, idempotencyKey) {
    const key = idempotencyKey || execution.executionId;
    const claim = claimIdempotencyKey(key, execution.fingerprint);
    if (claim.status === "conflict") {
      return { error: [409, "execution-conflict", "This idempotency key was already used with different parameters."] };
    }
    const target = claim.status === "replay" ? claim.execution : execution;
    if (claim.status === "new") bindIdempotencyKey(key, target.executionId);
    if (["settled", "delivered"].includes(target.status)) return { execution: target, replayed: true };
    if (target.status === "failed") return { error: target.settlementError, replayed: true };

    const active = settlements.get(target.executionId);
    if (active) return { ...(await active), replayed: true };
    const operation = (async () => {
      const requirement = getRequirement(target.requirementId);
      if (!requirement) return { error: [404, "not-found", "Payment requirement is unknown."] };
      if (isExpired(requirement)) {
        const error = [410, "requirement-expired", "The payment requirement expired before execution."];
        updateExecution(target.executionId, { status: "failed", settlementError: error });
        return { error };
      }
      const offer = getOffer(target.offerId);
      const violations = evaluatePurchase({ mandateId: target.mandateId, offer, network: NETWORK_TESTNET });
      if (violations.length) {
        const error = [403, "mandate-violation", violations[0].explanation, { details: { violations } }];
        updateExecution(target.executionId, { status: "failed", settlementError: error });
        return { error };
      }
      recordSpend(target.mandateId, offer.price.minorUnits);
      let submitted;
      try {
        if (shouldFail(FAULT_MODES.SETTLEMENT_FAIL)) throw new Error("XRPL settlement returned tecUNFUNDED_PAYMENT (injected fault).");
        submitted = await submitBlob(target.signedTxBlob, { executionId: target.executionId, offerId: offer.id, invoiceId: requirement.memo });
      } catch (error) {
        releaseSpend(target.mandateId, offer.price.minorUnits);
        const settlementError = [502, "settlement-failed", error.message];
        updateExecution(target.executionId, { status: "failed", settlementError });
        return { error: settlementError };
      }
      const verified = await verifyPayment(submitted.hash, {
        amountDrops: requirement.amountDrops,
        destination: requirement.destination,
        invoiceId: requirement.memo,
      }).catch((error) => ({ ok: false, reason: error.message }));
      if (!verified.ok) {
        const error = [422, "payment-mismatch", verified.reason];
        updateExecution(target.executionId, { status: "failed", settlementError: error });
        return { error };
      }
      const receipt = {
        executionId: target.executionId,
        planId: target.planId,
        offerId: target.offerId,
        status: "settled",
        transactionHash: verified.hash,
        explorerUrl: verified.explorerUrl,
      };
      return { execution: updateExecution(target.executionId, { status: "settled", transactionHash: verified.hash, receipt }), offer };
    })();
    settlements.set(target.executionId, operation);
    try { return await operation; } finally { settlements.delete(target.executionId); }
  }

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
        policy: policyFor(incident.tripId),
      }),
    });
  });

  // Exactly what the agent changed, derived from the authorised plan and the
  // offer it actually bought.
  router.get("/recovery/changes", (req, res) => {
    const incident = getIncident(activeIncidentId);
    const mandate = getMandate(DEMO_MANDATE.id);
    const plans = plansForIncident(activeIncidentId, mandate ?? DEMO_MANDATE);
    const plan = plans.find(({ id }) => id === req.query.planId) ?? plans[0];
    const offer = req.query.offerId ? getOffer(String(req.query.offerId)) : null;
    const assessments = analyzeCancellation({
      bookings: demoItinerary,
      canceledBookingId: incident.bookingId,
      replacementArrivalTime: incident.replacementArrivalTime,
    });
    res.json({
      contractVersion: CONTRACT_VERSION,
      ...summariseChanges({ bookings: demoItinerary, incident, plan, offer, assessments }),
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
      modelAttempt: result.modelAttempt ?? null,
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
    const plan = plans.find(({ id }) => id === req.body?.planId);
    if (!plan) return fail(res, 404, "not-found", `Plan ${req.body?.planId} is unknown for this incident.`);

    const incident = getIncident(activeIncidentId);
    const offers = listOffers(incident.supplierCategory);
    try {
      const priority = getPriority(mandate.priority ?? DEFAULT_PRIORITY);
      const decision = await decideSupplierOffer({
        offers,
        plan,
        mandate,
        priority,
        ranker: ranker ?? rankerFor(mandate.priority ?? DEFAULT_PRIORITY),
      });
      const decisionId = newId("decision");
      saveDecision({
        decisionId,
        recoveryId: DEMO_RECOVERY_ID,
        incidentId: incident.id,
        supplierCategory: incident.supplierCategory,
        mandateId,
        planId: plan.id,
        selectedOfferId: decision.selectedOfferId,
        rankedOfferIds: decision.rankedOfferIds ?? [decision.selectedOfferId],
        decision,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const refused = decision.rejectedOffers?.length ?? offers.length - 1;
      decision.reasons.push(
        `${refused} of ${offers.length} discovered offers were refused by the mandate.`,
      );
      res.json({
        contractVersion: CONTRACT_VERSION,
        offers: offers.map((offer) => ({ ...offer, expiresAt: null })),
        decisionId,
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
    const wallets = getWallets();
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
        accepted: requirements.accepts[0],
        offerId: offer.id,
        supplierId: offer.supplierId,
        recoveryId,
        incidentId: activeIncidentId,
        supplierCategory: getIncident(activeIncidentId).supplierCategory,
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

    // Payment proof presented: the supplier owns settlement and delivery.
    const parsed = parsePaymentSignature(signatureHeader);
    if (!parsed.ok) return fail(res, 400, "invalid-request", parsed.reason);

    const executionId = String(req.query.executionId || "");
    const execution = getExecution(executionId);
    if (!execution) return fail(res, 404, "not-found", `Execution ${executionId} is unknown.`);
    if (execution.offerId !== offer.id) {
      return fail(res, 422, "payment-mismatch", "This execution paid for a different offer.");
    }
    const requirement = getRequirement(execution.requirementId);
    if (!requirement || !acceptedRequirementsMatch(parsed.accepted, requirement.accepted)
      || parsed.signedTxBlob !== execution.signedTxBlob) {
      return fail(res, 422, "payment-mismatch", "The payment signature does not match the prepared execution.");
    }

    const settled = await settleExecution(execution, req.get("Idempotency-Key") || execution.executionId);
    if (settled.error) return fail(res, ...settled.error);
    const current = settled.execution;
    if (current.status === "delivered") {
      res.set(HEADER_RESPONSE, encodeHeader({ settled: true, transactionHash: current.transactionHash }));
      return res.json({ contractVersion: CONTRACT_VERSION, receipt: current.receipt, replayed: true });
    }
    const receipt = {
      ...current.receipt,
      status: "delivered",
      deliveredResource: buildReservationHold(offer),
    };
    updateExecution(current.executionId, { status: "delivered", receipt });
    res.set(HEADER_RESPONSE, encodeHeader({ settled: true, transactionHash: current.transactionHash }));
    return res.json({ contractVersion: CONTRACT_VERSION, receipt, replayed: settled.replayed || undefined });
  });

  // --- Prepare payment ------------------------------------------------------
  router.post("/payments/prepare", async (req, res) => {
    const { requirementId, planId, decisionId, mandateId = DEMO_MANDATE.id } = req.body ?? {};
    const requirement = getRequirement(requirementId);
    if (!requirement) return fail(res, 404, "not-found", `Requirement ${requirementId} is unknown.`);
    if (isExpired(requirement)) return fail(res, 410, "requirement-expired", "This payment requirement has expired. Request the resource again.");

    const mandate = getMandate(mandateId);
    if (!mandate) return fail(res, 404, "not-found", `Mandate ${mandateId} is unknown.`);
    const decision = getDecision(decisionId);
    const incident = getIncident(requirement.incidentId ?? activeIncidentId);
    if (!decision) return fail(res, 404, "not-found", "The supplier decision is unknown. Discover offers again.");
    if (isExpired(decision)) return fail(res, 410, "requirement-expired", "The supplier decision expired. Discover offers again.");
    if (decision.recoveryId !== requirement.recoveryId || decision.incidentId !== incident.id
      || decision.mandateId !== mandateId || decision.planId !== planId) {
      return fail(res, 422, "payment-mismatch", "The decision does not match this payment requirement.");
    }

    const plan = plansForIncident(incident.id, mandate).find(({ id }) => id === planId);
    if (!plan) return fail(res, 404, "not-found", `Plan ${planId} is unknown for this incident.`);
    if (!plan.mandateCompliant) return fail(res, 403, "mandate-violation", plan.violations[0]?.explanation ?? "The plan is outside the mandate.", { details: { violations: plan.violations } });

    const offer = getOfferForSupplier(requirement.supplierId, requirement.offerId);
    if (!offer || decision.selectedOfferId !== offer.id || decision.supplierCategory !== incident.supplierCategory) {
      return fail(res, 422, "payment-mismatch", "The challenged offer is not the guarded decision for this incident.");
    }
    const violations = evaluatePurchase({ mandateId, offer, network: NETWORK_TESTNET });
    if (violations.length > 0) return fail(res, 403, "mandate-violation", violations[0].explanation, { details: { violations } });

    let intent;
    try {
      intent = await signIntent({ amountDrops: requirement.amountDrops, destination: requirement.destination, invoiceId: requirement.memo });
    } catch (error) {
      return fail(res, 502, "settlement-failed", error.message);
    }

    const executionId = newId("execution");
    createExecution({
      executionId,
      recoveryId: requirement.recoveryId,
      incidentId: incident.id,
      planId,
      mandateId,
      offerId: offer.id,
      requirementId,
      signedTxBlob: intent.signedTxBlob,
      expectedHash: intent.hash,
      status: "pending-payment",
      fingerprint: fingerprint({ recoveryId: requirement.recoveryId, incidentId: incident.id, planId, mandateId, offerId: offer.id, amountDrops: requirement.amountDrops, destination: requirement.destination }),
    });

    res.json({
      contractVersion: CONTRACT_VERSION,
      executionId,
      planId,
      offerId: offer.id,
      mandateId,
      paymentSignature: encodeHeader(buildPaymentSignature({ accepted: requirement.accepted, signedTxBlob: intent.signedTxBlob })),
      preview: intent.preview,
      offer: { title: offer.title, price: offer.price, supplierId: offer.supplierId },
      budget: { authorized: mandate.maximumAdditionalSpend, remainingAfter: { currency: "SGD", minorUnits: remainingBudget(mandateId) - offer.price.minorUnits } },
    });
  });

  // --- Execute payment ------------------------------------------------------
  router.post("/payments/execute", async (req, res) => {
    const { executionId, idempotencyKey } = req.body ?? {};
    const execution = getExecution(executionId);
    if (!execution) return fail(res, 404, "not-found", `Execution ${executionId} is unknown.`);
    const settled = await settleExecution(execution, idempotencyKey);
    if (settled.error) return fail(res, ...settled.error);
    const canonical = settled.execution;
    res.json({
      contractVersion: CONTRACT_VERSION,
      receipt: canonical.receipt,
      spent: { currency: "SGD", minorUnits: getOffer(canonical.offerId).price.minorUnits },
      remaining: { currency: "SGD", minorUnits: remainingBudget(canonical.mandateId) },
      remainingLabel: formatSgd(remainingBudget(canonical.mandateId)),
      replayed: settled.replayed || undefined,
    });
  });

  return router;
}
