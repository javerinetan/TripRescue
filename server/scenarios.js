// Trips under monitoring, and the incidents that can befall them.
//
// Trip Rescue is a monitor, not a button. The traveller does not tell us their
// flight was cancelled; we are watching their bookings and the disruption
// arrives. These are the incidents the demo can surface, each feeding the same
// deterministic cascade engine in recovery.js — the engine traverses whatever
// booking broke, so a cancelled tour or a lost rental car needs no new logic.
//
// Recovery plans for the flight incident come from recovery.js. The other
// incidents carry their own plan fixtures here, evaluated with the same
// evaluateMandate policy, so nothing about mandate enforcement is duplicated.

import { demoItinerary, evaluateMandate, generateRecoveryPlans } from "./recovery.js";

const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

let actionSeq = 0;
const action = ({ kind, bookingId, supplierId, description, cost = 0, reversible = true }) => ({
  id: `action-${++actionSeq}`,
  kind,
  ...(bookingId ? { bookingId } : {}),
  ...(supplierId ? { supplierId } : {}),
  description,
  incrementalCost: sgd(cost),
  reversible,
  dependsOnActionIds: [],
});

// --- incidents ---------------------------------------------------------------

export const INCIDENTS = {
  "flight-cancelled": {
    id: "flight-cancelled",
    tripId: "trip-tokyo-sep",
    severity: "critical",
    headline: "Flight SQ634 cancelled",
    detail: "Demo Air cancelled your Singapore to Narita service. The airline's replacement lands at 09:30 tomorrow.",
    source: "Airline operations feed",
    bookingId: "flight-sin-nrt",
    replacementArrivalTime: "2026-09-05T09:30:00+09:00",
    supplierCategory: "transfer",
    replacesBookingId: "bus-nrt-hakone",
    detectedMinutesAgo: 2,
  },
  "rental-unavailable": {
    id: "rental-unavailable",
    tripId: "trip-tokyo-sep",
    severity: "high",
    headline: "Rental car no longer available",
    detail: "Hakone Drive released your compact booking. Only a higher class remains for an early pickup.",
    source: "Rental partner inventory feed",
    bookingId: "rental-hakone",
    replacementArrivalTime: "2026-09-05T10:30:00+09:00",
    supplierCategory: "rental",
    replacesBookingId: "rental-hakone",
    detectedMinutesAgo: 6,
  },
  "activity-cancelled": {
    id: "activity-cancelled",
    tripId: "trip-tokyo-sep",
    severity: "moderate",
    headline: "Mount Fuji day tour cancelled",
    detail: "Fuji Day Tours cancelled tomorrow's departure. Other operators still have morning slots.",
    source: "Operator notice",
    bookingId: "activity-fuji",
    replacementArrivalTime: "2026-09-05T12:00:00+09:00",
    supplierCategory: "activity",
    replacesBookingId: "activity-fuji",
    detectedMinutesAgo: 11,
  },
};

export const DEFAULT_INCIDENT = "flight-cancelled";

export function getIncident(id) {
  return INCIDENTS[id] ?? INCIDENTS[DEFAULT_INCIDENT];
}

export function listIncidents() {
  return Object.values(INCIDENTS).map(({ id, headline, detail, severity, source, detectedMinutesAgo }) => ({
    id, headline, detail, severity, source, detectedMinutesAgo,
  }));
}

// --- trips under monitoring --------------------------------------------------

// The cover the traveller actually bought. Claim guidance is worthless if it
// ignores the policy, and every policy has an excess and a filing window.
export const POLICIES = {
  "trip-tokyo-sep": {
    insurer: "Meridian Travel Cover",
    product: "Standard",
    reference: "MTC-4471-SG",
    perTripLimit: sgd(500000),
    excess: sgd(5000),
    filingWindowDays: 21,
    typicalSettlementDays: 3,
    covers: ["trip-disruption", "additional-transport", "missed-activity"],
    excludes: ["refundable-losses", "voluntary-changes"],
  },
};

export function policyFor(tripId) {
  return POLICIES[tripId] ?? null;
}

export const TRIPS = [
  {
    id: "trip-tokyo-sep",
    title: "Tokyo & Hakone",
    dates: "4 – 8 September 2026",
    purpose:
      "Client meeting in Tokyo on the 5th, so I need to land before noon. "
      + "I can spend up to $500 extra if something goes wrong, and the Fuji day "
      + "is the part we would hate to lose.",
    bookingCount: demoItinerary.length,
    providerCount: new Set(demoItinerary.map((b) => b.provider)).size,
    totalCommitted: sgd(demoItinerary.reduce((t, b) => t + b.cost.minorUnits, 0)),
    monitored: true,
  },
  {
    id: "trip-seoul-sep",
    title: "Seoul weekend",
    dates: "19 – 22 September 2026",
    purpose: "Just a holiday with friends. Keep the extra cost down, I don't mind arriving later.",
    bookingCount: 3,
    providerCount: 3,
    totalCommitted: sgd(74000),
    monitored: true,
  },
  {
    id: "trip-bali-oct",
    title: "Bali, Ubud",
    dates: "11 – 17 October 2026",
    purpose: "Family holiday with two young kids. Prefer the dependable option, avoid tight connections.",
    bookingCount: 4,
    providerCount: 4,
    totalCommitted: sgd(128000),
    monitored: true,
  },
];

// --- plan fixtures for the non-flight incidents ------------------------------

const PLANS_BY_INCIDENT = {
  "rental-unavailable": [
    {
      id: "plan-fastest-rental",
      kind: "fastest",
      title: "Premium SUV at 08:00",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-hakone-premium",
          description: "Take the only early class still available, a premium SUV.",
          cost: 16500,
          reversible: false,
        }),
        action({ kind: "preserve", bookingId: "activity-fuji", description: "Mount Fuji activity is unaffected." }),
      ],
      additionalCost: sgd(16500),
      arrivalTime: "2026-09-05T08:00:00+09:00",
      riskScore: 20,
      preservesBookingIds: ["rental-hakone", "activity-fuji"],
      accommodationType: "unchanged",
      explanation: "Earliest pickup and keeps the whole morning intact, at the highest price.",
    },
    {
      id: "plan-cheapest-rental",
      kind: "cheapest",
      title: "Car-share from town at 10:30",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-hakone-carshare",
          description: "Collect a car-share vehicle in town later in the morning.",
          cost: 7800,
        }),
        action({ kind: "cancel", bookingId: "activity-fuji", description: "Release the Fuji activity, which can no longer be reached in time.", reversible: false }),
      ],
      additionalCost: sgd(7800),
      arrivalTime: "2026-09-05T10:30:00+09:00",
      riskScore: 50,
      preservesBookingIds: ["rental-hakone"],
      accommodationType: "unchanged",
      explanation: "Lowest cost, but the Mount Fuji activity is lost.",
    },
    {
      id: "plan-reliable-rental",
      kind: "most-reliable",
      title: "Compact car, guaranteed 08:30",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-hakone-compact",
          description: "Hold a compact car at the same depot on the original terms.",
          cost: 11000,
          reversible: false,
        }),
        action({ kind: "notify", description: "Confirm the later pickup slot with the activity operator." }),
      ],
      additionalCost: sgd(11000),
      arrivalTime: "2026-09-05T08:30:00+09:00",
      riskScore: 14,
      preservesBookingIds: ["rental-hakone", "activity-fuji"],
      accommodationType: "unchanged",
      explanation: "Same depot, same terms, and the morning activity still works.",
    },
  ],
  "activity-cancelled": [
    {
      id: "plan-fastest-activity",
      kind: "fastest",
      title: "Small-group ascent at 08:30",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-fuji-smallgroup",
          description: "Book the earlier small-group Fuji ascent.",
          cost: 13000,
          reversible: false,
        }),
      ],
      additionalCost: sgd(13000),
      arrivalTime: "2026-09-05T08:30:00+09:00",
      riskScore: 25,
      preservesBookingIds: ["activity-fuji", "rental-hakone"],
      accommodationType: "unchanged",
      explanation: "Earliest replacement departure, smaller group, higher price.",
    },
    {
      id: "plan-cheapest-activity",
      kind: "cheapest",
      title: "Self-guided shuttle at 14:30",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-fuji-shuttle",
          description: "Take the afternoon self-guided shuttle instead.",
          cost: 6200,
        }),
      ],
      additionalCost: sgd(6200),
      arrivalTime: "2026-09-05T14:30:00+09:00",
      riskScore: 55,
      preservesBookingIds: ["activity-fuji", "rental-hakone"],
      accommodationType: "unchanged",
      explanation: "Cheapest replacement, but only an afternoon slot is left.",
    },
    {
      id: "plan-reliable-activity",
      kind: "most-reliable",
      title: "Guided five-lakes tour at 09:30",
      actions: [
        action({
          kind: "purchase",
          supplierId: "supplier-fuji-guided",
          description: "Book a licensed operator with a held slot and a wet-weather alternative.",
          cost: 9500,
          reversible: false,
        }),
        action({ kind: "preserve", bookingId: "rental-hakone", description: "Rental pickup is unaffected." }),
      ],
      additionalCost: sgd(9500),
      arrivalTime: "2026-09-05T09:30:00+09:00",
      riskScore: 15,
      preservesBookingIds: ["activity-fuji", "rental-hakone"],
      accommodationType: "unchanged",
      explanation: "Licensed operator, held slot, and a fallback if the weather turns.",
    },
  ],
};

/**
 * Plans for an incident, evaluated against the mandate with the same policy the
 * flight scenario uses. The flight incident delegates to recovery.js so Min
 * Xie's fixtures stay the single source for that scenario.
 */
export function plansForIncident(incidentId, mandate) {
  if (incidentId === "flight-cancelled") return generateRecoveryPlans(mandate);
  const fixtures = PLANS_BY_INCIDENT[incidentId];
  if (!fixtures) return generateRecoveryPlans(mandate);
  return fixtures.map((fixture) => {
    const plan = structuredClone(fixture);
    return { ...plan, ...evaluateMandate(plan, mandate) };
  });
}
