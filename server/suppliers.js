// Supplier catalog for the V1 scenarios.
//
// These are simulated independent travel suppliers. They are deliberately NOT
// wired into the agent as pre-provisioned integrations: the agent reaches them
// only through the registry, reads the price from their 402 challenge, and
// decides whether to buy. Nothing here is a real reservation system, and
// docs/BUILD_PLAN.md keeps real supplier integration out of scope.
//
// Each offer carries a category (which kind of disruption it answers) and a
// tier. A traveller's priority permits tiers, not supplier names, so the same
// mandate works whichever booking broke.

// Demo conversion rate, fixed so prices are reproducible across a demo run.
// 1 SGD = 100 minor units; we price 1 SGD at 1000 drops.
const DROPS_PER_SGD_MINOR = 10;

function sgd(minorUnits) {
  return { currency: "SGD", minorUnits };
}

function dropsForSgd(minorUnits) {
  return String(minorUnits * DROPS_PER_SGD_MINOR);
}

export const TIERS = Object.freeze(["protected", "express", "budget"]);

const OFFERS = [
  // --- replacement ground transfer, after the flight is cancelled -----------
  {
    id: "offer-protected-transfer-001",
    supplierId: "supplier-protected-transfer",
    category: "transfer",
    tier: "protected",
    title: "Protected Narita to Hakone transfer",
    description: "Guaranteed seat held on the 10:30 coach, rebookable once if the inbound flight slips.",
    price: sgd(4800),
    arrivalTime: "2026-09-05T11:40:00+09:00",
    riskScore: 12,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
  },
  {
    id: "offer-express-rail-003",
    supplierId: "supplier-express-rail",
    category: "transfer",
    tier: "express",
    title: "Narita Express plus local rail to Hakone",
    description: "Fastest arrival but requires two changes and no protected connection.",
    price: sgd(6100),
    arrivalTime: "2026-09-05T11:05:00+09:00",
    riskScore: 36,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
  },
  {
    id: "offer-flex-transfer-002",
    supplierId: "supplier-flex-transfer",
    category: "transfer",
    tier: "budget",
    title: "Flexible Narita to Hakone shuttle",
    description: "Cheaper shared shuttle, seat released 30 minutes before departure if unclaimed.",
    price: sgd(2600),
    arrivalTime: "2026-09-05T13:20:00+09:00",
    riskScore: 48,
    preservesBookingIds: ["hotel-hakone", "rental-hakone"],
  },

  // --- replacement rental car, after the original class sells out -----------
  {
    id: "offer-compact-rental-201",
    supplierId: "supplier-hakone-compact",
    category: "rental",
    tier: "protected",
    title: "Compact car, guaranteed 08:30 pickup",
    description: "Held vehicle at the same depot, same insurance terms as the original booking.",
    price: sgd(11000),
    arrivalTime: "2026-09-05T08:30:00+09:00",
    riskScore: 14,
    preservesBookingIds: ["rental-hakone", "activity-fuji"],
  },
  {
    id: "offer-premium-rental-202",
    supplierId: "supplier-hakone-premium",
    category: "rental",
    tier: "express",
    title: "Premium SUV, 08:00 pickup",
    description: "Only class still available for an early pickup, at a premium.",
    price: sgd(16500),
    arrivalTime: "2026-09-05T08:00:00+09:00",
    riskScore: 20,
    preservesBookingIds: ["rental-hakone", "activity-fuji"],
  },
  {
    id: "offer-shared-rental-203",
    supplierId: "supplier-hakone-carshare",
    category: "rental",
    tier: "budget",
    title: "Car-share pickup from town, 10:30",
    description: "Cheapest option, but collection is in town and too late for the morning activity.",
    price: sgd(7800),
    arrivalTime: "2026-09-05T10:30:00+09:00",
    riskScore: 50,
    preservesBookingIds: ["rental-hakone"],
  },

  // --- replacement activity, after the tour operator cancels ----------------
  {
    id: "offer-guided-fuji-101",
    supplierId: "supplier-fuji-guided",
    category: "activity",
    tier: "protected",
    title: "Guided Fuji five-lakes tour, 09:30",
    description: "Licensed operator with a held group slot and a wet-weather alternative.",
    price: sgd(9500),
    arrivalTime: "2026-09-05T09:30:00+09:00",
    riskScore: 15,
    preservesBookingIds: ["activity-fuji"],
  },
  {
    id: "offer-smallgroup-fuji-102",
    supplierId: "supplier-fuji-smallgroup",
    category: "activity",
    tier: "express",
    title: "Small-group Fuji ascent, 08:30",
    description: "Earlier departure and a smaller group, at a higher price.",
    price: sgd(13000),
    arrivalTime: "2026-09-05T08:30:00+09:00",
    riskScore: 25,
    preservesBookingIds: ["activity-fuji"],
  },
  {
    id: "offer-shuttle-fuji-103",
    supplierId: "supplier-fuji-shuttle",
    category: "activity",
    tier: "budget",
    title: "Self-guided shuttle to Fuji, 14:30",
    description: "Cheapest replacement, but only an afternoon departure remains.",
    price: sgd(6200),
    arrivalTime: "2026-09-05T14:30:00+09:00",
    riskScore: 55,
    preservesBookingIds: ["activity-fuji"],
  },
];

const OFFERS_BY_ID = new Map(
  OFFERS.map((offer) => [
    offer.id,
    {
      ...offer,
      amountDrops: dropsForSgd(offer.price.minorUnits),
      supportsX402: true,
      resourcePath: `/api/suppliers/${offer.supplierId}/offers/${offer.id}/resource`,
    },
  ]),
);

/**
 * The registry the agent fetches at runtime. It does not know these suppliers
 * at build time; it learns their identity, resource path and price by reading
 * this index and then challenging each resource.
 */
export function listOffers(category) {
  const all = [...OFFERS_BY_ID.values()];
  return category ? all.filter((offer) => offer.category === category) : all;
}

/** Concrete supplier ids for a category, restricted to the permitted tiers. */
export function suppliersForTiers(category, tiers) {
  return listOffers(category)
    .filter((offer) => tiers.includes(offer.tier))
    .map((offer) => offer.supplierId);
}

export function getOffer(offerId) {
  return OFFERS_BY_ID.get(offerId) ?? null;
}

export function getOfferForSupplier(supplierId, offerId) {
  const offer = getOffer(offerId);
  if (!offer || offer.supplierId !== supplierId) return null;
  return offer;
}

/**
 * The value the supplier hands over once payment is verified. A short-lived
 * reservation hold is something the recovery workflow actually consumes, which
 * is what docs/BUILD_PLAN.md requires of the protected resource.
 */
export function buildReservationHold(offer, { now = new Date() } = {}) {
  return {
    type: "reservation-hold",
    reference: `TR-HOLD-${offer.id.slice(-3)}`,
    description: `${offer.title} held for the recovered itinerary.`,
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
  };
}
