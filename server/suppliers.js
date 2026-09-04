// Supplier catalog for the V1 Tokyo scenario.
//
// These are simulated independent travel suppliers. They are deliberately NOT
// wired into the agent as pre-provisioned integrations: the agent reaches them
// only through the registry below, reads the price from their 402 challenge,
// and decides whether to buy. Nothing here is a real reservation system, and
// docs/BUILD_PLAN.md keeps real supplier integration out of scope.

// Demo conversion rate, fixed so prices are reproducible across a demo run.
// 1 SGD = 100 minor units; we price 1 SGD at 1000 drops.
const DROPS_PER_SGD_MINOR = 10;

function sgd(minorUnits) {
  return { currency: "SGD", minorUnits };
}

function dropsForSgd(minorUnits) {
  return String(minorUnits * DROPS_PER_SGD_MINOR);
}

const OFFERS = [
  {
    id: "offer-protected-transfer-001",
    supplierId: "supplier-protected-transfer",
    title: "Protected Narita to Hakone transfer",
    description: "Guaranteed seat held on the 10:30 coach, rebookable once if the inbound flight slips.",
    price: sgd(4800),
    arrivalTime: "2026-09-05T11:40:00+09:00",
    riskScore: 12,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
    resourcePath: "/api/suppliers/supplier-protected-transfer/offers/offer-protected-transfer-001/resource",
  },
  {
    id: "offer-flex-transfer-002",
    supplierId: "supplier-flex-transfer",
    title: "Flexible Narita to Hakone shuttle",
    description: "Cheaper shared shuttle, seat released 30 minutes before departure if unclaimed.",
    price: sgd(2600),
    arrivalTime: "2026-09-05T13:20:00+09:00",
    riskScore: 48,
    preservesBookingIds: ["hotel-hakone", "rental-hakone"],
    resourcePath: "/api/suppliers/supplier-flex-transfer/offers/offer-flex-transfer-002/resource",
  },
  {
    id: "offer-express-rail-003",
    supplierId: "supplier-express-rail",
    title: "Narita Express plus local rail to Hakone",
    description: "Fastest arrival but requires two changes and no protected connection.",
    price: sgd(6100),
    arrivalTime: "2026-09-05T11:05:00+09:00",
    riskScore: 36,
    preservesBookingIds: ["hotel-hakone", "rental-hakone", "activity-fuji"],
    resourcePath: "/api/suppliers/supplier-express-rail/offers/offer-express-rail-003/resource",
  },
];

const OFFERS_BY_ID = new Map(
  OFFERS.map((offer) => [offer.id, { ...offer, amountDrops: dropsForSgd(offer.price.minorUnits), supportsX402: true }]),
);

/**
 * The registry the agent fetches at runtime. It does not know these suppliers
 * at build time; it learns their identity, resource path and price by reading
 * this index and then challenging each resource.
 */
export function listOffers() {
  return [...OFFERS_BY_ID.values()];
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
