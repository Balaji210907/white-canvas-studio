import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Bar, Metric, PageHeader, Panel, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { useTelemetry } from "@/lib/sim/store";
import { logAudit } from "@/lib/security/audit";
import {
  INTEGRITY_STATUS_TONE,
  SECURITY_TESTS,
  runSecurityTest,
  type SecurityTestOutcome,
} from "@/lib/security/integrity";

export const Route = createFileRoute("/cybersecurity")({
  head: () => ({
    meta: [
      { title: "Cybersecurity & Telemetry Integrity — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Telemetry integrity monitoring, replay protection, source authentication and a controlled security test harness for the AERO-TWIN pipeline.",
      },
      { property: "og:title", content: "Cybersecurity & Telemetry Integrity — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Integrity checks, trust score and controlled security tests over live telemetry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CyberPage,
});

function CyberPage() {
  const { integrity, integrityMonitor, latest } = useTelemetry();
  const [outcomes, setOutcomes] = useState<SecurityTestOutcome[]>([]);

  const trust = integrity.trustScore;

  function execute(id: string) {
    const test = SECURITY_TESTS.find((t) => t.id === id);
    if (!test) return;
    const outcome = runSecurityTest(test, integrityMonitor, latest);
    setOutcomes((prev) => [outcome, ...prev].slice(0, 30));
    logAudit({
      actor: "security-test-harness",
      category: "SECURITY",
      action: `TEST_${test.id.toUpperCase()}`,
      resource: test.control,
      result: outcome.action === "FLAGGED" ? "DETECTED" : "REJECTED",
      detail: `${test.label} — ${outcome.evidence}`,
      correlationId: outcome.correlationId,
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cybersecurity & Telemetry Integrity"
        description="Defence-in-depth layer sitting between the data source and the engineering pipeline. Findings describe data-integrity anomalies with evidence — the platform never asserts that an attack occurred."
        actions={
          <StatusPill tone={INTEGRITY_STATUS_TONE[integrity.status]}>
            {integrity.status.replace("_", " ")}
          </StatusPill>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Frame trust score"
          value={trust === null ? "NO DATA" : `${(trust * 100).toFixed(1)}%`}
          tone={trust === null ? "neutral" : trust > 0.95 ? "ok" : trust > 0.6 ? "warn" : "crit"}
          provenance="calculated"
          hint={`Rolling window of the last ${Math.min(120, integrity.framesChecked)} frames.`}
        />
        <Metric
          label="Frames checked"
          value={integrity.framesChecked.toLocaleString()}
          provenance="measured"
          hint={`${integrity.framesFlagged} raised at least one finding.`}
        />
        <Metric
          label="Replay protection"
          value={integrity.duplicateFrames}
          tone={integrity.duplicateFrames ? "crit" : "ok"}
          provenance="measured"
          hint="Duplicate sequence numbers rejected this session."
        />
        <Metric
          label="Sequence gaps"
          value={integrity.sequenceGaps}
          tone={integrity.sequenceGaps ? "warn" : "ok"}
          provenance="measured"
          hint="Missing frames between accepted sequence numbers."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel
          title="Integrity checks"
          subtitle={
            integrity.sourceId
              ? `Active source ${integrity.sourceId} · ${integrity.sourceType}`
              : "No telemetry source authenticated yet"
          }
        >
          <div className="divide-y divide-border">
            {integrity.checks.map((c) => (
              <div key={c.check} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
                <StatusPill tone={c.hits === 0 ? "ok" : "warn"} className="shrink-0">
                  {c.hits === 0 ? "PASSING" : `${c.hits} HIT${c.hits > 1 ? "S" : ""}`}
                </StatusPill>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent findings" subtitle="Newest first · evidence-backed, no attack attribution">
          {integrity.findings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No integrity findings on the frames processed so far.
            </p>
          ) : (
            <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {integrity.findings.map((f) => (
                <li key={f.id} className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    <StatusPill tone={f.severity === "CRITICAL" ? "crit" : f.severity === "WARNING" ? "warn" : "info"}>
                      {f.severity}
                    </StatusPill>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{f.evidence}</div>
                  <div className="mono-num mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    seq {f.seq} · {new Date(f.t).toISOString().slice(11, 19)}Z · {f.check} · {f.sourceType}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Security test mode"
        subtitle="Controlled, in-session tests against this deployment's own controls. No traffic leaves the browser and no external system is targeted."
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {SECURITY_TESTS.map((t) => (
            <div key={t.id} className="flex flex-col justify-between rounded-md border border-border bg-surface p-3">
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                <div className="label-xs mt-1.5">Control · {t.control}</div>
              </div>
              <button
                type="button"
                onClick={() => execute(t.id)}
                className="mt-3 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-sidebar-accent"
              >
                Run test
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Test results" subtitle="Every run is written to the audit log with a correlation ID">
        {outcomes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No security tests executed in this session.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-xs border-b border-border text-left">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Test</th>
                  <th className="py-2 pr-3">Control</th>
                  <th className="py-2 pr-3">Detection</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {outcomes.map((o) => (
                  <tr key={o.correlationId}>
                    <td className="mono-num py-2 pr-3 text-xs">{new Date(o.t).toISOString().slice(11, 19)}Z</td>
                    <td className="py-2 pr-3">{o.label}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{o.control}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={o.detected ? "ok" : "crit"}>{o.detected ? "DETECTED" : "MISSED"}</StatusPill>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill tone="warn">{o.action}</StatusPill>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{o.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Control posture" subtitle="Implementation status of the security architecture — stated honestly">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ["Transport encryption (HTTPS/TLS)", "IMPLEMENTED", "ok", "All platform traffic is served over TLS by the hosting layer."],
            ["CSRF protection on server functions", "IMPLEMENTED", "ok", "Enabled globally in the request middleware chain."],
            ["Schema validation of telemetry", "IMPLEMENTED", "ok", "Canonical TelemetryFrame Zod contract at the ingest boundary."],
            ["Replay / duplicate frame protection", "IMPLEMENTED", "ok", "Per-session sequence ledger, shown above."],
            ["Source authentication", "PARTIAL", "warn", "Source identifier is checked; cryptographic signing requires a gateway."],
            ["Message integrity (HMAC / checksum)", "NOT IMPLEMENTED", "neutral", "Requires a hardware gateway to sign frames at source."],
            ["Authentication & RBAC", "NOT IMPLEMENTED", "neutral", "No user accounts in this prototype; roles are modelled, not enforced."],
            ["Server-side audit persistence", "PARTIAL", "warn", "Audit ledger is in-session only until backend storage is enabled."],
            ["Rate limiting", "NOT IMPLEMENTED", "neutral", "Budget defined (50 req/s); enforcement lands with the ingest API."],
            ["Secrets management", "IMPLEMENTED", "ok", "No credentials in client code; server secrets read inside handlers only."],
          ].map(([name, status, tone, detail]) => (
            <div key={name as string} className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
              <div>
                <div className="text-sm font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
              <StatusPill tone={tone as "ok" | "warn" | "neutral"} className="shrink-0">
                {status}
              </StatusPill>
            </div>
          ))}
        </div>
      </Panel>

      <div className="max-w-3xl">
        <Bar value={trust ?? 0} tone={trust !== null && trust > 0.95 ? "ok" : "warn"} />
      </div>
      <PrototypeNotice>
        Integrity findings describe data anomalies only. The platform does not attribute causes such as
        intrusion or tampering, and it is not a certified security control for an airworthy system.
      </PrototypeNotice>
    </div>
  );
}
