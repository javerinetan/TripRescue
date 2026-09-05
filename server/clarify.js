// What the agent refuses to assume.
//
// An agent that spends money on your behalf should not guess at the parts of
// your intent it cannot read off the mandate. But a product that interrogates
// you before every action is worse than one that never asks: the traveller is
// already having a bad day, and a form is not help.
//
// So the rule here is narrow. A question is only raised when the answer would
// change the outcome, and every question carries the assumption the agent would
// have made anyway, already selected. Confirming everything is one click. The
// grilling is real when there is something to grill about, and silent when
// there is not.
//
// The most useful questions are about the strategies the traveller can see but
// cannot have. A mandate refusing the cheapest option is correct behaviour, and
// completely opaque unless someone says which rule did it and what dropping
// that rule would cost. That is most of what this file does.
//
// It is deterministic policy, not a model. The mandate is the safety story; it
// would be strange to derive the questions about it from something that can
// hallucinate.

const TIER_LABEL = {
  protected: "protected",
  express: "express",
  budget: "budget",
};

const TIER_NOTE = {
  express: "faster, and priced accordingly",
  budget: "cheaper, with weaker rebooking cover",
  protected: "full rebooking cover if it fails again",
};

// Rules the traveller set and can therefore unset. Everything else — the
// network, the accommodation rule — is not theirs to trade away here.
const FIXABLE = new Set([
  "budget-exceeded",
  "required-booking-lost",
  "supplier-not-allowed",
  "arrival-too-late",
]);

const MINUTE = 60000;

function money(minorUnits) {
  return `S$${(minorUnits / 100).toFixed(2)}`;
}

function clockIn(iso, timeZone = "Asia/Tokyo") {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

function listWords(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The best strategy the mandate is currently refusing, where every reason for
 * refusing it is a rule the traveller chose. Cheapest first: a traveller asking
 * why they cannot have the cheap option is the case this exists for.
 */
function blockedTarget(plans) {
  return (plans ?? [])
    .filter(
      (candidate) =>
        !candidate.mandateCompliant
        && candidate.violations.length > 0
        && candidate.violations.every((violation) => FIXABLE.has(violation.code)),
    )
    .sort((a, b) => a.additionalCost.minorUnits - b.additionalCost.minorUnits)[0] ?? null;
}

function blockedQuestions({ plan, mandate, plans, offers, bookings }) {
  const target = blockedTarget(plans);
  if (!target || target.id === plan.id) return [];

  const saving = plan.additionalCost.minorUnits - target.additionalCost.minorUnits;
  const appeal =
    saving > 0
      ? `${money(saving)} cheaper than ${plan.title}`
      : `arrives ${clockIn(target.arrivalTime)} against ${clockIn(plan.arrivalTime)}`;

  // Saying "this unblocks it" when two other rules still refuse it would be a
  // lie the traveller catches one click later.
  const outcome = (code) => {
    const remaining = target.violations.filter((violation) => violation.code !== code).length;
    if (remaining === 0) return `${target.title} becomes available and I re-rank.`;
    return `One of ${remaining + 1} reasons ${target.title} is refused. Answer the other ${
      remaining === 1 ? "one" : `${remaining}`
    } as well and it becomes available.`;
  };

  const byCode = new Map(target.violations.map((violation) => [violation.code, violation]));
  const questions = [];

  if (byCode.has("budget-exceeded")) {
    const ceiling = mandate.maximumAdditionalSpend.minorUnits;
    // Round up to the next S$50 so the traveller is not authorising a number
    // that leaves zero room for a supplier to reprice.
    const raised = Math.ceil((target.additionalCost.minorUnits + 1) / 5000) * 5000;
    questions.push({
      id: "unblock-budget",
      question: `${target.title} costs more than you authorised.`,
      detail: `It needs ${money(target.additionalCost.minorUnits)} and your ceiling is ${money(ceiling)}. It is ${appeal}.`,
      why: "I will not spend a cent over the ceiling, so this is refused before I even look at it.",
      options: [
        {
          value: "hold",
          label: `Hold the ceiling at ${money(ceiling)}`,
          assumed: true,
          effect: `${target.title} stays refused. I proceed with ${plan.title}.`,
          patch: {},
        },
        {
          value: "raise",
          label: `Raise the ceiling to ${money(raised)}`,
          effect: `${outcome("budget-exceeded")} I still only ever spend what the plan actually costs.`,
          patch: { budgetMinorUnits: raised },
        },
      ],
    });
  }

  if (byCode.has("arrival-too-late")) {
    // Clear the target by a real margin rather than to the minute, so the
    // traveller is not authorising a deadline they meet by thirty seconds.
    const cleared = new Date(Date.parse(target.arrivalTime) + 30 * MINUTE).toISOString();
    const late = Math.round((Date.parse(target.arrivalTime) - Date.parse(mandate.arrivalDeadline)) / MINUTE);
    questions.push({
      id: "unblock-deadline",
      question: `${target.title} arrives after your deadline.`,
      detail: `It lands at ${clockIn(target.arrivalTime)}, ${late} minutes past the ${clockIn(
        mandate.arrivalDeadline,
      )} you set. It is ${appeal}.`,
      why: "Arrival time is the one rule I never trade against price. If the deadline is softer than it looks, this is the moment to say so.",
      options: [
        {
          value: "hold",
          label: `Keep the ${clockIn(mandate.arrivalDeadline)} deadline`,
          assumed: true,
          effect: `${target.title} stays refused. ${plan.title} gets you in at ${clockIn(plan.arrivalTime)}.`,
          patch: {},
        },
        {
          value: "extend",
          label: `Move the deadline to ${clockIn(cleared)}`,
          effect: outcome("arrival-too-late"),
          patch: { arrivalDeadline: cleared },
        },
      ],
    });
  }

  if (byCode.has("required-booking-lost")) {
    const titles = new Map(bookings.map((booking) => [booking.id, booking]));
    const missing = mandate.preserveBookingIds.filter(
      (bookingId) => !target.preservesBookingIds.includes(bookingId),
    );
    const named = missing.map((id) => titles.get(id)?.title ?? id);
    const lost = missing.reduce((total, id) => total + (titles.get(id)?.cost.minorUnits ?? 0), 0);
    if (named.length > 0) {
      questions.push({
        id: "unblock-preserve",
        question: `${target.title} cannot save your ${listWords(named)}.`,
        detail: `You told me to protect ${listWords(named)}, so I am refusing a strategy that is ${appeal}.`,
        why: "This came from what you said about the trip. It is the strictest thing in your mandate and the most common reason an option disappears.",
        options: [
          {
            value: "keep",
            label: `Keep protecting ${named[0]}`,
            assumed: true,
            effect: `${target.title} stays refused. ${plan.title} keeps it.`,
            patch: {},
          },
          {
            value: "drop",
            label: `Stop protecting ${named[0]}`,
            effect: `${outcome("required-booking-lost")}${
              lost > 0 ? ` ${money(lost)} would move onto your insurance claim.` : ""
            }`,
            patch: { dropPreserve: missing },
          },
        ],
      });
    }
  }

  if (byCode.has("supplier-not-allowed")) {
    const byId = new Map((offers ?? []).map((offer) => [offer.supplierId, offer]));
    const current = mandate.allowedTiers ?? [];
    const blocked = target.actions
      .map(({ supplierId }) => supplierId)
      .filter(Boolean)
      .filter((supplierId) => !mandate.allowedSupplierIds.includes(supplierId));
    const missingTiers = [
      ...new Set(blocked.map((supplierId) => byId.get(supplierId)?.tier).filter(Boolean)),
    ].filter((tier) => !current.includes(tier));

    if (missingTiers.length > 0) {
      const widened = [...new Set([...current, ...missingTiers])];
      const named = listWords(missingTiers.map((tier) => TIER_LABEL[tier] ?? tier));
      questions.push({
        id: "unblock-supplier",
        question: `${target.title} uses a provider you have not approved.`,
        detail: `It needs ${listWords(blocked)} — ${named} service. Your allow-list has ${listWords(
          current.map((tier) => TIER_LABEL[tier] ?? tier),
        )} only.`,
        why: "The allow-list is checked before price and again before I sign. It is what stops me paying someone you never agreed to.",
        options: [
          {
            value: "keep",
            label: "Keep the allow-list as it is",
            assumed: true,
            effect: `${target.title} stays refused. Nothing is paid to a provider you did not approve.`,
            patch: {},
          },
          {
            value: "widen",
            label: `Also allow ${named} providers`,
            effect: `${outcome("supplier-not-allowed")} ${
              TIER_NOTE[missingTiers[0]] ? `They are ${TIER_NOTE[missingTiers[0]]}.` : ""
            }`,
            patch: { allowedTiers: widened },
          },
        ],
      });
    }
  }

  return questions;
}

/**
 * The chosen plan is committing to lose something the traveller paid for and
 * cannot get back. The mandate never said to protect it, so the agent is within
 * policy — which is exactly why it should say so out loud before spending.
 */
function releaseQuestion({ plan, mandate, bookings, assessments, incident }) {
  const byId = new Map(assessments.map((a) => [a.bookingId, a]));
  const exposed = bookings
    .filter((booking) => {
      if (booking.refundable) return false;
      if (booking.id === incident?.bookingId) return false;
      if (plan.preservesBookingIds.includes(booking.id)) return false;
      if (mandate.preserveBookingIds.includes(booking.id)) return false;
      const status = byId.get(booking.id)?.status;
      return status === "broken" || status === "at-risk";
    })
    .sort((a, b) => b.cost.minorUnits - a.cost.minorUnits);

  const at = exposed[0];
  if (!at) return null;

  return {
    id: "release-nonrefundable",
    question: `Am I allowed to lose your ${at.title}?`,
    detail: `${money(at.cost.minorUnits)} with ${at.provider}, non-refundable. ${plan.title} does not protect it.`,
    why: byId.get(at.id)?.explanation ?? "It sits downstream of the booking that broke.",
    options: [
      {
        value: "release",
        label: "Yes — release it and claim it back",
        assumed: true,
        effect: `${plan.title} proceeds. ${money(at.cost.minorUnits)} goes onto your insurance claim as an unrecoverable loss.`,
        patch: {},
      },
      {
        value: "keep",
        label: "No — it has to survive",
        effect:
          "I re-plan. Any strategy that cannot keep it is refused, including this one if it comes to that.",
        patch: { addPreserve: [at.id] },
      },
    ],
  };
}

/**
 * The deadline is the hardest constraint in the mandate: it refuses plans
 * outright. Worth confirming when the margin is thin, because the traveller is
 * the only one who knows whether 15:00 was a real time or a round number.
 */
function deadlineQuestion({ plan, mandate }) {
  const arrival = Date.parse(plan.arrivalTime);
  const deadline = Date.parse(mandate.arrivalDeadline);
  if (!Number.isFinite(arrival) || !Number.isFinite(deadline)) return null;

  const slack = Math.round((deadline - arrival) / MINUTE);
  if (slack > 150) return null;

  const plusTwo = new Date(deadline + 120 * MINUTE).toISOString();
  const endOfDay = new Date(deadline + 480 * MINUTE).toISOString();

  return {
    id: "arrival-slack",
    question: `Is ${clockIn(mandate.arrivalDeadline)} a real deadline?`,
    detail:
      slack >= 0
        ? `${plan.title} lands at ${clockIn(plan.arrivalTime)} — ${slack} minutes of margin.`
        : `${plan.title} lands at ${clockIn(plan.arrivalTime)}, ${Math.abs(slack)} minutes past it.`,
    why: "I refuse anything that arrives later, however much cheaper it is. If the time is soft, say so now and I will look wider.",
    options: [
      {
        value: "firm",
        label: "Firm — refuse anything later",
        assumed: true,
        effect: "The deadline stands. Late options stay blocked.",
        patch: {},
      },
      {
        value: "plus-2h",
        label: "I can absorb two more hours",
        effect: `Deadline moves to ${clockIn(plusTwo)}. Slower, cheaper options become eligible.`,
        patch: { arrivalDeadline: plusTwo },
      },
      {
        value: "same-day",
        label: "Any time that day is fine",
        effect: `Deadline moves to ${clockIn(endOfDay)}. Almost nothing will be refused on time.`,
        patch: { arrivalDeadline: endOfDay },
      },
    ],
  };
}

/**
 * The allow-list is what makes "the agent cannot go rogue" true rather than a
 * claim. Narrowing it is also the most common reason a traveller ends up with
 * nothing bookable at all, so it is worth naming the trade before, not after.
 */
function supplierWidthQuestion({ mandate, offers }) {
  const tiers = mandate.allowedTiers ?? [];
  if (tiers.length !== 1) return null;

  const current = tiers[0];
  const available = [...new Set((offers ?? []).map((offer) => offer.tier))];
  const next = available.find((tier) => tier !== current);
  if (!next) return null;

  const allowedCount = (offers ?? []).filter((offer) => offer.tier === current).length;

  return {
    id: "supplier-width",
    question: `You have authorised ${allowedCount} supplier${allowedCount === 1 ? "" : "s"}.`,
    detail: `Only ${TIER_LABEL[current]} providers are on your allow-list. Everyone else is refused before I look at price.`,
    why: "If none of them can deliver, I stop and tell you rather than paying someone you did not approve.",
    options: [
      {
        value: "stop",
        label: "Keep it tight — stop and ask me",
        assumed: true,
        effect: "No payment leaves without an approved supplier. You may end up with nothing bookable.",
        patch: {},
      },
      {
        value: "widen",
        label: `Also allow ${TIER_LABEL[next]} providers`,
        effect: `Adds ${TIER_LABEL[next]} suppliers — ${TIER_NOTE[next]}. Every other rule still applies.`,
        patch: { allowedTiers: [current, next] },
      },
    ],
  };
}

/**
 * The questions worth asking before this plan is executed, most material first,
 * capped at three. An empty list is a real answer: it means the mandate already
 * decides everything this plan touches.
 */
export function clarificationsFor({
  plan,
  mandate,
  bookings = [],
  assessments = [],
  plans = [],
  offers = [],
  incident = null,
}) {
  if (!plan || !mandate) return [];

  const blocked = blockedQuestions({ plan, mandate, plans, offers, bookings });
  const asked = new Set(blocked.map((question) => question.id));

  const rest = [
    releaseQuestion({ plan, mandate, bookings, assessments, incident }),
    asked.has("unblock-deadline") ? null : deadlineQuestion({ plan, mandate }),
    // Redundant once a specific supplier is already under discussion.
    asked.has("unblock-supplier") ? null : supplierWidthQuestion({ mandate, offers }),
  ].filter(Boolean);

  return [...blocked, ...rest].slice(0, 3);
}
