import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_SESSION_KEY,
  IMPORT_STAGES,
  clearImportComplete,
  nextImportStage,
  readImportComplete,
  saveImportComplete,
} from "./tripImportState.ts";

test("import stages advance in the order shown to the traveller", () => {
  assert.deepEqual(IMPORT_STAGES.map(({ id }) => id), ["finding", "grouping", "monitoring"]);
  assert.equal(nextImportStage("idle"), "finding");
  assert.equal(nextImportStage("finding"), "grouping");
  assert.equal(nextImportStage("grouping"), "monitoring");
  assert.equal(nextImportStage("monitoring"), "complete");
  assert.equal(nextImportStage("complete"), "complete");
});

test("only the exact completed session value bypasses onboarding", () => {
  const storage = (value) => ({
    getItem: (key) => key === IMPORT_SESSION_KEY ? value : null,
    setItem() {},
    removeItem() {},
  });
  assert.equal(readImportComplete(storage("complete")), true);
  assert.equal(readImportComplete(storage("true")), false);
  assert.equal(readImportComplete(storage(null)), false);
  assert.equal(readImportComplete(null), false);
});

test("storage restrictions never block import or replay", () => {
  const restricted = {
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("storage disabled"); },
    removeItem() { throw new Error("storage disabled"); },
  };
  assert.equal(readImportComplete(restricted), false);
  assert.doesNotThrow(() => saveImportComplete(restricted));
  assert.doesNotThrow(() => clearImportComplete(restricted));
});
