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
export function assessClaim({ bookings, assessments, spentMinorUnits = 0, policy = null }) {
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

  const gross = total("claimable");
  // A claim is not the sum of what you lost. The excess comes off, and the
  // policy limit caps it. Showing the gross number would be misleading.
  const excess = policy ? Math.min(gross, policy.excess.minorUnits) : 0;
  const limit = policy ? policy.perTripLimit.minorUnits : Infinity;
  const net = Math.min(Math.max(0, gross - excess), limit);

  return {
    items,
    totals: {
      claimable: sgd(gross),
      refund: sgd(total("refund")),
      atRisk: sgd(total("at-risk")),
    },
    policy: policy && {
      insurer: policy.insurer,
      product: policy.product,
      reference: policy.reference,
      excess: policy.excess,
      perTripLimit: policy.perTripLimit,
      filingWindowDays: policy.filingWindowDays,
      typicalSettlementDays: policy.typicalSettlementDays,
      grossLoss: sgd(gross),
      lessExcess: sgd(excess),
      expectedPayout: sgd(net),
      cappedByLimit: gross - excess > limit,
    },
    // Filing is days of paperwork, which is the point: the agent already fixed
    // the trip in seconds. Preparing and filing the claim is the next step, not
    // something we pretend to have done.
    nextStep: policy
      ? `Trip Rescue can assemble this claim for ${policy.insurer} with the cancellation notices and the on-chain receipt attached. `
        + `You have ${policy.filingWindowDays} days to file, and they typically settle in about ${policy.typicalSettlementDays}. `
        + "Automatic filing is not built yet."
      : "No policy is linked to this trip, so this is booking-terms guidance only.",
    disclaimer:
      "Guidance from your booking terms, your policy summary, and what the disruption actually cost. "
      + "It is not a policy decision, and your insurer has the final say.",
  };
}
