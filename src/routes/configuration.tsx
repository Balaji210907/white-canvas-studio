import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel, PrototypeNotice, StatusPill } from "@/components/ui-kit";
import {
  CONFIGURATION_VERSION,
  SENSOR_SPECS,
  TWIN_CALIBRATION,
  listConstants,
} from "@/lib/config/registry";

export const Route = createFileRoute("/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration Registry — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Versioned engineering registry: sensor specifications, twin calibration coefficients and decision thresholds with units, ranges and provenance.",
      },
      { property: "og:title", content: "Configuration Registry — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Every engineering constant used by AERO-TWIN AI, with unit, valid range and source.",
      },
    ],
  }),
  component: ConfigurationPage,
});

function ConfigurationPage() {
  const constants = listConstants();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuration Registry"
        description="Single versioned source of truth for every engineering constant. No magic numbers live in pages or models — each value carries a unit, a valid range and a stated source."
        actions={
          <>
            <StatusPill tone="info">{CONFIGURATION_VERSION}</StatusPill>
            <StatusPill tone="neutral">{TWIN_CALIBRATION.version}</StatusPill>
          </>
        }
      />

      <Panel title="Twin calibration provenance" subtitle={TWIN_CALIBRATION.id}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="label-xs">Dataset</dt>
            <dd className="mt-1 text-foreground">{TWIN_CALIBRATION.dataset}</dd>
          </div>
          <div>
            <dt className="label-xs">Calibrated at</dt>
            <dd className="mono-num mt-1 text-foreground">{TWIN_CALIBRATION.calibratedAt}</dd>
          </div>
          <div>
            <dt className="label-xs">Calibration quality</dt>
            <dd className="mono-num mt-1 text-foreground">
              {(TWIN_CALIBRATION.calibrationQuality * 100).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="label-xs">Status</dt>
            <dd className="mt-1">
              <StatusPill tone="warn">NOT VALIDATED ON HARDWARE</StatusPill>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">{TWIN_CALIBRATION.notes}</p>
      </Panel>

      <Panel title="Engineering constants" subtitle={`${constants.length} values in the active registry`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Name", "Value", "Unit", "Valid range", "Source", "Description"].map((h) => (
                  <th key={h} className="label-xs px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {constants.map((c) => (
                <tr key={c.name} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{c.name}</td>
                  <td className="mono-num px-4 py-2">{c.value}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.unit}</td>
                  <td className="mono-num px-4 py-2 text-xs text-muted-foreground">
                    {c.validFrom} … {c.validTo}
                  </td>
                  <td className="px-4 py-2 text-xs">{c.source.replace("_", " ")}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Sensor specifications" subtitle="Physical limits, rate limits and residual scales" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Channel", "Unit", "Range", "Max rate", "Sample", "Bus", "Subsystem", "Residual σ", "Stale after"].map(
                  (h) => (
                    <th key={h} className="label-xs px-4 py-2 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {SENSOR_SPECS.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-foreground">{s.label}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.unit}</td>
                  <td className="mono-num px-4 py-2 text-xs">
                    {s.min} … {s.max}
                  </td>
                  <td className="mono-num px-4 py-2 text-xs">
                    {s.maxRate}/s
                  </td>
                  <td className="mono-num px-4 py-2 text-xs">{s.sampleHz} Hz</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.bus}</td>
                  <td className="px-4 py-2 text-xs">{s.subsystem}</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.residualScale}</td>
                  <td className="mono-num px-4 py-2 text-xs">{s.staleAfterMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PrototypeNotice>
        Registry values are prototype tuning parameters. They are not derived from a certified engine
        datasheet and must be re-calibrated against test-rig data before any engineering use.
      </PrototypeNotice>
    </div>
  );
}
