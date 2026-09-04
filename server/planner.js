import crypto from "node:crypto";
import { providers, toXrp } from "./catalog.js";

const countryRisk = new Map([
  ["singapore", 8], ["australia", 10], ["japan", 11], ["united kingdom", 12],
  ["vietnam", 27], ["indonesia", 25], ["india", 24], ["china", 28],
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function createPlan(input) {
  const amountUsd = clamp(Number(input.amountUsd) || 0, 1, 10_000_000);
  const budgetXrp = clamp(Number(input.budgetXrp) || 0.06, 0.012, 1);
  const riskTolerance = ["low", "balanced", "high"].includes(input.riskTolerance)
    ? input.riskTolerance : "balanced";
  const country = String(input.country || "Singapore").trim();
  const vendor = String(input.vendor || "New supplier").trim().slice(0, 100);
  const invoiceRef = String(input.invoiceRef || "INV-DEMO-2048").trim().slice(0, 60);

  const baseRisk = countryRisk.get(country.toLowerCase()) ?? 22;
  const valueRisk = Math.min(38, Math.round(Math.log10(Math.max(amountUsd, 10)) * 7));
  const toleranceBoost = riskTolerance === "low" ? 16 : riskTolerance === "high" ? -8 : 4;
  const riskScore = clamp(baseRisk + valueRisk + toleranceBoost, 8, 92);

  const wanted = new Set(["identity", "sanctions"]);
  if (amountUsd >= 5000 || riskTolerance === "low") wanted.add("invoice");
  if (amountUsd >= 25000 || baseRisk >= 25) wanted.add("reputation");

  const ranked = providers.map((provider) => {
    const relevance = provider.capabilities.some((capability) => wanted.has(capability)) ? 1 : 0.45;
    const quality = provider.confidence / 100;
    const speed = 1 - provider.latencyMs / 5000;
    const value = 1 - provider.priceDrops / Math.max(budgetXrp * 1_000_000, 1);
    const score = (relevance * 0.45 + quality * 0.3 + speed * 0.15 + value * 0.1) * 100;
    return { ...provider, agentScore: Math.round(score) };
  }).sort((a, b) => b.agentScore - a.agentScore);

  let spentDrops = 0;
  const maxDrops = Math.round(budgetXrp * 1_000_000);
  const selected = [];
  for (const provider of ranked) {
    const isRequired = provider.capabilities.some((capability) => wanted.has(capability));
    if (isRequired && spentDrops + provider.priceDrops <= maxDrops) {
      selected.push(provider);
      spentDrops += provider.priceDrops;
    }
  }
  if (!selected.length) {
    selected.push(ranked[0]);
    spentDrops = ranked[0].priceDrops;
  }

  const id = crypto.randomUUID();
  const reasons = [
    `${vendor} is a ${riskScore >= 55 ? "heightened" : riskScore >= 35 ? "moderate" : "lower"}-risk review at ${riskScore}/100.`,
    `The bundle covers ${[...wanted].join(", ")} signals within the ${budgetXrp.toFixed(3)} XRP cap.`,
    `${selected.length} provider${selected.length === 1 ? "" : "s"} selected for ${toXrp(spentDrops).toFixed(3)} XRP; ${toXrp(maxDrops - spentDrops).toFixed(3)} XRP remains.`,
  ];

  return {
    id,
    createdAt: new Date().toISOString(),
    status: "awaiting_authorization",
    input: { vendor, invoiceRef, country, amountUsd, budgetXrp, riskTolerance },
    riskScore,
    wanted: [...wanted],
    ranked,
    selected,
    totalDrops: spentDrops,
    totalXrp: toXrp(spentDrops),
    reasons,
  };
}

export function createEvidence(plan) {
  const suffix = plan.input.invoiceRef.replace(/[^a-z0-9]/gi, "").slice(-5).toUpperCase();
  return plan.selected.map((provider, index) => {
    const base = {
      providerId: provider.id,
      provider: provider.name,
      purchasedForXrp: toXrp(provider.priceDrops),
      receipt: `EV-${suffix}-${index + 1}`,
      deliveredAt: new Date().toISOString(),
    };
    if (provider.id === "registry-lens") return { ...base, finding: "Active entity; registration verified", severity: "clear" };
    if (provider.id === "sanction-zero") return { ...base, finding: "No sanctions or PEP match found", severity: "clear" };
    if (provider.id === "invoice-sentry") return { ...base, finding: "Bank details consistent; no duplicate detected", severity: "clear" };
    return { ...base, finding: "Delivery reliability above sector median", severity: "clear" };
  });
}

