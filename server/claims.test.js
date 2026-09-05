// The claim summary must never overstate what a traveller can get back.

import test from "node:test";
import assert from "node:assert/strict";
import { assessClaim } from "./claims.js";
import { analyzeCancellation, demoItinerary } from "./recovery.js";

const forFlight = () => assessClaim({
  bookings: demoItinerary,
  assessments: analyzeCancellation({
    bookings: demoItinerary,
    canceledBookingId: "flight-sin-nrt",
    replacementArrivalTime: "2026-09-05T09:30:00+09:00",
  }),
  spentMinorUnits: 4800,
});

test("untouched bookings never appear as claimable", () => {
  const ids = forFlight().items.map(({ bookingId }) => bookingId);
  assert.ok(!ids.includes("flight-nrt-sin"), "the safe return flight must not be listed");
  assert.ok(!ids.includes("transfer-hakone-nrt"));
});

test("a refundable loss is sent to the provider, not the insurer", () => {
  const flight = forFlight().items.find(({ bookingId }) => bookingId === "flight-sin-nrt");
  assert.equal(flight.route, "refund");
});

test("a non-refundable broken booking is the claimable case", () => {
  const activity = forFlight().items.find(({ bookingId }) => bookingId === "activity-fuji");
  assert.equal(activity.route, "claimable");
});

test("an at-risk booking is not claimed until it is actually lost", () => {
  const hotel = forFlight().items.find(({ bookingId }) => bookingId === "hotel-hakone");
  assert.equal(hotel.route, "at-risk");
});

test("recovery spend is itself claimable and carries its receipt", () => {
  const spend = forFlight().items.find(({ bookingId }) => bookingId === "recovery-spend");
  assert.equal(spend.route, "claimable");
  assert.equal(spend.amount.minorUnits, 4800);
});

test("nothing is claimed when nothing spent and nothing broke", () => {
  const quiet = assessClaim({
    bookings: demoItinerary,
    assessments: demoItinerary.map(({ id }) => ({ bookingId: id, status: "safe" })),
  });
  assert.deepEqual(quiet.items, []);
  assert.equal(quiet.totals.claimable.minorUnits, 0);
});

test("totals only count their own route", () => {
  const { items, totals } = forFlight();
  const sum = (route) => items.filter((i) => i.route === route)
    .reduce((t, i) => t + i.amount.minorUnits, 0);
  assert.equal(totals.claimable.minorUnits, sum("claimable"));
  assert.equal(totals.refund.minorUnits, sum("refund"));
  assert.equal(totals.atRisk.minorUnits, sum("at-risk"));
});
