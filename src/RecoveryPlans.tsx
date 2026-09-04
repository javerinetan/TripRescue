// The three whole-trip recovery strategies and the point of human authorization.
//
// Selecting a plan is the only decision the traveller makes. It converts into a
// bounded Rescue Mandate, and everything after it happens inside those limits.

import { formatLocalTime, formatSgd } from "./api";
import type { RecoveryPlan } from "./types";

const KIND_LABEL: Record<RecoveryPlan["kind"], string> = {
  fastest: "Fastest",
  cheapest: "Cheapest",
  "most-reliable": "Most reliable",
};

export default function RecoveryPlans({
  plans,
  recommendedPlanId,
  selectedPlanId,
  onSelect,
  disabled,
}: {
  plans: RecoveryPlan[];
  recommendedPlanId: string | null;
  selectedPlanId: string | null;
  onSelect: (plan: RecoveryPlan) => void;
  disabled: boolean;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Whole-trip recovery strategies</h2>
        <span className="muted small">You choose the trade-off, the agent executes it</span>
      </div>

      <div className="plans">
        {plans.map((plan) => {
          const blocked = !plan.mandateCompliant;
          const selected = plan.id === selectedPlanId;
          return (
            <article
              key={plan.id}
              className={`plan ${blocked ? "blocked" : ""} ${selected ? "selected" : ""}`}
            >
              <header>
                <span className="plan-kind">{KIND_LABEL[plan.kind]}</span>
                {plan.id === recommendedPlanId && <span className="tag safe">Recommended</span>}
              </header>

              <p className="plan-cost">+{formatSgd(plan.additionalCost.minorUnits)}</p>
              <p className="plan-arrival">
                Arrives {formatLocalTime(plan.arrivalTime)}
              </p>
              <p className="plan-risk">Risk {plan.riskScore}/100</p>

              <ul className="plan-actions">
                {plan.actions.map((action) => (
                  <li key={action.id} className={action.reversible ? "" : "irreversible"}>
                    <span className={`action-kind ${action.kind}`}>{action.kind}</span>
                    {action.description}
                    {!action.reversible && <span className="warn-flag" title="Irreversible">irreversible</span>}
                  </li>
                ))}
              </ul>

              <p className="plan-explanation">{plan.explanation}</p>

              {blocked ? (
                <div className="plan-violations">
                  {plan.violations.map((violation) => (
                    <p key={violation.code}>
                      <span className="tag broken">{violation.code}</span> {violation.explanation}
                    </p>
                  ))}
                </div>
              ) : (
                <button disabled={disabled} onClick={() => onSelect(plan)}>
                  {selected ? "Authorised" : "Authorise this plan"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
