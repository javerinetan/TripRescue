// The full Trip Rescue journey:
//   priority -> cancellation -> cascade -> strategies -> mandate -> x402 -> XRPL -> delivery

import { useEffect, useState } from "react";
import { analyzeDisruption, configureMandate, fetchPlans, fetchPriorities, resetDemo } from "./api";
import type { Priority } from "./api";
import IntentInput from "./IntentInput";
import PrioritySelector from "./PrioritySelector";
import TripCascade from "./TripCascade";
import RecoveryPlans from "./RecoveryPlans";
import PaymentFlow from "./PaymentFlow";
import type { Booking, BookingAssessment, RecoveryPlan } from "./types";

export default function App() {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [priority, setPriority] = useState("leisure");
  const [budget, setBudget] = useState(30000);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [assessments, setAssessments] = useState<BookingAssessment[]>([]);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "cascade" | "authorised">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preserve, setPreserve] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | undefined>(undefined);

  useEffect(() => {
    analyzeDisruption()
      .then((analysis) => setBookings(analysis.bookings))
      .catch(() => setError("API not reachable. Start it with npm run dev."));
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

  function choosePriority(id: string) {
    setPriority(id);
    const match = priorities.find((p) => p.id === id);
    if (match) setBudget(match.suggestedBudget.minorUnits);
  }

  // Re-plan whenever the mandate inputs change, so the traveller sees the
  // consequence of their own choice before authorising anything.
  async function refreshPlans() {
    await configureMandate(priority, budget, { preserveBookingIds: preserve, arrivalDeadline: deadline });
    const planned = await fetchPlans();
    setPlans(planned.plans);
    setRecommendedPlanId(planned.recommendedPlanId);
  }

  useEffect(() => {
    if (phase !== "cascade") return;
    refreshPlans().catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priority, budget, preserve, deadline, phase]);

  async function triggerCancellation() {
    setPhase("loading");
    setError(null);
    try {
      const analysis = await analyzeDisruption();
      setBookings(analysis.bookings);
      setAssessments(analysis.assessments);
      await refreshPlans();
      setPhase("cascade");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  async function startOver() {
    await resetDemo().catch(() => undefined);
    setAssessments([]);
    setPlans([]);
    setSelectedPlan(null);
    setPhase("idle");
  }

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Trip Rescue</h1>
        <p>When one booking breaks, fix the whole trip.</p>
      </header>

      {error && <div className="card warn"><p>{error}</p></div>}

      <div className="flow">
        <section className="card trigger">
          <div className="card-head">
            <h2>Singapore → Tokyo, 5 September</h2>
            <div className="actions">
              {phase === "idle" ? (
                <button onClick={triggerCancellation}>Cancel flight SQ634</button>
              ) : (
                <button className="ghost" onClick={startOver}>Start over</button>
              )}
            </div>
          </div>
          <p className="muted small">
            Five bookings from five unrelated providers. Each provider sees only its own
            reservation.
          </p>
        </section>

        <IntentInput
          disabled={phase === "authorised"}
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
            onSelect={choosePriority}
            onBudgetChange={setBudget}
            disabled={phase === "authorised"}
          />
        )}

        {phase === "loading" && <div className="card"><p className="muted">Analysing the cascade…</p></div>}

        {bookings.length > 0 && <TripCascade bookings={bookings} assessments={assessments} />}

        {plans.length > 0 && (
          <RecoveryPlans
            plans={plans}
            recommendedPlanId={recommendedPlanId}
            selectedPlanId={selectedPlan?.id ?? null}
            onSelect={(plan) => {
              setSelectedPlan(plan);
              setPhase("authorised");
            }}
            disabled={phase === "authorised"}
          />
        )}

        {selectedPlan && <PaymentFlow key={selectedPlan.id} planId={selectedPlan.id} />}
      </div>
    </main>
  );
}
