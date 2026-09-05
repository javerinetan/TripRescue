// The outcome.
//
// This is the last thing the traveller reads, and the moment the product either
// earns trust or does not. It is written as a short report rather than a grid
// of boxes: the headline result, the numbers that matter, what the agent did in
// order, then every booking's fate stated plainly, then the proof.

import { formatLocalTime, formatSgd } from "./api";
import type { RecoveredTripOutcome } from "./recoveryOutcome";

const ACTION_LABELS: Record<string, string> = {
  change: "Changed",
  notify: "Protected",
  purchase: "Bought",
  preserve: "Kept",
  cancel: "Released",
};

// A booking's fate maps onto the same three states used everywhere else, so a
// traveller does not have to learn a second vocabulary at the last screen.
const OUTCOME_TONE: Record<string, string> = {
  preserved: "safe",
  unchanged: "safe",
  // Planned, not confirmed. Colouring it green would overstate what actually
  // happened — only the supplier hold is settled on the ledger.
  "planned-change": "at-risk",
  replaced: "at-risk",
  released: "broken",
  cancelled: "broken",
};

const OUTCOME_LABEL: Record<string, string> = {
  preserved: "kept",
  unchanged: "untouched",
  "planned-change": "change planned",
  replaced: "replaced",
  released: "released",
  cancelled: "cancelled",
};

export default function RecoveredTrip({ outcome }: { outcome: RecoveredTripOutcome }) {
  return (
    <section className="recovered" aria-live="polite">
      <div className="recovered-head">
        <span className="recovered-kicker">Recovery complete · settlement verified on XRPL</span>
        <h2>Your trip has a viable recovery.</h2>
        <p className="recovered-lede">
          <strong>{outcome.planTitle}</strong> was authorised within your Rescue Mandate. The supplier
          hold below is confirmed on the ledger; the remaining provider actions are planned.
        </p>
      </div>

      <div className="recovered-figures">
        <div>
          <span className="label">Arriving</span>
          <strong>{formatLocalTime(outcome.arrivalTime)}</strong>
        </div>
        <div>
          <span className="label">Plan estimate</span>
          <strong>{formatSgd(outcome.estimatedAdditionalCost.minorUnits)}</strong>
        </div>
        <div>
          <span className="label">Bookings covered</span>
          <strong>{outcome.bookings.length}</strong>
        </div>
      </div>

      <div className="recovered-section">
        <span className="label">What the agent did</span>
        <ol className="recovered-steps">
          {outcome.actions.map((action) => (
            <li key={action.id}>
              <span className="recovered-verb">{ACTION_LABELS[action.kind] ?? action.kind}</span>
              <span>{action.description}</span>
            </li>
          ))}
          <li className="confirmed">
            <span className="recovered-verb">Confirmed</span>
            <span>{outcome.deliveredResource.description}</span>
          </li>
        </ol>
      </div>

      <div className="recovered-section">
        <span className="label">Where every booking ended up</span>
        <ul className="outcome-list">
          {outcome.bookings.map((booking) => (
            <li key={booking.id}>
              <span className={`status-pip ${OUTCOME_TONE[booking.outcome] ?? "safe"}`} aria-hidden="true" />
              <span className="outcome-title">{booking.title}</span>
              <span className="outcome-state">{OUTCOME_LABEL[booking.outcome] ?? booking.outcome}</span>
              {booking.explanation && <p className="outcome-why">{booking.explanation}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div className="recovered-proof">
        <div className="proof-row">
          <span className="label">Reservation</span>
          <strong>{outcome.deliveredResource.reference}</strong>
        </div>
        <div className="proof-row">
          <span className="label">Transaction</span>
          <code>{outcome.transactionHash}</code>
        </div>
        {outcome.explorerUrl && (
          <a className="explorer light" href={outcome.explorerUrl} target="_blank" rel="noreferrer">
            Verify on the XRPL Testnet explorer →
          </a>
        )}
      </div>
    </section>
  );
}
