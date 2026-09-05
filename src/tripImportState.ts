export const IMPORT_SESSION_KEY = "trip-rescue:import-complete";

export const IMPORT_STAGES = [
  { id: "finding", label: "Finding travel confirmations" },
  { id: "grouping", label: "Grouping bookings into trips" },
  { id: "monitoring", label: "Starting provider monitoring" },
] as const;

export type ImportStage = "idle" | (typeof IMPORT_STAGES)[number]["id"] | "complete";

const NEXT_STAGE: Record<ImportStage, ImportStage> = {
  idle: "finding",
  finding: "grouping",
  grouping: "monitoring",
  monitoring: "complete",
  complete: "complete",
};

export function nextImportStage(stage: ImportStage): ImportStage {
  return NEXT_STAGE[stage];
}

export function readImportComplete(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(IMPORT_SESSION_KEY) === "complete";
  } catch {
    return false;
  }
}

export function saveImportComplete(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(IMPORT_SESSION_KEY, "complete");
  } catch {
    // Session persistence is optional; importing still completes in memory.
  }
}

export function clearImportComplete(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(IMPORT_SESSION_KEY);
  } catch {
    // Replay still works in memory when browser storage is unavailable.
  }
}
