// Deliberate fault injection for demonstrating failure handling.
//
// docs/BUILD_PLAN.md requires that failure paths are understandable and
// recoverable. Being able to break the system on demand, on stage, and show
// that it stays safe is worth more than asserting that it would.
//
// Faults are demo-only state. They never persist and never affect the ledger.

export const FAULT_MODES = Object.freeze({
  NONE: "none",
  // Supplier is unreachable before any money moves.
  SUPPLIER_UNAVAILABLE: "supplier-unavailable",
  // The ledger rejects the payment at submission.
  SETTLEMENT_FAIL: "settlement-fail",
  // The mandate has already been spent down, so nothing may be bought.
  BUDGET_EXHAUSTED: "budget-exhausted",
});

let mode = FAULT_MODES.NONE;

export function setFault(next) {
  const allowed = Object.values(FAULT_MODES);
  if (!allowed.includes(next)) return { ok: false, allowed };
  mode = next;
  return { ok: true, mode };
}

export function currentFault() {
  return mode;
}

export function clearFault() {
  mode = FAULT_MODES.NONE;
}

export function shouldFail(which) {
  return mode === which;
}
