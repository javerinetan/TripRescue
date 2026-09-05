// Exactly what the agent changed about the trip.
//
// "Your trip is recovered" is not good enough. A traveller who authorised an
// agent to spend their money wants the specifics: which booking went, what
// stands in its place, who the new provider is, what it cost against what the
// plan estimated, and what was deliberately left alone.
//
// Everything here is derived from the plan the traveller authorised and the
// offer the agent actually bought, so it cannot drift from what happened.

const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

/**
 * Builds the before/after list for a completed recovery.
 * `offer` is what the agent actually bought; null before it has bought anything.
 */
export function summariseChanges({ bookings, incident, plan, offer, assessments }) {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const status = new Map((assessments ?? []).map((a) => [a.bookingId, a.status]));
  const changes = [];

  // The replacement itself: the one booking that actually swapped provider.
  const replaced = byId.get(incident.replacesBookingId);
  if (replaced && offer) {
    changes.push({
      kind: "replaced",
      bookingId: replaced.id,
      before: {
        title: replaced.title,
        provider: replaced.provider,
        time: replaced.startTime,
        cost: replaced.cost,
      },
      after: {
        title: offer.title,
        provider: offer.supplierId,
        time: offer.arrivalTime,
        cost: offer.price,
      },
      note: `${replaced.provider} could no longer honour this, so the agent bought a replacement from a different provider.`,
    });
  }

  // Everything the plan explicitly protected, and is still standing.
  for (const bookingId of plan?.preservesBookingIds ?? []) {
    if (bookingId === incident.replacesBookingId) continue;
    const booking = byId.get(bookingId);
    if (!booking) continue;
    changes.push({
      kind: "kept",
      bookingId,
      before: { title: booking.title, provider: booking.provider, time: booking.startTime, cost: booking.cost },
      after: null,
      note: status.get(bookingId) === "at-risk"
        ? "Was at risk from the disruption. The recovery keeps it viable, unchanged."
        : "Unaffected, and deliberately left alone.",
    });
  }

  // Anything the plan gives up, stated plainly rather than buried.
  for (const action of plan?.actions ?? []) {
    if (action.kind !== "cancel" || !action.bookingId) continue;
    const booking = byId.get(action.bookingId);
    if (!booking) continue;
    changes.push({
      kind: "released",
      bookingId: action.bookingId,
      before: { title: booking.title, provider: booking.provider, time: booking.startTime, cost: booking.cost },
      after: null,
      note: action.description,
    });
  }

  // Non-purchase legwork the agent did on the traveller's behalf.
  for (const action of plan?.actions ?? []) {
    if (action.kind !== "notify") continue;
    changes.push({ kind: "notified", bookingId: null, before: null, after: null, note: action.description });
  }

  const spent = offer ? offer.price.minorUnits : 0;
  const estimated = plan?.additionalCost?.minorUnits ?? 0;

  return {
    changes,
    cost: {
      estimated: sgd(estimated),
      actual: sgd(spent),
      // The plan is priced before the agent shops. Ending up under it is the
      // agent doing its job, and worth saying rather than hiding.
      differenceLabel: spent === 0
        ? "Nothing committed yet."
        : spent < estimated
          ? `Came in ${formatDelta(estimated - spent)} under the plan estimate.`
          : spent > estimated
            ? `Came in ${formatDelta(spent - estimated)} over the plan estimate.`
            : "Matched the plan estimate exactly.",
    },
  };
}

function formatDelta(minorUnits) {
  return `S$${(minorUnits / 100).toFixed(2)}`;
}
