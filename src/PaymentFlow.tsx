// The agentic commercial loop, made visible.
//
// This half of the screen is deliberately an instrument panel rather than a
// travel app: the traveller made one strategic decision, and everything here is
// the machine working inside those limits. Every economic decision shows its
// reason, and the raw x402 exchange is inspectable.

import { useEffect, useRef, useState } from "react";
import {
  ApiFailure,
  MANDATE_ID,
  RECOVERY_ID,
  challengeResource,
  claimResource,
  discoverSuppliers,
  executePayment,
  fetchMandate,
  fetchOfferDecision,
  formatLocalTime,
  formatSgd,
  preparePayment,
} from "./api";
import { FAULT_MODES, setFault } from "./api";
import type { FaultMode, OfferDecision, WireExchange } from "./api";
import WireInspector from "./WireInspector";
import type { ExecutionReceipt, JourneyStep, RescueMandate, SupplierOffer, TransactionPreview } from "./types";

const STEPS: { id: string; label: string }[] = [
  { id: "discover", label: "Discover suppliers" },
  { id: "challenge", label: "Request resource, receive 402" },
  { id: "authorize", label: "Check mandate, sign intent" },
  { id: "settle", label: "Settle on XRPL Testnet" },
  { id: "deliver", label: "Verify receipt, release resource" },
];

type Log = { id: number; kind: "info" | "decision" | "refusal" | "money" | "error"; text: string };

export default function PaymentFlow({ planId, onComplete }: { planId: string; onComplete?: () => void }) {
  const started = useRef(false);
  const [mandate, setMandate] = useState<RescueMandate | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [decision, setDecision] = useState<OfferDecision | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>(STEPS.map((s) => ({ ...s, state: "idle" })));
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [wire, setWire] = useState<WireExchange[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fault, setFaultMode] = useState<FaultMode>("none");
  const [proofOpen, setProofOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  const startedAt = useRef<number | null>(null);

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
      .catch(() => undefined);
  }, []);

  // Authorising the plan is the go-ahead. The agent starts on its own.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runLoop().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A recovery is a race against the clock. Show it running.
  useEffect(() => {
    if (!busy) return undefined;
    startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed((Date.now() - startedAt.current) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, [busy]);

  // overrideOfferId exists only to force an off-mandate supplier for the
  // safeguard demo. Normally the agent buys whatever it decided.
  async function runLoop(overrideOfferId?: string) {
    setSteps(STEPS.map((s) => ({ ...s, state: "idle" })));
    setPreview(null);
    setReceipt(null);
    setWire([]);
    setLogs([]);
    setElapsed(0);
    setBusy(true);
    try {
      setStep("discover", "running");
      const discovered = await discoverSuppliers();
      setOffers(discovered);
      const ranked = await fetchOfferDecision();
      setDecision(ranked.decision);
      setStep("discover", "done", `${discovered.length} found`);
      log("info", `Discovered ${discovered.length} suppliers the agent was not provisioned with.`);
      ranked.decision.reasons.forEach((reason) => log("decision", reason));

      const targetOfferId = overrideOfferId ?? ranked.decision.selectedOfferId;
      const offer = discovered.find((o) => o.id === targetOfferId);
      if (!offer) throw new Error("The agent could not find an offer it is allowed to buy.");
      if (overrideOfferId) {
        log("refusal", `Forcing ${offer.supplierId}, which the agent did not select.`);
      }

      setStep("challenge", "running");
      const challenged = await challengeResource(offer);
      setWire(challenged.wire);
      setStep("challenge", "done", `${challenged.requirement.amountDrops} drops`);
      log(
        "info",
        `Supplier replied 402 asking ${challenged.requirement.amountDrops} drops on ${challenged.requirement.network}.`,
      );

      setStep("authorize", "running");
      const prepared = await preparePayment(challenged.requirement.requirementId);
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
      setRemaining((prev) => (prev === null ? prev : prev - offer.price.minorUnits));
      setStep("settle", "done", executed.receipt.transactionHash?.slice(0, 12));
      log("money", `Settled ${formatSgd(offer.price.minorUnits)} on XRPL Testnet. ${executed.remainingLabel} remaining.`);

      setStep("deliver", "running");
      const delivered = await claimResource(
        offer,
        prepared.executionId,
        challenged.accepted,
        executed.receipt.transactionHash!,
      );
      setReceipt(delivered.receipt);
      setWire((prev) => [...prev, ...delivered.wire]);
      setStep("deliver", "done", delivered.receipt.deliveredResource?.reference);
      log("info", `Supplier verified the receipt on-ledger and released ${delivered.receipt.deliveredResource?.reference}.`);

      const fresh = await fetchMandate();
      setRemaining(fresh.remaining.minorUnits);
      onComplete?.();
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

  const authorised = mandate?.maximumAdditionalSpend.minorUnits ?? 0;
  const spent = remaining === null ? 0 : authorised - remaining;
  const spentPct = authorised === 0 ? 0 : Math.min(100, (spent / authorised) * 100);
  const allowed = new Set(mandate?.allowedSupplierIds ?? []);

  return (
    <div className="agent-zone">
      <div className="zone-head">
        <span className="zone-label">Agent · autonomous within the mandate</span>
        {busy && <span className="clock">{elapsed.toFixed(1)}s</span>}
      </div>

      <section className="panel mandate-panel">
        <div className="panel-row">
          <div>
            <span className="label">Rescue Mandate</span>
            <code className="mandate-id">{MANDATE_ID} · {planId}</code>
          </div>
          <div className="budget-figures">
            <span className="spent">{formatSgd(spent)}</span>
            <span className="of">spent of {formatSgd(authorised)}</span>
          </div>
        </div>

        <div className="meter" role="img" aria-label={`${spentPct.toFixed(0)} percent of budget spent`}>
          <div className="meter-fill" style={{ width: `${spentPct}%` }} />
        </div>

        {mandate && (
          <ul className="constraints">
            <li><span className="c-key">arrive by</span> {formatLocalTime(mandate.arrivalDeadline)}</li>
            <li><span className="c-key">preserve</span> {mandate.preserveBookingIds.join(", ")}</li>
            <li><span className="c-key">suppliers</span> {mandate.allowedSupplierIds.join(", ")}</li>
            <li><span className="c-key">network</span> {mandate.network}</li>
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-row">
          <span className="panel-title">{busy ? "Working" : "Done"}</span>
          {!busy && (
            <button className="ghost" onClick={() => runLoop()}>Run again</button>
          )}
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
        <section className="panel">
          <div className="panel-row">
            <span className="panel-title">Discovered at runtime</span>
            {decision && (
              <span className="panel-sub">
                {decision.consideredOfferIds.length - (decision.selectedOfferId ? 1 : 0)} refused by the mandate
              </span>
            )}
          </div>
          <ul className="offer-list">
            {offers.map((offer) => {
              const ok = allowed.has(offer.supplierId);
              const chosen = decision?.selectedOfferId === offer.id;
              return (
                <li key={offer.id} className={`offer ${ok ? "" : "refused"} ${chosen ? "chosen" : ""}`}>
                  <span className="offer-mark">{chosen ? "✓" : ok ? "·" : "✕"}</span>
                  <span className="offer-name">{offer.supplierId}</span>
                  <span className="offer-price">{formatSgd(offer.price.minorUnits)}</span>
                  <span className="offer-risk">risk {offer.riskScore}</span>
                  <span className="offer-verdict">{chosen ? "selected" : ok ? "eligible" : "not on allow-list"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(wire.length > 0 || preview) && (
        <section className="panel">
          <button className="panel-head bare" onClick={() => setProofOpen((v) => !v)} aria-expanded={proofOpen}>
            <span className="panel-title">Proof</span>
            <span className="panel-sub">the x402 exchange and the signed intent</span>
            <span className={`chevron ${proofOpen ? "open" : ""}`} aria-hidden="true" />
          </button>
        </section>
      )}

      {proofOpen && <WireInspector exchanges={wire} />}

      {proofOpen && preview && (
        <section className="panel">
          <span className="panel-title">Signed payment intent</span>
          <dl className="kv">
            <div><dt>from</dt><dd className="mono">{preview.from}</dd></div>
            <div><dt>to</dt><dd className="mono">{preview.to}</dd></div>
            <div><dt>amount</dt><dd>{preview.amountXrp} XRP <span className="muted">({preview.amountDrops} drops)</span></dd></div>
            <div><dt>fee</dt><dd>{preview.feeXrp} XRP</dd></div>
            <div><dt>invoice</dt><dd className="mono">{preview.invoiceId}</dd></div>
            <div><dt>source tag</dt><dd>{preview.sourceTag}</dd></div>
          </dl>
        </section>
      )}

      {receipt && (
        <section className={`panel receipt ${receipt.status}`}>
          <div className="panel-row">
            <span className="panel-title">Receipt</span>
            <span className={`tag ${receipt.status === "delivered" ? "safe" : "at-risk"}`}>{receipt.status}</span>
          </div>
          {receipt.transactionHash && <p className="hash mono">{receipt.transactionHash}</p>}
          {receipt.explorerUrl && (
            <a className="explorer" href={receipt.explorerUrl} target="_blank" rel="noreferrer">
              Verify on XRPL Testnet explorer →
            </a>
          )}
          {receipt.deliveredResource && (
            <div className="delivered">
              <span className="label">Value delivered</span>
              <strong>{receipt.deliveredResource.reference}</strong>
              <p>{receipt.deliveredResource.description}</p>
              <p className="muted">Held until {new Date(receipt.deliveredResource.expiresAt).toLocaleTimeString()}</p>
            </div>
          )}
        </section>
      )}

      {logs.length > 0 && (
        <section className="panel">
          <button className="panel-head bare" onClick={() => setTraceOpen((v) => !v)} aria-expanded={traceOpen}>
            <span className="panel-title">Why the agent did that</span>
            <span className="panel-sub">{logs.length} decisions</span>
            <span className={`chevron ${traceOpen ? "open" : ""}`} aria-hidden="true" />
          </button>
          <ul className="logs" hidden={!traceOpen}>
            {logs.map((entry) => (
              <li key={entry.id} className={entry.kind}>{entry.text}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel demo-controls">
        <button className="panel-head bare" onClick={() => setDemoOpen((v) => !v)} aria-expanded={demoOpen}>
          <span className="panel-title">Demo controls</span>
          <span className="panel-sub">break it on purpose</span>
          <span className={`chevron ${demoOpen ? "open" : ""}`} aria-hidden="true" />
        </button>

        {demoOpen && (
          <div className="demo-body">
            <label className="fault">
              <span className="fault-label">Inject fault</span>
              <select
                value={fault}
                disabled={busy}
                onChange={async (event) => {
                  const next = event.target.value as FaultMode;
                  setFaultMode(next);
                  await setFault(next).catch(() => undefined);
                  const fresh = await fetchMandate().catch(() => null);
                  if (fresh) setRemaining(fresh.remaining.minorUnits);
                }}
              >
                {FAULT_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>{mode.label}</option>
                ))}
              </select>
              <span className="fault-hint">Then run again — money must not move.</span>
            </label>
            <button className="ghost" disabled={busy} onClick={() => runLoop("offer-flex-transfer-002")}>
              Force a supplier outside the mandate
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
