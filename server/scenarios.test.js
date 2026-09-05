// One engine, three incidents. These pin that the cascade actually differs.

import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCancellation, demoItinerary } from "./recovery.js";
import { INCIDENTS, getIncident, listIncidents, plansForIncident } from "./scenarios.js";
import { listOffers, suppliersForTiers } from "./suppliers.js";
import { mandateFor } from "./priorities.js";

const statuses = (incidentId) => {
  const incident = getIncident(incidentId);
  return analyzeCancellation({
    bookings: demoItinerary,
    canceledBookingId: incident.bookingId,
    replacementArrivalTime: incident.replacementArrivalTime,
  }).map(({ status }) => status);
};

test("a cancelled flight breaks the whole downstream chain", () => {
  assert.deepEqual(statuses("flight-cancelled"), [
    "broken", "broken", "at-risk", "at-risk", "broken",
    // The return journey is days later and survives untouched.
    "safe", "safe",
  ]);
});

test("a withdrawn rental car leaves everything upstream of it safe", () => {
  const result = statuses("rental-unavailable");
  assert.deepEqual(result.slice(0, 3), ["safe", "safe", "safe"]);
  assert.equal(result[3], "broken");
});

test("a cancelled tour affects only itself", () => {
  const result = statuses("activity-cancelled");
  assert.deepEqual(result, ["safe", "safe", "safe", "safe", "broken", "safe", "safe"]);
});

test("every incident yields exactly three plan kinds", () => {
  const mandate = { ...mandateFor("leisure", {}, "transfer"), id: "m", network: "xrpl:1", accommodationRules: [], preserveBookingIds: [] };
  for (const id of Object.keys(INCIDENTS)) {
    const plans = plansForIncident(id, { ...mandate, allowedSupplierIds: [] });
    assert.equal(plans.length, 3, `${id} should produce three plans`);
    assert.deepEqual(
      plans.map((p) => p.kind).sort(),
      ["cheapest", "fastest", "most-reliable"],
      `${id} should cover all three kinds`,
    );
  }
});

test("each incident has suppliers of its own category", () => {
  for (const incident of Object.values(INCIDENTS)) {
    const offers = listOffers(incident.supplierCategory);
    assert.ok(offers.length >= 3, `${incident.id} needs discoverable suppliers`);
    assert.ok(offers.every((o) => o.category === incident.supplierCategory));
  }
});

test("tiers expand to real supplier ids per category", () => {
  const ids = suppliersForTiers("rental", ["protected"]);
  assert.deepEqual(ids, ["supplier-hakone-compact"]);
  assert.deepEqual(suppliersForTiers("activity", ["protected"]), ["supplier-fuji-guided"]);
});

test("the incident list is demo-ready", () => {
  const list = listIncidents();
  assert.equal(list.length, 3);
  assert.ok(list.every((i) => i.headline && i.detail && i.severity));
});
