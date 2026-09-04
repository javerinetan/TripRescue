// XRPL Testnet settlement for the x402 flow.
//
// The agent SIGNS a payment intent; the supplier SUBMITS and verifies it before
// releasing the resource. That ordering is what makes docs/BUILD_PLAN.md
// invariant 2 (no delivery before verified settlement) structurally true rather
// than merely enforced by a check.
//
// Wallet seeds stay in this module. They are never returned by any route.

import fs from "node:fs";
import path from "node:path";
import xrpl from "xrpl";

export const XRPL_STARTER_KIT_SOURCE_TAG = 20260530;

const network = process.env.XRPL_NETWORK || "testnet";
const rpc = process.env.XRPL_RPC || "wss://s.altnet.rippletest.net:51233";
const explorerBase = process.env.XRPL_EXPLORER || "https://testnet.xrpl.org/transactions";

// A demo operator may sit on the authorization screen for a while, so give the
// signed intent a generous validity window instead of autofill's short default.
const LEDGER_VALIDITY_WINDOW = 200;

export function nativePaymentAmount(tx) {
  return tx.Amount ?? tx.DeliverMax;
}

export function explorerUrlFor(hash) {
  return `${explorerBase}/${hash}`;
}

export function hexMemo(value) {
  return Buffer.from(value, "utf8").toString("hex").toUpperCase();
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

async function withClient(fn) {
  const client = new xrpl.Client(rpc);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

/**
 * Signs a Payment matching an x402 payment requirement. Returns the signed blob
 * and a human-readable preview for the authorization screen. Never returns the
 * seed or the wallet.
 */
export async function signPaymentIntent({ amountDrops, destination, invoiceId }) {
  const agent = loadWallet("XRPL_AGENT_SEED");
  return withClient(async (client) => {
    const ledgerIndex = await client.getLedgerIndex();
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: agent.address,
      Destination: destination,
      Amount: String(amountDrops),
      SourceTag: XRPL_STARTER_KIT_SOURCE_TAG,
      Memos: [
        {
          Memo: {
            MemoType: hexMemo("triprescue/x402"),
            MemoData: hexMemo(invoiceId),
          },
        },
      ],
    });
    prepared.LastLedgerSequence = ledgerIndex + LEDGER_VALIDITY_WINDOW;

    const signed = agent.sign(prepared);
    return {
      signedTxBlob: signed.tx_blob,
      hash: signed.hash,
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
        sourceTag: prepared.SourceTag,
        invoiceId,
      },
    };
  });
}

function persistTransaction(entry) {
  try {
    const dataDir = path.resolve("data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(
      path.join(dataDir, "transactions.jsonl"),
      `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`,
      "utf8",
    );
  } catch {
    // An audit-log write must never take down a settlement path.
  }
}

/**
 * Supplier side: submit the agent's signed blob and wait for validation.
 * Throws unless the ledger reports tesSUCCESS.
 */
export async function submitSignedBlob(signedTxBlob, context = {}) {
  persistTransaction({ ...context, status: "submitting" });
  return withClient(async (client) => {
    const response = await client.submitAndWait(signedTxBlob);
    const result = response.result.meta?.TransactionResult;
    const hash = response.result.hash;
    if (result !== "tesSUCCESS") {
      persistTransaction({ ...context, hash, status: "failed", result });
      throw new Error(`XRPL settlement returned ${result || "an unknown result"}.`);
    }
    persistTransaction({ ...context, hash, status: "settled", result });
    return {
      hash,
      result,
      ledgerIndex: response.result.ledger_index,
      explorerUrl: explorerUrlFor(hash),
    };
  });
}

/**
 * Supplier side: independently confirm from the ledger that a validated payment
 * matches this exact requirement. Returns { ok, reason }.
 */
export async function verifySettlement(hash, { amountDrops, destination, invoiceId }) {
  const wallets = publicWallets();
  return withClient(async (client) => {
    const response = await client.request({ command: "tx", transaction: hash, binary: false });
    const tx = response.result.tx_json || response.result;
    const meta = response.result.meta;
    // rippled API v2 reports a native Payment's requested amount as DeliverMax;
    // v1 and older xrpl.js responses use Amount.
    const amount = nativePaymentAmount(tx);

    const checks = [
      [response.result.validated === true, "The transaction is not validated yet."],
      [meta?.TransactionResult === "tesSUCCESS", "The transaction did not succeed."],
      [tx.TransactionType === "Payment", "The transaction is not a Payment."],
      [tx.Account === wallets.agentAddress, "The payment did not come from the agent wallet."],
      [tx.Destination === destination, "The payment went to the wrong destination."],
      [String(amount) === String(amountDrops), "The paid amount does not match the requirement."],
      [tx.SourceTag === XRPL_STARTER_KIT_SOURCE_TAG, "The SourceTag does not match."],
      [tx.Memos?.[0]?.Memo?.MemoData === hexMemo(invoiceId), "The invoice memo does not match this offer."],
    ];
    const failed = checks.find(([ok]) => !ok);
    if (failed) return { ok: false, reason: failed[1] };

    return {
      ok: true,
      hash,
      result: meta.TransactionResult,
      ledgerIndex: response.result.ledger_index,
      explorerUrl: explorerUrlFor(hash),
    };
  });
}
