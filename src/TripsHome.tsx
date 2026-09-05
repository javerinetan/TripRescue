// The monitoring dashboard.
//
// This is the free Trip Guardian tier made visible: your trips sit here being
// watched, and most of the time nothing happens. Two jobs, in order — tell the
// traveller at a glance whether anything is wrong and how much money is behind
// it, then let them act on the one thing that is.
//
// The traveller never triggers the disruption. It arrives, which is why the
// alert animates in rather than appearing on a click.

import { useEffect, useState } from "react";
import { formatSgd } from "./api";
import type { IncidentSummary, Trip, TripsSummary } from "./api";

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

/** Proportional bar of a trip's bookings by status. */
function ExposureBar({ exposure }: { exposure: Trip["exposure"] }) {
  const total = exposure.broken + exposure.atRisk + exposure.safe || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="exposure" role="img" aria-label={`${exposure.broken} broken, ${exposure.atRisk} at risk, ${exposure.safe} unaffected`}>
      {exposure.broken > 0 && <span className="seg broken" style={{ width: seg(exposure.broken) }} />}
      {exposure.atRisk > 0 && <span className="seg at-risk" style={{ width: seg(exposure.atRisk) }} />}
      {exposure.safe > 0 && <span className="seg safe" style={{ width: seg(exposure.safe) }} />}
    </div>
  );
}

export default function TripsHome({
  trips,
  summary,
  incidents,
  activeIncidentId,
  onOpen,
  onSwitchIncident,
  onReplayImport,
}: {
  trips: Trip[];
  summary: TripsSummary | null;
  incidents: IncidentSummary[];
  activeIncidentId: string;
  onOpen: (trip: Trip) => void;
  onSwitchIncident: (incidentId: string) => void;
  onReplayImport: () => void;
}) {
  // Hold the alert back for a beat so it lands as something detected, not
  // something that was always sitting there.
  const [alertVisible, setAlertVisible] = useState(false);
  useEffect(() => {
    setAlertVisible(false);
    const timer = setTimeout(() => setAlertVisible(true), 1100);
    return () => clearTimeout(timer);
  }, [activeIncidentId]);

  const atRisk = alertVisible ? summary?.valueAtRisk.minorUnits ?? 0 : 0;

  return (
    <>
      <section className="import-provenance" aria-label="Trip import status">
        <div className="provenance-mark" aria-hidden="true">✓</div>
        <div>
          <strong>
            {summary
              ? `${summary.trips} trips · ${summary.bookings} bookings imported`
              : "Trips imported"}
          </strong>
          <p>One-time import complete · Inbox disconnected · Monitoring provider feeds</p>
        </div>
        <button className="ghost replay-import" onClick={onReplayImport}>
          Replay import demo
        </button>
      </section>

      <section className="card dash">
        <div className="dash-head">
          <span className="pulse" aria-hidden="true" />
          <span className="dash-title">Monitoring</span>
          <span className={`dash-state ${alertVisible && summary?.alerts ? "alerting" : ""}`}>
            {alertVisible && summary?.alerts ? `${summary.alerts} alert` : "all clear"}
          </span>
        </div>

        {summary && (
          <div className="stats">
            <div className="stat">
              <span className="stat-value">{summary.trips}</span>
              <span className="stat-label">trips</span>
            </div>
            <div className="stat">
              <span className="stat-value">{summary.bookings}</span>
              <span className="stat-label">bookings</span>
            </div>
            <div className="stat">
              <span className="stat-value">{summary.providers}</span>
              <span className="stat-label">providers</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatSgd(summary.committed.minorUnits)}</span>
              <span className="stat-label">committed</span>
            </div>
            <div className="stat emphasis">
              <span className={`stat-value ${atRisk > 0 ? "bad" : ""}`}>{formatSgd(atRisk)}</span>
              <span className="stat-label">at risk now</span>
            </div>
          </div>
        )}
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
                  <span className="watching">
                    <span className="pulse small-pulse" aria-hidden="true" /> monitoring
                  </span>
                )}
              </div>

              <ExposureBar exposure={alert ? trip.exposure : { broken: 0, atRisk: 0, safe: trip.bookingCount }} />

              <div className="trip-facts">
                <span>{trip.bookingCount} bookings</span>
                <span>{trip.providerCount} providers</span>
                <span>{formatSgd(trip.totalCommitted.minorUnits)} committed</span>
                {alert && trip.valueAtRisk.minorUnits > 0 && (
                  <span className="fact-bad">{formatSgd(trip.valueAtRisk.minorUnits)} at risk</span>
                )}
              </div>

              {trip.purpose && <p className="trip-purpose">{trip.purpose}</p>}

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
