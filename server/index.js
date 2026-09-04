import "dotenv/config";
import cors from "cors";
import express from "express";
import { providers } from "./catalog.js";
import { createEvidence, createPlan } from "./planner.js";
import { preparePayment, publicWallets, signAndSubmit, verifyPayment, XRPL_STARTER_KIT_SOURCE_TAG } from "./xrpl.js";
import { loadRunRecords, persistRuns } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const runs = new Map();

app.use(cors());
app.use(express.json({ limit: "64kb" }));

function getRun(req, res) {
  const run = runs.get(req.params.id);
  if (!run) res.status(404).json({ error: "Review not found" });
  return run;
}

function requirementsFor(run) {
  const wallets = publicWallets();
  return {
    x402Version: 1,
    accepts: [{
      scheme: "exact",
      network: "xrpl:testnet",
      amount: String(run.totalDrops),
      asset: "XRP",
      payTo: wallets.merchantAddress || "configure-with-npm-run-wallet:setup",
      maxTimeoutSeconds: 180,
      extra: {
        invoiceId: run.id,
        sourceTag: XRPL_STARTER_KIT_SOURCE_TAG,
        purpose: "supplier-due-diligence-evidence",
      },
    }],
    error: "Payment required to unlock the selected evidence bundle",
  };
}

for (const record of loadRunRecords()) {
  const plan = createPlan(record.input);
  const run = {
    ...plan,
    id: record.id,
    status: record.status,
    transaction: record.transaction,
    evidence: record.status === "delivered" ? createEvidence(plan) : null,
    preview: record.preview || null,
    prepared: record.prepared || null,
  };
  run.x402 = requirementsFor(run);
  runs.set(run.id, run);
}

async function reconcileRun(run) {
  if (!run.transaction?.hash) throw new Error("No signed receipt is available to reconcile.");
  run.transaction = await verifyPayment(run.transaction.hash, run);
  run.evidence = createEvidence(run);
  run.status = "delivered";
  delete run.prepared;
  delete run.error;
  persistRuns(runs);
  return run;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, product: "ClearSpend", wallet: publicWallets(), providers: providers.length });
});

app.get("/api/providers", (_req, res) => res.json({ providers }));

app.post("/api/reviews", (req, res) => {
  const run = { ...createPlan(req.body), x402: null, preview: null, transaction: null, evidence: null };
  run.x402 = requirementsFor(run);
  runs.set(run.id, run);
  persistRuns(runs);
  res.status(201).json(run);
});

app.get("/api/reviews/:id", (req, res) => {
  const run = getRun(req, res);
  if (run) res.json(run);
});

app.get("/api/merchant/evidence/:id", async (req, res) => {
  const run = getRun(req, res);
  if (!run) return;
  const receipt = req.get("X-PAYMENT");
  if (!receipt) return res.status(402).json(requirementsFor(run));
  try {
    await verifyPayment(receipt, run);
    res.set("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ transaction: receipt, status: "settled" })).toString("base64"));
    res.json({ evidence: createEvidence(run) });
  } catch (error) {
    res.status(402).json({ ...requirementsFor(run), error: error.message });
  }
});

app.post("/api/reviews/:id/prepare", async (req, res) => {
  const run = getRun(req, res);
  if (!run) return;
  if (run.status !== "awaiting_authorization" && run.status !== "prepared") {
    return res.status(409).json({ error: `Review is already ${run.status}` });
  }
  try {
    const payment = await preparePayment(run);
    run.prepared = payment.prepared;
    run.preview = payment.preview;
    run.status = "prepared";
    persistRuns(runs);
    res.json({ id: run.id, status: run.status, preview: run.preview, x402: run.x402 });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/api/reviews/:id/authorize", async (req, res) => {
  const run = getRun(req, res);
  if (!run) return;
  if (req.body?.confirmed !== true) return res.status(400).json({ error: "Explicit confirmation is required." });
  if (run.transaction?.hash) {
    try { return res.json(await reconcileRun(run)); }
    catch (error) { return res.status(502).json({ error: error.message, transaction: run.transaction }); }
  }
  if (run.status !== "prepared" || !run.prepared) return res.status(409).json({ error: "Prepare and inspect the transaction first." });
  try {
    run.status = "settling";
    persistRuns(runs);
    run.transaction = await signAndSubmit(run.prepared, run.id);
    persistRuns(runs);
    res.json(await reconcileRun(run));
  } catch (error) {
    run.status = run.transaction?.hash ? "verification_pending" : "failed";
    run.error = error.message;
    persistRuns(runs);
    res.status(502).json({ error: error.message, transaction: run.transaction || null });
  }
});

app.post("/api/reviews/:id/reconcile", async (req, res) => {
  const run = getRun(req, res);
  if (!run) return;
  try {
    res.json(await reconcileRun(run));
  } catch (error) {
    res.status(502).json({ error: error.message, transaction: run.transaction || null });
  }
});

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message || "Unexpected error" });
});

app.listen(port, () => {
  console.log(`ClearSpend API listening on http://localhost:${port}`);
});
