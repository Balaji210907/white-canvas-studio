import { createFileRoute } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "System Health — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Platform self-monitoring: acquisition link state, pipeline stage status, per-sensor bus health and data-quality diagnostics.",
      },
      { property: "og:title", content: "System Health — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Acquisition link, pipeline stage status and per-sensor bus diagnostics.",
      },
    ],
  }),
  component: SystemPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function SystemPage() {
  const { samples, latest, running, rate } = useTelemetry();
  if (!latest) return <div className="panel p-8 text-sm text-muted-foreground">No link to the telemetry service.</div>;

  const window = samples.slice(-120);
  const flagged = SENSOR_SPECS.filter((s) => latest.readings[s.id].flags.length).length;

  const stages = [
    { name: "Data acquisition", ok: running, detail: `${(1000 / rate).toFixed(1)} frames/s from simulated bus` },
    { name: "Data validation", ok: true, detail: `${flagged} channel(s) currently flagged` },
    { name: "Sensor health monitor", ok: latest.sensorSuspicion[0]!.p < 0.55, detail: "Isolation scoring active" },
    { name: "Signal processing", ok: true, detail: "Rolling statistics and rate estimation" },
    { name: "Operating state estimator", ok: true, detail: `State: ${latest.state.replace("_", " ")}` },
    { name: "Digital twin", ok: latest.twinConfidence > 0.5, detail: `Confidence ${(latest.twinConfidence * 100).toFixed(0)}%` },
    { name: "Anomaly & diagnosis", ok: latest.anomalyConfidence > 0.3, detail: `Confidence ${(latest.anomalyConfidence * 100).toFixed(0)}%` },
    { name: "Fusion & decision support", ok: latest.status !== "INSUFFICIENT_DATA", detail: latest.status.replace("_", " ") },
    { name: "Time-series store", ok: true, detail: `${samples.length} frames buffered` },
  ];

  const qualitySeries = window.map((s) => ({
    x: clockOf(s.t),
    quality: +(s.dataQuality * 100).toFixed(1),
    twin: +(s.twinConfidence * 100).toFixed(1),
  }));

  return (
    <>
      <PageHeader
        title="System Health"
        description="Self-monitoring for the platform itself: link state, pipeline stage status, per-bus sensor health and data-quality diagnostics."
        actions={<StatusPill tone={running ? "ok" : "warn"}>{running ? "LINK UP" : "LINK PAUSED"}</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ingest rate" value={(1000 / rate).toFixed(1)} unit="fps" provenance="measured" tone={running ? "ok" : "warn"} />
        <Metric label="Pipeline stages healthy" value={`${stages.filter((s) => s.ok).length}/${stages.length}`} provenance="calculated" tone={stages.every((s) => s.ok) ? "ok" : "warn"} />
        <Metric label="Data quality" value={(latest.dataQuality * 100).toFixed(0)} unit="%" provenance="calculated" tone={latest.dataQuality > 0.9 ? "ok" : "warn"} />
        <Metric label="Channels flagged" value={flagged} provenance="calculated" tone={flagged ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Pipeline stage status" subtitle="End-to-end processing chain" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {stages.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="mono-num w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{s.detail}</div>
                  </div>
                </div>
                <StatusPill tone={s.ok ? "ok" : "warn"}>{s.ok ? "OK" : "DEGRADED"}</StatusPill>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Data quality & twin confidence" subtitle="Percent over the rolling window">
          <TrendChart
            data={qualitySeries}
            height={230}
            yDomain={[0, 100]}
            series={[
              { key: "quality", label: "Data quality", color: "var(--color-chart-1)" },
              { key: "twin", label: "Twin confidence", color: "var(--color-chart-2)" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Bus & sensor diagnostics" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">Bus</th>
                <th className="px-4 py-2 font-semibold">Rate</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Quality</th>
                <th className="px-4 py-2 font-semibold">Active flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SENSOR_SPECS.map((s) => {
                const r = latest.readings[s.id];
                const tone = r.status === "HEALTHY" ? "ok" : r.status === "DEGRADED" ? "warn" : "crit";
                return (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="px-4 py-2 font-medium">{s.label}</td>
                    <td className="mono-num px-4 py-2 text-xs">{s.bus}</td>
                    <td className="mono-num px-4 py-2 text-xs">{s.sampleHz} Hz</td>
                    <td className="px-4 py-2">
                      <StatusPill tone={tone}>{r.status}</StatusPill>
                    </td>
                    <td className="w-40 px-4 py-2">
                      <Bar value={r.quality} tone={tone} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.flags.length ? r.flags.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Validation rule coverage" subtitle="Checks applied to every incoming frame">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Null / missing detection",
            "Range validation",
            "Outlier detection",
            "Stuck-sensor detection",
            "Rate-of-change validation",
            "Timestamp validation",
            "Duplicate packet detection",
            "Communication timeout",
            "Data-quality scoring",
          ].map((r) => (
            <div key={r} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
              <span className="size-1.5 rounded-full bg-ok" />
              {r}
            </div>
          ))}
        </div>
      </Panel>

      <PrototypeNotice />
    </>
  );
}
