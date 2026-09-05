// Trip Rescue.
//
//   home      trips under monitoring; a disruption arrives
//   recovery  cascade -> strategies -> mandate -> x402 -> XRPL -> delivery
//
// The traveller never triggers the disruption. That matters: the product is a
// monitor, and a demo where you press "cancel my flight" tells the wrong story.

import { useEffect, useState } from "react";
import {
  analyzeDisruption,
  configureMandate,
  fetchPlans,
  fetchPriorities,
  fetchTrips,
  resetDemo,
  setActiveIncident,
} from "./api";
import type { IncidentSummary, Priority, Trip } from "./api";
import TripsHome from "./TripsHome";
import IntentInput from "./IntentInput";
import PrioritySelector from "./PrioritySelector";
import TripCascade from "./TripCascade";
import RecoveryPlans from "./RecoveryPlans";
import PaymentFlow from "./PaymentFlow";
import type { Booking, BookingAssessment, RecoveryPlan } from "./types";

type View = "home" | "recovery";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState("flight-cancelled");
  const [headline, setHeadline] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");

  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [priority, setPriority] = useState("leisure");
  const [budget, setBudget] = useState(30000);
  const [preserve, setPreserve] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | undefined>(undefined);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [assessments, setAssessments] = useState<BookingAssessment[]>([]);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  const [authorised, setAuthorised] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHome() {
    const data = await fetchTrips();
    setTrips(data.trips);
    setIncidents(data.incidents);
    setActiveIncidentId(data.activeIncidentId);
  }

  useEffect(() => {
    loadHome().catch(() => setError("API not reachable. Start it with npm run dev."));
    fetchPriorities()
      .then((data) => {
        setPriorities(data.priorities);
        const initial = data.priorities.find((p) => p.id === data.default);
        if (initial) {
          setPriority(initial.id);
          setBudget(initial.suggestedBudget.minorUnits);
        }
      })
      .catch(() => undefined);
  }, []);

  async function refreshPlans() {
    await configureMandate(priority, budget, { preserveBookingIds: preserve, arrivalDeadline: deadline });
    const planned = await fetchPlans();
    setPlans(planned.plans);
    setRecommendedPlanId(planned.recommendedPlanId);
  }

  // Re-plan whenever the mandate inputs change, so the traveller sees the
  // consequence of their own choice before authorising anything.
  useEffect(() => {
    if (view !== "recovery" || authorised) return;
    refreshPlans().catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priority, budget, preserve, deadline, view]);

  async function openRecovery(trip?: Trip) {
    setError(null);
    // The traveller already told us why they were travelling, at booking time.
    if (trip?.purpose) setPurpose(trip.purpose);
    try {
      const analysis = await analyzeDisruption();
      setBookings(analysis.bookings);
      setAssessments(analysis.assessments);
      setHeadline(analysis.incident?.headline ?? "");
      await refreshPlans();
      setView("recovery");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function switchIncident(incidentId: string) {
    await setActiveIncident(incidentId).catch(() => undefined);
    setSelectedPlan(null);
    setAuthorised(false);
    setPlans([]);
    await loadHome().catch(() => undefined);
  }

  async function backToTrips() {
    await resetDemo().catch(() => undefined);
    setSelectedPlan(null);
    setAuthorised(false);
    setPlans([]);
    setAssessments([]);
    setView("home");
    await loadHome().catch(() => undefined);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Trip Rescue</h1>
        <p>When one booking breaks, fix the whole trip.</p>
      </header>

      {error && <div className="card warn"><p>{error}</p></div>}

      {view === "home" ? (
        <div className="flow">
          <TripsHome
            trips={trips}
            incidents={incidents}
            activeIncidentId={activeIncidentId}
            onOpen={openRecovery}
            onSwitchIncident={switchIncident}
          />
        </div>
      ) : (
        <div className="flow">
          <section className="card trigger">
            <div className="card-head">
              <h2>{headline}</h2>
              <button className="ghost" onClick={backToTrips}>Back to my trips</button>
            </div>
            <p className="muted small">
              Trip Rescue detected this and worked out what it affects across every provider.
            </p>
          </section>

          {bookings.length > 0 && <TripCascade bookings={bookings} assessments={assessments} />}

          <IntentInput
            value={purpose}
            onChange={setPurpose}
            disabled={authorised}
            onApply={(proposal) => {
              if (proposal.priority) setPriority(proposal.priority);
              if (proposal.maximumAdditionalSpend) setBudget(proposal.maximumAdditionalSpend.minorUnits);
              if (proposal.preserveBookingIds) setPreserve(proposal.preserveBookingIds);
              if (proposal.arrivalDeadline) setDeadline(proposal.arrivalDeadline);
            }}
          />

          {priorities.length > 0 && (
            <PrioritySelector
              priorities={priorities}
              selected={priority}
              budget={budget}
              onSelect={(id) => {
                setPriority(id);
                const match = priorities.find((p) => p.id === id);
                if (match) setBudget(match.suggestedBudget.minorUnits);
              }}
              onBudgetChange={setBudget}
              disabled={authorised}
            />
          )}

          {plans.length > 0 && (
            <RecoveryPlans
              plans={plans}
              recommendedPlanId={recommendedPlanId}
              selectedPlanId={selectedPlan?.id ?? null}
              onSelect={(plan) => {
                setSelectedPlan(plan);
                setAuthorised(true);
              }}
              disabled={authorised}
            />
          )}

          {selectedPlan && <PaymentFlow key={selectedPlan.id} planId={selectedPlan.id} />}
        </div>
      )}
    </main>
  );
}
