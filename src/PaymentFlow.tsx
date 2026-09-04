// The agentic commercial loop, made visible.
//
// Every economic decision the agent makes is shown with its reason, so a
// reviewer can see what was discovered, what was refused, what was paid, and
// what came back. Mirrors the sequence in docs/BUILD_PLAN.md.

import { useEffect, useState } from "react";
import {
  ApiFailure,
  MANDATE_ID,
  RECOVERY_ID,
  challengeResource,
  claimResource,
  discoverSuppliers,
  executePayment,
  fetchMandate,
  formatSgd,
  preparePayment,
} from "./api";
import type { ExecutionReceipt, JourneyStep, RescueMandate, SupplierOffer, TransactionPreview } from "./types";

const STEPS: { id: string; label: string }[] = [
  { id: "discover", label: "Discover suppliers" },
  { id: "challenge", label: "Request resource, receive 402" },
  { id: "authorize", label: "Check mandate, sign intent" },
  { id: "settle", label: "Settle on XRPL Testnet" },
  { id: "deliver", label: "Verify receipt, release resource" },
];

type Log = { id: number; kind: "info" | "decision" | "refusal" | "money" | "error"; text: string };

export default function PaymentFlow() {
  const [mandate, setMandate] = useState<RescueMandate | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [steps, setSteps] = useState<JourneyStep[]>(STEPS.map((s) => ({ ...s, state: "idle" })));
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const log = (kind: Log["kind"], text: string) =>
    setLogs((prev) => [...prev, { id: prev.length, kind, text }]);

  const setStep = (id: string, state: JourneyStep["state"], detail?: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail } : s)));

  useEffect(() => {
    fetchMandate()
      .then((data) => {
        setMandate(data.mandate);
        setRemaining(data.remaining.minorUnits);
      })
      .catch(() => setOffline(true));
  }, []);

  function reset() {
    setSteps(STEPS.map((s) => ({ ...s, state: "idle" })));
    setPreview(null);
    setReceipt(null);
    setLogs([]);
  }

  async function runLoop(targetOfferId: string) {
    reset();
    setBusy(true);
    try {
      setStep("discover", "running");
      const discovered = await discoverSuppliers();
      setOffers(discovered);
      setStep("discover", "done", `${discovered.length} suppliers found at runtime`);
      log("info", `Discovered ${discovered.length} suppliers the agent was not provisioned with.`);

      const offer = discovered.find((o) => o.id === targetOfferId);
      if (!offer) throw new Error("Offer disappeared from the registry.");
      log("decision", `Evaluating ${offer.title} — ${formatSgd(offer.price.minorUnits)}, risk ${offer.riskScore}.`);

      setStep("challenge", "running");
      const { requirement, accepted } = await challengeResource(offer);
      setStep("challenge", "done", `402, ${requirement.amountDrops} drops on ${requirement.network}`);
      log("info", `Supplier replied 402 asking ${requirement.amountDrops} drops on ${requirement.network}.`);

      setStep("authorize", "running");
      const prepared = await preparePayment(requirement.requirementId);
      setPreview(prepared.preview);
      setStep("authorize", "done", "within mandate");
      log(
        "decision",
        `Mandate allows this purchase. ${formatSgd(prepared.budget.remainingAfter.minorUnits)} would remain of ` +
          `${formatSgd(prepared.budget.authorized.minorUnits)}.`,
      );

      setStep("settle", "running");
      const executed = await executePayment(
        prepared.executionId,
        `${RECOVERY_ID}:${offer.id}:${prepared.executionId}`,
      );
      setReceipt(executed.receipt);
      setStep("settle", "done", executed.receipt.transactionHash?.slice(0, 16));
      log("money", `Settled ${formatSgd(offer.price.minorUnits)} on XRPL Testnet. ${executed.remainingLabel} remaining.`);

      setStep("deliver", "running");
      const delivered = await claimResource(offer, prepared.executionId, accepted, executed.receipt.transactionHash!);
      setReceipt(delivered);
      setStep("deliver", "done", delivered.deliveredResource?.reference);
      log("info", `Supplier verified the receipt and released ${delivered.deliveredResource?.reference}.`);

      const fresh = await fetchMandate();
      setRemaining(fresh.remaining.minorUnits);
    } catch (error) {
      const failure = error as ApiFailure;
      const blocked = failure.code === "mandate-violation";
      setSteps((prev) =>
        prev.map((s) => (s.state === "running" ? { ...s, state: blocked ? "blocked" : "failed", detail: failure.code } : s)),
      );
      log(blocked ? "refusal" : "error", failure.message ?? String(error));
    } finally {
      setBusy(false);
    }
  }

  if (offline) {
    return (
      <div className="card warn">
        <h2>API not reachable</h2>
        <p>Start the server with <code>npm run dev</code>, then reload.</p>
      </div>
    );
  }

  return (
    <div className="flow">
      <section className="card mandate">
        <div className="card-head">
          <h2>Rescue Mandate</h2>
          <span className="pill">{MANDATE_ID}</span>
        </div>
        {mandate && (
          <>
            <div className="budget">
              <div>
                <span className="label">Authorised</span>
                <strong>{formatSgd(mandate.maximumAdditionalSpend.minorUnits)}</strong>
              </div>
              <div>
                <span className="label">Remaining</span>
                <strong className="good">{remaining !== null ? formatSgd(remaining) : "—"}</strong>
              </div>
            </div>
            <ul className="constraints">
              <li>Arrive before {new Date(mandate.arrivalDeadline).toLocaleString()}</li>
              <li>Preserve {mandate.preserveBookingIds.join(", ")}</li>
              <li>Pay only {mandate.allowedSupplierIds.join(", ")}</li>
              <li>Network {mandate.network}</li>
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Agent journey</h2>
          <div className="actions">
            <button disabled={busy} onClick={() => runLoop("offer-protected-transfer-001")}>
              {busy ? "Running…" : "Run recovery"}
            </button>
            <button className="ghost" disabled={busy} onClick={() => runLoop("offer-flex-transfer-002")}>
              Try a supplier outside the mandate
            </button>
          </div>
        </div>
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.id} className={`step ${step.state}`}>
              <span className="dot" />
              <span className="step-label">{step.label}</span>
              {step.detail && <span className="step-detail">{step.detail}</span>}
            </li>
          ))}
        </ol>
      </section>

      {offers.length > 0 && (
        <section className="card">
          <h2>Discovered suppliers</h2>
          <table className="offers">
            <thead>
              <tr><th>Supplier</th><th>Offer</th><th>Price</th><th>Risk</th></tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className={mandate?.allowedSupplierIds.includes(offer.supplierId) ? "" : "muted-row"}>
                  <td>{offer.supplierId}</td>
                  <td>{offer.title}</td>
                  <td>{formatSgd(offer.price.minorUnits)}</td>
                  <td>{offer.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {preview && (
        <section className="card">
          <h2>Transaction preview</h2>
          <dl className="kv">
            <div><dt>From</dt><dd className="mono">{preview.from}</dd></div>
            <div><dt>To</dt><dd className="mono">{preview.to}</dd></div>
            <div><dt>Amount</dt><dd>{preview.amountXrp} XRP <span className="muted">({preview.amountDrops} drops)</span></dd></div>
            <div><dt>Fee</dt><dd>{preview.feeXrp} XRP</dd></div>
            <div><dt>Invoice</dt><dd className="mono">{preview.invoiceId}</dd></div>
            <div><dt>Source tag</dt><dd>{preview.sourceTag}</dd></div>
          </dl>
        </section>
      )}

      {receipt && (
        <section className={`card receipt ${receipt.status}`}>
          <div className="card-head">
            <h2>Receipt</h2>
            <span className={`pill ${receipt.status}`}>{receipt.status}</span>
          </div>
          {receipt.transactionHash && (
            <p className="hash mono">{receipt.transactionHash}</p>
          )}
          {receipt.explorerUrl && (
            <a className="explorer" href={receipt.explorerUrl} target="_blank" rel="noreferrer">
              View on XRPL Testnet explorer →
            </a>
          )}
          {receipt.deliveredResource && (
            <div className="delivered">
              <span className="label">Delivered</span>
              <strong>{receipt.deliveredResource.reference}</strong>
              <p>{receipt.deliveredResource.description}</p>
              <p className="muted">Held until {new Date(receipt.deliveredResource.expiresAt).toLocaleTimeString()}</p>
            </div>
          )}
        </section>
      )}

      {logs.length > 0 && (
        <section className="card">
          <h2>Decision trace</h2>
          <ul className="logs">
            {logs.map((entry) => (
              <li key={entry.id} className={entry.kind}>{entry.text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
