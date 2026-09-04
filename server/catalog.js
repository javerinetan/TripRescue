export const providers = [
  {
    id: "registry-lens",
    name: "Registry Lens",
    monogram: "RL",
    category: "Company registry",
    description: "Live incorporation, directors, and operating-status evidence.",
    priceDrops: 12000,
    latencyMs: 640,
    confidence: 96,
    capabilities: ["identity", "registration", "directors"],
  },
  {
    id: "sanction-zero",
    name: "Sanction Zero",
    monogram: "SZ",
    category: "Sanctions screening",
    description: "Global sanctions, PEP, and adverse-media screening.",
    priceDrops: 18000,
    latencyMs: 820,
    confidence: 98,
    capabilities: ["sanctions", "pep", "adverse-media"],
  },
  {
    id: "invoice-sentry",
    name: "Invoice Sentry",
    monogram: "IS",
    category: "Invoice forensics",
    description: "Duplicate, tampering, and bank-detail anomaly detection.",
    priceDrops: 21000,
    latencyMs: 1100,
    confidence: 94,
    capabilities: ["invoice", "fraud", "bank-details"],
  },
  {
    id: "trade-pulse",
    name: "Trade Pulse",
    monogram: "TP",
    category: "Trade reputation",
    description: "Shipment reliability and counterparty dispute signals.",
    priceDrops: 15000,
    latencyMs: 1450,
    confidence: 89,
    capabilities: ["delivery", "reputation", "disputes"],
  },
];

export function toXrp(drops) {
  return Number(drops) / 1_000_000;
}

