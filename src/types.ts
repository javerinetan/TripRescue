// Shared types mirroring docs/API_CONTRACT.md v1.0.0.

export interface Money {
  currency: "SGD";
  minorUnits: number;
}

export interface SupplierOffer {
  id: string;
  supplierId: string;
  /** The company on the confirmation. Absent on older fixtures. */
  supplierName?: string;
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

export interface Booking {
  id: string;
  type: "flight" | "transfer" | "hotel" | "rental" | "activity";
  provider: string;
  title: string;
  startTime: string;
  endTime?: string;
  dependsOn: string[];
  cost: Money;
  refundable: boolean;
  changeDeadline?: string;
}

export interface BookingAssessment {
  bookingId: string;
  status: "safe" | "at-risk" | "broken";
  reasonCode: string;
  explanation: string;
}

export interface RecoveryAction {
  id: string;
  kind: "preserve" | "cancel" | "change" | "purchase" | "notify";
  bookingId?: string;
  supplierId?: string;
  description: string;
  incrementalCost: Money;
  reversible: boolean;
  dependsOnActionIds: string[];
}

export interface RecoveryPlan {
  id: string;
  kind: "fastest" | "cheapest" | "most-reliable";
  title: string;
  actions: RecoveryAction[];
  additionalCost: Money;
  arrivalTime: string;
  riskScore: number;
  preservesBookingIds: string[];
  accommodationType: "private" | "shared" | "unchanged";
  mandateCompliant: boolean;
  violations: MandateViolation[];
  explanation: string;
}
