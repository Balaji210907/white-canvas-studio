import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS, faultLabel, labelState } from "@/lib/sim/engine";
import { Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Historical Analysis — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Recorded run history, alert log, statistical summaries and exportable frames from the AERO-TWIN AI prototype time-series store.",
      },
      { property: "og:title", content: "Historical Analysis — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Run history, alert log and statistical summaries of recorded engine telemetry.",
      },
    ],
  }),
  component: HistoryPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(11, 19);

function HistoryPage() {
  const { samples, alerts, clearAlerts } = useTelemetry();
  const [severity, setSeverity] = useState<"ALL" | "INFO" | "WARNING" | "CRITICAL">("ALL");

  const stats = useMemo(
    () =>
      SENSOR_SPECS.map((s) => {
        const vals = samples.map((x) => x.readings[s.id].value).filter((v): v is number => v !== null);
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const sd = vals.length
          ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
          : 0;
        return {
          s,
          n: vals.length,
          min: vals.length ? Math.min(...vals) : 0,
          max: vals.length ? Math.max(...vals) : 0,
          mean,
          sd,
          missing: samples.length - vals.length,
        };
      }),
    [samples],
  );

  const filtered = alerts.filter((a) => severity === "ALL" || a.severity === severity);

  const overview = samples.map((s) => ({
    x: clockOf(s.t),
    health: +s.healthIndex.toFixed(1),
    anomaly: +(s.anomalyScore * 100).toFixed(1),
    quality: +(s.dataQuality * 100).toFixed(1),
  }));

  const stateOccupancy = samples.reduce<Record<string, number>>((acc, s) => {
    acc[s.state] = (acc[s.state] ?? 0) + 1;
    return acc;
  }, {});

  const exportCsv = () => {
    const header = ["timestamp", "state", "health_index", "anomaly", "data_quality", ...SENSOR_SPECS.map((s) => s.id)];
    const rows = samples.map((s) =>
      [
        new Date(s.t).toISOString(),
        s.state,
        s.healthIndex.toFixed(2),
        s.anomalyScore.toFixed(4),
        s.dataQuality.toFixed(4),
        ...SENSOR_SPECS.map((sp) => (s.readings[sp.id].value ?? "").toString()),
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aerotwin-run-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Historical Analysis"
        description="Recorded frames from the current run, with statistical summaries, state occupancy and the full alert log. Frames follow the same schema used by the time-series store."
        actions={
          <button
            onClick={exportCsv}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Export CSV
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Frames recorded" value={samples.length} provenance="measured" hint="Rolling buffer, 240 frames" />
        <Metric label="Alerts logged" value={alerts.length} provenance="calculated" />
        <Metric
          label="Mean health index"
          value={(samples.reduce((a, s) => a + s.healthIndex, 0) / Math.max(1, samples.length)).toFixed(1)}
          provenance="calculated"
        />
        <Metric
          label="Frames with data flags"
          value={samples.filter((s) => SENSOR_SPECS.some((sp) => s.readings[sp.id].flags.length)).length}
          provenance="calculated"
        />
      </div>

      <Panel title="Run overview" subtitle="Health, anomaly and data quality across the recorded window">
        <TrendChart
          data={overview}
          height={240}
          yDomain={[0, 100]}
          series={[
            { key: "health", label: "Health index", color: "var(--color-chart-2)" },
            { key: "anomaly", label: "Anomaly %", color: "var(--color-chart-4)" },
            { key: "quality", label: "Data quality %", color: "var(--color-chart-1)" },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Operating state occupancy" subtitle="Frames per state">
          <ul className="space-y-2">
            {Object.entries(stateOccupancy)
              .sort((a, b) => b[1] - a[1])
              .map(([st, count]) => (
                <li key={st} className="flex items-center justify-between text-xs">
                  <span>{labelState(st as never)}</span>
                  <span className="mono-num text-muted-foreground">
                    {count} ({((count / samples.length) * 100).toFixed(0)}%)
                  </span>
                </li>
              ))}
            {!samples.length && <li className="text-xs text-muted-foreground">No frames recorded.</li>}
          </ul>
        </Panel>

        <Panel
          title="Alert log"
          subtitle={`${filtered.length} entries`}
          className="xl:col-span-2"
          actions={
            <div className="flex items-center gap-1">
              {(["ALL", "INFO", "WARNING", "CRITICAL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    severity === s ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {s}
                </button>
              ))}
              <button onClick={clearAlerts} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface">
                Clear
              </button>
            </div>
          }
          bodyClassName="p-0"
        >
          <ul className="max-h-[320px] divide-y divide-border overflow-y-auto">
            {filtered.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                <StatusPill tone={a.severity === "CRITICAL" ? "crit" : a.severity === "WARNING" ? "warn" : "info"}>
                  {a.severity}
                </StatusPill>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">{a.detail}</div>
                </div>
                <span className="mono-num text-[10px] text-muted-foreground">{clockOf(a.t)}</span>
              </li>
            ))}
            {!filtered.length && <li className="px-4 py-8 text-center text-xs text-muted-foreground">No entries.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Channel statistics" subtitle="Computed over the recorded buffer" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">n</th>
                <th className="px-4 py-2 font-semibold">Min</th>
                <th className="px-4 py-2 font-semibold">Mean</th>
                <th className="px-4 py-2 font-semibold">Max</th>
                <th className="px-4 py-2 font-semibold">σ</th>
                <th className="px-4 py-2 font-semibold">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.map((r) => (
                <tr key={r.s.id} className="hover:bg-surface">
                  <td className="px-4 py-2 font-medium">
                    {r.s.label} <span className="text-xs text-muted-foreground">({r.s.unit})</span>
                  </td>
                  <td className="mono-num px-4 py-2">{r.n}</td>
                  <td className="mono-num px-4 py-2">{r.min.toFixed(r.s.precision)}</td>
                  <td className="mono-num px-4 py-2">{r.mean.toFixed(r.s.precision)}</td>
                  <td className="mono-num px-4 py-2">{r.max.toFixed(r.s.precision)}</td>
                  <td className="mono-num px-4 py-2">{r.sd.toFixed(2)}</td>
                  <td className={`mono-num px-4 py-2 ${r.missing ? "text-warn" : ""}`}>{r.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recent frames" subtitle="Last 15 records as stored" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Timestamp</th>
                <th className="px-4 py-2 font-semibold">Seq</th>
                <th className="px-4 py-2 font-semibold">State</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">HI</th>
                <th className="px-4 py-2 font-semibold">Anomaly</th>
                <th className="px-4 py-2 font-semibold">Leading fault</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...samples].slice(-15).reverse().map((s) => (
                <tr key={s.seq} className="hover:bg-surface">
                  <td className="mono-num px-4 py-2 text-xs">{clockOf(s.t)}</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.seq}</td>
                  <td className="px-4 py-2 text-xs">{labelState(s.state)}</td>
                  <td className="px-4 py-2 text-xs">{s.status.replace("_", " ")}</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.healthIndex.toFixed(1)}</td>
                  <td className="mono-num px-4 py-2 text-xs">{(s.anomalyScore * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-xs">{faultLabel(s.faultProbs[0]!.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PrototypeNotice />
    </>
  );
}
