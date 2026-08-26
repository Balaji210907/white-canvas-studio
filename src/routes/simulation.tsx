import { createFileRoute } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import {
  ENGINE_FAULTS,
  SENSOR_FAULTS,
  SENSOR_SPECS,
  STATE_SEQUENCE,
  faultLabel,
  labelState,
  type EngineFaultId,
  type SensorFaultId,
  type SensorId,
} from "@/lib/sim/engine";
import { Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/simulation")({
  head: () => ({
    meta: [
      { title: "Simulation Lab — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Inject engine and sensor faults, control the mission profile playback and observe how the detection pipeline responds in the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Simulation Lab — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Fault injection and test-mode controls for the digital twin pipeline.",
      },
    ],
  }),
  component: SimulationPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function SimulationPage() {
  const { injection, setInjection, running, setRunning, rate, setRate, resetRun, samples, latest } =
    useTelemetry();

  const window = samples.slice(-120);
  const responseSeries = window.map((s) => ({
    x: clockOf(s.t),
    anomaly: +(s.anomalyScore * 100).toFixed(1),
    health: +s.healthIndex.toFixed(1),
    sensorSusp: +(s.sensorSuspicion[0]!.p * 100).toFixed(1),
  }));

  return (
    <>
      <PageHeader
        title="Simulation Lab"
        description="Test mode. Inject engine faults and sensor faults into the synthetic engine and verify that the validation, twin and diagnosis layers respond as designed."
        actions={
          <StatusPill tone={injection.engineFault !== "none" || injection.sensorFault !== "none" ? "warn" : "ok"}>
            {injection.engineFault !== "none" || injection.sensorFault !== "none" ? "INJECTION ACTIVE" : "NOMINAL"}
          </StatusPill>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Engine fault injection" subtitle="Applied to the ground-truth engine, not to the twin">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {ENGINE_FAULTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setInjection({ engineFault: f.id })}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    injection.engineFault === f.id ? "border-primary bg-accent" : "border-border hover:bg-surface"
                  }`}
                >
                  <div className="font-semibold">{f.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{f.description}</div>
                </button>
              ))}
            </div>
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="label-xs">Severity</span>
                <span className="mono-num">{(injection.engineSeverity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={injection.engineSeverity}
                onChange={(e) => setInjection({ engineSeverity: Number(e.target.value) })}
                className="mt-2 w-full accent-[var(--primary)]"
              />
            </label>
          </div>
        </Panel>

        <Panel title="Sensor fault injection" subtitle="Applied to the acquisition path of one channel">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {SENSOR_FAULTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setInjection({ sensorFault: f.id as SensorFaultId })}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    injection.sensorFault === f.id ? "border-primary bg-accent" : "border-border hover:bg-surface"
                  }`}
                >
                  <div className="font-semibold">{f.label}</div>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="label-xs">Target channel</span>
              <select
                value={injection.sensorTarget}
                onChange={(e) => setInjection({ sensorTarget: e.target.value as SensorId })}
                className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              >
                {SENSOR_SPECS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="label-xs">Sensor fault severity</span>
                <span className="mono-num">{(injection.sensorSeverity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={injection.sensorSeverity}
                onChange={(e) => setInjection({ sensorSeverity: Number(e.target.value) })}
                className="mt-2 w-full accent-[var(--primary)]"
              />
            </label>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Injected engine fault" value={faultLabel(injection.engineFault as EngineFaultId)} provenance="simulated" tone={injection.engineFault === "none" ? "ok" : "warn"} />
        <Metric label="Detected leading fault" value={latest ? faultLabel(latest.faultProbs[0]!.id) : "—"} provenance="model" tone={latest && latest.faultProbs[0]!.id === injection.engineFault ? "ok" : "warn"} hint="Match indicates correct classification" />
        <Metric label="Injected sensor fault" value={SENSOR_FAULTS.find((f) => f.id === injection.sensorFault)!.label} provenance="simulated" tone={injection.sensorFault === "none" ? "ok" : "warn"} />
        <Metric label="Detected suspect channel" value={latest ? SENSOR_SPECS.find((s) => s.id === latest.sensorSuspicion[0]!.id)!.label : "—"} provenance="model" />
      </div>

      <Panel title="Pipeline response" subtitle="How anomaly, health and sensor suspicion react to the injection">
        <TrendChart
          data={responseSeries}
          height={230}
          yDomain={[0, 100]}
          series={[
            { key: "anomaly", label: "Anomaly %", color: "var(--color-chart-4)" },
            { key: "health", label: "Health index", color: "var(--color-chart-2)" },
            { key: "sensorSusp", label: "Top sensor suspicion %", color: "var(--color-chart-3)" },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Playback control" subtitle="Test-mode stream parameters">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRunning(!running)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                {running ? "Pause stream" : "Resume stream"}
              </button>
              <button onClick={resetRun} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                Reset run
              </button>
              <button
                onClick={() =>
                  setInjection({ engineFault: "none", sensorFault: "none" })
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Clear injections
              </button>
            </div>
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="label-xs">Frame interval</span>
                <span className="mono-num">{rate} ms</span>
              </div>
              <input
                type="range"
                min={250}
                max={2000}
                step={250}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--primary)]"
              />
            </label>
          </div>
        </Panel>

        <Panel title="Mission profile schedule" subtitle="Cyclic operating-state script driving the synthetic engine" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {STATE_SEQUENCE.map((seg, i) => (
                <tr key={i} className={latest?.state === seg.state ? "bg-accent" : ""}>
                  <td className="px-4 py-2 font-medium">{labelState(seg.state)}</td>
                  <td className="mono-num px-4 py-2 text-xs text-muted-foreground">{seg.seconds} s</td>
                  <td className="mono-num px-4 py-2 text-xs text-muted-foreground">
                    load {(seg.throttle * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <PrototypeNotice>
        Simulation Lab outputs are entirely synthetic. Fault signatures are engineered approximations
        intended for pipeline verification, not representations of measured engine failure data.
      </PrototypeNotice>
    </>
  );
}
