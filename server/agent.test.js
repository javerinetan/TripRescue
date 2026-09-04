import test from "node:test";
import assert from "node:assert/strict";
import {
  NoCompliantOfferError,
  decideSupplierOffer,
} from "./agent.js";
import {
  demoMandate,
  generateRecoveryPlans,
} from "./recovery.js";

const reliablePlan = () => generateRecoveryPlans(demoMandate)
  .find(({ kind }) => kind === "most-reliable");

const offers = [
  {
    id: "offer-protected-transfer-001",
    supplierId: "supplier-protected-transfer",
    title: "Protected Narita to Hakone transfer",
    description: "Guaranteed seat with one protected rebooking.",
    price: { currency: "SGD", minorUnits: 4800 },
    expiresAt: "2026-09-05T10:00:00+09:00",
    resourcePath: "/api/suppliers/protected/resource",
    supportsX402: true,
    arrivalTime: "2026-09-05T11:40:00+09:00",
    riskScore: 12,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
  },
  {
    id: "offer-flex-transfer-002",
    supplierId: "supplier-flex-transfer",
    title: "Flexible shared shuttle",
    description: "Cheaper but arrives after the mandate deadline.",
    price: { currency: "SGD", minorUnits: 2600 },
    expiresAt: "2026-09-05T10:00:00+09:00",
    resourcePath: "/api/suppliers/flex/resource",
    supportsX402: true,
    arrivalTime: "2026-09-05T13:20:00+09:00",
    riskScore: 48,
    preservesBookingIds: ["hotel-hakone", "rental-hakone"],
  },
];

test("gives the AI ranker only mandate-compliant offers", async () => {
  let offersSeenByRanker;
  const ranker = async ({ offers: compliantOffers }) => {
    offersSeenByRanker = compliantOffers;
    return {
      selectedOfferId: "offer-protected-transfer-001",
      explanation: "It preserves the activity and has the lowest operational risk.",
    };
  };

  const decision = await decideSupplierOffer({
    offers,
    plan: reliablePlan(),
    mandate: demoMandate,
    ranker,
  });

  assert.deepEqual(
    offersSeenByRanker.map(({ id }) => id),
    ["offer-protected-transfer-001"],
  );
  assert.equal(decision.selectedOfferId, "offer-protected-transfer-001");
  assert.deepEqual(decision.consideredOfferIds, offers.map(({ id }) => id));
  assert.equal(decision.mandateCompliant, true);
  assert.deepEqual(decision.violations, []);
  assert.match(decision.reasons[0], /lowest operational risk/);
});

test("falls back to the safest compliant offer when the AI returns an invalid id", async () => {
  const expandedMandate = {
    ...demoMandate,
    allowedSupplierIds: [
      "supplier-protected-transfer",
      "supplier-express-rail",
    ],
  };
  const expressOffer = {
    ...offers[0],
    id: "offer-express-rail-003",
    supplierId: "supplier-express-rail",
    title: "Express rail",
    riskScore: 36,
  };

  const decision = await decideSupplierOffer({
    offers: [expressOffer, offers[0]],
    plan: reliablePlan(),
    mandate: expandedMandate,
    ranker: async () => ({
      selectedOfferId: "hallucinated-offer",
      explanation: "This identifier does not exist.",
    }),
  });

  assert.equal(decision.selectedOfferId, "offer-protected-transfer-001");
  assert.match(decision.reasons[0], /safe deterministic fallback/);
});

test("falls back safely when the AI ranker is unavailable", async () => {
  const decision = await decideSupplierOffer({
    offers: [offers[0]],
    plan: reliablePlan(),
    mandate: demoMandate,
    ranker: async () => {
      throw new Error("model unavailable");
    },
  });

  assert.equal(decision.selectedOfferId, "offer-protected-transfer-001");
  assert.match(decision.reasons[0], /safe deterministic fallback/);
});

test("keeps every decision reason a string when AI explanation is missing", async () => {
  const decision = await decideSupplierOffer({
    offers: [offers[0]],
    plan: reliablePlan(),
    mandate: demoMandate,
    ranker: async () => ({ selectedOfferId: "offer-protected-transfer-001" }),
  });

  assert.equal(decision.reasons.every((reason) => typeof reason === "string"), true);
  assert.match(decision.reasons[0], /safe deterministic fallback/);
});

test("rejects the decision when no offer satisfies the mandate", async () => {
  await assert.rejects(
    decideSupplierOffer({
      offers: [offers[1]],
      plan: reliablePlan(),
      mandate: demoMandate,
    }),
    (error) => {
      assert.equal(error instanceof NoCompliantOfferError, true);
      assert.equal(error.code, "mandate-violation");
      assert.equal(error.violations.length > 0, true);
      return true;
    },
  );
});

test("counts independent purchase actions when evaluating the selected offer", async () => {
  const planWithAnotherPurchase = {
    ...reliablePlan(),
    actions: [
      ...reliablePlan().actions,
      {
        id: "purchase-independent-hotel-change",
        kind: "purchase",
        supplierId: "supplier-hotel-change",
        description: "Pay an independent hotel change fee.",
        incrementalCost: { currency: "SGD", minorUnits: 12000 },
        reversible: false,
        dependsOnActionIds: ["preserve-hotel"],
      },
    ],
  };

  await assert.rejects(
    decideSupplierOffer({
      offers: [offers[0]],
      plan: planWithAnotherPurchase,
      mandate: demoMandate,
    }),
    (error) => error.violations.some(({ code }) => code === "budget-exceeded"),
  );
});

test("allows an offer whose effective total exactly matches the budget", async () => {
  const boundaryOffer = {
    ...offers[0],
    price: { currency: "SGD", minorUnits: 15000 },
  };

  const decision = await decideSupplierOffer({
    offers: [boundaryOffer],
    plan: reliablePlan(),
    mandate: demoMandate,
  });

  assert.equal(decision.selectedOfferId, boundaryOffer.id);
});

test("rejects malformed economic and timing fields before invoking AI", async () => {
  let rankerCalled = false;
  const malformedOffers = [
    { ...offers[0], id: "bad-price", price: { currency: "SGD", minorUnits: Number.NaN } },
    { ...offers[0], id: "bad-arrival", arrivalTime: "not-a-date" },
    { ...offers[0], id: "bad-risk", riskScore: Number.NaN },
  ];

  await assert.rejects(
    decideSupplierOffer({
      offers: malformedOffers,
      plan: reliablePlan(),
      mandate: demoMandate,
      ranker: async () => {
        rankerCalled = true;
        return { selectedOfferId: "bad-price", explanation: "Unsafe." };
      },
    }),
    (error) => error.violations.some(({ code }) => code === "invalid-offer"),
  );
  assert.equal(rankerCalled, false);
});

test("rejects shared accommodation when the mandate prohibits it", async () => {
  await assert.rejects(
    decideSupplierOffer({
      offers: [{ ...offers[0], accommodationType: "shared" }],
      plan: reliablePlan(),
      mandate: demoMandate,
    }),
    (error) => error.violations.some(
      ({ code }) => code === "accommodation-rule-violated",
    ),
  );
});
