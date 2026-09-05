// What the agent actually changed.
//
// "Your trip is recovered" is not enough for someone who just let software
// spend their money. This is the specifics: what went, what stands in its
// place, who the new provider is, what it cost against the estimate, and what
// was deliberately left alone.

import { useEffect, useState } from "react";
import { fetchChanges, formatLocalTime, formatSgd } from "./api";
import type { ChangeSummary } from "./api";

const KIND_LABEL: Record<string, string> = {
  replaced: "Replaced",
  kept: "Kept",
  released: "Released",
  notified: "Notified",
};

const KIND_TAG: Record<string, string> = {
  replaced: "at-risk",
  kept: "safe",
  released: "broken",
  notified: "safe",
};

export default function TripChanges({ planId, offerId }: { planId: string; offerId?: string }) {
  const [summary, setSummary] = useState<ChangeSummary | null>(null);

  useEffect(() => {
    fetchChanges(planId, offerId).then(setSummary).catch(() => undefined);
  }, [planId, offerId]);

  if (!summary || summary.changes.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>What changed on your trip</h2>
        <span className="panel-sub">{summary.cost.differenceLabel}</span>
      </div>

      <ul className="changes">
        {summary.changes.map((change, i) => (
          <li key={i} className={`change ${change.kind}`}>
            <span className={`tag ${KIND_TAG[change.kind]}`}>{KIND_LABEL[change.kind]}</span>

            {change.before && change.after ? (
              <div className="swap">
                <div className="swap-side was">
                  <strong>{change.before.title}</strong>
                  <span>{change.before.provider}</span>
                  <span>{formatLocalTime(change.before.time)} · {formatSgd(change.before.cost.minorUnits)}</span>
                </div>
                <span className="swap-arrow" aria-hidden="true">→</span>
                <div className="swap-side now">
                  <strong>{change.after.title}</strong>
                  <span>{change.after.provider}</span>
                  <span>{formatLocalTime(change.after.time)} · {formatSgd(change.after.cost.minorUnits)}</span>
                </div>
              </div>
            ) : change.before ? (
              <div className="swap-side single">
                <strong>{change.before.title}</strong>
                <span>{change.before.provider} · {formatSgd(change.before.cost.minorUnits)}</span>
              </div>
            ) : null}

            <p className="change-note">{change.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
