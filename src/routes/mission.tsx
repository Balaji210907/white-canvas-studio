import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { RISK_TONE, faultLabel } from "@/lib/sim/engine";
import { Bar, Metric, Panel, PageHeader, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";

export const Route = createFileRoute("/mission")({
  head: () => ({
    meta: [
      { title: "Mission Reliability — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Mission risk estimation, contributing factor breakdown and endurance feasibility assessment for MALE UAV sorties in the AERO-TWIN AI prototype.",
      },
      { property: "og:title", content: "Mission Reliability — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Mission risk factors, reliability projection and sortie feasibility assessment.",
      },
    ],
  }),
  component: MissionPage,
});

const clockOf = (t: number) => new Date(t).toISOString().slice(14, 19);

const PROFILES = [
  { id: "recce", label: "Long-endurance ISR", hours: 18, loadFactor: 0.62 },
  { id: "transit", label: "Transit / ferry", hours: 6, loadFactor: 0.55 },
  { id: "loiter", label: "High-altitude loiter", hours: 12, loadFactor: 0.7 },
  { id: "climb", label: "Sustained high-load climb", hours: 3, loadFactor: 0.92 },
];

function MissionPage() {
  const { samples, latest } = useTelemetry();
  const [profileId, setProfileId] = useState("recce");
  if (!latest) return <div className="panel p-8 text-sm text-muted-foreground">Evaluating mission risk…</div>;

  const profile = PROFILES.find((p) => p.id === profileId)!;
  const window = samples.slice(-120);

  const factors = [
    { name: "Anomaly severity", value: latest.anomalyScore * 0.42, note: "Fused twin residual magnitude" },
    { name: "Health index shortfall", value: (1 - latest.healthIndex / 100) * 0.33, note: "Distance from nominal health" },
    { name: "Evidence quality gap", value: (1 - latest.dataQuality) * 0.15, note: "Missing / degraded telemetry" },
    {
      name: "Fault hypothesis weight",
      value: latest.faultProbs[0]!.id !== "none" ? latest.faultProbs[0]!.p * 0.2 : 0,
      note: `Leading: ${faultLabel(latest.faultProbs[0]!.id)}`,
    },
  ];
  const sum = factors.reduce((a, f) => a + f.value, 0) || 1;

  const profileRisk = Math.min(1, latest.missionRisk * (0.7 + profile.loadFactor * 0.6));
  const successProb = Math.max(0.05, 1 - profileRisk) ** (profile.hours / 12);
  const feasible = profileRisk < 0.5 && latest.status !== "CRITICAL";

  const riskSeries = window.map((s) => ({
    x: clockOf(s.t),
    risk: +(s.missionRisk * 100).toFixed(1),
    health: +s.healthIndex.toFixed(1),
  }));

  return (
    <>
      <PageHeader
        title="Mission Reliability"
        description="Mission-level risk synthesis: how current engine condition, evidence quality and fault hypotheses translate into sortie feasibility."
        actions={<StatusPill tone={RISK_TONE[latest.missionRiskLevel]}>{latest.missionRiskLevel} RISK</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mission risk level" value={latest.missionRiskLevel} tone={RISK_TONE[latest.missionRiskLevel]} provenance="calculated" hint={`Composite ${(latest.missionRisk * 100).toFixed(0)}/100`} />
        <Metric label="Profile-adjusted risk" value={(profileRisk * 100).toFixed(0)} unit="%" tone={profileRisk > 0.5 ? "crit" : profileRisk > 0.3 ? "warn" : "ok"} provenance="model" hint={profile.label} />
        <Metric label="Completion likelihood" value={(successProb * 100).toFixed(1)} unit="%" tone={successProb > 0.85 ? "ok" : successProb > 0.65 ? "warn" : "crit"} provenance="model" hint={`${profile.hours} h sortie`} />
        <Metric label="Go / no-go advisory" value={feasible ? "GO" : "NO-GO"} tone={feasible ? "ok" : "crit"} provenance="model" hint="Advisory only — crew decision authority" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Mission profile" subtitle="Select the intended sortie" className="xl:col-span-1">
          <div className="space-y-2">
            {PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfileId(p.id)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                  p.id === profileId ? "border-primary bg-accent" : "border-border hover:bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="mono-num text-xs text-muted-foreground">{p.hours} h</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Mean load factor {(p.loadFactor * 100).toFixed(0)}%
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Risk factor contribution" subtitle="Explained decomposition of the composite score" className="xl:col-span-2">
          <ul className="space-y-3">
            {factors.map((f) => (
              <li key={f.name}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{f.name}</span>
                  <span className="mono-num">{((f.value / sum) * 100).toFixed(0)}% of score</span>
                </div>
                <Bar value={f.value / sum} tone={f.value / sum > 0.4 ? "crit" : "warn"} />
                <div className="mt-0.5 text-[11px] text-muted-foreground">{f.note}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Mission risk vs health index" subtitle="Rolling window">
        <TrendChart
          data={riskSeries}
          height={230}
          yDomain={[0, 100]}
          series={[
            { key: "risk", label: "Mission risk", color: "var(--color-chart-4)" },
            { key: "health", label: "Health index", color: "var(--color-chart-2)" },
          ]}
        />
      </Panel>

      <Panel title="Operational envelope guidance" subtitle="Derived from current condition" bodyClassName="p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr className="label-xs">
              <th className="px-4 py-2 font-semibold">Regime</th>
              <th className="px-4 py-2 font-semibold">Advisory</th>
              <th className="px-4 py-2 font-semibold">Basis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              {
                r: "Continuous cruise",
                a: latest.healthIndex > 70 ? "Permitted" : "Permitted with monitoring",
                b: "Health index and residual trend",
              },
              {
                r: "Sustained high load",
                a: latest.healthIndex > 80 && latest.anomalyScore < 0.2 ? "Permitted" : "Restrict duration",
                b: "Thermal and vibration residual headroom",
              },
              {
                r: "Extended endurance (>12 h)",
                a: profileRisk < 0.35 ? "Permitted" : "Not recommended",
                b: "Degradation slope extrapolation",
              },
              {
                r: "Diversion / recovery",
                a: latest.status === "CRITICAL" ? "Initiate now" : "Standby",
                b: "Fused status classification",
              },
            ].map((row) => (
              <tr key={row.r}>
                <td className="px-4 py-2.5 font-medium">{row.r}</td>
                <td className="px-4 py-2.5">{row.a}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <PrototypeNotice>
        Mission risk figures are prototype estimates from simulated telemetry. They are not
        certified reliability predictions and carry no operational authority.
      </PrototypeNotice>
    </>
  );
}
