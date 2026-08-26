import { createFileRoute } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, ProvenanceTag, PrototypeNotice } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/twin")({
  head: () => ({
    meta: [
      { title: "Digital Twin — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Physics-informed digital twin state, actual-vs-expected residual analysis and twin confidence for the simulated aero piston engine.",
      },
      { property: "og:title", content: "Digital Twin — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Actual vs expected engine state with residual decomposition and twin confidence.",
      },
    ],
  }),
  component: TwinPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

const MODEL_BLOCKS = [
  {
    name: "Volumetric induction model",
    outputs: "Manifold pressure, air mass flow",
    basis: "Speed-density relation with ambient pressure correction",
  },
  {
    name: "Thermodynamic cylinder model",
    outputs: "Cylinder head temperature",
    basis: "Load-proportional heat release with convective rejection term",
  },
  {
    name: "Lubrication circuit model",
    outputs: "Oil pressure, oil temperature",
    basis: "Pump characteristic vs speed with viscosity-temperature coupling",
  },
  {
    name: "Rotordynamic model",
    outputs: "Vibration RMS",
    basis: "Speed-dependent baseline plus imbalance sensitivity term",
  },
];

function TwinPage() {
  const { samples, latest } = useTelemetry();
  if (!latest) return <div className="panel p-8 text-sm text-muted-foreground">Twin initialising…</div>;

  const window = samples.slice(-120);
  const residualSeries = window.map((s) => ({
    x: clockOf(s.t),
    rpm: +s.twin.rpm.normResidual.toFixed(3),
    engTemp: +s.twin.engTemp.normResidual.toFixed(3),
    oilPress: +s.twin.oilPress.normResidual.toFixed(3),
    vib: +s.twin.vib.normResidual.toFixed(3),
  }));

  const confSeries = window.map((s) => ({
    x: clockOf(s.t),
    twin: +(s.twinConfidence * 100).toFixed(1),
    quality: +(s.dataQuality * 100).toFixed(1),
  }));

  const worst = SENSOR_SPECS.map((s) => ({ s, n: Math.abs(latest.twin[s.id].normResidual) }))
    .sort((a, b) => b.n - a.n)[0]!;

  return (
    <>
      <PageHeader
        title="Digital Twin"
        description="A physics-informed model of the engine runs alongside the live stream. Residuals are the difference between measured behaviour and the twin's expected behaviour under the same operating conditions."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Twin confidence"
          value={(latest.twinConfidence * 100).toFixed(0)}
          unit="%"
          tone={latest.twinConfidence > 0.75 ? "ok" : "warn"}
          provenance="model"
          hint="Reduced by poor data quality and thermal transients"
        />
        <Metric
          label="Fused residual magnitude"
          value={(latest.anomalyScore * 6).toFixed(2)}
          unit="σ"
          tone={latest.anomalyScore > 0.35 ? "crit" : latest.anomalyScore > 0.18 ? "warn" : "ok"}
          provenance="calculated"
        />
        <Metric
          label="Dominant deviation"
          value={worst.s.label}
          tone={worst.n > 2 ? "crit" : worst.n > 1 ? "warn" : "ok"}
          provenance="calculated"
          hint={`${worst.n.toFixed(2)} σ normalised`}
        />
        <Metric
          label="Twin update rate"
          value="1.0"
          unit="Hz"
          provenance="model"
          hint="Synchronised to the slowest validated channel"
        />
      </div>

      <Panel title="Actual vs expected state" subtitle="Per-parameter twin comparison" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Parameter</th>
                <th className="px-4 py-2 font-semibold">Actual</th>
                <th className="px-4 py-2 font-semibold">Twin expected</th>
                <th className="px-4 py-2 font-semibold">Residual</th>
                <th className="px-4 py-2 font-semibold">Normalised</th>
                <th className="px-4 py-2 font-semibold">Deviation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SENSOR_SPECS.map((s) => {
                const tw = latest.twin[s.id];
                const r = latest.readings[s.id];
                const n = Math.abs(tw.normResidual);
                const tone = n > 2 ? "crit" : n > 1 ? "warn" : "ok";
                return (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="px-4 py-2 font-medium">
                      {s.label} <span className="text-xs text-muted-foreground">({s.unit})</span>
                    </td>
                    <td className="mono-num px-4 py-2">
                      {r.value === null ? "—" : r.value.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2 text-muted-foreground">
                      {tw.expected.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2">
                      {tw.residual >= 0 ? "+" : ""}
                      {tw.residual.toFixed(s.precision)}
                    </td>
                    <td className="mono-num px-4 py-2">{tw.normResidual.toFixed(2)} σ</td>
                    <td className="w-40 px-4 py-2">
                      <Bar value={Math.min(1, n / 4)} tone={tone} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Normalised residual trend" subtitle="σ units, zero = twin agreement">
          <TrendChart
            data={residualSeries}
            height={220}
            zeroLine
            series={[
              { key: "rpm", label: "Engine speed", color: "var(--color-chart-1)" },
              { key: "engTemp", label: "CHT", color: "var(--color-chart-4)" },
              { key: "oilPress", label: "Oil pressure", color: "var(--color-chart-2)" },
              { key: "vib", label: "Vibration", color: "var(--color-chart-3)" },
            ]}
          />
        </Panel>
        <Panel title="Twin confidence vs data quality" subtitle="Percent">
          <TrendChart
            data={confSeries}
            height={220}
            yDomain={[0, 100]}
            series={[
              { key: "twin", label: "Twin confidence", color: "var(--color-chart-1)" },
              { key: "quality", label: "Data quality", color: "var(--color-chart-2)" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Twin model composition" subtitle="Replaceable model blocks behind a fixed data contract">
        <div className="grid gap-3 md:grid-cols-2">
          {MODEL_BLOCKS.map((m) => (
            <div key={m.name} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{m.name}</span>
                <ProvenanceTag p="model" />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Outputs: {m.outputs}</div>
              <div className="text-xs text-muted-foreground">Basis: {m.basis}</div>
            </div>
          ))}
        </div>
      </Panel>

      <PrototypeNotice>
        The twin is a reduced-order engineering approximation tuned to simulated data. It has not been
        calibrated against a physical test rig; residual thresholds are provisional.
      </PrototypeNotice>
    </>
  );
}
