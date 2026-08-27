import { createFileRoute } from "@tanstack/react-router";

import { Bar, Metric, PageHeader, Panel, PrototypeNotice, StatusPill, type Tone } from "@/components/ui-kit";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_MAP } from "@/lib/config/registry";
import type { StageTrace } from "@/lib/pipeline/types";

export const Route = createFileRoute("/trace")({
  head: () => ({
    meta: [
      { title: "Trace Mode — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Per-frame pipeline trace: raw frame, data quality, sensor health, operating state, twin residuals, diagnosis, health and mission risk.",
      },
      { property: "og:title", content: "Trace Mode — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Follow a single telemetry frame through every processing stage of AERO-TWIN AI.",
      },
    ],
  }),
  component: TracePage,
});

const STAGE_TONE: Record<StageTrace["status"], Tone> = {
  OK: "ok",
  DEGRADED: "warn",
  SUPPRESSED: "crit",
  SKIPPED: "neutral",
};

function TracePage() {
  const { latest } = useTelemetry();

  if (!latest) {
    return (
      <div className="space-y-5">
        <PageHeader title="Trace Mode" description="Frame-level traceability of the processing chain." />
        <Panel title="No frame yet">
          <p className="text-sm text-muted-foreground">Waiting for the first telemetry frame.</p>
        </Panel>
      </div>
    );
  }

  const channels = Object.entries(latest.frame.channels);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trace Mode"
        description="Every displayed result is traceable back to the frame that produced it. This page follows the most recent frame through all pipeline stages."
        actions={
          <>
            <StatusPill tone="info">SEQ {latest.seq}</StatusPill>
            <StatusPill tone="neutral">{latest.sourceType}</StatusPill>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Frame latency" value={latest.totalLatencyMs.toFixed(2)} unit="ms" provenance="calculated" />
        <Metric
          label="Data quality"
          value={(latest.dataQuality * 100).toFixed(0)}
          unit="%"
          tone={latest.dataQuality < 0.85 ? "warn" : "ok"}
          provenance="calculated"
        />
        <Metric
          label="Twin confidence"
          value={(latest.twinConfidence * 100).toFixed(0)}
          unit="%"
          provenance="model"
        />
        <Metric
          label="Suppressed"
          value={latest.suppressed ? "YES" : "NO"}
          tone={latest.suppressed ? "crit" : "ok"}
          hint={latest.suppressionReason ?? "Evidence sufficient for reporting"}
          provenance="calculated"
        />
      </div>

      <Panel
        title="Stage trace"
        subtitle={`Configuration ${latest.configurationVersion} · twin ${latest.twinCalibrationVersion}`}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["#", "Stage", "Inputs", "Detail", "Latency", "Status"].map((h) => (
                  <th key={h} className="label-xs px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {latest.stages.map((s, i) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="mono-num px-4 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {s.inputs.length ? s.inputs.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.detail}</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.durationMs.toFixed(2)} ms</td>
                  <td className="px-4 py-2">
                    <StatusPill tone={STAGE_TONE[s.status]}>{s.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Raw frame channels" subtitle="As delivered by the adapter, before validation" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Channel", "Raw", "Status", "Quality", "Flags"].map((h) => (
                    <th key={h} className="label-xs px-4 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channels.map(([id, ch]) => (
                  <tr key={id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      {SENSOR_MAP[id as keyof typeof SENSOR_MAP]?.label ?? id}
                    </td>
                    <td className="mono-num px-4 py-2">
                      {ch.raw === null ? "—" : ch.raw.toFixed(2)} {ch.unit}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{ch.status}</td>
                    <td className="mono-num px-4 py-2 text-xs">{(ch.quality * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {ch.flags.length ? ch.flags.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Residual comparison" subtitle="Actual vs twin expectation for this frame" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Channel", "Actual", "Expected", "Residual", "Normalised"].map((h) => (
                    <th key={h} className="label-xs px-4 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(latest.twin).map(([id, tp]) => {
                  const r = latest.readings[id as keyof typeof latest.readings];
                  return (
                    <tr key={id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        {SENSOR_MAP[id as keyof typeof SENSOR_MAP]?.label ?? id}
                      </td>
                      <td className="mono-num px-4 py-2">{r?.value === null || r === undefined ? "—" : r.value.toFixed(2)}</td>
                      <td className="mono-num px-4 py-2">{tp.comparable ? tp.expected.toFixed(2) : "—"}</td>
                      <td className="mono-num px-4 py-2">{tp.comparable ? tp.residual.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2">
                        {tp.comparable ? (
                          <div className="flex items-center gap-2">
                            <Bar
                              value={Math.min(1, Math.abs(tp.normResidual) / 3)}
                              tone={Math.abs(tp.normResidual) > 2 ? "crit" : Math.abs(tp.normResidual) > 1 ? "warn" : "ok"}
                            />
                            <span className="mono-num text-xs">{tp.normResidual.toFixed(2)}σ</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">not comparable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Evidence used for the decision" subtitle="Weighted contributions with provenance">
        {latest.evidence.length ? (
          <ul className="space-y-2">
            {latest.evidence.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-foreground">{e.label}</span>
                <div className="flex w-1/2 items-center gap-3">
                  <Bar value={e.weight} tone="info" />
                  <span className="mono-num w-12 text-right text-xs">{(e.weight * 100).toFixed(0)}%</span>
                  <span className="label-xs w-24 text-right">{e.provenance.toUpperCase()}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No evidence exceeded the reporting threshold for this frame.</p>
        )}
      </Panel>

      <PrototypeNotice />
    </div>
  );
}
