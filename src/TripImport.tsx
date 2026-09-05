import { useEffect, useState } from "react";
import { IMPORT_STAGES, nextImportStage } from "./tripImportState";
import type { ImportStage } from "./tripImportState";

export default function TripImport({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<ImportStage>("idle");
  const active = stage !== "idle" && stage !== "complete";
  const currentStage = IMPORT_STAGES.find((item) => item.id === stage);
  const currentIndex = IMPORT_STAGES.findIndex((item) => item.id === stage);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => {
      setStage((current) => nextImportStage(current));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [active, stage]);

  useEffect(() => {
    if (stage === "complete") onComplete();
  }, [stage, onComplete]);

  return (
    <section className="import-gate" aria-labelledby="import-title">
      <div className="import-copy">
        <span className="import-kicker">One-time itinerary import</span>
        <h2 id="import-title">Bring your whole trip into one place.</h2>
        <p>
          Trip Rescue turns travel confirmations into a connected itinerary,
          then watches the providers for changes.
        </p>
        <button disabled={active} onClick={() => setStage("finding")}>
          {active ? "Importing…" : "Import my trips"}
        </button>
        <p className="import-progress" role="status" aria-live="polite">
          {currentStage ? currentStage.label : "Ready for a one-time import"}
        </p>
        <p className="demo-disclosure">
          <strong>Demo mode</strong> — sample confirmations only; no inbox is accessed.
        </p>
      </div>

      <div className="privacy-boundary">
        <span className="boundary-label">Your inbox boundary</span>
        <ul className="privacy-list">
          <li><span aria-hidden="true">✓</span> Travel confirmations only</li>
          <li><span aria-hidden="true">✓</span> Structured booking fields retained</li>
          <li><span aria-hidden="true">✓</span> Inbox disconnected after import</li>
        </ul>

        <ol className="import-stages">
          {IMPORT_STAGES.map((item, itemIndex) => {
            const itemState = stage === "complete" || itemIndex < currentIndex
              ? "done"
              : item.id === stage
                ? "active"
                : "idle";
            return (
              <li
                key={item.id}
                className={itemState}
                aria-current={itemState === "active" ? "step" : undefined}
              >
                <span className="import-stage-mark" aria-hidden="true" />
                {item.label}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
