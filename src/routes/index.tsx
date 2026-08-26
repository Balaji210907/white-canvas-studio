import { createFileRoute, Link } from "@tanstack/react-router";
import { useTelemetry } from "@/lib/sim/store";
import {
  RISK_TONE,
  SENSOR_MAP,
  STATUS_TONE,
  faultLabel,
  labelState,
  type SensorId,
} from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, ProvenanceTag, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { BandChart, TrendChart } from "@/components/charts";
import { AlertTriangle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Operational overview of engine status, health index, digital twin synchronisation, anomaly and mission risk for the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Command Center — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Real-time engine status, health index, twin sync and mission risk overview.",
      },
    ],
  }),
  component: CommandCenter,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

function CommandCenter() {
  const { samples, latest, alerts } = useTelemetry();

  if (!latest) {
    return (
      <div className="panel p-8 text-sm text-muted-foreground">
        Acquiring telemetry from the simulated engine bus…
      </div>
    );
  }

  const healthSeries = samples.slice(-90).map((s) => ({
    x: clockOf(s.t),
    value: +s.healthIndex.toFixed(1),
    lo: +Math.max(0, s.healthIndex - s.healthBand / 2).toFixed(1),
    hi: +Math.min(100, s.healthIndex + s.healthBand / 2).toFixed(1),
  }));

  const riskSeries = samples.slice(-90).map((s) => ({
    x: clockOf(s.t),
    anomaly: +(s.anomalyScore * 100).toFixed(1),
    mission: +(s.missionRisk * 100).toFixed(1),
  }));

  const sensorIds = Object.keys(latest.readings) as SensorId[];
  const healthy = sensorIds.filter((id) => latest.readings[id].status === "HEALTHY").length;
  const degraded = sensorIds.filter((id) => latest.readings[id].status === "DEGRADED").length;
  const unavailable = sensorIds.filter((id) => latest.readings[id].status === "UNAVAILABLE").length;

  const topFault = latest.faultProbs[0]!;
  const topSensor = latest.sensorSuspicion[0]!;
  const healthTone = latest.healthIndex > 80 ? "ok" : latest.healthIndex > 60 ? "warn" : "crit";

  return (
    <>
      <PageHeader
        title="Command Center"
        description="Fused operational picture combining validated sensor data, the physics-informed digital twin and AI prognostics."
        actions={<StatusPill tone={STATUS_TONE[latest.status]}>{latest.status.replace("_", " ")}</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Engine Health Index"
          value={latest.healthIndex.toFixed(1)}
          unit={`± ${(latest.healthBand / 2).toFixed(1)}`}
          tone={healthTone}
          provenance="calculated"
          hint="Prototype 0–100 index, not a certified limit"
        />
        <Metric
          label="Anomaly Risk"
          value={(latest.anomalyScore * 100).toFixed(1)}
          unit="%"
          tone={latest.anomalyScore > 0.45 ? "crit" : latest.anomalyScore > 0.2 ? "warn" : "ok"}
          provenance="model"
          hint={`AI confidence ${(latest.anomalyConfidence * 100).toFixed(0)}%`}
        />
        <Metric
          label="Mission Risk"
          value={latest.missionRiskLevel}
          tone={RISK_TONE[latest.missionRiskLevel]}
          provenance="calculated"
          hint={`Composite score ${(latest.missionRisk * 100).toFixed(0)}/100`}
        />
        <Metric
          label="Twin Synchronisation"
          value={(latest.twinConfidence * 100).toFixed(0)}
          unit="% conf"
          tone={latest.twinConfidence > 0.75 ? "ok" : "warn"}
          provenance="model"
          hint={`Data quality ${(latest.dataQuality * 100).toFixed(0)}%`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Engine Health Index trend"
          subtitle="Shaded band = model uncertainty interval"
          className="xl:col-span-2"
        >
          <BandChart data={healthSeries} height={210} />
        </Panel>

        <Panel title="Operating state" subtitle="Estimated from validated telemetry">
          <div className="space-y-4">
            <div>
              <div className="label-xs">Current state</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold">{labelState(latest.state)}</span>
                <ProvenanceTag p="calculated" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Commanded load</span>
                <span className="mono-num">{(latest.throttle * 100).toFixed(0)}%</span>
              </div>
              <Bar value={latest.throttle} tone="info" />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                { l: "Healthy", v: healthy, t: "text-ok" },
                { l: "Degraded", v: degraded, t: "text-warn" },
                { l: "Unavailable", v: unavailable, t: "text-crit" },
              ].map((x) => (
                <div key={x.l} className="rounded-md border border-border bg-surface px-2 py-2">
                  <dd className={`mono-num text-lg font-semibold ${x.t}`}>{x.v}</dd>
                  <dt className="text-[11px] text-muted-foreground">{x.l}</dt>
                </div>
              ))}
            </dl>
            <Link
              to="/telemetry"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open live telemetry <ArrowRight className="size-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Anomaly & mission risk" subtitle="Percent scale" className="xl:col-span-2">
          <TrendChart
            data={riskSeries}
            height={190}
            yDomain={[0, 100]}
            series={[
              { key: "anomaly", label: "Anomaly", color: "var(--color-chart-3)" },
              { key: "mission", label: "Mission risk", color: "var(--color-chart-4)" },
            ]}
          />
        </Panel>

        <Panel title="Most likely fault" subtitle="Residual-signature classifier">
          <div className="space-y-3">
            <div>
              <div className="text-base font-semibold">{faultLabel(topFault.id)}</div>
              <div className="mono-num text-xs text-muted-foreground">
                p = {(topFault.p * 100).toFixed(1)}% · confidence{" "}
                {(latest.anomalyConfidence * 100).toFixed(0)}%
              </div>
            </div>
            <div className="space-y-2">
              {latest.faultProbs.slice(0, 4).map((f) => (
                <div key={f.id}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{faultLabel(f.id)}</span>
                    <span className="mono-num">{(f.p * 100).toFixed(1)}%</span>
                  </div>
                  <Bar value={f.p} tone={f.id === "none" ? "ok" : "warn"} />
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border bg-surface p-2 text-xs">
              <span className="font-semibold">Sensor-fault discrimination: </span>
              {topSensor.p > 0.55
                ? `Suspected fault on ${SENSOR_MAP[topSensor.id].label} (${(topSensor.p * 100).toFixed(0)}%)`
                : "No sensor fault dominates the evidence."}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Top contributing evidence" subtitle="Explainable AI attribution">
          <ul className="space-y-2.5">
            {latest.evidence.map((e, i) => (
              <li key={i}>
                <div className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-foreground">{e.label}</span>
                  <ProvenanceTag p={e.provenance} />
                </div>
                <Bar value={Math.min(1, e.weight / 4)} tone="info" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recommended action" subtitle="Decision support output">
          <div className="space-y-3">
            <StatusPill tone={STATUS_TONE[latest.status]}>{latest.status.replace("_", " ")}</StatusPill>
            <p className="text-sm leading-relaxed">{latest.recommendation}</p>
            <PrototypeNotice>
              Advisory only. Crew and maintenance authority retain full decision responsibility.
            </PrototypeNotice>
          </div>
        </Panel>

        <Panel
          title="Active alerts"
          subtitle={`${alerts.length} in buffer`}
          actions={
            <Link to="/history" className="text-xs font-medium text-primary hover:underline">
              History
            </Link>
          }
          bodyClassName="p-0"
        >
          <ul className="max-h-[300px] divide-y divide-border overflow-y-auto">
            {alerts.slice(0, 12).map((a) => (
              <li key={a.id} className="flex gap-2.5 px-4 py-2.5">
                <AlertTriangle
                  className={`mt-0.5 size-3.5 shrink-0 ${
                    a.severity === "CRITICAL" ? "text-crit" : a.severity === "WARNING" ? "text-warn" : "text-info"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium">{a.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{a.detail}</div>
                  <div className="mono-num text-[10px] text-muted-foreground">{clockOf(a.t)}</div>
                </div>
              </li>
            ))}
            {!alerts.length && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">No active alerts.</li>
            )}
          </ul>
        </Panel>
      </div>

      <PrototypeNotice />
    </>
  );
}
