// The monitoring home.
//
// Trip Rescue is the free Trip Guardian tier made visible: your trips sit here
// being watched, and most of the time nothing happens. The product only speaks
// up when a booking breaks. The traveller never triggers the disruption — it
// arrives, which is why the alert animates in rather than appearing on a click.

import { useEffect, useState } from "react";
import { formatSgd } from "./api";
import type { IncidentSummary, Trip } from "./api";

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
};

const SEVERITY_TAG: Record<string, string> = {
  critical: "broken",
  high: "broken",
  moderate: "at-risk",
};

export default function TripsHome({
  trips,
  incidents,
  activeIncidentId,
  onOpen,
  onSwitchIncident,
}: {
  trips: Trip[];
  incidents: IncidentSummary[];
  activeIncidentId: string;
  onOpen: (trip: Trip) => void;
  onSwitchIncident: (incidentId: string) => void;
}) {
  // Hold the alert back for a beat so it lands as something detected, not
  // something that was always sitting there.
  const [alertVisible, setAlertVisible] = useState(false);
  useEffect(() => {
    setAlertVisible(false);
    const timer = setTimeout(() => setAlertVisible(true), 1100);
    return () => clearTimeout(timer);
  }, [activeIncidentId]);

  return (
    <>
      <section className="card monitor-bar">
        <span className="pulse" aria-hidden="true" />
        <div>
          <strong>Monitoring {trips.length} trips</strong>
          <p className="muted small">
            Watching {trips.reduce((n, t) => n + t.bookingCount, 0)} bookings across{" "}
            {trips.reduce((n, t) => n + t.providerCount, 0)} providers for disruption.
          </p>
        </div>
        <span className="monitor-state">{alertVisible ? "1 alert" : "all clear"}</span>
      </section>

      <div className="trips">
        {trips.map((trip) => {
          const alert = trip.alert && alertVisible ? trip.alert : null;
          return (
            <article key={trip.id} className={`card trip ${alert ? "alerting" : ""}`}>
              <div className="trip-head">
                <div>
                  <h2>{trip.title}</h2>
                  <p className="trip-dates">{trip.dates}</p>
                </div>
                {alert ? (
                  <span className={`tag ${SEVERITY_TAG[alert.severity]}`}>{SEVERITY_LABEL[alert.severity]}</span>
                ) : (
                  <span className="watching"><span className="pulse small-pulse" aria-hidden="true" /> monitoring</span>
                )}
              </div>

              {trip.purpose && <p className="trip-purpose">“{trip.purpose}”</p>}

              <p className="trip-meta">
                {trip.bookingCount} bookings · {trip.providerCount} providers ·{" "}
                {formatSgd(trip.totalCommitted.minorUnits)} committed
              </p>

              {alert && (
                <div className="alert">
                  <div className="alert-head">
                    <strong>{alert.headline}</strong>
                    <span className="alert-age">detected {alert.detectedMinutesAgo} min ago</span>
                  </div>
                  <p className="alert-detail">{alert.detail}</p>
                  <p className="alert-source">via {alert.source}</p>
                  <button onClick={() => onOpen(trip)}>See what this affects</button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="card sim">
        <div className="card-head">
          <h2>Simulate a different disruption</h2>
          <span className="panel-sub">demo control — in production the feeds decide this</span>
        </div>
        <div className="sim-options">
          {incidents.map((incident) => (
            <button
              key={incident.id}
              className={`sim-option ${incident.id === activeIncidentId ? "on" : ""}`}
              onClick={() => onSwitchIncident(incident.id)}
            >
              <span className={`tag ${SEVERITY_TAG[incident.severity]}`}>{SEVERITY_LABEL[incident.severity]}</span>
              <strong>{incident.headline}</strong>
              <span className="sim-detail">{incident.detail}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
