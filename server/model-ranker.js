import { createAnthropicProvider } from "./anthropic-provider.js";

export function createModelRanker({ provider = createAnthropicProvider() } = {}) {
  if (!provider) return null;
  return async ({ offers, plan, mandate, priority }) => {
    const result = await provider.rankOffers({
      offers: offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        description: offer.description,
        price: offer.price,
        arrivalTime: offer.arrivalTime,
        riskScore: offer.riskScore,
        preservesBookingIds: offer.preservesBookingIds,
        accommodationType: offer.accommodationType,
      })),
      plan: {
        id: plan.id,
        kind: plan.kind,
        title: plan.title,
        arrivalTime: plan.arrivalTime,
        riskScore: plan.riskScore,
      },
      mandate: {
        maximumAdditionalSpend: mandate.maximumAdditionalSpend,
        arrivalDeadline: mandate.arrivalDeadline,
        preserveBookingIds: mandate.preserveBookingIds,
        accommodationRules: mandate.accommodationRules,
      },
      priority,
    });
    return {
      selectedOfferId: result.selectedOfferId,
      explanation: result.explanation,
      provenance: {
        finalMethod: "model",
        modelAttempt: {
          provider: "anthropic",
          requestedModel: provider.model,
          servedModel: result.servedModel,
          outcome: "used",
        },
      },
    };
  };
}
