// The trip dependency graph and the cascade caused by one cancellation.
//
// This is the view that makes the product legible in two seconds: providers see
// their own booking, Trip Rescue sees what breaks downstream.

import type { Booking, BookingAssessment } from "./types";
import { formatLocalTime, formatSgd } from "./api";

const STATUS_LABEL: Record<string, string> = {
  broken: "Broken",
  "at-risk": "At risk",
  safe: "Safe",
};

export default function TripCascade({
  bookings,
  assessments,
}: {
  bookings: Booking[];
  assessments: BookingAssessment[];
}) {
  const byId = new Map(assessments.map((a) => [a.bookingId, a]));
  // Before the cancellation there is nothing to assess: show the intact trip.
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

      <ol className="cascade">
        {bookings.map((booking, index) => {
          const assessment = byId.get(booking.id);
          const status = analysed ? assessment?.status ?? "safe" : "intact";
          return (
            <li key={booking.id} className={`node ${status}`}>
              {index > 0 && <span className="connector" aria-hidden="true" />}
              <div className="node-body">
                <div className="node-head">
                  <span className={`status-dot ${status}`} />
                  <strong>{booking.title}</strong>
                  {analysed && <span className={`tag ${status}`}>{STATUS_LABEL[status]}</span>}
                </div>
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
                {assessment && <p className="node-reason">{assessment.explanation}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
