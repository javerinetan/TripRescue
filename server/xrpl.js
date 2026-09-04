import fs from "node:fs";
import path from "node:path";
import xrpl from "xrpl";

export const XRPL_STARTER_KIT_SOURCE_TAG = 20260530;
const network = process.env.XRPL_NETWORK || "testnet";
const rpc = process.env.XRPL_RPC || "wss://s.altnet.rippletest.net:51233";
const explorerBase = process.env.XRPL_EXPLORER || "https://testnet.xrpl.org/transactions";

export function nativePaymentAmount(tx) {
  return tx.Amount ?? tx.DeliverMax;
}

function seedFor(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured. Run npm run wallet:setup.`);
  return value;
}

function loadWallet(name) {
  return xrpl.Wallet.fromSeed(seedFor(name));
}

export function publicWallets() {
  try {
    return {
      configured: true,
      agentAddress: loadWallet("XRPL_AGENT_SEED").address,
      merchantAddress: loadWallet("XRPL_MERCHANT_SEED").address,
      network,
    };
  } catch {
    return { configured: false, agentAddress: null, merchantAddress: null, network };
  }
}

export async function preparePayment(plan) {
  const agent = loadWallet("XRPL_AGENT_SEED");
  const merchant = loadWallet("XRPL_MERCHANT_SEED");
  const client = new xrpl.Client(rpc);
  await client.connect();
  try {
    const tx = {
      TransactionType: "Payment",
      Account: agent.address,
      Destination: merchant.address,
      Amount: String(plan.totalDrops),
      SourceTag: XRPL_STARTER_KIT_SOURCE_TAG,
      Memos: [{ Memo: {
        MemoType: Buffer.from("clearspend/x402", "utf8").toString("hex").toUpperCase(),
        MemoData: Buffer.from(plan.id, "utf8").toString("hex").toUpperCase(),
      } }],
    };
    const prepared = await client.autofill(tx);
    const ledger = await client.getLedgerIndex();
    return {
      prepared,
      preview: {
        network,
        type: prepared.TransactionType,
        from: prepared.Account,
        to: prepared.Destination,
        amountDrops: prepared.Amount,
        amountXrp: xrpl.dropsToXrp(prepared.Amount),
        feeDrops: prepared.Fee,
        feeXrp: xrpl.dropsToXrp(prepared.Fee),
        sequence: prepared.Sequence,
        lastLedgerSequence: prepared.LastLedgerSequence,
        expiresInLedgers: prepared.LastLedgerSequence - ledger,
        sourceTag: prepared.SourceTag,
        memo: plan.id,
      },
    };
  } finally {
    await client.disconnect();
  }
}

function persistPending(hash, prepared, planId) {
  const dataDir = path.resolve("data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(
    path.join(dataDir, "transactions.jsonl"),
    `${JSON.stringify({ hash, planId, prepared, status: "signed_pending", at: new Date().toISOString() })}\n`,
    "utf8",
  );
}

export async function signAndSubmit(prepared, planId) {
  const wallet = loadWallet("XRPL_AGENT_SEED");
  if (wallet.address !== prepared.Account) throw new Error("Signing wallet does not match the prepared transaction account.");
  const signed = wallet.sign(prepared);
  persistPending(signed.hash, prepared, planId);

  const client = new xrpl.Client(rpc);
  await client.connect();
  try {
    const response = await client.submitAndWait(signed.tx_blob);
    const result = response.result.meta?.TransactionResult;
    if (result !== "tesSUCCESS") {
      throw new Error(`XRPL settled with ${result || "an unknown result"}; do not resubmit.`);
    }
    return {
      hash: signed.hash,
      result,
      ledgerIndex: response.result.ledger_index,
      explorerUrl: `${explorerBase}/${signed.hash}`,
    };
  } finally {
    await client.disconnect();
  }
}

export async function verifyPayment(hash, plan) {
  const wallets = publicWallets();
  const client = new xrpl.Client(rpc);
  await client.connect();
  try {
    const response = await client.request({ command: "tx", transaction: hash, binary: false });
    const tx = response.result.tx_json || response.result;
    const meta = response.result.meta;
    // rippled API v2 exposes a native Payment's requested amount as DeliverMax.
    // API v1 and older xrpl.js responses expose the same field as Amount.
    const deliveredAmount = nativePaymentAmount(tx);
    const memoData = tx.Memos?.[0]?.Memo?.MemoData;
    const expectedMemo = Buffer.from(plan.id, "utf8").toString("hex").toUpperCase();
    const valid = response.result.validated === true
      && meta?.TransactionResult === "tesSUCCESS"
      && tx.TransactionType === "Payment"
      && tx.Account === wallets.agentAddress
      && tx.Destination === wallets.merchantAddress
      && String(deliveredAmount) === String(plan.totalDrops)
      && tx.SourceTag === XRPL_STARTER_KIT_SOURCE_TAG
      && memoData === expectedMemo;
    if (!valid) throw new Error("The XRPL receipt does not satisfy this x402 payment requirement.");
    return {
      hash,
      result: meta.TransactionResult,
      ledgerIndex: response.result.ledger_index,
      explorerUrl: `${explorerBase}/${hash}`,
    };
  } finally {
    await client.disconnect();
  }
}
