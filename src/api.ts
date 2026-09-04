// API client for the supplier, x402 and payment routes.

import type { ExecutionReceipt, PaymentRequirement, RescueMandate, SupplierOffer, TransactionPreview } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";
export const RECOVERY_ID = "recovery-tokyo-001";
export const MANDATE_ID = "mandate-tokyo-001";

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
): Promise<{ requirement: PaymentRequirement; accepted: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${offer.resourcePath}?recoveryId=${RECOVERY_ID}`);
  const body = await res.json();
  if (res.status !== 402) throw new ApiFailure(res.status, "unexpected", "Expected HTTP 402 from the supplier.");
  const header = res.headers.get("PAYMENT-REQUIRED");
  const accepted = header ? JSON.parse(atob(header)).accepts[0] : {};
  return { requirement: body.paymentRequirement as PaymentRequirement, accepted };
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
): Promise<ExecutionReceipt> {
  const signature = btoa(
    JSON.stringify({ x402Version: 2, accepted, payload: { signedTxBlob: transactionHash } }),
  );
  const { data } = await call<{ receipt: ExecutionReceipt }>(
    `${offer.resourcePath}?recoveryId=${RECOVERY_ID}&executionId=${executionId}`,
    { headers: { "PAYMENT-SIGNATURE": signature } },
  );
  return data.receipt;
}

export function formatSgd(minorUnits: number): string {
  return `S$${(minorUnits / 100).toFixed(2)}`;
}
