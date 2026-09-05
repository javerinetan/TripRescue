// "Tell us about this trip."
//
// The only free-text input in the product, and deliberately so. Interpreting
// what a traveller means is genuine ambiguity, which is where AI belongs.
// Everything downstream — what the mandate permits, what the agent may buy — is
// deterministic policy that this cannot reach past.
//
// The proposal is always shown before it is applied. The model suggests; the
// traveller authorises.

import { useState } from "react";
import { formatLocalTime, formatSgd, interpretRequest } from "./api";
import type { Interpretation } from "./api";

const EXAMPLES = [
  "I have a client meeting in Tokyo tomorrow and need to be there before noon. I can spend up to $500 extra.",
  "Family holiday with two young kids. Please keep it dependable and don't lose the Fuji tour.",
  "Just a holiday, keep the extra cost down. I don't mind arriving later.",
];

const SOURCE_LABEL: Record<Interpretation["source"], string> = {
  llm: "interpreted by the model",
  fallback: "model unavailable, read deterministically",
  deterministic: "read deterministically",
  none: "nothing to read",
};

export default function IntentInput({
  onApply,
  disabled,
}: {
  onApply: (proposal: Interpretation["proposal"]) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Interpretation | null>(null);
  const [busy, setBusy] = useState(false);

  async function interpret(value: string) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await interpretRequest(value));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const nothingFound = result && Object.keys(result.proposal).length === 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Tell us about this trip</h2>
        <span className="panel-sub">we propose a mandate, you authorise it</span>
      </div>

      <textarea
        className="intent"
        rows={3}
        value={text}
        disabled={disabled || busy}
        placeholder="e.g. I have a client meeting tomorrow and need to land before noon. I can spend up to $500 extra, and I really don't want to lose the Fuji tour."
        onChange={(event) => setText(event.target.value)}
      />

      <div className="intent-row">
        <button disabled={disabled || busy || text.trim().length < 3} onClick={() => interpret(text)}>
          {busy ? "Reading…" : "Interpret"}
        </button>
        <div className="examples">
          {EXAMPLES.map((example, i) => (
            <button
              key={i}
              className="chip"
              disabled={disabled || busy}
              onClick={() => {
                setText(example);
                interpret(example);
              }}
            >
              {i === 0 ? "Business" : i === 1 ? "Family" : "Leisure"}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="interpretation">
          <div className="interp-head">
            <span className="label">Proposed mandate</span>
            <span className={`tag ${result.source === "llm" ? "safe" : "at-risk"}`}>
              {SOURCE_LABEL[result.source]}
              {result.model ? ` · ${result.model}` : ""}
            </span>
          </div>

          {result.reasons.map((reason, i) => (
            <p key={i} className="interp-reason">{reason}</p>
          ))}

          {!nothingFound && (
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

          {!nothingFound && (
            <button disabled={disabled} onClick={() => onApply(result.proposal)}>
              Apply to my mandate
            </button>
          )}
        </div>
      )}
    </section>
  );
}
