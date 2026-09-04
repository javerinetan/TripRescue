import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
const runsPath = path.join(dataDir, "runs.json");

export function loadRunRecords() {
  try {
    const records = JSON.parse(fs.readFileSync(runsPath, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function persistRuns(runs) {
  fs.mkdirSync(dataDir, { recursive: true });
  const records = [...runs.values()].map((run) => ({
    id: run.id,
    input: run.input,
    status: run.status,
    transaction: run.transaction || null,
    prepared: run.prepared || null,
    preview: run.preview || null,
  }));
  const temporary = `${runsPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, runsPath);
}
