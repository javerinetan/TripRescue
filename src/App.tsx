// The full Trip Rescue journey:
//   cancellation -> cascade -> three strategies -> mandate -> x402 -> XRPL -> delivery

import { useEffect, useState } from "react";
import { analyzeDisruption, fetchPlans, resetDemo } from "./api";
import TripCascade from "./TripCascade";
import RecoveryPlans from "./RecoveryPlans";
import PaymentFlow from "./PaymentFlow";
import type { Booking, BookingAssessment, RecoveryPlan } from "./types";

export default function App() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [assessments, setAssessments] = useState<BookingAssessment[]>([]);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "cascade" | "authorised">("idle");
  const [error, setError] = useState<string | null>(null);

  async function triggerCancellation() {
    setPhase("loading");
    setError(null);
    try {
      const analysis = await analyzeDisruption();
      setBookings(analysis.bookings);
      setAssessments(analysis.assessments);
      const planned = await fetchPlans();
      setPlans(planned.plans);
      setRecommendedPlanId(planned.recommendedPlanId);
      setPhase("cascade");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  async function startOver() {
    await resetDemo().catch(() => undefined);
    setBookings([]);
    setAssessments([]);
    setPlans([]);
    setSelectedPlan(null);
    setPhase("idle");
  }

  // Load the itinerary immediately so the demo opens on the trip, not a blank page.
  useEffect(() => {
    analyzeDisruption()
      .then((analysis) => setBookings(analysis.bookings))
      .catch(() => setError("API not reachable. Start it with npm run dev."));
  }, []);

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
                <button disabled={phase !== "idle"} onClick={triggerCancellation}>
                  Cancel flight SQ634
                </button>
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

        {phase === "loading" && <div className="card"><p className="muted">Analysing the cascade…</p></div>}

        {bookings.length > 0 && assessments.length > 0 && (
          <TripCascade bookings={bookings} assessments={assessments} />
        )}

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

        {selectedPlan && <PaymentFlow planId={selectedPlan.id} />}
      </div>
    </main>
  );
}
