// What is still recoverable after the trip is put back together.
//
// Recovery is not always free: some money is simply gone, and some of it is
// claimable. Travellers do not know which is which, and insurers pay staff to
// work it out. Since we already hold every booking's cost, refundability and
// post-disruption status, we can say plainly what to claim, what to reclaim
// direct from the provider, and what is not worth pursuing.
//
// This is guidance drawn from the trip's own data, not a policy decision. The
// wording says so, because telling someone a claim will succeed when we have
// never seen their policy would be worse than saying nothing.

const sgd = (minorUnits) => ({ currency: "SGD", minorUnits });

/**
 * Splits the disrupted bookings into what the traveller should do about each.
 * `spentMinorUnits` is what the agent spent recovering the trip, which is
 * itself usually the strongest line on a disruption claim.
 */
export function assessClaim({ bookings, assessments, spentMinorUnits = 0 }) {
  const byId = new Map(assessments.map((a) => [a.bookingId, a]));
  const items = [];

  for (const booking of bookings) {
    const status = byId.get(booking.id)?.status ?? "safe";
    if (status === "safe") continue;

    if (booking.refundable) {
      items.push({
        bookingId: booking.id,
        title: booking.title,
        provider: booking.provider,
        amount: booking.cost,
        route: "refund",
        headline: "Ask the provider first",
        note: `${booking.provider} lists this booking as refundable, so claim it back directly before involving an insurer.`,
      });
    } else if (status === "broken") {
      items.push({
        bookingId: booking.id,
        title: booking.title,
        provider: booking.provider,
        amount: booking.cost,
        route: "claimable",
        headline: "Likely claimable",
        note: `Non-refundable and lost to a disruption you did not cause. Most travel policies cover this — keep the ${booking.provider} cancellation notice.`,
      });
    } else {
      items.push({
        bookingId: booking.id,
        title: booking.title,
        provider: booking.provider,
        amount: booking.cost,
        route: "at-risk",
        headline: "Only if it is actually lost",
        note: "Still at risk rather than lost. Nothing to claim unless the provider ends up charging a no-show.",
      });
    }
  }

  if (spentMinorUnits > 0) {
    items.push({
      bookingId: "recovery-spend",
      title: "Replacement services bought during recovery",
      provider: "Trip Rescue",
      amount: sgd(spentMinorUnits),
      route: "claimable",
      headline: "Likely claimable",
      note: "Additional expense incurred to complete a disrupted journey, with an on-chain receipt attached.",
    });
  }

  const total = (route) => items
    .filter((item) => item.route === route)
    .reduce((sum, item) => sum + item.amount.minorUnits, 0);

  return {
    items,
    totals: {
      claimable: sgd(total("claimable")),
      refund: sgd(total("refund")),
      atRisk: sgd(total("at-risk")),
    },
    disclaimer:
      "Guidance from your booking terms and what the disruption actually cost. "
      + "It is not a policy decision, and your insurer has the final say.",
  };
}
