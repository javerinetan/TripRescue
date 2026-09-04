// Supplier, x402 and payment routes (Javerine's ownership per docs/BUILD_PLAN.md).
//
// Flow, matching the canonical sequence in docs/BUILD_PLAN.md:
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
  recordSpend,
  releaseSpend,
  remainingBudget,
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
  saveRequirement,
  updateExecution,
} from "./executions.js";
import { publicWallets, signPaymentIntent, submitSignedBlob, verifySettlement } from "./xrpl.js";

const CONTRACT_VERSION = "1.0.0";

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
      suppliers: listOffers().map((offer) => ({
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

    const recoveryId = String(req.query.recoveryId || "recovery-tokyo-001");
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
