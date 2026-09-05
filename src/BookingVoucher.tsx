// The thing you actually show at the desk.
//
// A reservation the traveller cannot produce is not a reservation. Once the
// supplier releases the hold, this is the confirmation they present at check-in
// — reference, service, time, what was paid, and the ledger transaction that
// proves it. Printable, because the desk may want paper and the phone may be
// dead, which is exactly the situation this product exists for.

import { formatLocalTime, formatSgd } from "./api";
import type { ExecutionReceipt } from "./types";

export default function BookingVoucher({
  receipt,
  supplier,
  service,
  price,
  travellerName,
}: {
  receipt: ExecutionReceipt;
  supplier: string;
  service: string;
  price?: { minorUnits: number };
  travellerName: string;
}) {
  const held = receipt.deliveredResource;
  if (!held) return null;

  return (
    <section className="voucher" aria-label="Booking confirmation">
      <div className="voucher-head">
        <div>
          <span className="voucher-kicker">Booking confirmation</span>
          <h2>{held.reference}</h2>
        </div>
        <button className="ghost small-btn no-print" onClick={() => window.print()}>
          Print or save
        </button>
      </div>

      <dl className="voucher-body">
        <div>
          <dt>Passenger</dt>
          <dd>{travellerName}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>{service}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{supplier}</dd>
        </div>
        <div>
          <dt>Valid until</dt>
          <dd>{formatLocalTime(held.expiresAt)}</dd>
        </div>
        {price && (
          <div>
            <dt>Paid</dt>
            <dd>{formatSgd(price.minorUnits)}</dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd className="voucher-ok">Confirmed · payment verified on XRP Ledger</dd>
        </div>
      </dl>

      <p className="voucher-note">{held.description}</p>

      <div className="voucher-proof">
        <span className="label">Ledger transaction</span>
        <code>{receipt.transactionHash}</code>
        {receipt.explorerUrl && (
          <a className="explorer light no-print" href={receipt.explorerUrl} target="_blank" rel="noreferrer">
            Verify →
          </a>
        )}
        <p className="voucher-fineprint">
          The provider can confirm this booking against the transaction above without
          contacting Trip Rescue.
        </p>
      </div>
    </section>
  );
}
