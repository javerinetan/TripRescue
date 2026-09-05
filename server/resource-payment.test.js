import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createRouter } from "./routes.js";
import { decodeHeader } from "./x402.js";
import { resetExecutions } from "./executions.js";
import { remainingBudget, resetMandates } from "./mandate.js";

const SIGNED_BLOB = "12000022800000002400000001201B0000000A";
const HASH = "ABC123";

function dependencies(overrides = {}) {
  const calls = { sign: 0, submit: 0, verify: 0 };
  return {
    calls,
    services: {
      publicWallets: () => ({ configured: true, agentAddress: "rAgent", merchantAddress: "rMerchant", network: "testnet" }),
      signPaymentIntent: async () => {
        calls.sign += 1;
        return { signedTxBlob: SIGNED_BLOB, hash: HASH, preview: { network: "testnet", type: "Payment", from: "rAgent", to: "rMerchant", amountDrops: "48000", amountXrp: 0.000048, feeDrops: "12", feeXrp: 0.000012, sequence: 1, lastLedgerSequence: 2, sourceTag: 20260530, invoiceId: "recovery-tokyo-001:offer-protected-transfer-001" } };
      },
      submitSignedBlob: async (blob) => {
        calls.submit += 1;
        assert.equal(blob, SIGNED_BLOB);
        return { hash: HASH, result: "tesSUCCESS", ledgerIndex: 123, explorerUrl: `https://example.test/${HASH}` };
      },
      verifySettlement: async (hash) => {
        calls.verify += 1;
        assert.equal(hash, HASH);
        return { ok: true, hash, result: "tesSUCCESS", ledgerIndex: 123, explorerUrl: `https://example.test/${hash}` };
      },
      ...overrides,
    },
  };
}

async function withServer(services, run) {
  resetMandates();
  resetExecutions();
  const app = express();
  app.use(express.json());
  app.use("/api", createRouter(services));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  try { await run(`http://127.0.0.1:${server.address().port}/api`); }
  finally { await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))); }
}

async function setup(baseUrl) {
  const resourcePath = "/suppliers/supplier-protected-transfer/offers/offer-protected-transfer-001/resource";
  const challengeResponse = await fetch(`${baseUrl}${resourcePath}?recoveryId=recovery-tokyo-001`);
  const challengeBody = await challengeResponse.json();
  assert.equal(challengeResponse.status, 402);
  const challenge = { resourcePath, requirement: challengeBody.paymentRequirement, accepted: decodeHeader(challengeResponse.headers.get("PAYMENT-REQUIRED")).accepts[0] };
  const offersResponse = await fetch(`${baseUrl}/recovery/offers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: "plan-reliable-001", mandateId: "mandate-tokyo-001" }) });
  const offers = await offersResponse.json();
  assert.equal(offersResponse.status, 200);
  const prepareResponse = await fetch(`${baseUrl}/payments/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requirementId: challenge.requirement.requirementId, planId: "plan-reliable-001", decisionId: offers.decisionId, mandateId: "mandate-tokyo-001" }) });
  return { challenge, offers, prepared: { response: prepareResponse, body: await prepareResponse.json() } };
}

async function claim(baseUrl, setupData, executionId = setupData.prepared.body.executionId, paymentSignature = setupData.prepared.body.paymentSignature, idempotencyKey = "stable-key") {
  const response = await fetch(`${baseUrl}${setupData.challenge.resourcePath}?recoveryId=recovery-tokyo-001&executionId=${executionId}`, { headers: { "PAYMENT-SIGNATURE": paymentSignature, "Idempotency-Key": idempotencyKey } });
  return { response, body: await response.json() };
}

test("prepare returns an opaque signature containing the genuine signed transaction blob", async () => {
  const { calls, services } = dependencies();
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    assert.equal(data.prepared.response.status, 200);
    assert.equal(calls.sign, 1);
    assert.deepEqual(decodeHeader(data.prepared.body.paymentSignature), { x402Version: 2, accepted: data.challenge.accepted, payload: { signedTxBlob: SIGNED_BLOB } });
    assert.equal(data.prepared.body.signedTxBlob, undefined);
    assert.equal(JSON.stringify(data.prepared.body).includes("seed"), false);
  });
});

test("forged plans are rejected before signing", async () => {
  const { calls, services } = dependencies();
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const response = await fetch(`${baseUrl}/payments/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requirementId: data.challenge.requirement.requirementId, planId: "plan-forged-999", decisionId: data.offers.decisionId, mandateId: "mandate-tokyo-001" }) });
    assert.equal(response.status, 422);
    assert.equal(calls.sign, 1);
  });
});

test("genuine signature settles, verifies, and delivers", async () => {
  const { calls, services } = dependencies();
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const delivered = await claim(baseUrl, data);
    assert.equal(delivered.response.status, 200);
    assert.equal(delivered.body.receipt.status, "delivered");
    assert.equal(delivered.body.receipt.transactionHash, HASH);
    assert.equal(calls.submit, 1);
    assert.equal(calls.verify, 1);
  });
});

test("accepted requirement or blob mismatch is rejected before submission", async () => {
  const { calls, services } = dependencies();
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const genuine = decodeHeader(data.prepared.body.paymentSignature);
    for (const signature of [
      Buffer.from(JSON.stringify({ ...genuine, accepted: { ...genuine.accepted, amount: "1" } })).toString("base64"),
      Buffer.from(JSON.stringify({ ...genuine, payload: { signedTxBlob: "DEADBEEF" } })).toString("base64"),
    ]) {
      const result = await claim(baseUrl, data, undefined, signature);
      assert.equal(result.response.status, 422);
      assert.equal(result.body.error.code, "payment-mismatch");
    }
    assert.equal(calls.submit, 0);
    assert.equal(calls.verify, 0);
  });
});

test("verification failure never releases the resource or budget", async () => {
  const { calls, services } = dependencies({ verifySettlement: async () => { calls.verify += 1; return { ok: false, reason: "not validated" }; } });
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const result = await claim(baseUrl, data);
    assert.equal(result.response.status, 422);
    assert.equal(result.body.receipt, undefined);
    assert.equal(calls.submit, 1);
    assert.equal(remainingBudget("mandate-tokyo-001"), 25200);
  });
});

test("concurrent retries submit once and replay the canonical receipt", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { calls, services } = dependencies({ submitSignedBlob: async (blob) => { calls.submit += 1; assert.equal(blob, SIGNED_BLOB); await gate; return { hash: HASH, explorerUrl: `https://example.test/${HASH}` }; } });
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const first = claim(baseUrl, data);
    const second = claim(baseUrl, data);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const results = await Promise.all([first, second]);
    assert.equal(results[0].response.status, 200);
    assert.equal(results[1].response.status, 200);
    assert.equal(calls.submit, 1);
    assert.equal(calls.verify, 1);
  });
});

test("same logical key replays across a second prepare", async () => {
  const { calls, services } = dependencies();
  await withServer(services, async (baseUrl) => {
    const data = await setup(baseUrl);
    const secondResponse = await fetch(`${baseUrl}/payments/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requirementId: data.challenge.requirement.requirementId, planId: "plan-reliable-001", decisionId: data.offers.decisionId, mandateId: "mandate-tokyo-001" }) });
    const second = { response: secondResponse, body: await secondResponse.json() };
    const first = await claim(baseUrl, data, data.prepared.body.executionId, data.prepared.body.paymentSignature, "same-logical-action");
    const replay = await claim(baseUrl, data, second.body.executionId, second.body.paymentSignature, "same-logical-action");
    assert.equal(first.response.status, 200);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(calls.submit, 1);
  });
});
