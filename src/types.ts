export type Provider = {
  id: string;
  name: string;
  monogram: string;
  category: string;
  description: string;
  priceDrops: number;
  latencyMs: number;
  confidence: number;
  capabilities: string[];
  agentScore: number;
};

export type Review = {
  id: string;
  createdAt: string;
  status: "awaiting_authorization" | "prepared" | "settling" | "verification_pending" | "delivered" | "failed";
  input: {
    vendor: string;
    invoiceRef: string;
    country: string;
    amountUsd: number;
    budgetXrp: number;
    riskTolerance: string;
  };
  riskScore: number;
  wanted: string[];
  ranked: Provider[];
  selected: Provider[];
  totalDrops: number;
  totalXrp: number;
  reasons: string[];
  x402: { accepts: Array<Record<string, unknown>> };
  preview?: TransactionPreview;
  transaction?: { hash: string; result: string; ledgerIndex: number; explorerUrl: string };
  evidence?: Array<{ provider: string; finding: string; severity: string; receipt: string; purchasedForXrp: number }>;
};

export type TransactionPreview = {
  network: string;
  type: string;
  from: string;
  to: string;
  amountDrops: string;
  amountXrp: string;
  feeDrops: string;
  feeXrp: string;
  sequence: number;
  lastLedgerSequence: number;
  expiresInLedgers: number;
  sourceTag: number;
  memo: string;
};
