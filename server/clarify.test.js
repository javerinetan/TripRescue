// The pre-flight has one job it must never get wrong: it may explain the
// mandate and offer to change it, but it can never make obeying it optional.

import test from "node:test";
import assert from "node:assert/strict";
import { clarificationsFor } from "./clarify.js";
import { demoItinerary } from "./recovery.js";

const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

const mandate = (overrides = {}) => ({
  maximumAdditionalSpend: sgd(30000),
  arrivalDeadline: "2026-09-05T12:00:00+09:00",
  preserveBookingIds: [],
  allowedSupplierIds: ["supplier-protected-transfer", "supplier-express-rail"],
  allowedTiers: ["protected", "express"],
  network: "xrpl:1",
  ...overrides,
});

const plan = (overrides = {}) => ({
  id: "plan-chosen",
  kind: "fastest",
  title: "Fastest recovery",
  actions: [{ id: "a", kind: "purchase", supplierId: "supplier-express-rail", incrementalCost: sgd(20000) }],
  additionalCost: sgd(20000),
  arrivalTime: "2026-09-05T07:30:00+09:00",
  riskScore: 20,
  preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
  mandateCompliant: true,
  violations: [],
  ...overrides,
});

const blocked = (violations, overrides = {}) => plan({
  id: "plan-cheap",
  kind: "cheapest",
  title: "Cheapest recovery",
  additionalCost: sgd(9000),
  arrivalTime: "2026-09-05T13:30:00+09:00",
  actions: [{ id: "b", kind: "purchase", supplierId: "supplier-hakone-carshare", incrementalCost: sgd(9000) }],
  preservesBookingIds: ["hotel-hakone"],
  mandateCompliant: false,
  violations,
  ...overrides,
});

const offers = [
  { supplierId: "supplier-protected-transfer", tier: "protected" },
  { supplierId: "supplier-express-rail", tier: "express" },
  { supplierId: "supplier-hakone-carshare", tier: "budget" },
];

const ask = (args) => clarificationsFor({ bookings: demoItinerary, offers, ...args });

test("says nothing when the mandate already answers everything", () => {
  const chosen = plan();
  const questions = ask({ plan: chosen, mandate: mandate(), plans: [chosen] });
  assert.deepEqual(questions, []);
});

test("every question is answerable in one click", () => {
  const chosen = plan();
  const questions = ask({
    plan: chosen,
    mandate: mandate({ preserveBookingIds: ["activity-fuji"] }),
    plans: [
      chosen,
      blocked([
        { code: "arrival-too-late", explanation: "" },
        { code: "required-booking-lost", explanation: "" },
      ]),
    ],
  });

  assert.ok(questions.length > 0, "the blocked strategy should raise questions");
  for (const question of questions) {
    const assumed = question.options.filter((option) => option.assumed === true);
    assert.equal(assumed.length, 1, `${question.id} must carry exactly one default`);
    assert.deepEqual(assumed[0].patch, {}, `${question.id}'s default must change nothing`);
  }
});

test("names every rule blocking the cheapest strategy, one question each", () => {
  const questions = ask({
    plan: plan(),
    mandate: mandate({ preserveBookingIds: ["activity-fuji"], maximumAdditionalSpend: sgd(5000) }),
    plans: [
      plan(),
      blocked([
        { code: "budget-exceeded", explanation: "" },
        { code: "arrival-too-late", explanation: "" },
        { code: "required-booking-lost", explanation: "" },
      ]),
    ],
  });

  const ids = questions.map(({ id }) => id);
  assert.deepEqual(ids, ["unblock-budget", "unblock-deadline", "unblock-preserve"]);
});

test("never claims a single answer unblocks a strategy three rules are refusing", () => {
  const questions = ask({
    plan: plan(),
    mandate: mandate({ preserveBookingIds: ["activity-fuji"], maximumAdditionalSpend: sgd(5000) }),
    plans: [
      plan(),
      blocked([
        { code: "budget-exceeded", explanation: "" },
        { code: "arrival-too-late", explanation: "" },
        { code: "required-booking-lost", explanation: "" },
      ]),
    ],
  });

  for (const question of questions) {
    const change = question.options.find((option) => option.assumed !== true);
    assert.match(
      change.effect,
      /One of 3 reasons/,
      `${question.id} must not promise more than answering it delivers`,
    );
  }
});

test("a rule the traveller did not set is never offered as a trade", () => {
  const questions = ask({
    plan: plan(),
    mandate: mandate(),
    plans: [
      plan(),
      blocked([
        { code: "wrong-network", explanation: "" },
        { code: "accommodation-rule-violated", explanation: "" },
      ]),
    ],
  });

  assert.deepEqual(questions, [], "network and accommodation rules are not the traveller's to relax here");
});

test("a strategy blocked by one tradeable rule and one fixed rule stays refused", () => {
  const questions = ask({
    plan: plan(),
    mandate: mandate({ maximumAdditionalSpend: sgd(5000) }),
    plans: [
      plan(),
      blocked([
        { code: "budget-exceeded", explanation: "" },
        { code: "wrong-network", explanation: "" },
      ]),
    ],
  });

  assert.ok(
    !questions.some(({ id }) => id === "unblock-budget"),
    "raising the ceiling would not unblock it, so it must not be offered",
  );
});

test("warns before letting a non-refundable booking go", () => {
  const chosen = plan({ preservesBookingIds: ["hotel-hakone"] });
  const questions = ask({
    plan: chosen,
    mandate: mandate(),
    plans: [chosen],
    assessments: [{ bookingId: "activity-fuji", status: "at-risk", explanation: "downstream" }],
    incident: { bookingId: "flight-sin-nrt" },
  });

  const release = questions.find(({ id }) => id === "release-nonrefundable");
  assert.ok(release, "the traveller should be told what this plan gives up");
  assert.match(release.question, /Mount Fuji activity/);
  assert.deepEqual(
    release.options.find((option) => option.assumed !== true).patch,
    { addPreserve: ["activity-fuji"] },
  );
});

test("never raises the booking that broke as something to protect", () => {
  const chosen = plan({ preservesBookingIds: [] });
  const questions = ask({
    plan: chosen,
    mandate: mandate(),
    plans: [chosen],
    assessments: [{ bookingId: "hotel-hakone", status: "broken", explanation: "gone" }],
    incident: { bookingId: "hotel-hakone" },
  });

  assert.ok(!questions.some(({ id }) => id === "release-nonrefundable"));
});

test("widening the allow-list only ever adds the tier the blocked plan needs", () => {
  const questions = ask({
    plan: plan(),
    mandate: mandate({ allowedTiers: ["protected"], allowedSupplierIds: ["supplier-protected-transfer"] }),
    plans: [plan(), blocked([{ code: "supplier-not-allowed", explanation: "" }])],
  });

  const widen = questions
    .find(({ id }) => id === "unblock-supplier")
    .options.find((option) => option.assumed !== true);
  assert.deepEqual(widen.patch.allowedTiers, ["protected", "budget"]);
});

test("asks at most three things, however much is wrong", () => {
  const questions = ask({
    plan: plan({ preservesBookingIds: [] }),
    mandate: mandate({ preserveBookingIds: ["activity-fuji"], maximumAdditionalSpend: sgd(5000) }),
    plans: [
      plan({ preservesBookingIds: [] }),
      blocked([
        { code: "budget-exceeded", explanation: "" },
        { code: "arrival-too-late", explanation: "" },
        { code: "required-booking-lost", explanation: "" },
        { code: "supplier-not-allowed", explanation: "" },
      ]),
    ],
    assessments: [{ bookingId: "activity-fuji", status: "at-risk", explanation: "downstream" }],
    incident: { bookingId: "flight-sin-nrt" },
  });

  assert.ok(questions.length <= 3, `asked ${questions.length}`);
});
