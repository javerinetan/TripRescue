// Offline tests for the x402 layer, mandate policy and idempotency store.
// These cover the safety invariants in docs/BUILD_PLAN.md that do not require
// a live XRPL connection.

import test from "node:test";
import assert from "node:assert/strict";

import {
  HEADER_REQUIRED,
  HEADER_SIGNATURE,
  NETWORK_TESTNET,
  buildPaymentRequirements,
  buildPaymentSignature,
  decodeHeader,
  encodeHeader,
  invoiceIdFor,
  parsePaymentSignature,
  toContractRequirement,
} from "./x402.js";
import { getOffer, getOfferForSupplier, listOffers } from "./suppliers.js";
import {
  DEMO_MANDATE,
  evaluatePurchase,
  recordSpend,
  releaseSpend,
  remainingBudget,
  resetMandates,
} from "./mandate.js";
import { FAULT_MODES, clearFault, currentFault, setFault, shouldFail } from "./faults.js";
import {
  bindIdempotencyKey,
  claimIdempotencyKey,
  createExecution,
  fingerprint,
  isExpired,
  resetExecutions,
} from "./executions.js";

test("x402 header names follow the XRPL x402 specification", () => {
  assert.equal(HEADER_REQUIRED, "PAYMENT-REQUIRED");
  assert.equal(HEADER_SIGNATURE, "PAYMENT-SIGNATURE");
  assert.equal(NETWORK_TESTNET, "xrpl:1");
});

test("payment requirements round-trip through a base64 header", () => {
  const offer = getOffer("offer-protected-transfer-001");
  const requirements = buildPaymentRequirements({
    offer,
    payTo: "rMerchant",
    sourceTag: 20260530,
    recoveryId: "recovery-tokyo-001",
  });
  const decoded = decodeHeader(encodeHeader(requirements));
  const accepted = decoded.accepts[0];

  assert.equal(decoded.x402Version, 2);
  assert.equal(accepted.scheme, "exact");
  assert.equal(accepted.network, "xrpl:1");
  assert.equal(accepted.asset, "XRP");
  assert.equal(accepted.payTo, "rMerchant");
  assert.equal(accepted.amount, offer.amountDrops);
  assert.equal(accepted.extra.invoiceId, "recovery-tokyo-001:offer-protected-transfer-001");
});

test("the contract requirement mirrors the wire requirement", () => {
  const offer = getOffer("offer-protected-transfer-001");
  const requirements = buildPaymentRequirements({
    offer,
    payTo: "rMerchant",
    sourceTag: 20260530,
    recoveryId: "recovery-tokyo-001",
  });
  const contract = toContractRequirement(requirements, { requirementId: "requirement-1" });

  assert.equal(contract.destination, "rMerchant");
  assert.equal(contract.amountDrops, offer.amountDrops);
  assert.equal(contract.memo, invoiceIdFor("recovery-tokyo-001", offer.id));
});

test("a malformed or wrong-version payment signature is rejected", () => {
  assert.equal(parsePaymentSignature(undefined).ok, false);
  assert.equal(parsePaymentSignature("not-base64-json").ok, false);
  assert.equal(parsePaymentSignature(encodeHeader({ x402Version: 1 })).ok, false);
  assert.equal(parsePaymentSignature(encodeHeader({ x402Version: 2, payload: {} })).ok, false);

  const good = encodeHeader(buildPaymentSignature({ accepted: {}, signedTxBlob: "1200002280000000" }));
  assert.equal(parsePaymentSignature(good).ok, true);
});

test("offers are only reachable through their own supplier", () => {
  assert.ok(getOfferForSupplier("supplier-protected-transfer", "offer-protected-transfer-001"));
  assert.equal(getOfferForSupplier("supplier-flex-transfer", "offer-protected-transfer-001"), null);
});

test("the registry advertises every offer as x402-payable", () => {
  const offers = listOffers();
  assert.ok(offers.length >= 3);
  assert.ok(offers.every((offer) => offer.supportsX402 && offer.resourcePath.startsWith("/api/suppliers/")));
});

// --- Mandate enforcement (invariant 1) --------------------------------------

test("a compliant offer passes the mandate", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: DEMO_MANDATE.id,
    offer: getOffer("offer-protected-transfer-001"),
    network: NETWORK_TESTNET,
  });
  assert.deepEqual(violations, []);
});

test("a supplier outside the allow-list is rejected", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: DEMO_MANDATE.id,
    offer: getOffer("offer-flex-transfer-002"),
    network: NETWORK_TESTNET,
  });
  assert.ok(violations.some((v) => v.code === "supplier-not-allowed"));
});

test("an offer that loses a preserved booking is rejected", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: DEMO_MANDATE.id,
    offer: { ...getOffer("offer-protected-transfer-001"), preservesBookingIds: ["hotel-hakone"] },
    network: NETWORK_TESTNET,
  });
  assert.ok(violations.some((v) => v.code === "required-booking-lost"));
});

test("an arrival after the deadline is rejected", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: DEMO_MANDATE.id,
    offer: { ...getOffer("offer-protected-transfer-001"), arrivalTime: "2026-09-05T18:00:00+09:00" },
    network: NETWORK_TESTNET,
  });
  assert.ok(violations.some((v) => v.code === "arrival-too-late"));
});

test("the wrong network is rejected", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: DEMO_MANDATE.id,
    offer: getOffer("offer-protected-transfer-001"),
    network: "xrpl:0",
  });
  assert.ok(violations.some((v) => v.code === "wrong-network"));
});

test("spending the budget down blocks the next purchase", () => {
  resetMandates();
  const offer = getOffer("offer-protected-transfer-001");
  // Authorized budget is S$300; leave less than this offer's S$48 price.
  recordSpend(DEMO_MANDATE.id, 29000);
  const violations = evaluatePurchase({ mandateId: DEMO_MANDATE.id, offer, network: NETWORK_TESTNET });
  assert.ok(violations.some((v) => v.code === "budget-exceeded"));
});

test("an unknown mandate authorizes nothing", () => {
  resetMandates();
  const violations = evaluatePurchase({
    mandateId: "mandate-does-not-exist",
    offer: getOffer("offer-protected-transfer-001"),
    network: NETWORK_TESTNET,
  });
  assert.ok(violations.length > 0);
});

// --- Idempotency (invariant 3) ----------------------------------------------

test("the same key with the same parameters replays instead of paying twice", () => {
  resetExecutions();
  const print = fingerprint({
    requirementId: "requirement-1",
    offerId: "offer-protected-transfer-001",
    amountDrops: "48000",
    destination: "rMerchant",
  });
  createExecution({ executionId: "execution-1", fingerprint: print, status: "settled" });
  bindIdempotencyKey("key-1", "execution-1");

  const claim = claimIdempotencyKey("key-1", print);
  assert.equal(claim.status, "replay");
  assert.equal(claim.execution.executionId, "execution-1");
});

test("the same key with different parameters is a conflict", () => {
  resetExecutions();
  const print = fingerprint({
    requirementId: "requirement-1",
    offerId: "offer-protected-transfer-001",
    amountDrops: "48000",
    destination: "rMerchant",
  });
  createExecution({ executionId: "execution-1", fingerprint: print, status: "settled" });
  bindIdempotencyKey("key-1", "execution-1");

  const other = fingerprint({
    requirementId: "requirement-2",
    offerId: "offer-express-rail-003",
    amountDrops: "61000",
    destination: "rMerchant",
  });
  assert.equal(claimIdempotencyKey("key-1", other).status, "conflict");
});

test("an unused key is new", () => {
  resetExecutions();
  assert.equal(claimIdempotencyKey("fresh-key", "abc").status, "new");
});

test("an expired requirement is detected", () => {
  assert.equal(isExpired({ expiresAt: "2000-01-01T00:00:00Z" }), true);
  assert.equal(isExpired({ expiresAt: "2999-01-01T00:00:00Z" }), false);
});

// --- Fault injection and failure handling (invariant 4) ----------------------

test("fault modes are constrained to the known set", () => {
  clearFault();
  assert.equal(setFault("not-a-mode").ok, false);
  assert.equal(currentFault(), FAULT_MODES.NONE);

  assert.equal(setFault(FAULT_MODES.SETTLEMENT_FAIL).ok, true);
  assert.equal(currentFault(), FAULT_MODES.SETTLEMENT_FAIL);
  assert.equal(shouldFail(FAULT_MODES.SETTLEMENT_FAIL), true);
  assert.equal(shouldFail(FAULT_MODES.SUPPLIER_UNAVAILABLE), false);

  clearFault();
  assert.equal(currentFault(), FAULT_MODES.NONE);
});

test("a released budget can be spent again after a failed settlement", () => {
  resetMandates();
  const offer = getOffer("offer-protected-transfer-001");

  // Reserve, then release as the settlement path does when submission throws.
  recordSpend(DEMO_MANDATE.id, offer.price.minorUnits);
  assert.equal(remainingBudget(DEMO_MANDATE.id), 30000 - offer.price.minorUnits);

  releaseSpend(DEMO_MANDATE.id, offer.price.minorUnits);
  assert.equal(remainingBudget(DEMO_MANDATE.id), 30000);

  // And the offer is purchasable again, so a failure does not strand budget.
  assert.deepEqual(
    evaluatePurchase({ mandateId: DEMO_MANDATE.id, offer, network: NETWORK_TESTNET }),
    [],
  );
});

test("releasing budget never drives the mandate negative", () => {
  resetMandates();
  releaseSpend(DEMO_MANDATE.id, 999999);
  assert.equal(remainingBudget(DEMO_MANDATE.id), 30000);
});
