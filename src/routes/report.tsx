import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { ENGINE_PROFILES, mappingCoverage } from "@/lib/engine/profile";
import { CONFIGURATION_VERSION, TWIN_CALIBRATION } from "@/lib/config/registry";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Implementation Report — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Technical implementation report: what is implemented, what remains simulated, what requires real hardware or real engine data, and what is not yet validated.",
      },
      { property: "og:title", content: "Implementation Report — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Honest status of every AERO-TWIN subsystem: implemented, simulated, or not validated.",
      },
    ],
  }),
  component: ReportPage,
});

type Row = { item: string; status: string; note: string };

const SECTIONS: { title: string; subtitle: string; rows: Row[] }[] = [
  {
    title: "1 · Already present before this update",
    subtitle: "Preserved and upgraded, not rewritten",
    rows: [
      { item: "Canonical TelemetryFrame contract + Zod schema", status: "PRESERVED", note: "Extended with replay provenance." },
      { item: "Engineering configuration registry", status: "PRESERVED", note: "Still the only source of constants." },
      { item: "Physics simulator (virtual engine)", status: "PRESERVED", note: "Unchanged; now one adapter among several." },
      { item: "Physics-informed twin model + 10-stage pipeline", status: "PRESERVED", note: "Now feeds the Twin State Engine." },
      { item: "PHM, fault diagnosis, mission risk, validation pages", status: "PRESERVED", note: "Consume the same pipeline output." },
    ],
  },
  {
    title: "2 · Upgraded in this update",
    subtitle: "Existing modules extended",
    rows: [
      { item: "Telemetry store", status: "UPGRADED", note: "Source switching (simulator / replay), playback speed, seek, per-frame twin state computation." },
      { item: "Adapter layer", status: "UPGRADED", note: "ReplayAdapter implemented; hardware adapters still declared and NOT_CONNECTED." },
      { item: "Digital Twin page", status: "REPLACED BY WORKSPACE", note: "Residual analysis moved to /residuals; /twin is now the engine-centric workspace." },
      { item: "Provenance handling", status: "UPGRADED", note: "REPLAY frames can never be labelled LIVE or REAL ENGINE." },
    ],
  },
  {
    title: "3 · Newly implemented",
    subtitle: "New engineering modules",
    rows: [
      { item: "Engine Identity + Engine Model Package", status: "IMPLEMENTED", note: "Identity, component hierarchy, component IDs, sensor mapping, limits, fault relationships, versions, 3D asset reference." },
      { item: "Twin State Engine", status: "IMPLEMENTED", note: "Single place where a frame becomes engine / subsystem / component state with confidence." },
      { item: "Sensor → component mapping (many-to-many, weighted)", status: "IMPLEMENTED", note: "One sensor can drive several components and vice versa." },
      { item: "WebGL 3D viewer (three.js / react-three-fiber)", status: "IMPLEMENTED", note: "Rotate, pan, zoom, reset, select, isolate, hide, explode, section, sensor overlay, deviation overlays." },
      { item: "3D state synchronisation", status: "IMPLEMENTED", note: "Every colour derives from ComponentState; no hardcoded or random visuals." },
      { item: "Data Import module", status: "IMPLEMENTED", note: "CSV/TSV/JSON parsing, column discovery, unit detection & conversion, confirmed mapping, quality report." },
      { item: "Replay / time-machine", status: "IMPLEMENTED", note: "Play, pause, speed 0.25–5×, seek; runs through the identical pipeline." },
      { item: "Synchronisation monitor", status: "IMPLEMENTED", note: "Measured processing latency, dropped frames, gaps — no invented numbers." },
      { item: "Reasoning path / traceability view", status: "IMPLEMENTED", note: "Mission ← engine ← subsystem ← component ← feature ← sensor ← source." },
      { item: "3D twin configuration validation", status: "IMPLEMENTED", note: "Component mapping coverage, unmapped components and channels." },
    ],
  },
  {
    title: "4 · What remains simulated",
    subtitle: "Labelled as such everywhere in the UI",
    rows: [
      { item: "All default telemetry", status: "SIMULATED", note: "Produced by the deterministic virtual engine; provenance SIMULATED." },
      { item: "Twin calibration coefficients", status: "SIMULATED", note: `Fitted to synthetic data only (${TWIN_CALIBRATION.version}, quality ${TWIN_CALIBRATION.calibrationQuality}).` },
      { item: "Fault signatures", status: "SIMULATED", note: "Residual signatures are engineering assumptions, not measured failure data." },
      { item: "3D geometry", status: "GENERIC / APPROXIMATE", note: "Primitive layout from the component hierarchy. Not vendor CAD." },
    ],
  },
  {
    title: "5 · Requires real hardware",
    subtitle: "Interfaces exist; no device is bound",
    rows: [
      { item: "CAN / CAN-FD gateway", status: "NOT CONNECTED", note: "Adapter declared; message layout must be configured per engine, not hardcoded." },
      { item: "Serial / UART link", status: "NOT CONNECTED", note: "Adapter declared." },
      { item: "DAQ (high-rate vibration)", status: "NOT CONNECTED", note: "Adapter declared; current vibration channel is band-RMS only." },
      { item: "ECU / FADEC logger", status: "NOT CONNECTED", note: "Read-only by design. No command path exists or may be added here." },
    ],
  },
  {
    title: "6 · Requires real engine data",
    subtitle: "Blocked until a physical run exists",
    rows: [
      { item: "Twin calibration against a physical engine", status: "BLOCKED", note: "Needs instrumented test-rig runs across the operating envelope." },
      { item: "RUL model", status: "NOT AVAILABLE", note: "No run-to-failure history; RUL deliberately reports NOT AVAILABLE with a reason." },
      { item: "False-alarm / missed-detection rates", status: "NOT AVAILABLE", note: "Requires labelled real events." },
      { item: "Exact 3D digital replication", status: "NOT AVAILABLE", note: "Requires vendor CAD/GLB and a validated component mapping." },
    ],
  },
  {
    title: "7 · Requires validated engineering models",
    subtitle: "",
    rows: [
      { item: "Cylinder-level thermal model", status: "PENDING", note: "Present model is single-zone; per-cylinder CHT needs per-cylinder instrumentation." },
      { item: "Rotordynamic bearing model", status: "PENDING", note: "Order-tracked spectra needed; current model uses RMS only." },
      { item: "Degradation / physics-of-failure models", status: "PENDING", note: "No validated wear laws implemented." },
    ],
  },
  {
    title: "8 · Currently validated",
    subtitle: "Only against synthetic ground truth",
    rows: [
      { item: "Pipeline determinism and stage tracing", status: "VALIDATED (SYNTHETIC)", note: "Every frame carries per-stage timing and inputs." },
      { item: "Data-quality detection on injected sensor faults", status: "VALIDATED (SYNTHETIC)", note: "Stuck, bias, noise, dropout, spike are detected in the simulator." },
      { item: "Source interchangeability", status: "VALIDATED", note: "Simulator and replay produce identical downstream behaviour." },
      { item: "Unit conversion on import", status: "VALIDATED", note: "°F/K, psi/kPa/bar/inHg, m/s²/g conversions applied before normalisation." },
    ],
  },
  {
    title: "9 · Not validated",
    subtitle: "Explicitly unproven",
    rows: [
      { item: "Absolute health index values", status: "NOT VALIDATED", note: "Scale is a prototype construction, not a certified condition index." },
      { item: "Fault probabilities", status: "NOT VALIDATED", note: "Derived from assumed residual signatures." },
      { item: "Mission Risk Index", status: "NOT VALIDATED", note: "Decision-support index only — not a probability of failure." },
      { item: "3D component-to-geometry fidelity", status: "NOT VALIDATED", note: "Generic primitives; positions are representative only." },
    ],
  },
  {
    title: "10 · Remaining demo / non-real data",
    subtitle: "Confined to labelled sources",
    rows: [
      { item: "Simulator scenario programme (state sequence)", status: "DEMO", note: "Configured in the registry; only drives the simulated source." },
      { item: "Engine profile metadata (manufacturer, serial)", status: "PLACEHOLDER", note: "Reported as NOT SPECIFIED rather than invented." },
      { item: "Second engine asset ENGINE-TEST-001", status: "EMPTY PROFILE", note: "Intentionally shows 3D GEOMETRY NOT AVAILABLE and NO DATA behaviour." },
    ],
  },
  {
    title: "11 · Known limitations",
    subtitle: "",
    rows: [
      { item: "In-browser state only", status: "LIMITATION", note: "History is a rolling window; no persistent database write path in this build." },
      { item: "XLSX / Parquet import", status: "LIMITATION", note: "Not decoded in the browser build; export to CSV/JSON." },
      { item: "Single-zone engine model", status: "LIMITATION", note: "Per-cylinder states are inferred from one CHT sensor with declared weights." },
      { item: "Vibration is band-RMS", status: "LIMITATION", note: "No spectral/order analysis without a DAQ source." },
    ],
  },
  {
    title: "12 · Integration interfaces",
    subtitle: "Exact seams for future hardware",
    rows: [
      { item: "TelemetryAdapter", status: "src/lib/telemetry/adapter.ts", note: "connect / disconnect / next(dt) → TelemetryFrame | null / reset." },
      { item: "TelemetryFrame", status: "src/lib/telemetry/frame.ts", note: "Canonical contract every source must emit; Zod-validated." },
      { item: "TelemetryPipeline.process(frame)", status: "src/lib/pipeline/index.ts", note: "Source-agnostic processing chain." },
      { item: "computeTwinState({profile,result})", status: "src/lib/twin/state.ts", note: "Frame + engine profile → component-level twin state." },
      { item: "EngineProfile", status: "src/lib/engine/profile.ts", note: "Identity, hierarchy, sensor map, limits, fault map, 3D asset reference." },
      { item: "buildDataset()", status: "src/lib/import/ingest.ts", note: "Recorded file → validated frames + quality report." },
    ],
  },
];

const ACCEPTANCE: { id: string; test: string; result: string; pass: boolean | null }[] = [
  { id: "T1", test: "Upload valid CSV → correct telemetry appears", result: "Parsed, mapped and replayed through the pipeline.", pass: true },
  { id: "T2", test: "Change one telemetry parameter → only affected twin state changes", result: "Component states are computed per mapped channel; unrelated components unchanged.", pass: true },
  { id: "T3", test: "Inject known simulated fault → detection pipeline responds", result: "Simulation Lab injection raises residuals, hypotheses and component status.", pass: true },
  { id: "T4", test: "Replay historical data → 3D state changes over time", result: "3D colours follow the replayed component states.", pass: true },
  { id: "T5", test: "Disconnect data source → system shows NO DATA", result: "Twin state falls back to NO DATA / NOT EVALUATED; nothing is fabricated.", pass: true },
  { id: "T6", test: "Inject bad sensor data → data-quality engine detects it", result: "Range, rate, frozen and missing checks flag the channel at import and at runtime.", pass: true },
  { id: "T7", test: "Select component → correct component highlighted in 3D", result: "Tree and 3D selection are bound to the same state.", pass: true },
  { id: "T8", test: "Select fault → affected component/subsystem shown", result: "Fault→component map drives hypotheses in the inspection panel.", pass: true },
  { id: "T9", test: "Switch simulator → replay: same downstream pipeline", result: "Both sources share TelemetryPipeline and the Twin State Engine.", pass: true },
  { id: "T10", test: "Switch to future hardware adapter", result: "Interface exists and is exercised by two adapters; no hardware available to prove end-to-end.", pass: null },
];

function toneFor(status: string) {
  if (/NOT AVAILABLE|NOT VALIDATED|BLOCKED|NOT CONNECTED/.test(status)) return "warn" as const;
  if (/IMPLEMENTED|VALIDATED|PRESERVED|UPGRADED/.test(status)) return "ok" as const;
  if (/LIMITATION|DEMO|PLACEHOLDER|SIMULATED|GENERIC|PENDING|EMPTY/.test(status)) return "info" as const;
  return "neutral" as const;
}

function ReportPage() {
  const coverage = mappingCoverage(ENGINE_PROFILES[0]!);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Technical Implementation Report"
        description="What is real, what is simulated, and what is not validated. This report is deliberately conservative: no capability is claimed that the code cannot demonstrate."
        actions={<StatusPill tone="info">CONFIG {CONFIGURATION_VERSION}</StatusPill>}
      />

      <div className="grid gap-2 text-xs sm:grid-cols-4">
        {[
          ["Engine assets", String(ENGINE_PROFILES.length)],
          ["Component mapping coverage", `${coverage.coveragePct}%`],
          ["Real engine data", "NONE"],
          ["Certification claim", "NONE"],
        ].map(([k, v]) => (
          <div key={k} className="rounded border border-border bg-card p-3">
            <div className="label-xs">{k}</div>
            <div className="mono-num text-foreground">{v}</div>
          </div>
        ))}
      </div>

      {SECTIONS.map((s) => (
        <Panel key={s.title} title={s.title} subtitle={s.subtitle} bodyClassName="p-0">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border">
              {s.rows.map((r) => (
                <tr key={r.item}>
                  <td className="w-1/3 px-4 py-2 font-medium">{r.item}</td>
                  <td className="w-52 px-4 py-2">
                    <StatusPill tone={toneFor(r.status)}>{r.status}</StatusPill>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      <Panel title="13 · Acceptance test results" subtitle="Executed against the current build" bodyClassName="p-0">
        <table className="w-full text-xs">
          <thead className="bg-surface text-left">
            <tr className="label-xs">
              <th className="px-4 py-2 font-semibold">#</th>
              <th className="px-4 py-2 font-semibold">Scenario</th>
              <th className="px-4 py-2 font-semibold">Result</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ACCEPTANCE.map((t) => (
              <tr key={t.id}>
                <td className="mono-num px-4 py-2">{t.id}</td>
                <td className="px-4 py-2 font-medium">{t.test}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.result}</td>
                <td className="px-4 py-2">
                  <StatusPill tone={t.pass === true ? "ok" : t.pass === false ? "crit" : "warn"}>
                    {t.pass === true ? "PASS" : t.pass === false ? "FAIL" : "NOT PROVABLE"}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="14 · Known failures and gaps" subtitle="">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>End-to-end hardware path (T10) cannot be proven without a physical device.</li>
          <li>No persistence layer in this build: closing the browser discards the run.</li>
          <li>Per-cylinder health is inferred from a single CHT sensor with declared weights, not measured per cylinder.</li>
          <li>Section/cutaway view is a half-space cull of primitives, not a true CAD section.</li>
          <li>Import rejects rather than repairs malformed rows — large corrupt files may yield few usable frames.</li>
        </ul>
      </Panel>

      <Panel title="15 · Recommended next engineering validation stage" subtitle="">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Instrument a test-cell engine with the declared sensor set and record steady-state sweeps across the RPM/load envelope.</li>
          <li>Re-fit the twin calibration against that data and publish a new calibration version with measured quality.</li>
          <li>Import the vendor CAD as GLB and complete the component mapping to raise 3D fidelity from GENERIC to validated.</li>
          <li>Run seeded-fault tests (oil restriction, cooling blockage, ignition dropout) to measure detection latency and false-alarm rate.</li>
          <li>Only after run-to-failure data exists, enable an RUL model with published uncertainty and coverage.</li>
          <li>Keep the ECU/FADEC path strictly read-only; any control capability requires separate authorisation and engineering.</li>
        </ol>
      </Panel>

      <PrototypeNotice>
        AERO-TWIN is a decision-support prototype. It is not certified, not airworthiness-approved,
        and has never been connected to a physical engine.
      </PrototypeNotice>
    </div>
  );
}
