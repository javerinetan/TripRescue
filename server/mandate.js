// Payment-side Rescue Mandate enforcement.
//
// Min Xie's domain layer decides which plan satisfies the mandate. This module
// re-checks the mandate at the moment money would move, because
// docs/BUILD_PLAN.md invariant 1 requires that the agent cannot exceed the
// mandate and docs/API_CONTRACT.md requires the server to reject client-supplied
// destinations, amounts, suppliers and networks that disagree with server state.
//
// Every check here is deterministic. No LLM output can relax it.

import { NETWORK_TESTNET } from "./x402.js";
import { demoMandate } from "./recovery.js";
import { DEFAULT_PRIORITY, mandateFor } from "./priorities.js";

const mandates = new Map();

// Single source of truth: the domain layer owns the mandate, the payment layer
// re-enforces it. Defining it twice would let the two halves drift apart.
export const DEMO_MANDATE = Object.freeze({ ...demoMandate });

if (DEMO_MANDATE.network !== NETWORK_TESTNET) {
  throw new Error(
    `Mandate network ${DEMO_MANDATE.network} does not match the payment network ${NETWORK_TESTNET}.`,
  );
}

export function resetMandates() {
  mandates.clear();
  mandates.set(DEMO_MANDATE.id, { mandate: DEMO_MANDATE, spentMinorUnits: 0 });
}

/**
 * Rewrites the demo mandate from a traveller priority plus any edits the
 * traveller made. Spend resets, because a re-authorised mandate is a new
 * authorisation, not a continuation of the old one.
 */
export function configureMandate({ priority = DEFAULT_PRIORITY, ...overrides } = {}) {
  const derived = mandateFor(priority, overrides);
  const mandate = Object.freeze({
    ...DEMO_MANDATE,
    ...derived,
    network: NETWORK_TESTNET,
  });
  mandates.set(mandate.id, { mandate, spentMinorUnits: 0 });
  return mandate;
}

resetMandates();

export function getMandate(mandateId) {
  return mandates.get(mandateId)?.mandate ?? null;
}

export function remainingBudget(mandateId) {
  const entry = mandates.get(mandateId);
  if (!entry) return null;
  return entry.mandate.maximumAdditionalSpend.minorUnits - entry.spentMinorUnits;
}

/** Records spend only after settlement is confirmed. */
export function recordSpend(mandateId, minorUnits) {
  const entry = mandates.get(mandateId);
  if (!entry) return;
  entry.spentMinorUnits += minorUnits;
}

export function releaseSpend(mandateId, minorUnits) {
  const entry = mandates.get(mandateId);
  if (!entry) return;
  entry.spentMinorUnits = Math.max(0, entry.spentMinorUnits - minorUnits);
}

/**
 * Returns the MandateViolation list from docs/API_CONTRACT.md. An empty array
 * means the purchase is authorized.
 */
export function evaluatePurchase({ mandateId, offer, network }) {
  const entry = mandates.get(mandateId);
  if (!entry) {
    return [{ code: "supplier-not-allowed", explanation: `Mandate ${mandateId} is unknown.` }];
  }
  const { mandate } = entry;
  const violations = [];

  if (!mandate.allowedSupplierIds.includes(offer.supplierId)) {
    violations.push({
      code: "supplier-not-allowed",
      explanation: `${offer.supplierId} is not on the mandate's allow-list.`,
    });
  }

  const remaining = mandate.maximumAdditionalSpend.minorUnits - entry.spentMinorUnits;
  if (offer.price.minorUnits > remaining) {
    violations.push({
      code: "budget-exceeded",
      explanation:
        `${offer.title} costs ${formatSgd(offer.price.minorUnits)} but only ` +
        `${formatSgd(remaining)} of the authorized budget remains.`,
    });
  }

  if (network !== mandate.network) {
    violations.push({
      code: "wrong-network",
      explanation: `Payment network ${network} does not match the authorized ${mandate.network}.`,
    });
  }

  if (offer.arrivalTime && Date.parse(offer.arrivalTime) > Date.parse(mandate.arrivalDeadline)) {
    violations.push({
      code: "arrival-too-late",
      explanation: `Arrival ${offer.arrivalTime} is later than the authorized deadline ${mandate.arrivalDeadline}.`,
    });
  }

  const lost = mandate.preserveBookingIds.filter((id) => !offer.preservesBookingIds.includes(id));
  if (lost.length > 0) {
    violations.push({
      code: "required-booking-lost",
      explanation: `This offer does not preserve ${lost.join(", ")}.`,
    });
  }

  return violations;
}

export function formatSgd(minorUnits) {
  return `S$${(minorUnits / 100).toFixed(2)}`;
}
