import { createFileRoute } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import { ENGINE_FAULTS, SENSOR_MAP, SENSOR_SPECS, faultLabel } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, ProvenanceTag, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/diagnosis")({
  head: () => ({
    meta: [
      { title: "Fault Diagnosis — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "AI fault diagnosis with sensor-versus-engine fault discrimination, ranked hypotheses and explainable evidence for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Fault Diagnosis — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Ranked fault hypotheses with sensor-fault discrimination and explainable evidence.",
      },
    ],
  }),
  component: DiagnosisPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function DiagnosisPage() {
  const { samples, latest } = useTelemetry();
  if (!latest) return <div className="panel p-8 text-sm text-muted-foreground">Diagnostic engine warming up…</div>;

  const window = samples.slice(-120);
  const top = latest.faultProbs[0]!;
  const suspect = latest.sensorSuspicion[0]!;
  const sensorFaultSuspected = suspect.p > 0.55;

  const probSeries = window.map((s) => {
    const row: Record<string, number | string> = { x: clockOf(s.t) };
    for (const f of s.faultProbs) row[f.id] = +(f.p * 100).toFixed(1);
    return row;
  });

  const verdict = sensorFaultSuspected
    ? "SENSOR ANOMALY"
    : latest.anomalyScore > 0.25
      ? "ENGINE ANOMALY"
      : latest.anomalyScore > 0.12
        ? "INSUFFICIENT EVIDENCE"
        : "NO ANOMALY";

  return (
    <>
      <PageHeader
        title="Fault Diagnosis"
        description="Residual signatures are matched against known fault modes. Before any engine fault is declared, the evidence is tested against sensor health, physical plausibility, cross-sensor agreement and twin residual behaviour."
        actions={
          <StatusPill tone={verdict === "ENGINE ANOMALY" ? "crit" : verdict === "SENSOR ANOMALY" ? "warn" : "ok"}>
            {verdict}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Leading hypothesis" value={faultLabel(top.id)} provenance="model" tone={top.id === "none" ? "ok" : "warn"} hint={`p = ${(top.p * 100).toFixed(1)}%`} />
        <Metric label="Classifier confidence" value={(latest.anomalyConfidence * 100).toFixed(0)} unit="%" provenance="model" tone={latest.anomalyConfidence > 0.6 ? "ok" : "warn"} />
        <Metric
          label="Suspected sensor"
          value={sensorFaultSuspected ? SENSOR_MAP[suspect.id].label : "None"}
          provenance="model"
          tone={sensorFaultSuspected ? "warn" : "ok"}
          hint={`isolation score ${(suspect.p * 100).toFixed(0)}%`}
        />
        <Metric label="Anomaly score" value={(latest.anomalyScore * 100).toFixed(1)} unit="%" provenance="model" tone={latest.anomalyScore > 0.45 ? "crit" : latest.anomalyScore > 0.2 ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Ranked fault hypotheses" subtitle="Signature-matching over normalised residuals" className="xl:col-span-2" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {latest.faultProbs.map((f) => {
              const meta = ENGINE_FAULTS.find((x) => x.id === f.id);
              return (
                <li key={f.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{meta?.label ?? f.id}</span>
                    <span className="mono-num text-sm">{(f.p * 100).toFixed(1)}%</span>
                  </div>
                  <Bar value={f.p} tone={f.id === "none" ? "ok" : f.p > 0.4 ? "crit" : "warn"} />
                  <p className="mt-1 text-xs text-muted-foreground">{meta?.description}</p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Sensor-fault discrimination" subtitle="Isolation vs cross-sensor agreement">
          <ul className="space-y-2.5">
            {latest.sensorSuspicion.slice(0, 6).map((s) => (
              <li key={s.id}>
                <div className="flex justify-between text-xs">
                  <span>{SENSOR_MAP[s.id].label}</span>
                  <span className="mono-num">{(s.p * 100).toFixed(0)}%</span>
                </div>
                <Bar value={s.p} tone={s.p > 0.55 ? "warn" : "ok"} />
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-md border border-border bg-surface p-3 text-xs leading-relaxed">
            <span className="font-semibold">Decision logic: </span>
            an isolated large residual on a single channel, while every other channel and the twin remain
            in agreement, is reported as a suspected sensor fault rather than an engine fault.
          </div>
        </Panel>
      </div>

      <Panel title="Hypothesis probability history" subtitle="Percent over the rolling window">
        <TrendChart
          data={probSeries}
          height={230}
          yDomain={[0, 100]}
          series={[
            { key: "none", label: "No fault", color: "var(--color-chart-2)" },
            { key: "oil_degradation", label: "Oil degradation", color: "var(--color-chart-1)" },
            { key: "cooling_loss", label: "Cooling loss", color: "var(--color-chart-4)" },
            { key: "bearing_wear", label: "Bearing wear", color: "var(--color-chart-3)" },
            { key: "ignition_misfire", label: "Misfire", color: "var(--color-chart-5)" },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Explainable evidence" subtitle="Attribution behind the current verdict">
          <ul className="space-y-2.5">
            {latest.evidence.map((e, i) => (
              <li key={i}>
                <div className="flex items-start justify-between gap-2 text-xs">
                  <span>{e.label}</span>
                  <ProvenanceTag p={e.provenance} />
                </div>
                <Bar value={Math.min(1, e.weight / 4)} tone="info" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Plausibility cross-checks" subtitle="Gates applied before declaring an engine fault" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                {
                  k: "Sensor health",
                  v: `${SENSOR_SPECS.filter((s) => latest.readings[s.id].status === "HEALTHY").length}/${SENSOR_SPECS.length} healthy`,
                  ok: SENSOR_SPECS.every((s) => latest.readings[s.id].status !== "UNAVAILABLE"),
                },
                {
                  k: "Physical plausibility",
                  v: SENSOR_SPECS.some((s) => latest.readings[s.id].flags.includes("RANGE_VIOLATION"))
                    ? "Range violation present"
                    : "All channels physically plausible",
                  ok: !SENSOR_SPECS.some((s) => latest.readings[s.id].flags.includes("RANGE_VIOLATION")),
                },
                {
                  k: "Cross-sensor agreement",
                  v: sensorFaultSuspected ? "One channel disagrees with the rest" : "Channels mutually consistent",
                  ok: !sensorFaultSuspected,
                },
                {
                  k: "Twin residual persistence",
                  v: `${window.filter((s) => s.anomalyScore > 0.2).length} of ${window.length} frames elevated`,
                  ok: window.filter((s) => s.anomalyScore > 0.2).length < window.length * 0.3,
                },
                {
                  k: "Temporal behaviour",
                  v: latest.state === "ACCELERATION" || latest.state === "STARTING"
                    ? "Transient state — thresholds relaxed"
                    : "Quasi-steady operation",
                  ok: true,
                },
              ].map((row) => (
                <tr key={row.k}>
                  <td className="px-4 py-2.5 font-medium">{row.k}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.v}</td>
                  <td className="px-4 py-2.5 text-right">
                    <StatusPill tone={row.ok ? "ok" : "warn"}>{row.ok ? "PASS" : "FLAG"}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <PrototypeNotice />
    </>
  );
}
