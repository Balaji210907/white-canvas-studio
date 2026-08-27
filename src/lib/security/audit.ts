/**
 * Audit log.
 *
 * Every operator action, configuration change, dataset load, replay control,
 * security test and integrity finding is recorded here with a correlation id.
 * This is an in-session ledger (the prototype has no server-side persistence
 * for audit yet) — it is explicitly labelled as such in the UI.
 */

export type AuditCategory =
  | "SESSION"
  | "CONFIGURATION"
  | "DATA"
  | "REPLAY"
  | "MODEL"
  | "SECURITY"
  | "INTEGRITY"
  | "MAINTENANCE";

export type AuditResult = "SUCCESS" | "REJECTED" | "DETECTED" | "FAILED" | "INFO";

export interface AuditEntry {
  id: string;
  /** UTC ms. */
  t: number;
  actor: string;
  category: AuditCategory;
  action: string;
  resource: string;
  result: AuditResult;
  detail: string;
  correlationId: string;
}

const MAX_ENTRIES = 500;

let seq = 0;
let entries: AuditEntry[] = [];
const listeners = new Set<(e: AuditEntry[]) => void>();

function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}-${(Date.now() % 1_000_000).toString(36)}`;
}

export function logAudit(input: {
  actor?: string;
  category: AuditCategory;
  action: string;
  resource: string;
  result?: AuditResult;
  detail?: string;
  correlationId?: string;
}): AuditEntry {
  const entry: AuditEntry = {
    id: nextId("evt"),
    t: Date.now(),
    actor: input.actor ?? "operator@local",
    category: input.category,
    action: input.action,
    resource: input.resource,
    result: input.result ?? "SUCCESS",
    detail: input.detail ?? "",
    correlationId: input.correlationId ?? nextId("cid"),
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  for (const l of listeners) l(entries);
  return entry;
}

export function getAuditEntries(): AuditEntry[] {
  return entries;
}

export function subscribeAudit(fn: (e: AuditEntry[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearAudit(actor = "operator@local") {
  entries = [];
  logAudit({ actor, category: "SESSION", action: "AUDIT_CLEARED", resource: "audit-log", detail: "Session audit ledger cleared by operator." });
}

export const AUDIT_RESULT_TONE: Record<AuditResult, "ok" | "warn" | "crit" | "info" | "neutral"> = {
  SUCCESS: "ok",
  REJECTED: "warn",
  DETECTED: "warn",
  FAILED: "crit",
  INFO: "neutral",
};
