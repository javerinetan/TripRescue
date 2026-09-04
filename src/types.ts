// Shared types mirroring docs/API_CONTRACT.md v1.0.0.

export interface Money {
  currency: "SGD";
  minorUnits: number;
}

export interface SupplierOffer {
  id: string;
  supplierId: string;
  title: string;
  description: string;
  price: Money;
  resourcePath: string;
  supportsX402: true;
  arrivalTime: string;
  riskScore: number;
  preservesBookingIds: string[];
}

export interface PaymentRequirement {
  requirementId: string;
  scheme: string;
  network: string;
  asset: string;
  amountDrops: string;
  destination: string;
  memo: string;
  expiresAt: string;
}

export interface TransactionPreview {
  network: string;
  type: string;
  from: string;
  to: string;
  amountDrops: string;
  amountXrp: number;
  feeDrops: string;
  feeXrp: number;
  sequence: number;
  lastLedgerSequence: number;
  sourceTag: number;
  invoiceId: string;
}

export interface ExecutionReceipt {
  executionId: string;
  planId: string;
  offerId: string;
  status: "pending-payment" | "settled" | "delivered" | "failed";
  transactionHash?: string;
  explorerUrl?: string;
  deliveredResource?: {
    type: "reservation-hold";
    reference: string;
    description: string;
    expiresAt: string;
  };
}

export interface MandateViolation {
  code: string;
  explanation: string;
}

export interface RescueMandate {
  id: string;
  maximumAdditionalSpend: Money;
  arrivalDeadline: string;
  preserveBookingIds: string[];
  accommodationRules: string[];
  allowedSupplierIds: string[];
  network: string;
}

export type StepState = "idle" | "running" | "done" | "blocked" | "failed";

export interface JourneyStep {
  id: string;
  label: string;
  detail?: string;
  state: StepState;
}
