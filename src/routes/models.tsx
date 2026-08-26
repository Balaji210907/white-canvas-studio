import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, Metric, Panel, PageHeader, ProvenanceTag, PrototypeNotice, StatusPill } from "@/components/ui-kit";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Model Management — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Registry of digital twin, anomaly, diagnosis and prognosis models with versions, training provenance and deployment state.",
      },
      { property: "og:title", content: "Model Management — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Model registry with versions, training provenance and deployment state.",
      },
    ],
  }),
  component: ModelsPage,
});

interface ModelRec {
  id: string;
  name: string;
  kind: "Physics twin" | "Anomaly detector" | "Fault classifier" | "Prognostic" | "Data validator";
  version: string;
  stage: "ACTIVE" | "SHADOW" | "ARCHIVED";
  algorithm: string;
  features: string[];
  trainedOn: string;
  frames: number;
  metric: { label: string; value: string; score: number };
  notes: string;
}

const MODELS: ModelRec[] = [
  {
    id: "twin-core",
    name: "Reduced-order engine twin",
    kind: "Physics twin",
    version: "2.4.0",
    stage: "ACTIVE",
    algorithm: "Analytical speed-density + thermal network",
    features: ["load command", "ambient pressure", "ambient temperature", "thermal state"],
    trainedOn: "Analytical, no data fit",
    frames: 0,
    metric: { label: "Mean channel MAPE", value: "3.8%", score: 0.85 },
    notes: "Replaceable behind a fixed expectation contract; a rig-calibrated variant can be swapped in without frontend changes.",
  },
  {
    id: "anom-res",
    name: "Residual fusion anomaly detector",
    kind: "Anomaly detector",
    version: "1.9.2",
    stage: "ACTIVE",
    algorithm: "Confidence-weighted normalised residual fusion",
    features: ["8 normalised residuals", "sensor confidence", "isolation score"],
    trainedOn: "Synthetic nominal runs (12 h equivalent)",
    frames: 43200,
    metric: { label: "F1 on injected faults", value: "0.91", score: 0.91 },
    notes: "Down-weights channels flagged by the sensor-fault discriminator to avoid false engine alarms.",
  },
  {
    id: "diag-sig",
    name: "Fault signature classifier",
    kind: "Fault classifier",
    version: "1.4.1",
    stage: "ACTIVE",
    algorithm: "Signature matching over residual vectors (gradient-boosting candidate in shadow)",
    features: ["residual vector", "operating state", "transient flag"],
    trainedOn: "Six injected fault modes × five severities",
    frames: 21600,
    metric: { label: "Top-1 accuracy", value: "0.87", score: 0.87 },
    notes: "Reports 'no fault' explicitly rather than forcing a class when evidence is weak.",
  },
  {
    id: "diag-xgb",
    name: "Gradient-boosted fault classifier",
    kind: "Fault classifier",
    version: "0.3.0",
    stage: "SHADOW",
    algorithm: "XGBoost, 240 trees, depth 4",
    features: ["residual vector", "rolling statistics", "spectral vibration features"],
    trainedOn: "Synthetic dataset v3",
    frames: 64800,
    metric: { label: "Top-1 accuracy", value: "0.90", score: 0.9 },
    notes: "Runs in shadow mode; outputs recorded for comparison but not used for decision support.",
  },
  {
    id: "phm-rul",
    name: "Degradation & RUL estimator",
    kind: "Prognostic",
    version: "0.8.4",
    stage: "ACTIVE",
    algorithm: "Windowed least-squares slope with uncertainty inflation",
    features: ["health index history", "twin confidence", "data quality"],
    trainedOn: "Synthetic wear profiles",
    frames: 86400,
    metric: { label: "Slope stability", value: "±0.6 HI/h", score: 0.62 },
    notes: "Linear projection only. Wide uncertainty; not suitable for maintenance credit.",
  },
  {
    id: "dq-valid",
    name: "Data validation ruleset",
    kind: "Data validator",
    version: "3.1.0",
    stage: "ACTIVE",
    algorithm: "Deterministic rule chain (null, range, rate, stuck, duplicate, timeout)",
    features: ["raw frame", "previous frame", "channel specification"],
    trainedOn: "Rule-based, no training",
    frames: 0,
    metric: { label: "Rule coverage", value: "9 / 9", score: 1 },
    notes: "Executes before any AI stage; failures suppress the affected channel from fusion.",
  },
];

const STAGE_TONE = { ACTIVE: "ok", SHADOW: "info", ARCHIVED: "neutral" } as const;

function ModelsPage() {
  const [selectedId, setSelectedId] = useState(MODELS[0]!.id);
  const selected = MODELS.find((m) => m.id === selectedId)!;

  return (
    <>
      <PageHeader
        title="Model Management"
        description="Every analytic stage is a versioned, replaceable model behind a stable data contract. Algorithms can be upgraded without changing the acquisition layer or the interface."
        actions={<StatusPill tone="ok">{MODELS.filter((m) => m.stage === "ACTIVE").length} ACTIVE</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered models" value={MODELS.length} provenance="calculated" />
        <Metric label="Active in decision path" value={MODELS.filter((m) => m.stage === "ACTIVE").length} provenance="calculated" />
        <Metric label="Shadow deployments" value={MODELS.filter((m) => m.stage === "SHADOW").length} provenance="calculated" hint="Recorded, not acted upon" />
        <Metric label="Training frames (synthetic)" value={MODELS.reduce((a, m) => a + m.frames, 0).toLocaleString()} provenance="simulated" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Model registry" className="xl:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr className="label-xs">
                  <th className="px-4 py-2 font-semibold">Model</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Version</th>
                  <th className="px-4 py-2 font-semibold">Stage</th>
                  <th className="px-4 py-2 font-semibold">Key metric</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MODELS.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`cursor-pointer hover:bg-surface ${m.id === selectedId ? "bg-accent" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.kind}</td>
                    <td className="mono-num px-4 py-2.5 text-xs">{m.version}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={STAGE_TONE[m.stage]}>{m.stage}</StatusPill>
                    </td>
                    <td className="mono-num px-4 py-2.5 text-xs">
                      {m.metric.value}
                      <span className="ml-1 text-muted-foreground">{m.metric.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={selected.name} subtitle={`${selected.kind} · v${selected.version}`} actions={<ProvenanceTag p="model" />}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="label-xs">Algorithm</dt>
              <dd>{selected.algorithm}</dd>
            </div>
            <div>
              <dt className="label-xs">Input features</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {selected.features.map((f) => (
                  <span key={f} className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px]">
                    {f}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="label-xs">Training provenance</dt>
              <dd className="text-muted-foreground">
                {selected.trainedOn}
                {selected.frames > 0 && ` · ${selected.frames.toLocaleString()} frames`}
              </dd>
            </div>
            <div>
              <dt className="label-xs">{selected.metric.label}</dt>
              <dd className="mono-num">{selected.metric.value}</dd>
              <Bar value={selected.metric.score} tone={selected.metric.score > 0.85 ? "ok" : "warn"} />
            </div>
            <div>
              <dt className="label-xs">Notes</dt>
              <dd className="text-muted-foreground">{selected.notes}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel title="Promotion policy" subtitle="Rules governing what may enter the decision path">
        <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
          <li>A new model enters as SHADOW and records outputs alongside the active model.</li>
          <li>Promotion requires a documented improvement on the Validation Center metric set.</li>
          <li>A model may not be promoted while its training provenance is undocumented.</li>
          <li>Any model touching decision support must expose per-prediction confidence and evidence.</li>
          <li>Rollback to the previous ACTIVE version must be possible without redeploying the interface.</li>
        </ol>
      </Panel>

      <PrototypeNotice>
        All quoted model metrics were obtained on synthetic data generated by this prototype. No model
        here has been trained or evaluated on measured engine data.
      </PrototypeNotice>
    </>
  );
}
