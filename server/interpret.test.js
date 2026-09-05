// The model proposes; these tests are the reason it cannot overreach.

import test from "node:test";
import assert from "node:assert/strict";
import { interpretRequest, parseDeterministically, validateProposal } from "./interpret.js";

test("a well-formed proposal survives validation", () => {
  const { proposal, rejected } = validateProposal({
    priority: "business",
    maximumAdditionalSpend: { currency: "SGD", minorUnits: 40000 },
    arrivalDeadline: "2026-09-05T11:00:00+09:00",
    preserveBookingIds: ["activity-fuji"],
  });
  assert.equal(proposal.priority, "business");
  assert.equal(proposal.maximumAdditionalSpend.minorUnits, 40000);
  assert.deepEqual(proposal.preserveBookingIds, ["activity-fuji"]);
  assert.deepEqual(rejected, []);
});

test("a budget beyond the allowed range is dropped, not clamped", () => {
  const { proposal, rejected } = validateProposal({ maximumAdditionalSpend: { minorUnits: 5_000_000 } });
  assert.equal(proposal.maximumAdditionalSpend, undefined);
  assert.equal(rejected.length, 1);
});

test("an invented booking id never reaches the mandate", () => {
  const { proposal, rejected } = validateProposal({
    preserveBookingIds: ["activity-fuji", "hotel-atlantis-mars"],
  });
  assert.deepEqual(proposal.preserveBookingIds, ["activity-fuji"]);
  assert.match(rejected.join(" "), /hotel-atlantis-mars/);
});

test("an unknown priority is refused", () => {
  const { proposal, rejected } = validateProposal({ priority: "vip-unlimited" });
  assert.equal(proposal.priority, undefined);
  assert.equal(rejected.length, 1);
});

test("an unparseable deadline is refused", () => {
  const { proposal, rejected } = validateProposal({ arrivalDeadline: "sometime tuesday-ish" });
  assert.equal(proposal.arrivalDeadline, undefined);
  assert.equal(rejected.length, 1);
});

test("the deterministic parser reads a business trip", () => {
  const { proposal } = parseDeterministically(
    "I have a client meeting in Tokyo, I can spend up to $400 extra, and I can't lose the Fuji tour.",
  );
  assert.equal(proposal.priority, "business");
  assert.equal(proposal.maximumAdditionalSpend.minorUnits, 40000);
  assert.ok(proposal.preserveBookingIds.includes("activity-fuji"));
});

test("the deterministic parser reads a deadline", () => {
  const { proposal } = parseDeterministically("I need to be there before noon.");
  assert.match(proposal.arrivalDeadline, /T12:00:00\+09:00$/);
  const pm = parseDeterministically("Please get me in by 2pm.");
  assert.match(pm.proposal.arrivalDeadline, /T14:00:00\+09:00$/);
});

test("the parser stays silent rather than guessing", () => {
  const { proposal } = parseDeterministically("hello there");
  assert.deepEqual(proposal, {});
});

test("interpretation always resolves, even on nonsense", async () => {
  const result = await interpretRequest("asdfgh");
  assert.ok(["llm", "fallback", "deterministic", "none"].includes(result.source));
  assert.ok(Array.isArray(result.reasons));
});

test("empty input asks for nothing", async () => {
  const result = await interpretRequest("");
  assert.equal(result.source, "none");
  assert.deepEqual(result.proposal, {});
});
