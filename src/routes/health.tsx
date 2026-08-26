import { createFileRoute } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { BandChart, TrendChart } from "@/components/charts";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Health & PHM — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Engine Health Index, subsystem health decomposition, degradation trend and remaining-useful-life estimation for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Health & PHM — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Health index, degradation trend and prototype remaining-useful-life projection.",
      },
    ],
  }),
  component: HealthPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function HealthPage() {
  const { samples, latest } = useTelemetry();
  if (!latest) return <div className="panel p-8 text-sm text-muted-foreground">Computing health baseline…</div>;

  const window = samples.slice(-150);
  const hi = window.map((s) => ({
    x: clockOf(s.t),
    value: +s.healthIndex.toFixed(1),
    lo: +Math.max(0, s.healthIndex - s.healthBand / 2).toFixed(1),
    hi: +Math.min(100, s.healthIndex + s.healthBand / 2).toFixed(1),
  }));

  // Degradation slope via least squares over the window
  const n = window.length;
  const meanX = (n - 1) / 2;
  const meanY = window.reduce((a, s) => a + s.healthIndex, 0) / Math.max(1, n);
  let num = 0;
  let den = 0;
  window.forEach((s, i) => {
    num += (i - meanX) * (s.healthIndex - meanY);
    den += (i - meanX) ** 2;
  });
  const slope = den > 0 ? num / den : 0; // HI units per sample
  const perHour = slope * 3600;
  const rulHours = slope < -1e-6 ? (latest.healthIndex - 50) / (-slope * 3600) : Infinity;

  const subsystems = [
    { name: "Lubrication", ids: ["oilPress", "oilTemp"] as const },
    { name: "Thermal management", ids: ["engTemp"] as const },
    { name: "Rotating assembly", ids: ["vib", "rpm"] as const },
    { name: "Induction", ids: ["map"] as const },
    { name: "Instrumentation", ids: ["ambTemp", "ambPress"] as const },
  ].map((sub) => {
    const res =
      sub.ids.reduce((a, id) => a + Math.abs(latest.twin[id].normResidual), 0) / sub.ids.length;
    const q = sub.ids.reduce((a, id) => a + latest.readings[id].quality, 0) / sub.ids.length;
    const score = Math.max(0, 100 - res * 14 - (1 - q) * 25);
    return { ...sub, score, res };
  });

  const trendTone = perHour < -6 ? "crit" : perHour < -2 ? "warn" : "ok";

  return (
    <>
      <PageHeader
        title="Health & PHM"
        description="Prognostics and health management view: fused health index, subsystem decomposition, degradation slope and a prototype remaining-useful-life projection."
        actions={<StatusPill tone={trendTone}>{`TREND ${perHour.toFixed(1)} HI/h`}</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Engine Health Index"
          value={latest.healthIndex.toFixed(1)}
          unit="/ 100"
          tone={latest.healthIndex > 80 ? "ok" : latest.healthIndex > 60 ? "warn" : "crit"}
          provenance="calculated"
          hint={`Uncertainty ± ${(latest.healthBand / 2).toFixed(1)} at 1σ`}
        />
        <Metric
          label="Degradation rate"
          value={`${perHour >= 0 ? "+" : ""}${perHour.toFixed(2)}`}
          unit="HI/h"
          tone={trendTone}
          provenance="calculated"
          hint="Least-squares slope over the current window"
        />
        <Metric
          label="Projected RUL to HI 50"
          value={Number.isFinite(rulHours) ? rulHours.toFixed(1) : "—"}
          unit={Number.isFinite(rulHours) ? "h" : "stable"}
          tone={Number.isFinite(rulHours) && rulHours < 5 ? "crit" : "info"}
          provenance="model"
          hint="Linear extrapolation, wide uncertainty"
        />
        <Metric
          label="Evidence quality"
          value={(latest.dataQuality * 100).toFixed(0)}
          unit="%"
          tone={latest.dataQuality > 0.9 ? "ok" : "warn"}
          provenance="calculated"
          hint="Health outputs are suppressed below 40%"
        />
      </div>

      <Panel title="Health index with uncertainty band" subtitle="Rolling window">
        <BandChart data={hi} height={240} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Subsystem health decomposition" subtitle="Derived from twin residuals and sensor quality">
          <ul className="space-y-3">
            {subsystems.map((s) => (
              <li key={s.name}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="mono-num">{s.score.toFixed(1)}</span>
                </div>
                <Bar value={s.score / 100} tone={s.score > 80 ? "ok" : s.score > 60 ? "warn" : "crit"} />
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  mean |residual| {s.res.toFixed(2)} σ
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Health drivers" subtitle="Contribution to the current index penalty">
          <TrendChart
            data={window.map((s) => ({
              x: clockOf(s.t),
              residual: +(Math.min(8, s.anomalyScore * 6) * 5.5).toFixed(2),
              quality: +((1 - s.dataQuality) * 12).toFixed(2),
            }))}
            height={220}
            series={[
              { key: "residual", label: "Residual penalty", color: "var(--color-chart-4)" },
              { key: "quality", label: "Data-quality penalty", color: "var(--color-chart-3)" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Channel-level condition indicators" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">Value</th>
                <th className="px-4 py-2 font-semibold">|Residual|</th>
                <th className="px-4 py-2 font-semibold">Sensor confidence</th>
                <th className="px-4 py-2 font-semibold">Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SENSOR_SPECS.map((s) => {
                const nres = Math.abs(latest.twin[s.id].normResidual);
                return (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="px-4 py-2 font-medium">{s.label}</td>
                    <td className="mono-num px-4 py-2">
                      {latest.readings[s.id].value?.toFixed(s.precision) ?? "—"} {s.unit}
                    </td>
                    <td className="mono-num px-4 py-2">{nres.toFixed(2)} σ</td>
                    <td className="mono-num px-4 py-2">
                      {(latest.readings[s.id].confidence * 100).toFixed(0)}%
                    </td>
                    <td className="w-48 px-4 py-2">
                      <Bar value={Math.min(1, nres / 4)} tone={nres > 2 ? "crit" : nres > 1 ? "warn" : "ok"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <PrototypeNotice>
        The Health Index and RUL projection are prototype indicators derived from simulated data. They
        are not maintenance-credit values and must not be used for airworthiness decisions.
      </PrototypeNotice>
    </>
  );
}
