import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader, Panel, PrototypeNotice, StatusPill, type Tone } from "@/components/ui-kit";
import { hardwareAdapters } from "@/lib/telemetry/adapters";
import type { AdapterDescriptor, AdapterStatus } from "@/lib/telemetry/adapter";
import { useTelemetry } from "@/lib/sim/store";
import { CONFIGURATION_VERSION } from "@/lib/config/registry";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Data Sources — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Telemetry adapter inventory: simulator, serial, CAN, DAQ, ECU and replay interfaces with honest connection status.",
      },
      { property: "og:title", content: "Data Sources — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Adapter inventory and connection state for every AERO-TWIN telemetry path.",
      },
    ],
  }),
  component: SourcesPage,
});

const STATUS_TONE: Record<AdapterStatus, Tone> = {
  CONNECTED: "ok",
  CONNECTING: "info",
  NOT_CONNECTED: "neutral",
  ERROR: "crit",
  DISABLED: "neutral",
};

function SourcesPage() {
  const { latest, running, samples } = useTelemetry();

  const adapters = useMemo<AdapterDescriptor[]>(() => {
    const sim: AdapterDescriptor = {
      id: "sim-primary",
      name: "Physics simulator (virtual engine)",
      sourceType: "SIMULATED",
      protocol: "INTERNAL",
      status: running ? "CONNECTED" : "DISABLED",
      statusDetail: running
        ? "Deterministic virtual engine with seeded noise and fault injection"
        : "Acquisition paused by operator",
      device: null,
      nominalRateHz: 1,
      lastFrameAt: latest?.t ?? null,
      framesDelivered: samples.length,
      errors: 0,
      canProduceRealData: false,
    };
    return [sim, ...hardwareAdapters().map((a) => a.descriptor)];
  }, [latest, running, samples.length]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Sources"
        description="Every telemetry path is declared through the same adapter interface. Only the simulator produces data in this deployment; hardware interfaces are defined but not connected."
        actions={<StatusPill tone="info">CONFIG {CONFIGURATION_VERSION}</StatusPill>}
      />

      <Panel
        title="Adapter inventory"
        subtitle="Hardware → adapter → canonical TelemetryFrame → pipeline. The UI never talks to a sensor."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Adapter", "Source type", "Protocol", "Device", "Rate", "Frames", "Real data", "Status"].map((h) => (
                  <th key={h} className="label-xs px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adapters.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.statusDetail}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{a.sourceType}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{a.protocol}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {a.device ?? "—"}
                  </td>
                  <td className="mono-num px-4 py-2.5 text-xs">{a.nominalRateHz} Hz</td>
                  <td className="mono-num px-4 py-2.5 text-xs">{a.framesDelivered}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {a.canProduceRealData ? "Capable" : "No — synthetic only"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill tone={STATUS_TONE[a.status]}>{a.status.replace("_", " ")}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Integration readiness" subtitle="What a real installation would require for each path">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">CAN / J1939:</span> a signal map (PGN, SPN,
            scaling, endianness) per engine variant plus a reachable gateway. No mapping is faked as live.
          </li>
          <li>
            <span className="font-medium text-foreground">ECU / FADEC:</span> a documented parameter list
            and session handling. No connectivity is claimed.
          </li>
          <li>
            <span className="font-medium text-foreground">DAQ:</span> high-rate vibration acquisition with
            its own anti-alias and windowing stage before frame assembly.
          </li>
          <li>
            <span className="font-medium text-foreground">Replay:</span> recorded runs pass through the
            identical pipeline so results are directly comparable.
          </li>
        </ul>
      </Panel>

      <PrototypeNotice>
        No physical engine, ECU, CAN gateway or DAQ device is connected to this deployment. All data shown
        anywhere in the application originates from the simulator adapter.
      </PrototypeNotice>
    </div>
  );
}
