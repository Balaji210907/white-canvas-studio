import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader, Panel, PrototypeNotice, StatusPill, type Tone } from "@/components/ui-kit";
import { useTelemetry } from "@/lib/sim/store";

export const Route = createFileRoute("/traceability")({
  head: () => ({
    meta: [
      { title: "Requirement Traceability — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Problem-statement requirement matrix, implementation status, evidence links and measured performance targets versus actual results for AERO-TWIN AI.",
      },
      { property: "og:title", content: "Requirement Traceability — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Requirement-to-feature matrix with implementation status and measured performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraceabilityPage,
});

type ImplStatus = "IMPLEMENTED" | "PARTIAL" | "NOT IMPLEMENTED" | "NOT VALIDATABLE";

const STATUS_TONE: Record<ImplStatus, Tone> = {
  IMPLEMENTED: "ok",
  PARTIAL: "warn",
  "NOT IMPLEMENTED": "neutral",
  "NOT VALIDATABLE": "info",
};

interface Requirement {
  requirement: string;
  feature: string;
  status: ImplStatus;
  evidence: string;
  validation: string;
}

const MATRIX: Requirement[] = [
  { requirement: "Real-time engine monitoring", feature: "Live Telemetry + Command Center", status: "IMPLEMENTED", evidence: "/telemetry, /", validation: "Verified against simulated and replayed sources" },
  { requirement: "Health indicators", feature: "Health & PHM, component health roll-up", status: "IMPLEMENTED", evidence: "/health, /twin", validation: "Synthetic fault injection only" },
  { requirement: "Anomaly detection", feature: "Residual-based anomaly scoring in the pipeline", status: "PARTIAL", evidence: "/residuals, /diagnosis", validation: "Statistical method; no trained ML model deployed" },
  { requirement: "Failure prediction", feature: "Fault hypothesis ranking with evidence", status: "PARTIAL", evidence: "/diagnosis", validation: "Validated on synthetic scenarios only" },
  { requirement: "Degradation tracking", feature: "Health-index slope estimator", status: "IMPLEMENTED", evidence: "/health", validation: "Requires sufficient window length" },
  { requirement: "Remaining useful life", feature: "RUL estimator gate", status: "NOT VALIDATABLE", evidence: "/health, /maintenance", validation: "Reports NOT AVAILABLE — no run-to-failure data exists" },
  { requirement: "Mission replay", feature: "Dataset ingest + replay runner through the same pipeline", status: "IMPLEMENTED", evidence: "/import", validation: "Play / pause / seek / speed verified" },
  { requirement: "Environmental simulation (altitude, hot weather)", feature: "Simulation Lab scenarios", status: "PARTIAL", evidence: "/simulation", validation: "Scenario coverage incomplete" },
  { requirement: "Rapid throttle transient handling", feature: "Operating-state classifier + transient suppression", status: "IMPLEMENTED", evidence: "/trace", validation: "Observed in stage trace" },
  { requirement: "Sensor fusion", feature: "Multi-channel weighted fusion with quality weighting", status: "IMPLEMENTED", evidence: "/system", validation: "Quality-weighted; degrades safely" },
  { requirement: "CAN bus integration", feature: "CAN adapter interface", status: "NOT IMPLEMENTED", evidence: "/sources", validation: "Interface declared, reports NOT CONNECTED" },
  { requirement: "ECU / FADEC gateway", feature: "ECU adapter interface", status: "NOT IMPLEMENTED", evidence: "/sources", validation: "Interface declared, reports NOT CONNECTED" },
  { requirement: "Edge architecture", feature: "Adapter → validation → pipeline separation", status: "PARTIAL", evidence: "/sources, /trace", validation: "Architecturally separated; no edge deployment" },
  { requirement: "AI / ML", feature: "Statistical anomaly + fault-signature matching", status: "PARTIAL", evidence: "/models", validation: "No trained model registered; metrics show NOT VALIDATED" },
  { requirement: "Digital twin", feature: "Physics-informed twin with submodels and residuals", status: "IMPLEMENTED", evidence: "/twin, /residuals", validation: "Calibrated against the simulator only" },
  { requirement: "3D visualisation", feature: "Component-level 3D twin driven by twin state", status: "IMPLEMENTED", evidence: "/twin", validation: "Representative geometry, not vendor CAD" },
  { requirement: "Maintenance advisory", feature: "Evidence-backed inspection advisories", status: "IMPLEMENTED", evidence: "/maintenance", validation: "Advisory only, acknowledged events audited" },
  { requirement: "Mission health reports", feature: "Implementation & session report generator", status: "IMPLEMENTED", evidence: "/report", validation: "Generated from live session data" },
  { requirement: "Secure telemetry", feature: "Integrity layer: replay protection, ordering, plausibility", status: "PARTIAL", evidence: "/cybersecurity", validation: "No cryptographic signing without a gateway" },
  { requirement: "Audit trail", feature: "Session audit ledger with correlation IDs", status: "PARTIAL", evidence: "/audit", validation: "In-session storage only" },
  { requirement: "Authentication & RBAC", feature: "Role model defined", status: "NOT IMPLEMENTED", evidence: "/cybersecurity", validation: "No accounts in the prototype" },
];

function pct(n: number, d: number) {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`;
}

function TraceabilityPage() {
  const { samples, twinState, integrity } = useTelemetry();

  const perf = useMemo(() => {
    const lat = samples.map((s) => s.totalLatencyMs).filter((v) => Number.isFinite(v));
    const sorted = [...lat].sort((a, b) => a - b);
    const mean = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : null;
    const gaps: number[] = [];
    for (let i = 1; i < samples.length; i++) gaps.push(samples[i]!.t - samples[i - 1]!.t);
    const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    const dropped = twinState.sync.droppedFrames;
    const total = twinState.sync.framesProcessed;
    return { mean, p95, meanGap, dropped, total, ingest: twinState.sync.ingestLatencyMs };
  }, [samples, twinState]);

  const targets: { metric: string; target: string; actual: string; ok: boolean | null; note: string }[] = [
    {
      metric: "Pipeline processing latency (mean)",
      target: "≤ 50 ms",
      actual: perf.mean === null ? "NOT MEASURED" : `${perf.mean.toFixed(2)} ms`,
      ok: perf.mean === null ? null : perf.mean <= 50,
      note: "Measured end-to-end inside the engineering pipeline for each frame.",
    },
    {
      metric: "Pipeline processing latency (p95)",
      target: "≤ 100 ms",
      actual: perf.p95 === null ? "NOT MEASURED" : `${perf.p95.toFixed(2)} ms`,
      ok: perf.p95 === null ? null : perf.p95 <= 100,
      note: "95th percentile over the retained sample window.",
    },
    {
      metric: "Twin synchronisation latency",
      target: "≤ 250 ms",
      actual:
        twinState.sync.processingLatencyMs === null ? "NOT MEASURED" : `${twinState.sync.processingLatencyMs.toFixed(2)} ms`,
      ok: twinState.sync.processingLatencyMs === null ? null : twinState.sync.processingLatencyMs <= 250,
      note: "Source timestamp to twin-state commit.",
    },
    {
      metric: "Ingest latency",
      target: "≤ 100 ms",
      actual: perf.ingest === null ? "NOT MEASURED" : `${perf.ingest.toFixed(2)} ms`,
      ok: perf.ingest === null ? null : perf.ingest <= 100,
      note: "Reported by the active adapter.",
    },
    {
      metric: "Frame loss",
      target: "< 1%",
      actual: perf.total === 0 ? "NOT MEASURED" : pct(perf.dropped, perf.total + perf.dropped),
      ok: perf.total === 0 ? null : perf.dropped / Math.max(1, perf.total + perf.dropped) < 0.01,
      note: "Derived from sequence-number continuity.",
    },
    {
      metric: "Telemetry integrity trust",
      target: "≥ 99%",
      actual: integrity.trustScore === null ? "NOT MEASURED" : `${(integrity.trustScore * 100).toFixed(1)}%`,
      ok: integrity.trustScore === null ? null : integrity.trustScore >= 0.99,
      note: "Fraction of recent frames passing every integrity check.",
    },
    {
      metric: "Anomaly detection latency",
      target: "≤ 3 frames",
      actual: "NOT MEASURED",
      ok: null,
      note: "Requires labelled fault-onset ground truth from the Validation Lab.",
    },
    {
      metric: "False alarm rate",
      target: "≤ 5%",
      actual: "NOT MEASURED",
      ok: null,
      note: "Requires a completed labelled validation campaign.",
    },
    {
      metric: "Missed detection rate",
      target: "≤ 5%",
      actual: "NOT MEASURED",
      ok: null,
      note: "Requires a completed labelled validation campaign.",
    },
    {
      metric: "RUL error (MAE)",
      target: "≤ 10% of true life",
      actual: "NOT APPLICABLE",
      ok: null,
      note: "No validated RUL model exists; RUL output is gated off.",
    },
  ];

  const counts = MATRIX.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Requirement Traceability & Performance"
        description="Maps each problem-statement requirement to the feature that implements it, its evidence in the application, and its validation state. Performance targets are stated separately from measured results — a target is never reported as achieved without a measurement."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_TONE) as ImplStatus[]).map((s) => (
              <StatusPill key={s} tone={STATUS_TONE[s]}>
                {s} {counts[s] ?? 0}
              </StatusPill>
            ))}
          </div>
        }
      />

      <Panel title="Requirement matrix" subtitle={`${MATRIX.length} mapped requirements`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-xs border-b border-border text-left">
                <th className="py-2 pr-3">Requirement</th>
                <th className="py-2 pr-3">Feature</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Evidence</th>
                <th className="py-2">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MATRIX.map((r) => (
                <tr key={r.requirement}>
                  <td className="py-2 pr-3 font-medium">{r.requirement}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{r.feature}</td>
                  <td className="py-2 pr-3">
                    <StatusPill tone={STATUS_TONE[r.status]}>{r.status}</StatusPill>
                  </td>
                  <td className="mono-num py-2 pr-3 text-xs">{r.evidence}</td>
                  <td className="py-2 text-xs text-muted-foreground">{r.validation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Performance targets vs measured" subtitle="Actuals are measured live in this session; unmeasured metrics say so">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-xs border-b border-border text-left">
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Actual</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {targets.map((t) => (
                <tr key={t.metric}>
                  <td className="py-2 pr-3 font-medium">{t.metric}</td>
                  <td className="mono-num py-2 pr-3 text-xs">{t.target}</td>
                  <td className="mono-num py-2 pr-3 text-xs">{t.actual}</td>
                  <td className="py-2 pr-3">
                    <StatusPill tone={t.ok === null ? "neutral" : t.ok ? "ok" : "warn"}>
                      {t.ok === null ? "UNMEASURED" : t.ok ? "MEETS TARGET" : "OUTSIDE TARGET"}
                    </StatusPill>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PrototypeNotice>
        Nothing in this matrix constitutes certification evidence. Requirements marked IMPLEMENTED are implemented
        against simulated or replayed data unless a real-engine dataset has been imported.
      </PrototypeNotice>
    </div>
  );
}
