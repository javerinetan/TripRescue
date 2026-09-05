import type { Booking, ExecutionReceipt, RecoveryPlan } from "./types";

export interface RecoveredBookingOutcome {
  id: string;
  title: string;
  originalStatus: Booking["type"] | string;
  outcome: "planned-change" | "preserved" | "unchanged";
  explanation: string;
}

export interface RecoveredTripOutcome {
  status: "recovered";
  planId: string;
  planTitle: string;
  selectedOfferId: string;
  arrivalTime: string;
  estimatedAdditionalCost: RecoveryPlan["additionalCost"];
  paidAmount?: number;
  actions: RecoveryPlan["actions"];
  bookings: RecoveredBookingOutcome[];
  deliveredResource: NonNullable<ExecutionReceipt["deliveredResource"]>;
  transactionHash: string;
  explorerUrl?: string;
}

export function buildRecoveryIdempotencyKey({ recoveryId, planId, offerId }: {
  recoveryId: string;
  planId: string;
  offerId: string;
}): string {
  return `${recoveryId}:${planId}:${offerId}`;
}

export function resolveSelectedOffer<T extends { id: string }>(offers: T[], selectedOfferId: string | null): T {
  const selected = offers.find((offer) => offer.id === selectedOfferId);
  if (!selected) throw new Error("The guarded agent selected an offer not present in discovery results.");
  return selected;
}

export function buildRecoveredTrip({
  plan,
  receipt,
  bookings,
  assessments = [],
}: {
  plan: RecoveryPlan;
  receipt: ExecutionReceipt | null;
  bookings: Booking[];
  assessments?: { bookingId: string; status: string }[];
}): RecoveredTripOutcome | null {
  if (
    !receipt
    || receipt.status !== "delivered"
    || receipt.planId !== plan.id
    || !receipt.offerId
    || !receipt.deliveredResource
    || !receipt.transactionHash
  ) return null;

  const statusByBooking = new Map(assessments.map((assessment) => [assessment.bookingId, assessment.status]));
  const preserved = new Set(plan.preservesBookingIds);
  return {
    status: "recovered",
    planId: plan.id,
    planTitle: plan.title,
    selectedOfferId: receipt.offerId,
    arrivalTime: plan.arrivalTime,
    estimatedAdditionalCost: plan.additionalCost,
    actions: plan.actions,
    bookings: bookings.map((booking) => {
      const originalStatus = statusByBooking.get(booking.id) ?? "safe";
      return {
        id: booking.id,
        title: booking.title,
        originalStatus,
        outcome: preserved.has(booking.id) ? "preserved" : originalStatus === "safe" ? "unchanged" : "planned-change",
        explanation: preserved.has(booking.id)
          ? "Preserved by the authorized recovery plan."
          : originalStatus === "safe"
            ? "Outside the disruption cascade; no change was needed."
            : "Included in the recovery plan; provider action is represented as planned/simulated.",
      };
    }),
    deliveredResource: receipt.deliveredResource,
    transactionHash: receipt.transactionHash,
    explorerUrl: receipt.explorerUrl,
  };
}
