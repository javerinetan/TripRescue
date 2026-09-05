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
  const result = await interpretRequest("asdfgh", { provider: null });
  assert.equal(result.source, "deterministic");
  assert.ok(Array.isArray(result.reasons));
});

test("a provider proposal is validated and records served model provenance", async () => {
  const result = await interpretRequest("client meeting, preserve Fuji", {
    provider: {
      model: "claude-opus-5",
      interpretIntent: async () => ({
        servedModel: "claude-opus-5",
        proposal: {
          priority: "business",
          preserveBookingIds: ["activity-fuji", "invented-booking"],
          explanation: "Arrive for the meeting and keep the Fuji activity.",
        },
      }),
    },
  });
  assert.equal(result.source, "llm");
  assert.equal(result.model, "claude-opus-5");
  assert.equal(result.modelAttempt.outcome, "used");
  assert.deepEqual(result.proposal.preserveBookingIds, ["activity-fuji"]);
  assert.match(result.rejected.join(" "), /invented-booking/);
});

test("a provider failure falls back deterministically with provenance", async () => {
  const result = await interpretRequest("client meeting before noon", {
    provider: {
      model: "claude-opus-5",
      interpretIntent: async () => { throw new Error("provider unavailable"); },
    },
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.modelAttempt.outcome, "provider-error");
  assert.equal(result.proposal.priority, "business");
});

test("empty input asks for nothing", async () => {
  const result = await interpretRequest("");
  assert.equal(result.source, "none");
  assert.deepEqual(result.proposal, {});
});

test("a cancelled reason for travelling is not read as the reason", () => {
  const { proposal } = parseDeterministically(
    "Change of plan, the meeting is off. Just a holiday now, keep the extra cost down.",
  );
  assert.equal(proposal.priority, "leisure");
});

test("the strongest signal wins when a trip mentions two reasons", () => {
  const { proposal } = parseDeterministically(
    "Family holiday with the kids and my parents, though I may take one work call.",
  );
  assert.equal(proposal.priority, "family");
});

test("a plain business trip still reads as business", () => {
  const { proposal } = parseDeterministically("Client meeting in Tokyo, I must be there on time.");
  assert.equal(proposal.priority, "business");
});
