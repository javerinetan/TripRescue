import test from "node:test";
import assert from "node:assert/strict";
import { createModelRanker } from "./model-ranker.js";

test("the Anthropic ranker passes only safe offer context and provenance", async () => {
  let received;
  const ranker = createModelRanker({
    provider: {
      model: "claude-opus-5",
      rankOffers: async (input) => {
        received = input;
        return { selectedOfferId: "offer-a", explanation: "Earliest safe arrival.", servedModel: "claude-opus-5" };
      },
    },
  });
  const result = await ranker({
    offers: [{ id: "offer-a", title: "A", description: "safe", price: { currency: "SGD", minorUnits: 100 }, arrivalTime: "2026-09-05T09:00:00+09:00", riskScore: 2, preservesBookingIds: [] }],
    plan: { id: "plan-a", kind: "fastest", title: "Fast", arrivalTime: "2026-09-05T09:00:00+09:00", riskScore: 2 },
    mandate: { maximumAdditionalSpend: { currency: "SGD", minorUnits: 30000 }, arrivalDeadline: "2026-09-05T12:00:00+09:00", preserveBookingIds: [], accommodationRules: [] },
    priority: { id: "business", rank: "time" },
  });
  assert.deepEqual(result.selectedOfferId, "offer-a");
  assert.equal(result.provenance.modelAttempt.servedModel, "claude-opus-5");
  assert.equal(received.offers.length, 1);
  assert.equal(received.offers[0].id, "offer-a");
});

test("missing provider disables model ranking", () => {
  assert.equal(createModelRanker({ provider: null }), null);
});
