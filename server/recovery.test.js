import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCancellation,
  demoItinerary,
  demoMandate,
  evaluateMandate,
  generateRecoveryPlans,
} from "./recovery.js";

test("classifies the fixed Tokyo itinerary after the flight cancellation", () => {
  const assessments = analyzeCancellation({
    bookings: demoItinerary,
    canceledBookingId: "flight-sin-nrt",
    replacementArrivalTime: "2026-09-05T09:30:00+09:00",
  });

  assert.deepEqual(
    assessments.map(({ bookingId, status, reasonCode }) => ({
      bookingId,
      status,
      reasonCode,
    })),
    [
      {
        bookingId: "flight-sin-nrt",
        status: "broken",
        reasonCode: "service-cancelled",
      },
      {
        bookingId: "bus-nrt-hakone",
        status: "broken",
        reasonCode: "time-window-missed",
      },
      {
        bookingId: "hotel-hakone",
        status: "at-risk",
        reasonCode: "no-show-risk",
      },
      {
        bookingId: "rental-hakone",
        status: "at-risk",
        reasonCode: "dependency-at-risk",
      },
      {
        bookingId: "activity-fuji",
        status: "broken",
        reasonCode: "time-window-missed",
      },
      {
        bookingId: "transfer-hakone-nrt",
        status: "safe",
        reasonCode: "unaffected",
      },
      {
        bookingId: "flight-nrt-sin",
        status: "safe",
        reasonCode: "unaffected",
      },
    ],
  );
});

test("leaves bookings outside the cancelled flight dependency chain safe", () => {
  const independentBooking = {
    id: "dinner-singapore",
    type: "activity",
    provider: "Local Restaurant",
    title: "Independent dinner booking",
    startTime: "2026-09-04T19:00:00+08:00",
    endTime: "2026-09-04T21:00:00+08:00",
    dependsOn: [],
    cost: { currency: "SGD", minorUnits: 5000 },
    refundable: true,
  };

  const assessments = analyzeCancellation({
    bookings: [...demoItinerary, independentBooking],
    canceledBookingId: "flight-sin-nrt",
    replacementArrivalTime: "2026-09-05T09:30:00+09:00",
  });
  const dinner = assessments.find(({ bookingId }) => bookingId === "dinner-singapore");

  assert.equal(dinner.status, "safe");
  assert.equal(dinner.reasonCode, "unaffected");
});

test("generates exactly three complete recovery strategies", () => {
  const plans = generateRecoveryPlans(demoMandate);

  assert.deepEqual(plans.map((plan) => plan.kind), [
    "fastest",
    "cheapest",
    "most-reliable",
  ]);
  assert.equal(plans.every((plan) => plan.actions.length > 0), true);
  assert.equal(plans.every((plan) => plan.explanation.length > 0), true);

  const reliable = plans.find((plan) => plan.kind === "most-reliable");
  assert.equal(reliable.mandateCompliant, true);
  assert.deepEqual(reliable.violations, []);
  assert.equal(reliable.preservesBookingIds.includes("activity-fuji"), true);
});

test("reports every hard Rescue Mandate violation", () => {
  const unsafePlan = {
    id: "plan-unsafe-001",
    kind: "fastest",
    title: "Unsafe plan",
    actions: [
      {
        id: "purchase-blocked-supplier",
        kind: "purchase",
        supplierId: "supplier-not-allowed",
        description: "Purchase an unapproved service.",
        incrementalCost: { currency: "SGD", minorUnits: 35000 },
        reversible: false,
        dependsOnActionIds: [],
      },
    ],
    additionalCost: { currency: "SGD", minorUnits: 35000 },
    arrivalTime: "2026-09-05T13:00:00+09:00",
    riskScore: 80,
    preservesBookingIds: [],
    accommodationType: "shared",
    explanation: "Violates every hard boundary used in this test.",
  };

  const result = evaluateMandate(unsafePlan, demoMandate, {
    network: "xrpl:0",
  });

  assert.equal(result.mandateCompliant, false);
  assert.deepEqual(result.violations.map(({ code }) => code), [
    "budget-exceeded",
    "arrival-too-late",
    "required-booking-lost",
    "accommodation-rule-violated",
    "supplier-not-allowed",
    "wrong-network",
  ]);
});

test("orders irreversible purchases after their prerequisites", () => {
  const plans = generateRecoveryPlans(demoMandate);
  const reliable = plans.find((plan) => plan.kind === "most-reliable");
  const protectedPurchase = reliable.actions.find(
    (action) => action.id === "purchase-protected-transfer",
  );

  assert.equal(protectedPurchase.reversible, false);
  assert.deepEqual(protectedPurchase.dependsOnActionIds, [
    "change-replacement-flight",
    "preserve-hotel",
  ]);
});

test("enforces budget against action costs instead of a reported plan total", () => {
  const understatedPlan = {
    ...generateRecoveryPlans(demoMandate)[0],
    additionalCost: { currency: "SGD", minorUnits: 100 },
    actions: [
      {
        id: "understated-purchase",
        kind: "purchase",
        supplierId: "supplier-protected-transfer",
        description: "An action whose real cost exceeds the mandate.",
        incrementalCost: { currency: "SGD", minorUnits: 35000 },
        reversible: false,
        dependsOnActionIds: [],
      },
    ],
  };

  const result = evaluateMandate(understatedPlan, demoMandate);

  assert.equal(result.mandateCompliant, false);
  assert.equal(
    result.violations.some(({ code }) => code === "budget-exceeded"),
    true,
  );
});

test("returns fresh plan data that cannot mutate later requests", () => {
  const firstResult = generateRecoveryPlans(demoMandate);
  firstResult[0].actions[0].description = "tampered";
  firstResult[0].preservesBookingIds.length = 0;

  const secondResult = generateRecoveryPlans(demoMandate);

  assert.notEqual(secondResult[0].actions[0].description, "tampered");
  assert.equal(secondResult[0].preservesBookingIds.length > 0, true);
});
