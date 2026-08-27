import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { PageHeader, Panel, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import {
  AUDIT_RESULT_TONE,
  clearAudit,
  getAuditEntries,
  subscribeAudit,
  type AuditCategory,
  type AuditEntry,
} from "@/lib/security/audit";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Session audit ledger for AERO-TWIN AI: operator actions, dataset loads, replay control, model events, integrity findings and security tests with correlation IDs.",
      },
      { property: "og:title", content: "Audit Log — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Traceable ledger of every operator, data and security event in the session.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

const CATEGORIES: (AuditCategory | "ALL")[] = [
  "ALL",
  "SESSION",
  "CONFIGURATION",
  "DATA",
  "REPLAY",
  "MODEL",
  "SECURITY",
  "INTEGRITY",
  "MAINTENANCE",
];

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [category, setCategory] = useState<AuditCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setEntries(getAuditEntries());
    return subscribeAudit(setEntries);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (category === "ALL" || e.category === category) &&
        (!q ||
          `${e.action} ${e.resource} ${e.detail} ${e.actor} ${e.correlationId}`.toLowerCase().includes(q)),
    );
  }, [entries, category, query]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description="Every security-relevant and engineering-relevant action is recorded with actor, resource, result and correlation ID. This ledger is in-session only until backend persistence is enabled."
        actions={
          <button
            type="button"
            onClick={() => clearAudit()}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-sidebar-accent"
          >
            Clear ledger
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
              (category === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:bg-sidebar-accent")
            }
          >
            {c}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search action, resource, correlation ID…"
          className="ml-auto w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>

      <Panel title={`Events (${filtered.length})`} subtitle="Newest first">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No audit events match the current filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-xs border-b border-border text-left">
                  <th className="py-2 pr-3">Timestamp (UTC)</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Resource</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2">Correlation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="mono-num whitespace-nowrap py-2 pr-3 text-xs">
                      {new Date(e.t).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{e.actor}</td>
                    <td className="py-2 pr-3 text-xs font-semibold">{e.category}</td>
                    <td className="mono-num py-2 pr-3 text-xs">{e.action}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.resource}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={AUDIT_RESULT_TONE[e.result]}>{e.result}</StatusPill>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.detail}</td>
                    <td className="mono-num py-2 text-[10px] text-muted-foreground">{e.correlationId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <PrototypeNotice>
        Audit entries are retained for the browser session only (most recent 500). Tamper-evident, server-side
        audit storage with user identity is a backend requirement that is not yet implemented.
      </PrototypeNotice>
    </div>
  );
}
