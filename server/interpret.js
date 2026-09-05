// Turning what a traveller says into a mandate they can authorise.
//
// This is the one place in Trip Rescue where genuine ambiguity lives, so it is
// the one place an LLM belongs. "I have a client meeting at two and I really
// don't want to lose the Fuji trip" is not a form; extracting intent from it is
// interpretation, not policy.
//
// Two hard rules, both enforced below rather than trusted:
//   1. The model proposes. It never authorises — the traveller confirms.
//   2. Every field is validated against server-side truth before it is offered.
//      An out-of-range budget, an unknown booking id or an unparseable time is
//      discarded, not clamped silently.
//
// If no API key is configured, or the call fails, a deterministic parser takes
// over. The product degrades to something honest instead of breaking.

import { demoItinerary } from "./recovery.js";
import { PRIORITIES, getPriority } from "./priorities.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

const MIN_BUDGET = 5000;
const MAX_BUDGET = 80000;

const KNOWN_BOOKINGS = demoItinerary.map(({ id }) => id);
const PRIORITY_IDS = Object.keys(PRIORITIES);

export function llmConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// --- validation -------------------------------------------------------------

/**
 * Accepts a proposal from any source and returns only the parts that survive
 * checking, plus a note for anything dropped. Nothing here trusts the model.
 */
export function validateProposal(raw) {
  const rejected = [];
  const out = {};

  if (PRIORITY_IDS.includes(raw?.priority)) {
    out.priority = raw.priority;
  } else if (raw?.priority !== undefined) {
    rejected.push(`Unknown priority "${raw.priority}".`);
  }

  const budget = raw?.maximumAdditionalSpend?.minorUnits ?? raw?.budgetMinorUnits;
  if (Number.isInteger(budget) && budget >= MIN_BUDGET && budget <= MAX_BUDGET) {
    out.maximumAdditionalSpend = { currency: "SGD", minorUnits: budget };
  } else if (budget !== undefined) {
    rejected.push(`Budget ${budget} is outside the allowed range.`);
  }

  if (typeof raw?.arrivalDeadline === "string" && Number.isFinite(Date.parse(raw.arrivalDeadline))) {
    out.arrivalDeadline = raw.arrivalDeadline;
  } else if (raw?.arrivalDeadline !== undefined) {
    rejected.push(`Could not read a deadline from "${raw.arrivalDeadline}".`);
  }

  if (Array.isArray(raw?.preserveBookingIds)) {
    const known = raw.preserveBookingIds.filter((id) => KNOWN_BOOKINGS.includes(id));
    const unknown = raw.preserveBookingIds.filter((id) => !KNOWN_BOOKINGS.includes(id));
    if (known.length > 0) out.preserveBookingIds = [...new Set(known)];
    if (unknown.length > 0) rejected.push(`Ignored unknown bookings: ${unknown.join(", ")}.`);
  }

  return { proposal: out, rejected };
}

// --- deterministic fallback -------------------------------------------------

const PRIORITY_HINTS = [
  ["business", /\b(meeting|client|conference|work|business|presentation|interview|deadline)\b/i],
  ["family", /\b(family|kids|children|parents|toddler|grandparent|elderly)\b/i],
  ["leisure", /\b(holiday|vacation|leisure|sightseeing|relax)\b/i],
];

const BOOKING_HINTS = [
  ["activity-fuji", /\b(fuji|activity|tour|excursion)\b/i],
  ["hotel-hakone", /\b(hotel|room|accommodation|check[- ]?in)\b/i],
  ["rental-hakone", /\b(rental|car|drive)\b/i],
];

/**
 * Keyword extraction. Deliberately conservative: it would rather return nothing
 * for a field than guess it wrong, because a wrong mandate spends real money.
 */
export function parseDeterministically(text) {
  const said = String(text ?? "");
  const proposal = {};
  const reasons = [];

  for (const [id, pattern] of PRIORITY_HINTS) {
    if (pattern.test(said)) {
      proposal.priority = id;
      reasons.push(`Read "${id}" from how the trip was described.`);
      break;
    }
  }

  // "up to $400", "spend 250", "budget of S$300"
  const money = said.match(/(?:budget|spend|up to|maximum|max|no more than)\D{0,12}(\d{2,5})/i)
    ?? said.match(/(?:s?\$)\s?(\d{2,5})/i);
  if (money) {
    const minorUnits = Number(money[1]) * 100;
    if (minorUnits >= MIN_BUDGET && minorUnits <= MAX_BUDGET) {
      proposal.maximumAdditionalSpend = { currency: "SGD", minorUnits };
      reasons.push(`Read a budget of S$${money[1]} from the text.`);
    }
  }

  // "before noon", "by 9am", "before 2pm"
  const clock = said.match(/\b(?:before|by|prior to)\s+(noon|midday|\d{1,2})\s*(am|pm)?\b/i);
  if (clock) {
    let hour = /noon|midday/i.test(clock[1]) ? 12 : Number(clock[1]);
    const meridiem = (clock[2] || "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) {
      proposal.arrivalDeadline = `2026-09-05T${String(hour).padStart(2, "0")}:00:00+09:00`;
      reasons.push(`Read an arrival deadline of ${String(hour).padStart(2, "0")}:00 JST.`);
    }
  }

  const preserve = BOOKING_HINTS.filter(([, pattern]) => pattern.test(said)).map(([id]) => id);
  if (preserve.length > 0) {
    proposal.preserveBookingIds = preserve;
    reasons.push(`Understood that ${preserve.join(" and ")} must be preserved.`);
  }

  return { proposal, reasons };
}

// --- LLM path ---------------------------------------------------------------

const SYSTEM = `You convert a traveller's plain description of their trip into a structured recovery mandate.

Return ONLY a JSON object, no prose, with any of these optional keys:
  priority: one of ${PRIORITY_IDS.join(", ")}
  maximumAdditionalSpend: { "currency": "SGD", "minorUnits": <integer cents, ${MIN_BUDGET}-${MAX_BUDGET}> }
  arrivalDeadline: ISO 8601 with offset, on 2026-09-05, Japan time (+09:00)
  preserveBookingIds: array from ${KNOWN_BOOKINGS.join(", ")}
  explanation: one short sentence, addressed to the traveller, saying what you understood

Omit any key you are not confident about. Never invent a booking id. Never
exceed the budget range. You are proposing a mandate for a human to approve,
not authorising a payment.`;

async function callModel(text, signal) {
  const res = await fetch(API, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error(`Model returned ${res.status}.`);
  const body = await res.json();
  const raw = body?.content?.find((part) => part.type === "text")?.text ?? "";
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("Model did not return JSON.");
  return JSON.parse(json[0]);
}

/**
 * Interprets free text into a validated mandate proposal.
 * Always resolves; never throws into the request path.
 */
export async function interpretRequest(text, { timeoutMs = 12000 } = {}) {
  const said = String(text ?? "").trim();
  if (said.length < 3) {
    return { source: "none", proposal: {}, reasons: ["Nothing to interpret."], rejected: [] };
  }

  if (llmConfigured()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const raw = await callModel(said, controller.signal);
      const { proposal, rejected } = validateProposal(raw);
      if (Object.keys(proposal).length > 0) {
        const reasons = [];
        if (typeof raw.explanation === "string" && raw.explanation.trim()) {
          reasons.push(raw.explanation.trim());
        }
        return { source: "llm", model: MODEL, proposal, reasons, rejected };
      }
      // Model produced nothing usable; fall through to the parser.
    } catch {
      // Any model failure falls through. The traveller still gets a mandate.
    } finally {
      clearTimeout(timer);
    }
  }

  const { proposal, reasons } = parseDeterministically(said);
  const { proposal: safe, rejected } = validateProposal(proposal);
  return {
    source: llmConfigured() ? "fallback" : "deterministic",
    proposal: safe,
    reasons: reasons.length > 0 ? reasons : ["Could not read a clear preference; keeping the current mandate."],
    rejected,
  };
}

/** Merges a validated proposal onto a priority's defaults for display. */
export function describeProposal(proposal) {
  const priority = getPriority(proposal.priority);
  return {
    priority: proposal.priority ?? priority.id,
    maximumAdditionalSpend: proposal.maximumAdditionalSpend ?? priority.maximumAdditionalSpend,
    arrivalDeadline: proposal.arrivalDeadline ?? priority.arrivalDeadline,
    preserveBookingIds: proposal.preserveBookingIds ?? [],
  };
}
