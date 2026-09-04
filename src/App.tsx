import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Provider, Review, TransactionPreview } from "./types";

const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactElement> = {
    spark: <><path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6L12 3Z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    shield: <path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z"/>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 14h2"/></>,
    arrow: <><path d="M5 12h14"/><path d="m15 8 4 4-4 4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function money(value: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function Home({ onStart }: { onStart: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <main className="home-shell">
      <section className="hero-copy">
        <div className="eyebrow"><span><Icon name="spark" size={15} /></span> Autonomous due diligence</div>
        <h1>Know who you’re<br />paying. <em>Before you pay.</em></h1>
        <p className="hero-lede">ClearSpend gives every small business a tireless procurement analyst. It finds the right evidence, pays only for what matters, and delivers an auditable answer in seconds.</p>
        <div className="promise-row">
          <span><Icon name="check" size={16} /> Spend-capped</span>
          <span><Icon name="check" size={16} /> Evidence-backed</span>
          <span><Icon name="check" size={16} /> Settled on XRPL</span>
        </div>
        <div className="metric-strip">
          <div><strong>4</strong><span>specialist providers</span></div>
          <div><strong>&lt; 3s</strong><span>agent decision</span></div>
          <div><strong>100%</strong><span>traceable spend</span></div>
        </div>
      </section>

      <section className="brief-card" id="new-review">
        <div className="card-kicker">New review</div>
        <h2>What are you about to approve?</h2>
        <p>Set the guardrails. Your agent handles the research.</p>
        <form onSubmit={onStart}>
          <label>Supplier name<input name="vendor" defaultValue="Meridian Components Pte. Ltd." required /></label>
          <div className="field-row">
            <label>Invoice reference<input name="invoiceRef" defaultValue="INV-2048-SG" required /></label>
            <label>Supplier country<select name="country" defaultValue="Singapore"><option>Singapore</option><option>Vietnam</option><option>Indonesia</option><option>India</option><option>China</option><option>Australia</option></select></label>
          </div>
          <div className="field-row">
            <label>Invoice value (USD)<div className="input-prefix"><span>$</span><input name="amountUsd" type="number" defaultValue="18500" min="1" /></div></label>
            <label>Agent budget (XRP)<div className="input-prefix"><span>✕</span><input name="budgetXrp" type="number" defaultValue="0.060" step="0.001" min="0.012" /></div></label>
          </div>
          <label>Risk posture<div className="segmented"><input id="low" type="radio" name="riskTolerance" value="low"/><label htmlFor="low">Strict</label><input id="balanced" type="radio" name="riskTolerance" value="balanced" defaultChecked/><label htmlFor="balanced">Balanced</label><input id="high" type="radio" name="riskTolerance" value="high"/><label htmlFor="high">Fast</label></div></label>
          <button className="primary-btn" type="submit"><Icon name="spark" /> Ask ClearSpend <Icon name="arrow" /></button>
          <div className="form-foot"><Icon name="lock" size={14} /> No payment happens without your policy approval</div>
        </form>
      </section>
    </main>
  );
}

function ScoreRing({ value }: { value: number }) {
  return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{value}</strong><span>risk score</span></div></div>;
}

function ProviderRow({ provider, selected, rank }: { provider: Provider; selected: boolean; rank: number }) {
  return <div className={`provider-row ${selected ? "chosen" : ""}`}>
    <div className="provider-rank">{rank}</div><div className={`provider-logo logo-${provider.id}`}>{provider.monogram}</div>
    <div className="provider-main"><strong>{provider.name}</strong><span>{provider.category} · {provider.latencyMs} ms</span></div>
    <div className="provider-score"><small>Agent score</small><strong>{provider.agentScore}</strong></div>
    <div className="provider-price"><strong>{(provider.priceDrops / 1e6).toFixed(3)} XRP</strong><span>per check</span></div>
    <div className={`selection ${selected ? "yes" : ""}`}>{selected ? <><Icon name="check" size={14}/> Selected</> : "Skipped"}</div>
  </div>;
}

function ReviewWorkspace({ review, onPrepare, busy }: { review: Review; onPrepare: () => void; busy: boolean }) {
  const savings = review.input.budgetXrp - review.totalXrp;
  return <main className="workspace">
    <header className="review-header">
      <div><button className="back-link" onClick={() => location.reload()}>← New review</button><div className="review-title-row"><h1>{review.input.vendor}</h1><span className="status-pill"><i /> Agent plan ready</span></div><p>{review.input.invoiceRef} · {review.input.country} · {money(review.input.amountUsd)}</p></div>
      <div className="header-budget"><span>Spend policy</span><strong>{review.totalXrp.toFixed(3)} <small>/ {review.input.budgetXrp.toFixed(3)} XRP</small></strong><div><i style={{ width: `${Math.min(100, (review.totalXrp / review.input.budgetXrp) * 100)}%` }} /></div></div>
    </header>

    <section className="journey">
      {["Brief understood", "Providers compared", "Awaiting approval", "Evidence delivered"].map((label, index) => <div className={index < 2 ? "done" : index === 2 ? "active" : ""} key={label}><span>{index < 2 ? <Icon name="check" size={14}/> : index + 1}</span><p>{label}</p></div>)}
    </section>

    <div className="workspace-grid">
      <div className="workspace-main">
        <section className="panel agent-summary">
          <div><div className="panel-kicker"><Icon name="spark" size={15}/> Agent assessment</div><h2>{review.riskScore >= 55 ? "Enhanced checks recommended" : "Standard checks are sufficient"}</h2><p>{review.reasons[0]}</p></div>
          <ScoreRing value={review.riskScore}/>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><div className="panel-kicker">Discovery market</div><h2>Provider comparison</h2></div><span className="live-chip"><i/> 4 services online</span></div>
          <div className="provider-list">{review.ranked.map((provider, index) => <ProviderRow key={provider.id} provider={provider} rank={index + 1} selected={review.selected.some((item) => item.id === provider.id)} />)}</div>
          <div className="decision-note"><Icon name="spark"/><div><strong>Why this bundle?</strong><p>{review.reasons[1]} The agent weighted relevance 45%, confidence 30%, speed 15%, and price 10%.</p></div></div>
        </section>
      </div>
      <aside className="checkout-card">
        <div className="checkout-top"><div className="panel-kicker">Proposed purchase</div><h2>Evidence bundle</h2><p>{review.selected.length} paid checks, one decision-ready report.</p></div>
        <div className="bundle-lines">{review.selected.map((provider) => <div key={provider.id}><span><i>{provider.monogram}</i>{provider.category}</span><strong>{(provider.priceDrops / 1e6).toFixed(3)}</strong></div>)}</div>
        <div className="total-line"><span>Total</span><strong>{review.totalXrp.toFixed(3)} <small>XRP</small></strong></div>
        <div className="budget-save"><Icon name="check" size={16}/><span><strong>Within policy</strong>{savings.toFixed(3)} XRP stays unspent</span></div>
        <button className="primary-btn" disabled={busy} onClick={onPrepare}>{busy ? <span className="spinner"/> : <Icon name="wallet"/>}{busy ? "Preparing on XRPL…" : "Review transaction"}<Icon name="arrow"/></button>
        <div className="protocol-box"><div><span className="x402">402</span><strong>x402 payment request</strong></div><p>Exact payment · XRP Testnet<br/>Source tag 20260530</p></div>
        <div className="checkout-foot"><Icon name="shield" size={16}/> Transaction is autofilled and shown before signing.</div>
      </aside>
    </div>
  </main>;
}

function TransactionModal({ preview, busy, onClose, onAuthorize }: { preview: TransactionPreview; busy: boolean; onClose: () => void; onAuthorize: () => void }) {
  const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-7)}`;
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="tx-modal">
    <div className="modal-head"><div className="modal-icon"><Icon name="wallet"/></div><div><span>Human checkpoint</span><h2>Review XRPL transaction</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <div className="network-banner"><i/> Testnet <span>No real-world funds</span></div>
    <div className="tx-amount"><span>You’re authorizing</span><strong>{preview.amountXrp} <small>XRP</small></strong><p>for the ClearSpend evidence bundle</p></div>
    <div className="tx-fields">
      <div><span>From</span><strong title={preview.from}>{short(preview.from)}</strong></div><div><span>To</span><strong title={preview.to}>{short(preview.to)}</strong></div>
      <div><span>Network fee</span><strong>{preview.feeXrp} XRP</strong></div><div><span>Sequence</span><strong>{preview.sequence}</strong></div>
      <div><span>Expires</span><strong>~{preview.expiresInLedgers * 4}s</strong></div><div><span>Source tag</span><strong>{preview.sourceTag}</strong></div>
      <div className="wide"><span>Purpose / memo</span><strong>{preview.memo}</strong></div>
    </div>
    <div className="consent-copy"><Icon name="shield"/><p>I understand this signs a <strong>{preview.amountXrp} XRP Testnet payment</strong> from the agent wallet to the evidence marketplace.</p></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-btn" onClick={onAuthorize} disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="lock"/>}{busy ? "Waiting for validation…" : "Authorize & deliver"}</button></div>
  </section></div>;
}

function Delivered({ review }: { review: Review }) {
  return <main className="delivered">
    <div className="success-orbit"><span><Icon name="check" size={32}/></span></div>
    <div className="eyebrow"><span><Icon name="spark" size={15}/></span> Evidence delivered</div>
    <h1>Clear to proceed.</h1><p className="delivered-lede">{review.selected.length} independent checks found no material exceptions for {review.input.vendor}.</p>
    <section className="receipt-panel">
      <div className="receipt-head"><div><span>Decision report</span><h2>{review.input.invoiceRef}</h2></div><div className="verdict">LOW RESIDUAL RISK</div></div>
      <div className="evidence-grid">{review.evidence?.map((item) => <div key={item.receipt}><div className="evidence-check"><Icon name="check"/></div><span>{item.provider}</span><strong>{item.finding}</strong><small>{item.receipt} · {item.purchasedForXrp.toFixed(3)} XRP</small></div>)}</div>
      <div className="chain-receipt"><Icon name="link"/><div><span>Validated on XRP Ledger #{review.transaction?.ledgerIndex}</span><a href={review.transaction?.explorerUrl} target="_blank" rel="noreferrer">{review.transaction?.hash}</a></div><a className="explorer-link" href={review.transaction?.explorerUrl} target="_blank" rel="noreferrer">View explorer ↗</a></div>
    </section>
    <div className="delivered-actions"><button className="primary-btn" onClick={() => location.reload()}>Start another review <Icon name="arrow"/></button><span>Team Peaunts · SingHacks 2026</span></div>
  </main>;
}

export default function App() {
  const [review, setReview] = useState<Review | null>(null);
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setClock((n) => n + 1), 1000); return () => clearInterval(timer); }, []);
  const statusText = useMemo(() => review ? `Review ${review.id.slice(0, 6).toUpperCase()}` : "Agent online", [review, clock]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try { setReview(await api<Review>("/api/reviews", { method: "POST", body: JSON.stringify(data) })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function prepare() {
    if (!review) return; setBusy(true); setError("");
    try { const result = await api<{ preview: TransactionPreview }>(`/api/reviews/${review.id}/prepare`, { method: "POST" }); setPreview(result.preview); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function authorize() {
    if (!review) return; setBusy(true); setError("");
    try { const result = await api<Review>(`/api/reviews/${review.id}/authorize`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); setReview(result); setPreview(null); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function reconcile() {
    if (!review) return; setBusy(true); setError("");
    try { setReview(await api<Review>(`/api/reviews/${review.id}/reconcile`, { method: "POST" })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="app">
    <nav><a className="brand" href="/"><span className="brand-mark"><i/><i/><i/></span><strong>clear<span>spend</span></strong></a><div className="nav-links"><a className="active"><Icon name="grid"/> Workspace</a><a href="#how"><Icon name="search"/> How it works</a><a href="https://testnet.xrpl.org" target="_blank" rel="noreferrer"><Icon name="link"/> Explorer</a></div><div className="agent-status"><i/><div><strong>{statusText}</strong><span>XRPL Testnet</span></div></div></nav>
    <div className="content">{review?.status === "delivered" ? <Delivered review={review}/> : review ? <ReviewWorkspace review={review} onPrepare={prepare} busy={busy}/> : <Home onStart={start}/>}</div>
    {preview && <TransactionModal preview={preview} busy={busy} onClose={() => setPreview(null)} onAuthorize={authorize}/>} 
    {busy && !review && <div className="loading-toast"><span className="spinner"/> Agent is comparing providers…</div>}
    {error && <div className="error-toast"><div><strong>Couldn’t continue</strong><span>{error}</span>{review && <button className="recover-btn" onClick={reconcile} disabled={busy}>Verify existing receipt</button>}</div><button onClick={() => setError("")}>×</button></div>}
  </div>;
}
