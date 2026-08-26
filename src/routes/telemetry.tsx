import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS, type SensorId } from "@/lib/sim/engine";
import { Bar, Panel, PageHeader, ProvenanceTag, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/telemetry")({
  head: () => ({
    meta: [
      { title: "Live Telemetry — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Real-time engine parameter stream with rolling plots, rate-of-change, data quality flags and per-sensor health for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Live Telemetry — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Rolling engine parameter plots with data validation and sensor health indication.",
      },
    ],
  }),
  component: TelemetryPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function TelemetryPage() {
  const { samples, latest } = useTelemetry();
  const [selected, setSelected] = useState<SensorId>("rpm");

  if (!latest) {
    return <div className="panel p-8 text-sm text-muted-foreground">Waiting for first packet…</div>;
  }

  const window = samples.slice(-120);
  const spec = SENSOR_SPECS.find((s) => s.id === selected)!;
  const chartData = window.map((s) => ({
    x: clockOf(s.t),
    measured: s.readings[selected].value ?? null,
    expected: +s.twin[selected].expected.toFixed(3),
  })) as unknown as Record<string, number | string>[];

  const values = window
    .map((s) => s.readings[selected].value)
    .filter((v): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const prev = samples[samples.length - 2];
  const rate =
    prev && latest.readings[selected].value !== null && prev.readings[selected].value !== null
      ? latest.readings[selected].value! - prev.readings[selected].value!
      : 0;

  return (
    <>
      <PageHeader
        title="Live Telemetry"
        description="Validated engine parameter stream. Every value passes null, range, rate-of-change, stuck-value and timestamp checks before it reaches the analytics layer."
        actions={<StatusPill tone="info" dot={false}>{samples.length} packets buffered</StatusPill>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SENSOR_SPECS.map((s) => {
          const r = latest.readings[s.id];
          const tone = r.status === "HEALTHY" ? "ok" : r.status === "DEGRADED" ? "warn" : "crit";
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`panel px-4 py-3 text-left transition-colors hover:bg-accent ${
                selected === s.id ? "ring-2 ring-ring" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="label-xs truncate">{s.label}</span>
                <StatusPill tone={tone}>{r.status}</StatusPill>
              </div>
              <div className="mono-num mt-2 flex items-baseline gap-1 text-2xl font-semibold">
                {r.value === null ? (
                  <span className="text-crit text-lg">NO DATA</span>
                ) : (
                  r.value.toFixed(s.precision)
                )}
                <span className="text-sm text-muted-foreground">{s.unit}</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Data quality</span>
                  <span className="mono-num">{(r.quality * 100).toFixed(0)}%</span>
                </div>
                <Bar value={r.quality} tone={tone} />
              </div>
              {r.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.flags.map((f) => (
                    <span key={f} className="rounded-sm bg-warn-soft px-1.5 py-px text-[10px] font-semibold text-warn">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Panel
        title={`${spec.label} — rolling plot`}
        subtitle={`Measured stream vs digital-twin expectation · ${spec.sampleHz} Hz acquisition on ${spec.bus}`}
        actions={<ProvenanceTag p="measured" />}
      >
        <TrendChart
          data={chartData}
          height={260}
          series={[
            { key: "measured", label: `Measured (${spec.unit})`, color: "var(--color-chart-1)" },
            { key: "expected", label: "Twin expected", color: "var(--color-chart-2)", dashed: true },
          ]}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { l: "Current", v: latest.readings[selected].value?.toFixed(spec.precision) ?? "—" },
            { l: "Window min", v: min.toFixed(spec.precision) },
            { l: "Window max", v: max.toFixed(spec.precision) },
            { l: "Rate of change", v: `${rate >= 0 ? "+" : ""}${rate.toFixed(spec.precision)} /s` },
            { l: "Valid range", v: `${spec.min} … ${spec.max}` },
          ].map((x) => (
            <div key={x.l} className="rounded-md border border-border bg-surface px-3 py-2">
              <div className="label-xs">{x.l}</div>
              <div className="mono-num text-sm font-semibold">{x.v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Packet inspector" subtitle="Latest validated frame" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Parameter</th>
                <th className="px-4 py-2 font-semibold">Raw</th>
                <th className="px-4 py-2 font-semibold">Validated</th>
                <th className="px-4 py-2 font-semibold">Twin expected</th>
                <th className="px-4 py-2 font-semibold">Residual</th>
                <th className="px-4 py-2 font-semibold">Quality</th>
                <th className="px-4 py-2 font-semibold">Sensor conf.</th>
                <th className="px-4 py-2 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SENSOR_SPECS.map((s) => {
                const r = latest.readings[s.id];
                const tw = latest.twin[s.id];
                return (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="px-4 py-2 font-medium">{s.label}</td>
                    <td className="mono-num px-4 py-2 text-muted-foreground">
                      {r.raw === null ? "null" : r.raw.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2">
                      {r.value === null ? "—" : r.value.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2 text-muted-foreground">
                      {tw.expected.toFixed(s.precision)}
                    </td>
                    <td
                      className={`mono-num px-4 py-2 ${
                        Math.abs(tw.normResidual) > 2 ? "text-crit" : Math.abs(tw.normResidual) > 1 ? "text-warn" : ""
                      }`}
                    >
                      {tw.residual >= 0 ? "+" : ""}
                      {tw.residual.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2">{(r.quality * 100).toFixed(0)}%</td>
                    <td className="mono-num px-4 py-2">{(r.confidence * 100).toFixed(0)}%</td>
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

      <Panel title="Extensibility" subtitle="Parameters the acquisition contract already accommodates">
        <div className="flex flex-wrap gap-2">
          {[
            "Fuel flow",
            "Fuel pressure",
            "Per-cylinder head temperature",
            "Exhaust gas temperature",
            "Throttle / load command",
            "Altitude",
            "GPS / mission parameters",
          ].map((p) => (
            <span key={p} className="rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
              {p} · not wired
            </span>
          ))}
        </div>
      </Panel>

      <PrototypeNotice />
    </>
  );
}
