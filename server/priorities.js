// Traveller priorities.
//
// Recovery is a trade-off, not a single correct answer: the same cancellation
// should resolve differently for someone who must be in a meeting at 09:00 than
// for someone on holiday who cares about the bill. The priority the traveller
// picks shapes three things — how much they authorise, which suppliers they
// will accept, and how the agent ranks what it discovers.
//
// The ranking is deterministic policy. It plugs into agent.js's `ranker` hook,
// which keeps the safe fallback in place if it ever returns something invalid.

const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

export const PRIORITIES = Object.freeze({
  leisure: {
    id: "leisure",
    label: "Leisure",
    summary: "Keep the extra cost down. I can absorb some delay.",
    maximumAdditionalSpend: sgd(30000),
    arrivalDeadline: "2026-09-05T12:00:00+09:00",
    allowedSupplierIds: ["supplier-protected-transfer"],
    preferredPlanKind: "cheapest",
    rank: "cost",
  },
  business: {
    id: "business",
    label: "Business",
    summary: "Arrive as early as possible. Cost matters less than the meeting.",
    maximumAdditionalSpend: sgd(60000),
    arrivalDeadline: "2026-09-05T12:00:00+09:00",
    allowedSupplierIds: ["supplier-protected-transfer", "supplier-express-rail"],
    preferredPlanKind: "fastest",
    rank: "time",
  },
  family: {
    id: "family",
    label: "Family",
    summary: "Prefer the most dependable option. Avoid tight connections.",
    maximumAdditionalSpend: sgd(45000),
    arrivalDeadline: "2026-09-05T12:00:00+09:00",
    allowedSupplierIds: [
      "supplier-protected-transfer",
      "supplier-express-rail",
      "supplier-flex-transfer",
    ],
    preferredPlanKind: "most-reliable",
    rank: "risk",
  },
});

export const DEFAULT_PRIORITY = "leisure";

export function getPriority(id) {
  return PRIORITIES[id] ?? PRIORITIES[DEFAULT_PRIORITY];
}

export function listPriorities() {
  return Object.values(PRIORITIES).map(({ id, label, summary, maximumAdditionalSpend, rank }) => ({
    id,
    label,
    summary,
    suggestedBudget: maximumAdditionalSpend,
    rank,
  }));
}

const COMPARATORS = {
  cost: (a, b) => a.price.minorUnits - b.price.minorUnits,
  time: (a, b) => Date.parse(a.arrivalTime) - Date.parse(b.arrivalTime),
  risk: (a, b) => a.riskScore - b.riskScore,
};

const REASON = {
  cost: (offer) => `${offer.title} is the cheapest option that satisfies the mandate.`,
  time: (offer) => `${offer.title} arrives earliest of the options the mandate allows.`,
  risk: (offer) => `${offer.title} carries the lowest risk of the options the mandate allows.`,
};

/**
 * Builds a ranker for agent.js. It only ever chooses between offers the mandate
 * has already cleared, so it can express preference but never relax policy.
 */
export function rankerFor(priorityId) {
  const priority = getPriority(priorityId);
  const compare = COMPARATORS[priority.rank] ?? COMPARATORS.risk;

  return async ({ offers }) => {
    if (!Array.isArray(offers) || offers.length === 0) return null;
    // Tie-break on id so the same inputs always give the same answer.
    const chosen = [...offers].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id))[0];
    return {
      selectedOfferId: chosen.id,
      explanation:
        `${priority.label} priority: ${REASON[priority.rank](chosen)}`,
    };
  };
}

/** The mandate a priority implies, before the traveller edits it. */
export function mandateFor(priorityId, overrides = {}) {
  const priority = getPriority(priorityId);
  return {
    priority: priority.id,
    maximumAdditionalSpend: overrides.maximumAdditionalSpend ?? priority.maximumAdditionalSpend,
    arrivalDeadline: overrides.arrivalDeadline ?? priority.arrivalDeadline,
    allowedSupplierIds: overrides.allowedSupplierIds ?? priority.allowedSupplierIds,
    ...(overrides.preserveBookingIds ? { preserveBookingIds: overrides.preserveBookingIds } : {}),
  };
}
