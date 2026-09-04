import test from "node:test";
import assert from "node:assert/strict";
import { nativePaymentAmount } from "./xrpl.js";

test("reads native payment amount from rippled API v1", () => {
  assert.equal(nativePaymentAmount({ Amount: "51000" }), "51000");
});

test("reads native payment amount from rippled API v2", () => {
  assert.equal(nativePaymentAmount({ DeliverMax: "51000" }), "51000");
});

