// End-to-end walk of the x402 commercial loop against a running API.
//
//   npm run demo:x402
//
// Proves the canonical sequence in docs/BUILD_PLAN.md: discovery, 402 challenge,
// mandate check, XRPL Testnet settlement, retry with payment evidence, gated
// delivery, and idempotent replay.

const BASE = process.env.TRIPRESCUE_API || "http://localhost:8787";
const RECOVERY_ID = "recovery-tokyo-001";

const step = (n, label) => console.log(`\n${n}. ${label}`);
const show = (obj) => console.log(JSON.stringify(obj, null, 2));

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  step(1, "Agent discovers suppliers it was never provisioned with");
  const { body: registry } = await json("/api/suppliers/registry");
  for (const offer of registry.suppliers) {
    console.log(`   ${offer.supplierId.padEnd(30)} S$${(offer.price.minorUnits / 100).toFixed(2)}  risk ${offer.riskScore}`);
  }

  const target = registry.suppliers.find((o) => o.id === "offer-protected-transfer-001");

  step(2, "Agent requests the protected resource with no payment");
  const challenge = await json(`${target.resourcePath}?recoveryId=${RECOVERY_ID}`);
  console.log(`   HTTP ${challenge.res.status}`);
  console.log(`   PAYMENT-REQUIRED header present: ${Boolean(challenge.res.headers.get("PAYMENT-REQUIRED"))}`);
  const decoded = JSON.parse(
    Buffer.from(challenge.res.headers.get("PAYMENT-REQUIRED"), "base64").toString("utf8"),
  );
  show(decoded.accepts[0]);
  const requirement = challenge.body.paymentRequirement;

  step(3, "Agent re-checks the mandate and signs a payment intent");
  const prepared = await json("/api/payments/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      requirementId: requirement.requirementId,
      planId: "plan-reliable-001",
      mandateId: "mandate-tokyo-001",
    }),
  });
  if (prepared.res.status !== 200) {
    show(prepared.body);
    throw new Error("prepare failed");
  }
  show(prepared.body.preview);

  step(4, "Supplier submits the signed intent and waits for XRPL validation");
  const executed = await json("/api/payments/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      executionId: prepared.body.executionId,
      requirementId: requirement.requirementId,
      idempotencyKey: `${RECOVERY_ID}:${target.id}:${prepared.body.executionId}`,
    }),
  });
  if (executed.res.status !== 200) {
    show(executed.body);
    throw new Error("execute failed");
  }
  show(executed.body.receipt);
  console.log(`   remaining budget: ${executed.body.remainingLabel}`);

  step(5, "Agent retries the resource with payment evidence");
  const signature = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: decoded.accepts[0],
      payload: { signedTxBlob: executed.body.receipt.transactionHash },
    }),
    "utf8",
  ).toString("base64");

  const delivered = await json(
    `${target.resourcePath}?recoveryId=${RECOVERY_ID}&executionId=${prepared.body.executionId}`,
    { headers: { "PAYMENT-SIGNATURE": signature } },
  );
  console.log(`   HTTP ${delivered.res.status}`);
  show(delivered.body.receipt);

  step(6, "Replaying the same idempotency key must not pay again");
  const replay = await json("/api/payments/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      executionId: prepared.body.executionId,
      requirementId: requirement.requirementId,
      idempotencyKey: `${RECOVERY_ID}:${target.id}:${prepared.body.executionId}`,
    }),
  });
  console.log(`   replayed: ${replay.body.replayed === true}`);
  console.log(`   same hash: ${replay.body.receipt?.transactionHash === executed.body.receipt.transactionHash}`);

  step(7, "A supplier outside the mandate allow-list must be refused");
  const blocked = registry.suppliers.find((o) => o.id === "offer-flex-transfer-002");
  const blockedChallenge = await json(`${blocked.resourcePath}?recoveryId=${RECOVERY_ID}`);
  const blockedPrepare = await json("/api/payments/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0.0",
      requirementId: blockedChallenge.body.paymentRequirement.requirementId,
      mandateId: "mandate-tokyo-001",
    }),
  });
  console.log(`   HTTP ${blockedPrepare.res.status} ${blockedPrepare.body.error?.code}`);
  console.log(`   ${blockedPrepare.body.error?.message}`);

  console.log(`\nExplorer: ${executed.body.receipt.explorerUrl}\n`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exitCode = 1;
});
