import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Bar, Metric, PageHeader, Panel, PrototypeNotice, StatusPill, type Tone } from "@/components/ui-kit";
import { useTelemetry } from "@/lib/sim/store";
import { COMPONENT_STATUS_TONE, type ComponentState } from "@/lib/twin/state";
import { logAudit } from "@/lib/security/audit";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance Decision Support — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Evidence-backed inspection recommendations derived from component health, residual evidence and fault hypotheses — advisory only, never an approved maintenance authority.",
      },
      { property: "og:title", content: "Maintenance Decision Support — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Inspection advisories with severity, urgency, evidence and confidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaintenancePage,
});

type Urgency = "ROUTINE" | "NEXT_INSPECTION" | "BEFORE_NEXT_SORTIE" | "IMMEDIATE";

const URGENCY_TONE: Record<Urgency, Tone> = {
  ROUTINE: "neutral",
  NEXT_INSPECTION: "info",
  BEFORE_NEXT_SORTIE: "warn",
  IMMEDIATE: "crit",
};

interface Advisory {
  id: string;
  component: ComponentState;
  urgency: Urgency;
  severity: number;
  action: string;
  evidence: string[];
  confidence: number;
}

function urgencyOf(c: ComponentState): Urgency | null {
  switch (c.status) {
    case "FAULT":
    case "CRITICAL":
      return "IMMEDIATE";
    case "DEGRADED":
      return "BEFORE_NEXT_SORTIE";
    case "WARNING":
      return "NEXT_INSPECTION";
    case "MONITOR":
      return "ROUTINE";
    default:
      return null;
  }
}

function MaintenancePage() {
  const { twinState, latest } = useTelemetry();
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});

  const advisories = useMemo<Advisory[]>(() => {
    const list: Advisory[] = [];
    for (const c of Object.values(twinState.components)) {
      const urgency = urgencyOf(c);
      if (!urgency || c.derived) continue;
      const evidence: string[] = [];
      for (const contrib of c.contributions.slice(0, 3)) {
        if (contrib.normResidual === null) continue;
        const n = contrib.normResidual;
        evidence.push(`${contrib.tag}: normalised residual ${n >= 0 ? "+" : ""}${n.toFixed(2)}σ`);
      }
      for (const h of c.faultHypotheses.slice(0, 2)) {
        evidence.push(`Hypothesis ${h.label} at ${(h.probability * 100).toFixed(0)}% support`);
      }
      if (!evidence.length) evidence.push(c.reason);
      list.push({
        id: c.id,
        component: c,
        urgency,
        severity: c.health === null ? 0 : 100 - c.health,
        action:
          urgency === "IMMEDIATE"
            ? `Recommend engineering inspection of ${c.name} before further operation.`
            : urgency === "BEFORE_NEXT_SORTIE"
              ? `Recommend borescope / physical inspection of ${c.name} before the next sortie.`
              : urgency === "NEXT_INSPECTION"
                ? `Add ${c.name} to the next scheduled inspection package.`
                : `Continue trend monitoring of ${c.name}; no action required yet.`,
        evidence,
        confidence: c.confidence,
      });
    }
    return list.sort((a, b) => b.severity - a.severity);
  }, [twinState]);

  const counts = {
    immediate: advisories.filter((a) => a.urgency === "IMMEDIATE").length,
    sortie: advisories.filter((a) => a.urgency === "BEFORE_NEXT_SORTIE").length,
    scheduled: advisories.filter((a) => a.urgency === "NEXT_INSPECTION").length,
  };

  const rul = twinState.rul;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Maintenance Decision Support"
        description="Advisories are derived from the same digital-twin evidence shown elsewhere in the platform. They are engineering recommendations for a qualified maintainer, not authorised maintenance instructions."
        actions={
          <StatusPill tone={counts.immediate ? "crit" : counts.sortie ? "warn" : "ok"}>
            {counts.immediate ? "ACTION REQUIRED" : counts.sortie ? "ATTENTION" : "NO ACTION OUTSTANDING"}
          </StatusPill>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Immediate advisories" value={counts.immediate} tone={counts.immediate ? "crit" : "ok"} provenance="calculated" />
        <Metric label="Before next sortie" value={counts.sortie} tone={counts.sortie ? "warn" : "ok"} provenance="calculated" />
        <Metric label="Next scheduled package" value={counts.scheduled} tone="info" provenance="calculated" />
        <Metric
          label="RUL basis"
          value={rul?.available ? `${rul.hours?.toFixed(0)} h` : "NOT AVAILABLE"}
          tone={rul?.available ? "info" : "neutral"}
          provenance="model"
          hint={rul?.available ? "Validated prognostic model" : (rul?.reason ?? "No prognostic model has been validated.")}
        />
      </div>

      <Panel
        title="Open advisories"
        subtitle={
          latest
            ? `Derived from frame ${latest.seq} · ${new Date(latest.t).toISOString().slice(11, 19)}Z · source ${twinState.sourceType}`
            : "Awaiting telemetry"
        }
      >
        {advisories.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {latest
              ? "No component is currently outside its monitoring band. No maintenance advisory is generated."
              : "No telemetry processed yet — advisories require live or replayed engine data."}
          </p>
        ) : (
          <ul className="space-y-2">
            {advisories.map((a) => (
              <li key={a.id} className="rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{a.component.name}</span>
                  <StatusPill tone={COMPONENT_STATUS_TONE[a.component.status]}>{a.component.status}</StatusPill>
                  <StatusPill tone={URGENCY_TONE[a.urgency]}>{a.urgency.replace(/_/g, " ")}</StatusPill>
                  <span className="label-xs ml-auto">{a.component.subsystem}</span>
                </div>
                <p className="mt-1.5 text-sm">{a.action}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {a.evidence.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="mono-num">
                    Health {a.component.health === null ? "—" : `${a.component.health.toFixed(0)}%`}
                  </span>
                  <span className="mono-num">Confidence {(a.confidence * 100).toFixed(0)}%</span>
                  <div className="w-32">
                    <Bar value={a.confidence} tone={a.confidence > 0.6 ? "ok" : "warn"} />
                  </div>
                  <button
                    type="button"
                    disabled={acknowledged[a.id]}
                    onClick={() => {
                      setAcknowledged((p) => ({ ...p, [a.id]: true }));
                      logAudit({
                        category: "MAINTENANCE",
                        action: "ADVISORY_ACKNOWLEDGED",
                        resource: `component:${a.id}`,
                        detail: `${a.component.name} — ${a.urgency} advisory acknowledged by operator.`,
                      });
                    }}
                    className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-sidebar-accent disabled:opacity-50"
                  >
                    {acknowledged[a.id] ? "Acknowledged" : "Acknowledge"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <PrototypeNotice>
        AERO-TWIN AI is a decision-support prototype. It does not replace the approved maintenance manual, and no
        advisory here constitutes airworthiness clearance or release-to-service.
      </PrototypeNotice>
    </div>
  );
}
