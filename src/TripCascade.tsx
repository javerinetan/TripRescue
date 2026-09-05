// The trip dependency graph and the cascade caused by one disruption.
//
// Attention is proportional to need. A booking that broke explains itself in
// full; one that is fine collapses to a line you can open if you want it. With
// seven bookings that is tidier. With a traveller who has booked twenty, it is
// the difference between a usable screen and a wall of text — and a monitoring
// product whose whole value is not making you read everything.

import { useState } from "react";
import type { Booking, BookingAssessment } from "./types";
import { formatLocalTime, formatSgd } from "./api";

const STATUS_LABEL: Record<string, string> = {
  broken: "Broken",
  "at-risk": "At risk",
  safe: "Safe",
};

function Node({
  booking,
  assessment,
  analysed,
}: {
  booking: Booking;
  assessment?: BookingAssessment;
  analysed: boolean;
}) {
  const status = analysed ? assessment?.status ?? "safe" : "intact";
  const needsAttention = status === "broken" || status === "at-risk";
  // Only things that are fine start collapsed. Nothing that needs a decision
  // is ever hidden behind a click.
  const [open, setOpen] = useState(needsAttention);
  const expanded = needsAttention || open;

  const meta = (
    <div className="node-meta">
      <span>{booking.provider}</span>
      <span>·</span>
      <span>
        {formatLocalTime(booking.startTime)}
        {booking.endTime && ` → ${formatLocalTime(booking.endTime)}`}
      </span>
      <span>·</span>
      <span>{formatSgd(booking.cost.minorUnits)}</span>
      <span>·</span>
      <span>{booking.refundable ? "refundable" : "non-refundable"}</span>
    </div>
  );

  return (
    <li className={`node ${status} ${expanded ? "" : "collapsed"}`}>
      <div className="node-body">
        {needsAttention ? (
          <div className="node-head">
            <strong>{booking.title}</strong>
            <span className={`tag ${status}`}>{STATUS_LABEL[status]}</span>
          </div>
        ) : (
          <button className="node-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={expanded}>
            <strong>{booking.title}</strong>
            {analysed && <span className={`tag ${status}`}>{STATUS_LABEL[status]}</span>}
            <span className={`chevron light ${expanded ? "open" : ""}`} aria-hidden="true" />
          </button>
        )}

        {expanded && (
          <div className="node-detail">
            {meta}
            {analysed && assessment && <p className="node-reason">{assessment.explanation}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

export default function TripCascade({
  bookings,
  assessments,
}: {
  bookings: Booking[];
  assessments: BookingAssessment[];
}) {
  const byId = new Map(assessments.map((a) => [a.bookingId, a]));
  const analysed = assessments.length > 0;
  const counts = assessments.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="card">
      <div className="card-head">
        <h2>{analysed ? "Trip cascade" : "Your trip"}</h2>
        {analysed ? (
          <span className="counts">
            <span className="tag broken">{counts.broken ?? 0} broken</span>
            <span className="tag at-risk">{counts["at-risk"] ?? 0} at risk</span>
            <span className="tag safe">{counts.safe ?? 0} safe</span>
          </span>
        ) : (
          <span className="panel-sub">{bookings.length} bookings · {bookings.length} providers</span>
        )}
      </div>

      {analysed && (counts.safe ?? 0) > 0 && (
        <p className="cascade-hint">
          {counts.safe} unaffected {counts.safe === 1 ? "booking is" : "bookings are"} collapsed. Open one to see why it survived.
        </p>
      )}

      <ol className="cascade">
        {bookings.map((booking) => (
          <Node
            key={booking.id}
            booking={booking}
            assessment={byId.get(booking.id)}
            analysed={analysed}
          />
        ))}
      </ol>
    </section>
  );
}
