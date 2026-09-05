// Execution and idempotency store.
//
// docs/BUILD_PLAN.md invariant 3: repeating the same execution request must not
// create a duplicate purchase. docs/API_CONTRACT.md requires a reused
// idempotency key with different parameters to fail with execution-conflict.

import crypto from "node:crypto";

const executions = new Map(); // executionId -> execution
const byIdempotencyKey = new Map(); // key -> executionId
const requirements = new Map(); // requirementId -> requirement record
const decisions = new Map(); // decisionId -> guarded supplier decision

export function resetExecutions() {
  executions.clear();
  byIdempotencyKey.clear();
  requirements.clear();
  decisions.clear();
}

export function saveDecision(record) {
  decisions.set(record.decisionId, record);
  return record;
}

export function getDecision(decisionId) {
  return decisions.get(decisionId) ?? null;
}

export function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function saveRequirement(record) {
  requirements.set(record.requirementId, record);
  return record;
}

export function getRequirement(requirementId) {
  return requirements.get(requirementId) ?? null;
}

export function isExpired(record, now = new Date()) {
  return Date.parse(record.expiresAt) <= now.getTime();
}

export function createExecution(execution) {
  executions.set(execution.executionId, execution);
  return execution;
}

export function getExecution(executionId) {
  return executions.get(executionId) ?? null;
}

export function updateExecution(executionId, patch) {
  const current = executions.get(executionId);
  if (!current) return null;
  const next = { ...current, ...patch };
  executions.set(executionId, next);
  return next;
}

/**
 * Fingerprint of everything that makes a payment economically distinct. Two
 * requests with the same idempotency key but a different fingerprint are a
 * conflict, not a retry.
 */
export function fingerprint({ recoveryId, incidentId = "", planId, mandateId, offerId, amountDrops, destination }) {
  return crypto
    .createHash("sha256")
    .update([recoveryId, incidentId, planId, mandateId, offerId, amountDrops, destination].join("|"))
    .digest("hex");
}

/**
 * Claims an idempotency key. Returns {status:"new"} for a first use,
 * {status:"replay", execution} when the same parameters are retried, or
 * {status:"conflict"} when the key is reused with different parameters.
 */
export function claimIdempotencyKey(key, print) {
  const existingId = byIdempotencyKey.get(key);
  if (!existingId) return { status: "new" };
  const execution = executions.get(existingId);
  if (!execution) return { status: "new" };
  if (execution.fingerprint !== print) return { status: "conflict", execution };
  return { status: "replay", execution };
}

export function bindIdempotencyKey(key, executionId) {
  byIdempotencyKey.set(key, executionId);
}

export function allExecutions() {
  return [...executions.values()];
}
