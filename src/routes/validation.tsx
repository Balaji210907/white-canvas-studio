import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/validation")({
  head: () => ({
    meta: [
      { title: "Validation Center — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Twin accuracy metrics, detection performance against injected ground truth and open validation gaps for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Validation Center — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Twin accuracy, detection performance and declared validation limitations.",
      },
    ],
  }),
  component: ValidationPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function ValidationPage() {
  const { samples, injection } = useTelemetry();

  const metrics = useMemo(
    () =>
      SENSOR_SPECS.map((s) => {
        const rows = samples.filter((x) => x.readings[s.id].value !== null);
        const n = rows.length || 1;
        const errs = rows.map((x) => x.readings[s.id].truth - x.twin[s.id].expected);
        const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / n;
        const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / n);
        const meanTruth = rows.reduce((a, x) => a + x.readings[s.id].truth, 0) / n;
        const mape = meanTruth !== 0 ? (mae / Math.abs(meanTruth)) * 100 : 0;
        const bias = errs.reduce((a, e) => a + e, 0) / n;
        return { s, mae, rmse, mape, bias, n: rows.length };
      }),
    [samples],
  );

  const engineFaultActive = injection.engineFault !== "none" && injection.engineSeverity > 0.15;
  const detection = useMemo(() => {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    for (const s of samples) {
      const flagged = s.anomalyScore > 0.2;
      if (engineFaultActive) flagged ? tp++ : fn++;
      else flagged ? fp++ : tn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : NaN;
    const recall = tp + fn ? tp / (tp + fn) : NaN;
    const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : NaN;
    const accuracy = samples.length ? (tp + tn) / samples.length : NaN;
    return { tp, fp, tn, fn, precision, recall, f1, accuracy };
  }, [samples, engineFaultActive]);

  const errSeries = samples.slice(-120).map((s) => ({
    x: clockOf(s.t),
    cht: +(s.readings.engTemp.truth - s.twin.engTemp.expected).toFixed(2),
    oil: +(s.readings.oilPress.truth - s.twin.oilPress.expected).toFixed(3),
    rpm: +((s.readings.rpm.truth - s.twin.rpm.expected) / 100).toFixed(2),
  }));

  const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "n/a");

  return (
    <>
      <PageHeader
        title="Validation Center"
        description="Twin accuracy and detector performance measured against the simulator's ground truth. These figures characterise the prototype only; no physical-engine validation data exists yet."
        actions={<StatusPill tone="info">SIMULATED GROUND TRUTH</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Detection accuracy" value={pct(detection.accuracy)} provenance="calculated" hint={`over ${samples.length} frames`} />
        <Metric label="Precision" value={pct(detection.precision)} provenance="calculated" tone={detection.precision > 0.8 ? "ok" : "warn"} />
        <Metric label="Recall" value={pct(detection.recall)} provenance="calculated" tone={detection.recall > 0.8 ? "ok" : "warn"} />
        <Metric label="F1 score" value={Number.isFinite(detection.f1) ? detection.f1.toFixed(3) : "n/a"} provenance="calculated" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Confusion matrix" subtitle={`Ground truth: ${engineFaultActive ? "fault injected" : "nominal"}`}>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[
              { l: "True positive", v: detection.tp, t: "text-ok" },
              { l: "False positive", v: detection.fp, t: "text-warn" },
              { l: "False negative", v: detection.fn, t: "text-crit" },
              { l: "True negative", v: detection.tn, t: "text-ok" },
            ].map((c) => (
              <div key={c.l} className="rounded-md border border-border bg-surface px-3 py-4">
                <div className={`mono-num text-2xl font-semibold ${c.t}`}>{c.v}</div>
                <div className="text-[11px] text-muted-foreground">{c.l}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Threshold: anomaly score &gt; 0.20. Counted over the current rolling buffer only.
          </p>
        </Panel>

        <Panel title="Twin prediction error" subtitle="Ground truth minus twin expectation" className="xl:col-span-2">
          <TrendChart
            data={errSeries}
            height={220}
            zeroLine
            series={[
              { key: "cht", label: "CHT error (°C)", color: "var(--color-chart-4)" },
              { key: "oil", label: "Oil pressure error (bar)", color: "var(--color-chart-2)" },
              { key: "rpm", label: "Speed error (×100 rpm)", color: "var(--color-chart-1)" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Per-channel twin accuracy" subtitle="MAE / RMSE / MAPE against simulator ground truth" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">n</th>
                <th className="px-4 py-2 font-semibold">MAE</th>
                <th className="px-4 py-2 font-semibold">RMSE</th>
                <th className="px-4 py-2 font-semibold">MAPE</th>
                <th className="px-4 py-2 font-semibold">Bias</th>
                <th className="px-4 py-2 font-semibold">Fit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.map((m) => (
                <tr key={m.s.id} className="hover:bg-surface">
                  <td className="px-4 py-2 font-medium">
                    {m.s.label} <span className="text-xs text-muted-foreground">({m.s.unit})</span>
                  </td>
                  <td className="mono-num px-4 py-2">{m.n}</td>
                  <td className="mono-num px-4 py-2">{m.mae.toFixed(3)}</td>
                  <td className="mono-num px-4 py-2">{m.rmse.toFixed(3)}</td>
                  <td className="mono-num px-4 py-2">{m.mape.toFixed(2)}%</td>
                  <td className="mono-num px-4 py-2">
                    {m.bias >= 0 ? "+" : ""}
                    {m.bias.toFixed(3)}
                  </td>
                  <td className="w-40 px-4 py-2">
                    <Bar value={Math.max(0, 1 - m.mape / 25)} tone={m.mape < 5 ? "ok" : m.mape < 12 ? "warn" : "crit"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Declared validation status" subtitle="What has and has not been demonstrated">
        <ul className="space-y-2 text-sm">
          {[
            { ok: true, t: "Pipeline behaviour verified against injected synthetic faults." },
            { ok: true, t: "Sensor-fault versus engine-fault discrimination demonstrated in simulation." },
            { ok: false, t: "No calibration against a physical engine test rig." },
            { ok: false, t: "No flight-representative environmental or vibration qualification." },
            { ok: false, t: "No statistical validation on measured fleet data." },
            { ok: false, t: "No airworthiness, military or operational certification of any kind." },
          ].map((row) => (
            <li key={row.t} className="flex items-start gap-2.5">
              <StatusPill tone={row.ok ? "ok" : "warn"}>{row.ok ? "DEMONSTRATED" : "NOT DEMONSTRATED"}</StatusPill>
              <span className="text-muted-foreground">{row.t}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <PrototypeNotice>
        All metrics on this page are computed against simulated ground truth. They must never be
        presented as measured engine accuracy or as evidence of certification.
      </PrototypeNotice>
    </>
  );
}
