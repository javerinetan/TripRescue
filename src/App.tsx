// Trip Rescue.
//
//   home      trips under monitoring; a disruption arrives
//   recovery  cascade -> strategies -> mandate -> x402 -> XRPL -> delivery
//
// The traveller never triggers the disruption. That matters: the product is a
// monitor, and a demo where you press "cancel my flight" tells the wrong story.

import { useCallback, useEffect, useState } from "react";
import RecoveredTrip from "./RecoveredTrip";
import { buildRecoveredTrip } from "./recoveryOutcome";
import type { ExecutionReceipt } from "./types";
import {
  analyzeDisruption,
  configureMandate,
  fetchPlans,
  formatSgd,
  fetchPriorities,
  fetchTrips,
  resetDemo,
  setActiveIncident,
} from "./api";
import type { ClarificationPatch, IncidentSummary, Priority, Trip, TripsSummary } from "./api";
import TripsHome from "./TripsHome";
import IntentInput from "./IntentInput";
import PrioritySelector from "./PrioritySelector";
import TripCascade from "./TripCascade";
import RecoveryPlans from "./RecoveryPlans";
import PaymentFlow from "./PaymentFlow";
import ClarifyBeforeExecute from "./ClarifyBeforeExecute";
import ClaimSummary from "./ClaimSummary";
import TripChanges from "./TripChanges";
import TripImport from "./TripImport";
import {
  clearImportComplete,
  readImportComplete,
  saveImportComplete,
} from "./tripImportState";
import type { Booking, BookingAssessment, RecoveryPlan } from "./types";

type View = "home" | "recovery";

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [importComplete, setImportComplete] = useState(() =>
    typeof window !== "undefined" ? readImportComplete(sessionStorageOrNull()) : false,
  );
  const [trips, setTrips] = useState<Trip[]>([]);
  const [summary, setSummary] = useState<TripsSummary | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState("flight-cancelled");
  const [headline, setHeadline] = useState<string>("");
  const [tripTitle, setTripTitle] = useState<string>("");
  const [tripDates, setTripDates] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");

  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [priority, setPriority] = useState("leisure");
  const [budget, setBudget] = useState(30000);
  const [preserve, setPreserve] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | undefined>(undefined);
  const [tiers, setTiers] = useState<string[] | undefined>(undefined);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [assessments, setAssessments] = useState<BookingAssessment[]>([]);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  // A strategy the traveller has picked but not yet authorised. It sits here
  // while the agent asks what it refuses to assume.
  const [pendingPlan, setPendingPlan] = useState<RecoveryPlan | null>(null);
  const [clarifyRefused, setClarifyRefused] = useState<string | null>(null);
  // A strategy the traveller's answers just made available. Executing the old
  // choice over the top of it would waste the answer they just gave.
  const [clarifyUnlocked, setClarifyUnlocked] = useState<string | null>(null);
  const [clarifyWorking, setClarifyWorking] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [deliveredReceipt, setDeliveredReceipt] = useState<ExecutionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(0);
  const [boughtOfferId, setBoughtOfferId] = useState<string | undefined>(undefined);

  const completeImport = useCallback(() => {
    saveImportComplete(sessionStorageOrNull());
    setImportComplete(true);
  }, []);

  const replayImport = useCallback(() => {
    clearImportComplete(sessionStorageOrNull());
    setImportComplete(false);
  }, []);

  async function loadHome() {
    const data = await fetchTrips();
    setTrips(data.trips);
    setSummary(data.summary);
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
    await configureMandate(priority, budget, {
      preserveBookingIds: preserve,
      arrivalDeadline: deadline,
      allowedTiers: tiers,
    });
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
  }, [priority, budget, preserve, deadline, tiers, view]);

  async function openRecovery(trip?: Trip) {
    setError(null);
    // The traveller already told us why they were travelling, at booking time.
    if (trip?.purpose) setPurpose(trip.purpose);
    if (trip) {
      setTripTitle(trip.title);
      setTripDates(trip.dates);
    }
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
    setPendingPlan(null);
    setClarifyRefused(null);
    setClarifyUnlocked(null);
    setAuthorised(false);
    setDeliveredReceipt(null);
    setSettled(0);
    setBoughtOfferId(undefined);
    setPlans([]);
    await loadHome().catch(() => undefined);
  }

  async function backToTrips() {
    await resetDemo().catch(() => undefined);
    setSelectedPlan(null);
    setPendingPlan(null);
    setClarifyRefused(null);
    setClarifyUnlocked(null);
    setAuthorised(false);
    setDeliveredReceipt(null);
    setSettled(0);
    setBoughtOfferId(undefined);
    setPlans([]);
    setAssessments([]);
    setView("home");
    await loadHome().catch(() => undefined);
  }

  /**
   * The traveller has answered the pre-flight questions. Their answers rewrite
   * the mandate, then the strategy they picked is re-planned against it. If it
   * no longer complies it is refused here — the mandate is what the agent
   * obeys, and the traveller just changed it.
   */
  async function confirmPlan(plan: RecoveryPlan, patch: ClarificationPatch, force = false) {
    setClarifyWorking(true);
    setClarifyRefused(null);
    setClarifyUnlocked(null);
    const blockedBefore = new Set(
      plans.filter((candidate) => !candidate.mandateCompliant).map((candidate) => candidate.id),
    );

    const nextBudget = patch.budgetMinorUnits ?? budget;
    const nextDeadline = patch.arrivalDeadline ?? deadline;
    const nextTiers = patch.allowedTiers ?? tiers;
    const dropped = new Set(patch.dropPreserve ?? []);
    const nextPreserve = [
      ...new Set([...preserve.filter((id) => !dropped.has(id)), ...(patch.addPreserve ?? [])]),
    ];

    try {
      await configureMandate(priority, nextBudget, {
        preserveBookingIds: nextPreserve,
        arrivalDeadline: nextDeadline,
        allowedTiers: nextTiers,
      });
      const planned = await fetchPlans();

      // Keep the traveller's answers whatever the verdict, so the strategy list
      // they are looking at is the one their mandate actually produces.
      setBudget(nextBudget);
      setDeadline(nextDeadline);
      setTiers(nextTiers);
      setPreserve(nextPreserve);
      setPlans(planned.plans);
      setRecommendedPlanId(planned.recommendedPlanId);

      const rechecked = planned.plans.find((candidate) => candidate.id === plan.id);
      if (!rechecked || !rechecked.mandateCompliant) {
        setClarifyRefused(
          rechecked?.violations.map((v) => v.explanation).join(" ")
            ?? "This strategy is no longer available under your mandate.",
        );
        return;
      }

      // Relaxing a rule to unblock a better strategy and then executing the old
      // one anyway is not what the traveller meant. Stop and let them look.
      const unlocked = planned.plans
        .filter((candidate) => candidate.mandateCompliant && blockedBefore.has(candidate.id))
        .sort((a, b) => a.additionalCost.minorUnits - b.additionalCost.minorUnits)[0];
      if (!force && unlocked) {
        const saving = rechecked.additionalCost.minorUnits - unlocked.additionalCost.minorUnits;
        setClarifyUnlocked(
          saving > 0
            ? `${unlocked.title} is now available — ${formatSgd(saving)} cheaper than ${rechecked.title}.`
            : `${unlocked.title} is now available.`,
        );
        return;
      }

      setDeliveredReceipt(null);
      setSettled(0);
      setBoughtOfferId(undefined);
      setSelectedPlan(rechecked);
      setPendingPlan(null);
      setAuthorised(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClarifyWorking(false);
    }
  }

  // Both views are long, so a change of view has to start at the top. Without
  // this the traveller arrives halfway down the cascade with the alert they
  // just clicked scrolled off the screen.
  useEffect(() => {
    // Home leads with the masthead. Recovery is a task, so it lands on the
    // alert itself rather than making the traveller scroll past a tagline
    // while something of theirs is broken.
    const land = () => {
      if (view === "recovery") {
        document.querySelector(".flow")?.scrollIntoView({ block: "start", behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    };
    land();
    // The recovery view's plans arrive after first paint, so assert it again.
    const frame = requestAnimationFrame(land);
    return () => cancelAnimationFrame(frame);
  }, [view]);

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Trip Rescue</h1>
        <p>When one booking breaks, fix the whole trip.</p>
      </header>

      {error && <div className="card warn"><p>{error}</p></div>}

      {view === "home" ? (
        <div className={`flow ${importComplete ? "enter" : "import-flow"}`}>
          {importComplete ? (
            <TripsHome
              trips={trips}
              summary={summary}
              incidents={incidents}
              activeIncidentId={activeIncidentId}
              onOpen={openRecovery}
              onSwitchIncident={switchIncident}
              onReplayImport={replayImport}
            />
          ) : (
            <TripImport onComplete={completeImport} />
          )}
        </div>
      ) : (
        <div className="flow enter">
          <section className="card trigger">
            <button className="crumb" onClick={backToTrips}>
              <span className="crumb-arrow" aria-hidden="true">←</span> My trips
            </button>
            <div className="card-head trigger-head">
              <div>
                <p className="trigger-trip">{tripTitle}{tripDates && ` · ${tripDates}`}</p>
                <h2>{headline}</h2>
              </div>
              <span className="tag broken">Needs attention</span>
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
                // Choosing a priority outright replaces what was read from the
                // traveller's booking text. Without this the earlier "we would
                // hate to lose the Fuji day" kept ruling out the cheapest
                // strategy, so switching priority appeared to do nothing.
                setPreserve([]);
                setDeadline(undefined);
                setTiers(undefined);
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
                setClarifyRefused(null);
                setClarifyUnlocked(null);
                setPendingPlan(plan);
              }}
              disabled={authorised}
              pendingPlanId={pendingPlan?.id ?? null}
            />
          )}

          {pendingPlan && !selectedPlan && (
            <ClarifyBeforeExecute
              key={pendingPlan.id}
              plan={pendingPlan}
              refused={clarifyRefused}
              unlocked={clarifyUnlocked}
              working={clarifyWorking}
              onConfirm={(patch, force) => confirmPlan(pendingPlan, patch, force)}
              onCancel={() => {
                setPendingPlan(null);
                setClarifyRefused(null);
                setClarifyUnlocked(null);
              }}
            />
          )}

          {selectedPlan && (
            <>
              <PaymentFlow
                key={selectedPlan.id}
                planId={selectedPlan.id}
                onDelivered={setDeliveredReceipt}
                onComplete={(offerId) => {
                  setBoughtOfferId(offerId);
                  setSettled((count) => count + 1);
                }}
              />
              {(() => {
                const outcome = buildRecoveredTrip({
                  plan: selectedPlan,
                  receipt: deliveredReceipt,
                  bookings,
                  assessments,
                });
                return outcome ? <RecoveredTrip outcome={outcome} /> : null;
              })()}
            </>
          )}

          {selectedPlan && settled > 0 && (
            <TripChanges planId={selectedPlan.id} offerId={boughtOfferId} />
          )}

          {selectedPlan && <ClaimSummary refreshToken={settled} />}
        </div>
      )}
    </main>
  );
}
