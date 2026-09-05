// What is still recoverable once the trip is back together.
//
// Recovery is not free — some money is genuinely gone. Travellers rarely know
// which losses are claimable and which they should chase the provider for, and
// insurers pay people to work exactly that out. We already hold every booking's
// cost, refundability and post-disruption status, so we can say it plainly.
//
// Deliberately worded as guidance. We have never seen their policy.

import { useEffect, useState } from "react";
import { fetchClaim, formatSgd } from "./api";
import type { ClaimSummary as Summary } from "./api";

const ROUTE_TAG: Record<string, string> = {
  claimable: "safe",
  refund: "at-risk",
  "at-risk": "at-risk",
};

export default function ClaimSummary({ refreshToken = 0 }: { refreshToken?: number }) {
  const [claim, setClaim] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);

  // Recovery spend is itself the biggest claimable line, so this has to be read
  // after the agent settles, not when the plan is authorised.
  useEffect(() => {
    fetchClaim().then(setClaim).catch(() => undefined);
  }, [refreshToken]);

  if (!claim || claim.items.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>What you can still claim back</h2>
        <button className="ghost small-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show each item"}
        </button>
      </div>

      <div className="claim-totals">
        <div>
          <span className="label">Likely claimable</span>
          <strong className="good">{formatSgd(claim.totals.claimable.minorUnits)}</strong>
        </div>
        <div>
          <span className="label">Refund direct</span>
          <strong>{formatSgd(claim.totals.refund.minorUnits)}</strong>
        </div>
        <div>
          <span className="label">Only if lost</span>
          <strong className="muted">{formatSgd(claim.totals.atRisk.minorUnits)}</strong>
        </div>
      </div>

      {open && (
        <ul className="claim-items">
          {claim.items.map((item) => (
            <li key={item.bookingId} className="claim-item">
              <span className={`tag ${ROUTE_TAG[item.route]}`}>{item.headline}</span>
              <span className="claim-title">{item.title}</span>
              <span className="claim-amount">{formatSgd(item.amount.minorUnits)}</span>
              <p className="claim-note">{item.note}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="claim-disclaimer">{claim.disclaimer}</p>
    </section>
  );
}
