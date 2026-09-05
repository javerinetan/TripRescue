const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

export const demoItinerary = [
  {
    id: "flight-sin-nrt",
    type: "flight",
    provider: "Demo Air",
    title: "Singapore to Narita",
    startTime: "2026-09-04T08:00:00+08:00",
    endTime: "2026-09-04T15:00:00+09:00",
    dependsOn: [],
    cost: sgd(68000),
    refundable: true,
  },
  {
    id: "bus-nrt-hakone",
    type: "transfer",
    provider: "Hakone Express",
    title: "Narita to Hakone airport bus",
    startTime: "2026-09-04T17:00:00+09:00",
    endTime: "2026-09-04T20:00:00+09:00",
    dependsOn: ["flight-sin-nrt"],
    cost: sgd(4200),
    refundable: true,
    changeDeadline: "2026-09-04T16:00:00+09:00",
  },
  {
    id: "hotel-hakone",
    type: "hotel",
    provider: "Hakone Springs Hotel",
    title: "Hakone hotel",
    startTime: "2026-09-04T15:00:00+09:00",
    endTime: "2026-09-04T22:00:00+09:00",
    dependsOn: ["bus-nrt-hakone"],
    cost: sgd(18000),
    refundable: false,
    changeDeadline: "2026-09-04T18:00:00+09:00",
  },
  {
    id: "rental-hakone",
    type: "rental",
    provider: "Hakone Drive",
    title: "Hakone rental-car pickup",
    startTime: "2026-09-05T08:00:00+09:00",
    endTime: "2026-09-05T08:30:00+09:00",
    dependsOn: ["hotel-hakone"],
    cost: sgd(9500),
    refundable: true,
    changeDeadline: "2026-09-04T20:00:00+09:00",
  },
  {
    id: "activity-fuji",
    type: "activity",
    provider: "Fuji Day Tours",
    title: "Mount Fuji activity",
    startTime: "2026-09-05T09:00:00+09:00",
    endTime: "2026-09-05T15:00:00+09:00",
    dependsOn: ["rental-hakone"],
    cost: sgd(12000),
    refundable: false,
  },
  // The return journey. It depends on the same chain, but it is days later, so
  // an outbound disruption should leave it alone. Proving that the cascade
  // stops where it should matters as much as showing how far it spreads.
  {
    id: "transfer-hakone-nrt",
    type: "transfer",
    provider: "Hakone Express",
    title: "Hakone to Narita transfer",
    startTime: "2026-09-08T09:00:00+09:00",
    endTime: "2026-09-08T12:00:00+09:00",
    dependsOn: ["hotel-hakone"],
    cost: sgd(4200),
    refundable: true,
    changeDeadline: "2026-09-07T20:00:00+09:00",
  },
  {
    id: "flight-nrt-sin",
    type: "flight",
    provider: "Demo Air",
    title: "Narita to Singapore",
    startTime: "2026-09-08T15:00:00+09:00",
    endTime: "2026-09-08T21:30:00+08:00",
    dependsOn: ["transfer-hakone-nrt"],
    cost: sgd(69000),
    refundable: true,
  },
];

export const demoMandate = {
  id: "mandate-tokyo-001",
  maximumAdditionalSpend: sgd(30000),
  arrivalDeadline: "2026-09-05T12:00:00+09:00",
  preserveBookingIds: ["activity-fuji"],
  accommodationRules: ["no-shared-accommodation"],
  allowedSupplierIds: ["supplier-protected-transfer"],
  // CAIP-2 Testnet identifier, matching the x402 payment layer.
  network: "xrpl:1",
};

// Wording stays incident-neutral: the same engine now serves a cancelled
// flight, a withdrawn rental car and a cancelled tour.
const explanations = {
  "service-cancelled": "The provider cancelled this booking.",
  "time-window-missed": "The recovery arrives after this booking starts.",
  "no-show-risk": "The delayed arrival creates a no-show risk that requires intervention.",
  "dependency-at-risk": "An upstream disruption puts this booking at risk and requires a change.",
  unaffected: "The booking remains feasible after the disruption.",
};

export function analyzeCancellation({
  bookings,
  canceledBookingId,
  replacementArrivalTime,
}) {
  const replacementArrival = new Date(replacementArrivalTime).getTime();
  const affectedBookingIds = new Set([canceledBookingId]);

  let foundAffectedBooking = true;
  while (foundAffectedBooking) {
    foundAffectedBooking = false;
    for (const booking of bookings) {
      if (
        !affectedBookingIds.has(booking.id)
        && booking.dependsOn.some((bookingId) => affectedBookingIds.has(bookingId))
      ) {
        affectedBookingIds.add(booking.id);
        foundAffectedBooking = true;
      }
    }
  }

  return bookings.map((booking) => {
    let status = "safe";
    let reasonCode = "unaffected";

    if (booking.id === canceledBookingId) {
      status = "broken";
      reasonCode = "service-cancelled";
    } else if (
      affectedBookingIds.has(booking.id)
      && new Date(booking.startTime).getTime() < replacementArrival
    ) {
      if (booking.type === "hotel") {
        status = "at-risk";
        reasonCode = "no-show-risk";
      } else if (booking.type === "rental") {
        status = "at-risk";
        reasonCode = "dependency-at-risk";
      } else {
        status = "broken";
        reasonCode = "time-window-missed";
      }
    }

    return {
      bookingId: booking.id,
      status,
      reasonCode,
      explanation: explanations[reasonCode],
    };
  });
}

const action = ({
  id,
  kind,
  description,
  minorUnits,
  reversible,
  dependsOnActionIds = [],
  bookingId,
  supplierId,
}) => ({
  id,
  kind,
  ...(bookingId ? { bookingId } : {}),
  ...(supplierId ? { supplierId } : {}),
  description,
  incrementalCost: sgd(minorUnits),
  reversible,
  dependsOnActionIds,
});

const planFixtures = [
  {
    id: "plan-fastest-001",
    kind: "fastest",
    title: "Fastest recovery",
    actions: [
      action({
        id: "change-flight-fastest",
        kind: "change",
        bookingId: "flight-sin-nrt",
        description: "Take the earliest alternative flight to Tokyo.",
        minorUnits: 24000,
        reversible: true,
      }),
      action({
        id: "purchase-transfer-fastest",
        kind: "purchase",
        supplierId: "supplier-protected-transfer",
        description: "Secure a direct protected transfer to Hakone.",
        minorUnits: 4000,
        reversible: false,
        dependsOnActionIds: ["change-flight-fastest"],
      }),
    ],
    additionalCost: sgd(28000),
    arrivalTime: "2026-09-05T07:30:00+09:00",
    riskScore: 35,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
    accommodationType: "private",
    explanation: "Arrives earliest and preserves the activity, using most of the authorized budget.",
  },
  {
    id: "plan-cheapest-001",
    kind: "cheapest",
    title: "Cheapest recovery",
    actions: [
      action({
        id: "accept-airline-rebooking",
        kind: "change",
        bookingId: "flight-sin-nrt",
        description: "Accept the airline's free replacement flight.",
        minorUnits: 0,
        reversible: true,
      }),
      action({
        id: "change-rental-cheapest",
        kind: "change",
        bookingId: "rental-hakone",
        description: "Move the rental pickup to the afternoon.",
        minorUnits: 9000,
        reversible: true,
        dependsOnActionIds: ["accept-airline-rebooking"],
      }),
    ],
    additionalCost: sgd(9000),
    arrivalTime: "2026-09-05T13:30:00+09:00",
    riskScore: 65,
    preservesBookingIds: ["hotel-hakone", "rental-hakone"],
    accommodationType: "unchanged",
    explanation: "Minimizes new spending but arrives after the deadline and cannot preserve the activity.",
  },
  {
    id: "plan-reliable-001",
    kind: "most-reliable",
    title: "Most reliable recovery",
    actions: [
      action({
        id: "change-replacement-flight",
        kind: "change",
        bookingId: "flight-sin-nrt",
        description: "Move to a reroute with a larger operational buffer.",
        minorUnits: 15000,
        reversible: true,
      }),
      action({
        id: "preserve-hotel",
        kind: "notify",
        bookingId: "hotel-hakone",
        description: "Confirm late arrival so the hotel does not mark a no-show.",
        minorUnits: 0,
        reversible: true,
      }),
      action({
        id: "purchase-protected-transfer",
        kind: "purchase",
        supplierId: "supplier-protected-transfer",
        description: "Buy a short-lived hold on protected transfer inventory.",
        minorUnits: 7000,
        reversible: false,
        dependsOnActionIds: ["change-replacement-flight", "preserve-hotel"],
      }),
    ],
    additionalCost: sgd(22000),
    arrivalTime: "2026-09-05T08:30:00+09:00",
    riskScore: 20,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
    accommodationType: "private",
    explanation: "Uses protected inventory and larger buffers while preserving the important activity within budget.",
  },
];

export function evaluateMandate(plan, mandate, { network = mandate.network } = {}) {
  const violations = [];
  const actionCurrencyMismatch = plan.actions.some(
    ({ incrementalCost }) => incrementalCost.currency !== mandate.maximumAdditionalSpend.currency,
  );
  const actionTotal = plan.actions.reduce(
    (total, { incrementalCost }) => total + incrementalCost.minorUnits,
    0,
  );
  const effectiveTotal = Math.max(plan.additionalCost.minorUnits, actionTotal);

  if (
    actionCurrencyMismatch
    || plan.additionalCost.currency !== mandate.maximumAdditionalSpend.currency
    || effectiveTotal > mandate.maximumAdditionalSpend.minorUnits
  ) {
    violations.push({
      code: "budget-exceeded",
      explanation: "The plan exceeds the authorized additional spend.",
    });
  }

  if (new Date(plan.arrivalTime).getTime() > new Date(mandate.arrivalDeadline).getTime()) {
    violations.push({
      code: "arrival-too-late",
      explanation: "The plan arrives after the authorized deadline.",
    });
  }

  const missingBookings = mandate.preserveBookingIds.filter(
    (bookingId) => !plan.preservesBookingIds.includes(bookingId),
  );
  if (missingBookings.length > 0) {
    violations.push({
      code: "required-booking-lost",
      explanation: `The plan does not preserve: ${missingBookings.join(", ")}.`,
    });
  }

  if (
    mandate.accommodationRules.includes("no-shared-accommodation")
    && plan.accommodationType === "shared"
  ) {
    violations.push({
      code: "accommodation-rule-violated",
      explanation: "The plan uses shared accommodation, which the mandate prohibits.",
    });
  }

  const blockedSuppliers = plan.actions
    .map(({ supplierId }) => supplierId)
    .filter(Boolean)
    .filter((supplierId) => !mandate.allowedSupplierIds.includes(supplierId));
  if (blockedSuppliers.length > 0) {
    violations.push({
      code: "supplier-not-allowed",
      explanation: `The plan uses a supplier outside the allow-list: ${blockedSuppliers.join(", ")}.`,
    });
  }

  if (network !== mandate.network) {
    violations.push({
      code: "wrong-network",
      explanation: `The plan requested ${network}, but the mandate allows ${mandate.network}.`,
    });
  }

  return {
    mandateCompliant: violations.length === 0,
    violations,
  };
}

export function generateRecoveryPlans(mandate) {
  return planFixtures.map((fixture) => {
    const plan = structuredClone(fixture);
    return {
      ...plan,
      ...evaluateMandate(plan, mandate),
    };
  });
}
