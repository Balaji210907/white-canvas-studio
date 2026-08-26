import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS } from "@/lib/sim/engine";
import { Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Configure detection thresholds, acquisition parameters, channel limits and data-retention policy for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Settings — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Detection thresholds, acquisition parameters and channel limit configuration.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { rate, setRate, running, setRunning, resetRun } = useTelemetry();
  const [anomalyThreshold, setAnomalyThreshold] = useState(0.2);
  const [healthWarn, setHealthWarn] = useState(68);
  const [healthCrit, setHealthCrit] = useState(45);
  const [qualityFloor, setQualityFloor] = useState(0.4);
  const [retention, setRetention] = useState("30");
  const [units, setUnits] = useState("metric");

  const Row = ({
    label,
    hint,
    children,
  }: {
    label: string;
    hint?: string;
    children: React.ReactNode;
  }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configuration for the prototype: detection thresholds, acquisition parameters, channel limits and data retention. Changes apply to this browser session."
        actions={<StatusPill tone="info" dot={false}>SESSION SCOPED</StatusPill>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Detection thresholds" subtitle="Provisional prototype values — not certified limits" bodyClassName="px-4 py-1">
          <Row label="Anomaly declaration threshold" hint="Fused residual score above which an anomaly is declared">
            <input
              type="range"
              min={0.05}
              max={0.6}
              step={0.01}
              value={anomalyThreshold}
              onChange={(e) => setAnomalyThreshold(Number(e.target.value))}
              className="w-40 accent-[var(--primary)]"
            />
            <span className="mono-num w-12 text-right text-xs">{anomalyThreshold.toFixed(2)}</span>
          </Row>
          <Row label="Health index — warning" hint="Below this the engine is reported DEGRADED">
            <input
              type="number"
              value={healthWarn}
              min={50}
              max={95}
              onChange={(e) => setHealthWarn(Number(e.target.value))}
              className="mono-num w-20 rounded-md border border-input bg-card px-2 py-1 text-sm"
            />
          </Row>
          <Row label="Health index — critical" hint="Below this the engine is reported CRITICAL">
            <input
              type="number"
              value={healthCrit}
              min={10}
              max={70}
              onChange={(e) => setHealthCrit(Number(e.target.value))}
              className="mono-num w-20 rounded-md border border-input bg-card px-2 py-1 text-sm"
            />
          </Row>
          <Row label="Evidence quality floor" hint="Diagnostics are withheld below this data-quality score">
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={qualityFloor}
              onChange={(e) => setQualityFloor(Number(e.target.value))}
              className="w-40 accent-[var(--primary)]"
            />
            <span className="mono-num w-12 text-right text-xs">{qualityFloor.toFixed(2)}</span>
          </Row>
        </Panel>

        <Panel title="Acquisition & stream" subtitle="Telemetry service parameters" bodyClassName="px-4 py-1">
          <Row label="Stream state" hint="Pause suspends acquisition without clearing the buffer">
            <button
              onClick={() => setRunning(!running)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {running ? "Pause" : "Resume"}
            </button>
          </Row>
          <Row label="Frame interval" hint="Interval between fused frames">
            <input
              type="range"
              min={250}
              max={2000}
              step={250}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-40 accent-[var(--primary)]"
            />
            <span className="mono-num w-16 text-right text-xs">{rate} ms</span>
          </Row>
          <Row label="Communication timeout" hint="Frames missing beyond this window mark the channel unavailable">
            <span className="mono-num text-xs">3 000 ms</span>
          </Row>
          <Row label="Buffer depth" hint="In-memory rolling window before persistence">
            <span className="mono-num text-xs">240 frames</span>
          </Row>
          <Row label="Reset run" hint="Clears the buffer, alert log and twin thermal state">
            <button onClick={resetRun} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              Reset
            </button>
          </Row>
        </Panel>
      </div>

      <Panel title="Channel limits" subtitle="Validation bounds used by the data-quality layer" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="label-xs">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">Unit</th>
                <th className="px-4 py-2 font-semibold">Min</th>
                <th className="px-4 py-2 font-semibold">Max</th>
                <th className="px-4 py-2 font-semibold">Max rate / s</th>
                <th className="px-4 py-2 font-semibold">Sample rate</th>
                <th className="px-4 py-2 font-semibold">Bus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SENSOR_SPECS.map((s) => (
                <tr key={s.id} className="hover:bg-surface">
                  <td className="px-4 py-2 font-medium">{s.label}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.unit}</td>
                  <td className="mono-num px-4 py-2">{s.min}</td>
                  <td className="mono-num px-4 py-2">{s.max}</td>
                  <td className="mono-num px-4 py-2">{s.maxRate}</td>
                  <td className="mono-num px-4 py-2">{s.sampleHz} Hz</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.bus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Data & units" bodyClassName="px-4 py-1">
          <Row label="Unit system">
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="rounded-md border border-input bg-card px-2 py-1 text-sm"
            >
              <option value="metric">Metric (SI)</option>
              <option value="imperial">Imperial</option>
            </select>
          </Row>
          <Row label="Retention policy" hint="Days of telemetry retained in the time-series store">
            <select
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className="rounded-md border border-input bg-card px-2 py-1 text-sm"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">365 days</option>
            </select>
          </Row>
          <Row label="Timestamp reference">
            <span className="mono-num text-xs">UTC, monotonic sequence numbers</span>
          </Row>
        </Panel>

        <Panel title="Interface deployment target" subtitle="Where this prototype expects to connect next">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Replace the synthetic source with a rig DAQ adapter implementing the same frame schema.</li>
            <li>• Keep validation, twin and AI stages unchanged; only the acquisition adapter differs.</li>
            <li>• Persist frames to a time-series store with the schema shown in Historical Analysis.</li>
            <li>• Calibrate the twin against measured rig data before quoting any accuracy figure.</li>
          </ul>
        </Panel>
      </div>

      <PrototypeNotice>
        Thresholds configured here are engineering defaults for a prototype. They are not derived from
        engine manufacturer limits and carry no certification standing.
      </PrototypeNotice>
    </>
  );
}
