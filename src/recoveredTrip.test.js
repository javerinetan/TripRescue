import test from "node:test";
import assert from "node:assert/strict";
import { buildRecoveredTrip, buildRecoveryIdempotencyKey, resolveSelectedOffer } from "./recoveryOutcome.ts";

const plan = {
  id: "plan-reliable-001",
  title: "Protected recovery",
  arrivalTime: "2026-09-05T10:00:00+09:00",
  additionalCost: { currency: "SGD", minorUnits: 22000 },
  preservesBookingIds: ["activity-fuji"],
  actions: [],
};
const bookings = [
  { id: "activity-fuji", title: "Fuji activity", type: "activity" },
  { id: "return-flight", title: "Return flight", type: "flight" },
];

function receipt(overrides = {}) {
  return { executionId: "execution-1", planId: plan.id, offerId: "offer-1", status: "delivered", transactionHash: "ABC123", deliveredResource: { type: "reservation-hold", reference: "TR-HOLD-001", description: "Transfer held", expiresAt: "2099-01-01T00:00:00Z" }, ...overrides };
}

test("builds a recovered outcome only from verified delivery", () => {
  const outcome = buildRecoveredTrip({ plan, receipt: receipt(), bookings, assessments: [{ bookingId: "activity-fuji", status: "broken" }] });
  assert.equal(outcome.status, "recovered");
  assert.equal(outcome.bookings.length, 2);
  assert.equal(outcome.bookings[0].outcome, "preserved");
  assert.equal(outcome.bookings[1].outcome, "unchanged");
});

test("settled-only or mismatched receipts do not claim recovery", () => {
  assert.equal(buildRecoveredTrip({ plan, receipt: receipt({ status: "settled" }), bookings }), null);
  assert.equal(buildRecoveredTrip({ plan, receipt: receipt({ planId: "other-plan" }), bookings }), null);
  assert.equal(buildRecoveredTrip({ plan, receipt: receipt({ transactionHash: undefined }), bookings }), null);
});

test("logical key excludes transient execution identity", () => {
  assert.equal(buildRecoveryIdempotencyKey({ recoveryId: "recovery-tokyo-001", planId: plan.id, offerId: "offer-1" }), "recovery-tokyo-001:plan-reliable-001:offer-1");
});

test("selected offer must come from discovery", () => {
  assert.equal(resolveSelectedOffer([{ id: "offer-1" }], "offer-1").id, "offer-1");
  assert.throws(() => resolveSelectedOffer([{ id: "offer-1" }], "invented"), /not present/);
});
