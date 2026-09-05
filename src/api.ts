// API client for the supplier, x402 and payment routes.

import type { ExecutionReceipt, Money, PaymentRequirement, RescueMandate, SupplierOffer, TransactionPreview } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";
export const RECOVERY_ID = "recovery-tokyo-001";
export const MANDATE_ID = "mandate-tokyo-001";

export interface WireExchange {
  dir: "in" | "out";
  label: string;
  header?: string;
  note?: string;
  payload?: unknown;
}

export class ApiFailure extends Error {
  code: string;
  status: number;
  violations: { code: string; explanation: string }[];

  constructor(status: number, code: string, message: string, violations: { code: string; explanation: string }[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.violations = violations;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<{ data: T; res: Response }> {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const violations = (body?.error?.details?.violations ?? []) as { code: string; explanation: string }[];
    throw new ApiFailure(res.status, body?.error?.code ?? "unknown", body?.error?.message ?? res.statusText, violations);
  }
  return { data: body as T, res };
}

export async function fetchMandate(): Promise<{ mandate: RescueMandate; remaining: { minorUnits: number } }> {
  const { data } = await call<{ mandate: RescueMandate; remaining: { minorUnits: number } }>(`/api/mandates/${MANDATE_ID}`);
  return data;
}

/** Runtime discovery: the agent learns which suppliers exist at all. */
export async function discoverSuppliers(): Promise<SupplierOffer[]> {
  const { data } = await call<{ suppliers: SupplierOffer[] }>("/api/suppliers/registry");
  return data.suppliers;
}

/**
 * Requests a protected resource with no payment. Expects HTTP 402 and returns
 * both the decoded PAYMENT-REQUIRED header and the contract requirement.
 */
export async function challengeResource(
  offer: SupplierOffer,
): Promise<{ requirement: PaymentRequirement; accepted: Record<string, unknown>; wire: WireExchange[] }> {
  const url = `${offer.resourcePath}?recoveryId=${RECOVERY_ID}`;
  const res = await fetch(`${BASE}${url}`);
  const body = await res.json();
  if (res.status !== 402) throw new ApiFailure(res.status, "unexpected", "Expected HTTP 402 from the supplier.");
  const header = res.headers.get("PAYMENT-REQUIRED");
  const accepted = header ? JSON.parse(atob(header)).accepts[0] : {};
  const wire: WireExchange[] = [
    { dir: "out", label: `GET ${offer.resourcePath}`, note: "no payment attached" },
    { dir: "in", label: "402 Payment Required", header: "PAYMENT-REQUIRED", payload: accepted },
  ];
  return { requirement: body.paymentRequirement as PaymentRequirement, accepted, wire };
}

export async function preparePayment(requirementId: string): Promise<{
  executionId: string;
  preview: TransactionPreview;
  offer: { title: string; price: { minorUnits: number }; supplierId: string };
  budget: { authorized: { minorUnits: number }; remainingAfter: { minorUnits: number } };
}> {
  const { data } = await call<never>("/api/payments/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      requirementId,
      planId: "plan-reliable-001",
      mandateId: MANDATE_ID,
    }),
  });
  return data as never;
}

export async function executePayment(
  executionId: string,
  idempotencyKey: string,
): Promise<{ receipt: ExecutionReceipt; remainingLabel: string; replayed?: boolean }> {
  const { data } = await call<never>("/api/payments/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "1.0.0", executionId, idempotencyKey }),
  });
  return data as never;
}

/** Retries the protected resource with payment evidence in PAYMENT-SIGNATURE. */
export async function claimResource(
  offer: SupplierOffer,
  executionId: string,
  accepted: Record<string, unknown>,
  transactionHash: string,
): Promise<{ receipt: ExecutionReceipt; wire: WireExchange[] }> {
  const payload = { x402Version: 2, accepted, payload: { signedTxBlob: transactionHash } };
  const signature = btoa(JSON.stringify(payload));
  const { data, res } = await call<{ receipt: ExecutionReceipt }>(
    `${offer.resourcePath}?recoveryId=${RECOVERY_ID}&executionId=${executionId}`,
    { headers: { "PAYMENT-SIGNATURE": signature } },
  );
  const responseHeader = res.headers.get("PAYMENT-RESPONSE");
  const wire: WireExchange[] = [
    { dir: "out", label: `GET ${offer.resourcePath}`, header: "PAYMENT-SIGNATURE", payload },
    {
      dir: "in",
      label: "200 OK — resource released",
      header: "PAYMENT-RESPONSE",
      payload: responseHeader ? JSON.parse(atob(responseHeader)) : {},
    },
  ];
  return { receipt: data.receipt, wire };
}

export function formatSgd(minorUnits: number): string {
  return `S$${(minorUnits / 100).toFixed(2)}`;
}

// --- Recovery domain ---------------------------------------------------

export async function analyzeDisruption(): Promise<{
  recoveryId: string;
  incident?: { headline: string; detail: string; severity: string };
  bookings: import("./types").Booking[];
  assessments: import("./types").BookingAssessment[];
}> {
  const { data } = await call<never>("/api/recovery/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      bookings: [],
    }),
  });
  return data as never;
}

export async function fetchPlans(): Promise<{
  plans: import("./types").RecoveryPlan[];
  recommendedPlanId: string | null;
}> {
  const { data } = await call<never>("/api/recovery/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "1.0.0", recoveryId: RECOVERY_ID }),
  });
  return data as never;
}

export async function resetDemo(): Promise<void> {
  await call("/api/demo/reset", { method: "POST" });
}

/**
 * Formats an ISO string using the wall-clock time it was written in, not the
 * viewer's timezone. A Japan itinerary must read in Japan time or the demo
 * times look wrong to anyone outside JST.
 */
export function formatLocalTime(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, , month, day, hour, minute] = match;
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(month) - 1
  ];
  const offset = iso.slice(-6);
  const zone = offset === "+09:00" ? "JST" : offset === "+08:00" ? "SGT" : offset;
  return `${Number(day)} ${monthName}, ${hour}:${minute} ${zone}`;
}

export interface OfferDecision {
  selectedOfferId: string | null;
  consideredOfferIds: string[];
  reasons: string[];
  mandateCompliant: boolean;
  violations: { code: string; explanation: string }[];
}

/** The agent's ranked economic decision over everything it discovered. */
export async function fetchOfferDecision(): Promise<{
  offers: SupplierOffer[];
  decision: OfferDecision;
}> {
  const { data } = await call<never>("/api/recovery/offers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "1.0.0", recoveryId: RECOVERY_ID, mandateId: MANDATE_ID }),
  });
  return data as never;
}

export const FAULT_MODES = [
  { id: "none", label: "No fault" },
  { id: "supplier-unavailable", label: "Supplier offline" },
  { id: "settlement-fail", label: "Settlement rejected" },
  { id: "budget-exhausted", label: "Budget exhausted" },
] as const;

export type FaultMode = (typeof FAULT_MODES)[number]["id"];

export async function setFault(mode: FaultMode): Promise<void> {
  await call("/api/demo/fault", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export interface Priority {
  id: string;
  label: string;
  summary: string;
  suggestedBudget: Money;
  rank: "cost" | "time" | "risk";
}

export async function fetchPriorities(): Promise<{ priorities: Priority[]; default: string }> {
  const { data } = await call<never>("/api/priorities");
  return data as never;
}

/** Authorising a strategy writes the mandate from priority plus any edits. */
export async function configureMandate(
  priority: string,
  budgetMinorUnits?: number,
  extras: { preserveBookingIds?: string[]; arrivalDeadline?: string } = {},
): Promise<RescueMandate> {
  const { data } = await call<{ mandate: RescueMandate }>("/api/mandates/configure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      priority,
      ...(budgetMinorUnits ? { maximumAdditionalSpend: { currency: "SGD", minorUnits: budgetMinorUnits } } : {}),
      ...(extras.preserveBookingIds?.length ? { preserveBookingIds: extras.preserveBookingIds } : {}),
      ...(extras.arrivalDeadline ? { arrivalDeadline: extras.arrivalDeadline } : {}),
    }),
  });
  return data.mandate;
}

export interface Interpretation {
  source: "llm" | "fallback" | "deterministic" | "none";
  model: string | null;
  llmConfigured: boolean;
  proposal: {
    priority?: string;
    maximumAdditionalSpend?: Money;
    arrivalDeadline?: string;
    preserveBookingIds?: string[];
  };
  preview: {
    priority: string;
    maximumAdditionalSpend: Money;
    arrivalDeadline: string;
    preserveBookingIds: string[];
  };
  reasons: string[];
  rejected: string[];
}

/** Free text in, a proposed mandate out. Never writes the mandate. */
export async function interpretRequest(text: string): Promise<Interpretation> {
  const { data } = await call<never>("/api/mandates/interpret", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "1.0.0", text }),
  });
  return data as never;
}

export interface TripAlert {
  incidentId: string;
  severity: "critical" | "high" | "moderate";
  headline: string;
  detail: string;
  source: string;
  detectedMinutesAgo: number;
}

export interface TripExposure { broken: number; atRisk: number; safe: number }

export interface TripsSummary {
  trips: number;
  bookings: number;
  providers: number;
  committed: Money;
  valueAtRisk: Money;
  alerts: number;
}

export interface Trip {
  id: string;
  title: string;
  dates: string;
  purpose?: string;
  exposure: TripExposure;
  valueAtRisk: Money;
  bookingCount: number;
  providerCount: number;
  totalCommitted: Money;
  monitored: boolean;
  alert: TripAlert | null;
}

export interface IncidentSummary {
  id: string;
  headline: string;
  detail: string;
  severity: string;
  source: string;
  detectedMinutesAgo: number;
}

export async function fetchTrips(): Promise<{
  trips: Trip[];
  summary: TripsSummary;
  incidents: IncidentSummary[];
  activeIncidentId: string;
}> {
  const { data } = await call<never>("/api/trips");
  return data as never;
}

export async function setActiveIncident(incidentId: string): Promise<void> {
  await call("/api/incidents/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "1.0.0", incidentId }),
  });
}

export interface ClaimItem {
  bookingId: string;
  title: string;
  provider: string;
  amount: Money;
  route: "claimable" | "refund" | "at-risk";
  headline: string;
  note: string;
}

export interface ClaimSummary {
  items: ClaimItem[];
  totals: { claimable: Money; refund: Money; atRisk: Money };
  policy: PolicySummary | null;
  nextStep: string;
  disclaimer: string;
}

export async function fetchClaim(): Promise<ClaimSummary> {
  const { data } = await call<never>("/api/recovery/claim");
  return data as never;
}

export interface ChangeSide { title: string; provider: string; time: string; cost: Money }
export interface TripChange {
  kind: "replaced" | "kept" | "released" | "notified";
  bookingId: string | null;
  before: ChangeSide | null;
  after: ChangeSide | null;
  note: string;
}
export interface ChangeSummary {
  changes: TripChange[];
  cost: { estimated: Money; actual: Money; differenceLabel: string };
}

export async function fetchChanges(planId: string, offerId?: string): Promise<ChangeSummary> {
  const q = new URLSearchParams({ planId, ...(offerId ? { offerId } : {}) });
  const { data } = await call<never>(`/api/recovery/changes?${q}`);
  return data as never;
}

export interface PolicySummary {
  insurer: string;
  product: string;
  reference: string;
  excess: Money;
  perTripLimit: Money;
  filingWindowDays: number;
  typicalSettlementDays: number;
  grossLoss: Money;
  lessExcess: Money;
  expectedPayout: Money;
  cappedByLimit: boolean;
}
