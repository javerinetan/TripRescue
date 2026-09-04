import test from "node:test";
import assert from "node:assert/strict";
import { createPlan, createEvidence } from "./planner.js";

test("planner respects the spending cap", () => {
  const plan = createPlan({ vendor: "Acme", country: "Singapore", amountUsd: 12000, budgetXrp: 0.05, riskTolerance: "balanced" });
  assert.ok(plan.totalXrp <= 0.05);
  assert.ok(plan.selected.length >= 1);
  assert.equal(plan.status, "awaiting_authorization");
});

test("low tolerance increases scrutiny", () => {
  const low = createPlan({ amountUsd: 6000, riskTolerance: "low", budgetXrp: 0.08 });
  const high = createPlan({ amountUsd: 6000, riskTolerance: "high", budgetXrp: 0.08 });
  assert.ok(low.riskScore > high.riskScore);
  assert.ok(low.wanted.includes("invoice"));
});

test("evidence is only produced for selected paid services", () => {
  const plan = createPlan({ amountUsd: 30000, country: "Vietnam", budgetXrp: 0.08 });
  assert.equal(createEvidence(plan).length, plan.selected.length);
});

