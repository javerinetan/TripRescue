export class NoCompliantOfferError extends Error {
  constructor(violations) {
    super("No supplier offer satisfies the Rescue Mandate.");
    this.name = "NoCompliantOfferError";
    this.code = "mandate-violation";
    this.violations = violations;
  }
}

function evaluateOffer(offer, plan, mandate) {
  const violations = [];
  const validMoney = (money) => money
    && money.currency === mandate.maximumAdditionalSpend.currency
    && Number.isInteger(money.minorUnits)
    && money.minorUnits >= 0;
  const validTimestamp = (value) => typeof value === "string"
    && Number.isFinite(Date.parse(value));
  const planCostsValid = Array.isArray(plan.actions)
    && plan.actions.every(({ incrementalCost }) => validMoney(incrementalCost));
  const offerFieldsValid = offer
    && typeof offer.id === "string"
    && typeof offer.supplierId === "string"
    && typeof offer.title === "string"
    && validMoney(offer.price)
    && validTimestamp(offer.arrivalTime)
    && validTimestamp(mandate.arrivalDeadline)
    && Number.isFinite(offer.riskScore)
    && offer.riskScore >= 0
    && offer.riskScore <= 100
    && Array.isArray(offer.preservesBookingIds);

  if (!planCostsValid || !offerFieldsValid) {
    return [{
      code: "invalid-offer",
      explanation: "The offer or plan contains invalid economic, timing, or risk data.",
    }];
  }

  let replacedSupplierPurchase = false;
  const retainedPlanCost = plan.actions.reduce((total, action) => {
    const isReplacedPurchase = !replacedSupplierPurchase
      && action.kind === "purchase"
      && action.supplierId === offer.supplierId;
    if (isReplacedPurchase) {
      replacedSupplierPurchase = true;
      return total;
    }
    return total + action.incrementalCost.minorUnits;
  }, 0);

  if (
    retainedPlanCost + offer.price.minorUnits > mandate.maximumAdditionalSpend.minorUnits
  ) {
    violations.push({
      code: "budget-exceeded",
      explanation: `${offer.title} would exceed the remaining recovery budget.`,
    });
  }

  if (new Date(offer.arrivalTime).getTime() > new Date(mandate.arrivalDeadline).getTime()) {
    violations.push({
      code: "arrival-too-late",
      explanation: `${offer.title} arrives after the authorized deadline.`,
    });
  }

  const lostBookings = mandate.preserveBookingIds.filter(
    (bookingId) => !offer.preservesBookingIds.includes(bookingId),
  );
  if (lostBookings.length > 0) {
    violations.push({
      code: "required-booking-lost",
      explanation: `${offer.title} does not preserve: ${lostBookings.join(", ")}.`,
    });
  }

  if (!mandate.allowedSupplierIds.includes(offer.supplierId)) {
    violations.push({
      code: "supplier-not-allowed",
      explanation: `${offer.supplierId} is outside the mandate's supplier allow-list.`,
    });
  }

  if (
    mandate.accommodationRules.includes("no-shared-accommodation")
    && offer.accommodationType === "shared"
  ) {
    violations.push({
      code: "accommodation-rule-violated",
      explanation: `${offer.title} requires shared accommodation.`,
    });
  }

  return violations;
}

function safestOffer(offers) {
  return [...offers].sort(
    (left, right) => left.riskScore - right.riskScore
      || left.price.minorUnits - right.price.minorUnits
      || left.id.localeCompare(right.id),
  )[0];
}

function uniqueViolations(evaluatedOffers) {
  const byCode = new Map();
  for (const { violations } of evaluatedOffers) {
    for (const violation of violations) {
      if (!byCode.has(violation.code)) byCode.set(violation.code, violation);
    }
  }
  return [...byCode.values()];
}

export async function decideSupplierOffer({ offers, plan, mandate, ranker }) {
  const evaluatedOffers = offers.map((offer) => ({
    offer,
    violations: evaluateOffer(offer, plan, mandate),
  }));
  const compliantOffers = evaluatedOffers
    .filter(({ violations }) => violations.length === 0)
    .map(({ offer }) => offer);

  if (compliantOffers.length === 0) {
    throw new NoCompliantOfferError(uniqueViolations(evaluatedOffers));
  }

  let rankedDecision = null;
  if (ranker) {
    try {
      rankedDecision = await ranker({
        offers: structuredClone(compliantOffers),
        plan: structuredClone(plan),
        mandate: structuredClone(mandate),
      });
    } catch {
      rankedDecision = null;
    }
  }

  const rankedOffer = compliantOffers.find(
    ({ id }) => id === rankedDecision?.selectedOfferId,
  );
  const hasCompleteRankedDecision = rankedOffer
    && typeof rankedDecision.explanation === "string"
    && rankedDecision.explanation.trim().length > 0;
  const selectedOffer = hasCompleteRankedDecision
    ? rankedOffer
    : safestOffer(compliantOffers);
  const reasons = hasCompleteRankedDecision
    ? [rankedDecision.explanation]
    : [
      "Selected by the safe deterministic fallback because the AI ranker was unavailable or returned an incomplete or invalid result.",
    ];

  reasons.push(
    `${selectedOffer.title} stays within budget, meets the arrival deadline, and preserves required bookings.`,
  );

  return {
    selectedOfferId: selectedOffer.id,
    consideredOfferIds: offers.map(({ id }) => id),
    reasons,
    mandateCompliant: true,
    violations: [],
  };
}
