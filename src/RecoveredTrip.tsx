import { formatLocalTime, formatSgd } from "./api";
import type { RecoveredTripOutcome } from "./recoveryOutcome";

const ACTION_LABELS: Record<string, string> = {
  change: "Planned change",
  notify: "Planned protection",
  purchase: "Supplier resource secured",
  preserve: "Preserved",
  cancel: "Planned cancellation",
};

export default function RecoveredTrip({ outcome }: { outcome: RecoveredTripOutcome }) {
  return (
    <section className="recovered-trip" aria-live="polite">
      <header className="recovered-head">
        <div>
          <span className="recovered-kicker">Recovery complete · settlement verified on XRPL</span>
          <h2>Your trip has a viable recovery.</h2>
          <p>{outcome.planTitle} was authorized within the Rescue Mandate. The supplier hold below is confirmed; other provider actions remain planned or simulated.</p>
        </div>
        <span className="recovered-seal" aria-label="Trip recovered">✓</span>
      </header>

      <div className="outcome-stats">
        <div><span>Arrival</span><strong>{formatLocalTime(outcome.arrivalTime)}</strong></div>
        <div><span>Estimated plan cost</span><strong>{formatSgd(outcome.estimatedAdditionalCost.minorUnits)}</strong></div>
        <div><span>Bookings represented</span><strong>{outcome.bookings.length}</strong></div>
      </div>

      <ol className="recovered-spine">
        {outcome.actions.map((action) => (
          <li key={action.id}>
            <span className="recovered-dot" aria-hidden="true" />
            <div><span className="recovered-action">{ACTION_LABELS[action.kind] ?? action.kind}</span><p>{action.description}</p></div>
          </li>
        ))}
        <li>
          <span className="recovered-dot final" aria-hidden="true" />
          <div><span className="recovered-action">Confirmed supplier hold</span><p>{outcome.deliveredResource.description}</p></div>
        </li>
      </ol>

      <div className="protected-bookings">
        <span className="label">Booking outcomes</span>
        <div>
          {outcome.bookings.map((booking) => (
            <span key={booking.id} title={booking.explanation}>{booking.title} · {booking.outcome}</span>
          ))}
        </div>
      </div>

      <footer className="recovery-proof">
        <div><span className="label">Reservation</span><strong>{outcome.deliveredResource.reference}</strong></div>
        <div><span className="label">On-chain paid amount</span><strong>Verified by supplier</strong></div>
        <div className="proof-hash"><span className="label">Transaction</span><code>{outcome.transactionHash}</code></div>
        {outcome.explorerUrl && <a href={outcome.explorerUrl} target="_blank" rel="noreferrer">Verify on ledger →</a>}
      </footer>
    </section>
  );
}
