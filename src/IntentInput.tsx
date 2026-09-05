// What matters on this trip.
//
// The traveller said why they were travelling when they booked, so this arrives
// filled in rather than blank — the product should not ask again at the worst
// possible moment. Editing it re-reads the intent and moves the mandate, so the
// priority below is a consequence of their words, not a separate switch.
//
// Interpreting free text is the one genuinely ambiguous job here, which is why
// it is the one place a model is used. Everything it proposes is validated
// against server-side truth before it can touch a mandate.

import { useEffect, useRef, useState } from "react";
import { formatLocalTime, formatSgd, interpretRequest } from "./api";
import type { Interpretation } from "./api";

const SOURCE_LABEL: Record<Interpretation["source"], string> = {
  llm: "interpreted by the model",
  fallback: "model unavailable, read deterministically",
  deterministic: "read deterministically",
  none: "nothing to read",
};

export default function IntentInput({
  value,
  onChange,
  onApply,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  onApply: (proposal: Interpretation["proposal"]) => void;
  disabled: boolean;
}) {
  const [result, setResult] = useState<Interpretation | null>(null);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const lastRead = useRef<string>("");

  // Read whatever the traveller told us at booking time, once, on arrival.
  useEffect(() => {
    if (!value || lastRead.current === value) return;
    lastRead.current = value;
    setBusy(true);
    interpretRequest(value)
      .then((interpretation) => {
        setResult(interpretation);
        onApply(interpretation.proposal);
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reread() {
    setBusy(true);
    setEdited(false);
    lastRead.current = value;
    try {
      const interpretation = await interpretRequest(value);
      setResult(interpretation);
      onApply(interpretation.proposal);
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const found = result && Object.keys(result.proposal).length > 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>What matters on this trip</h2>
        <span className="panel-sub">
          {edited ? "unsaved change" : "from your booking"}
        </span>
      </div>

      <textarea
        className="intent"
        rows={3}
        value={value}
        disabled={disabled || busy}
        placeholder="Tell us why you are travelling and what you cannot lose."
        onChange={(event) => {
          onChange(event.target.value);
          setEdited(event.target.value !== lastRead.current);
        }}
      />

      <div className="intent-row">
        <button disabled={disabled || busy || !edited || value.trim().length < 3} onClick={reread}>
          {busy ? "Reading…" : edited ? "Update what matters" : "Up to date"}
        </button>
        {result && (
          <span className={`tag ${result.source === "llm" ? "safe" : "at-risk"}`}>
            {SOURCE_LABEL[result.source]}
            {result.model ? ` · ${result.model}` : ""}
          </span>
        )}
      </div>

      {result && (
        <div className="interpretation">
          {result.reasons.map((reason, i) => (
            <p key={i} className="interp-reason">{reason}</p>
          ))}

          {found && (
            <dl className="interp-fields">
              {result.proposal.priority && (
                <div><dt>priority</dt><dd>{result.proposal.priority}</dd></div>
              )}
              {result.proposal.maximumAdditionalSpend && (
                <div><dt>budget</dt><dd>{formatSgd(result.proposal.maximumAdditionalSpend.minorUnits)}</dd></div>
              )}
              {result.proposal.arrivalDeadline && (
                <div><dt>arrive by</dt><dd>{formatLocalTime(result.proposal.arrivalDeadline)}</dd></div>
              )}
              {result.proposal.preserveBookingIds && (
                <div><dt>preserve</dt><dd>{result.proposal.preserveBookingIds.join(", ")}</dd></div>
              )}
            </dl>
          )}

          {result.rejected.length > 0 && (
            <div className="interp-rejected">
              <span className="label">Refused by validation</span>
              {result.rejected.map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
