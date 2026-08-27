import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Upload, Play, Pause, SkipBack } from "lucide-react";

import { PageHeader, Panel, StatusPill, PrototypeNotice, Bar } from "@/components/ui-kit";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_SPECS, SENSOR_MAP, type SensorId } from "@/lib/config/registry";
import { ENGINE_PROFILES } from "@/lib/engine/profile";
import {
  buildDataset,
  parseFile,
  profileColumns,
  UNIT_OPTIONS,
  type ChannelMapping,
  type ColumnProfile,
  type ParsedTable,
  type QualityReport,
} from "@/lib/import/ingest";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Data Import & Replay — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Import recorded engine telemetry (CSV/JSON), map columns to canonical channels, review data quality and replay the run through the digital twin pipeline.",
      },
      { property: "og:title", content: "Data Import & Replay — AERO-TWIN AI" },
      {
        property: "og:description",
        content: "Upload, map, validate and replay recorded engine telemetry through the twin pipeline.",
      },
    ],
  }),
  component: ImportPage,
});

type Step = "upload" | "map" | "loaded";

function ImportPage() {
  const {
    loadDataset,
    clearDataset,
    dataset,
    source,
    replayPosition,
    replayLength,
    running,
    setRunning,
    speed,
    setSpeed,
    seekReplay,
    useSimulator,
  } = useTelemetry();

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [columns, setColumns] = useState<ColumnProfile[]>([]);
  const [tsColumn, setTsColumn] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ChannelMapping[]>([]);
  const [engineId, setEngineId] = useState(ENGINE_PROFILES[0]!.engineId);
  const [rateHz, setRateHz] = useState(1);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step: Step = dataset && source === "REPLAY" ? "loaded" : table ? "map" : "upload";

  async function onFile(file: File) {
    setError(null);
    const text = await file.text();
    const parsed = parseFile(file.name, text);
    if (parsed.format === "UNSUPPORTED" || !parsed.columns.length) {
      setError(parsed.issues.join(" ") || "File could not be read.");
      setTable(null);
      return;
    }
    const profs = profileColumns(parsed);
    setTable(parsed);
    setColumns(profs);
    setTsColumn(profs.find((c) => c.suggestedChannel === "timestamp")?.name ?? null);
    setMappings(
      SENSOR_SPECS.map((s) => {
        const match = profs.find((c) => c.suggestedChannel === s.id);
        return {
          channel: s.id,
          column: match?.name ?? null,
          sourceUnit: match?.detectedUnit ?? s.unit,
        };
      }),
    );
    setQuality(null);
  }

  const mappedCount = mappings.filter((m) => m.column).length;

  function build() {
    if (!table) return;
    const { dataset: ds, quality: q } = buildDataset({
      table,
      timestampColumn: tsColumn,
      mappings,
      engineId,
      vehicleId: "UAV-IMPORT",
      datasetName: table.fileName.replace(/\.[^.]+$/, ""),
      assumedRateHz: rateHz,
    });
    setQuality(q);
    if (!ds.frames.length) {
      setError("No usable rows survived validation — nothing was loaded.");
      return;
    }
    loadDataset(ds);
  }

  const preview = useMemo(() => (table ? table.rows.slice(0, 5) : []), [table]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Import & Replay"
        description="Recorded telemetry is normalised into the canonical TelemetryFrame at import time and replayed through exactly the same pipeline as the simulator. Column names are never assumed — you confirm every mapping."
        actions={
          <StatusPill tone={source === "REPLAY" ? "info" : "neutral"}>
            {source === "REPLAY" ? "SOURCE: REPLAY" : "SOURCE: SIMULATED"}
          </StatusPill>
        }
      />

      <Panel
        title="1 · Upload"
        subtitle="CSV, TSV or JSON. XLSX/Parquet must be exported to CSV first — the browser build does not decode them."
      >
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-8 text-center hover:bg-accent">
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">Select a recorded telemetry file</span>
          <span className="text-xs text-muted-foreground">
            The file is parsed locally in the browser; nothing is uploaded to a server.
          </span>
          <input
            type="file"
            accept=".csv,.tsv,.json,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
        {error && <p className="mt-3 text-xs font-medium text-crit">{error}</p>}
        {table && (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
            {[
              ["File", table.fileName],
              ["Format", table.format],
              ["Columns", String(table.columns.length)],
              ["Rows", String(table.rows.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-border bg-surface p-2">
                <div className="label-xs">{k}</div>
                <div className="mono-num truncate">{v}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {table && (
        <>
          <Panel title="2 · Column discovery" subtitle="Detected kind, range and unit for each column" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface text-left">
                  <tr className="label-xs">
                    {["Column", "Kind", "Numeric", "Missing", "Min", "Max", "Unit", "Suggestion", "Sample"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {columns.map((c) => (
                    <tr key={c.name}>
                      <td className="px-3 py-1.5 font-medium">{c.name}</td>
                      <td className="px-3 py-1.5">{c.kind}</td>
                      <td className="mono-num px-3 py-1.5">{c.numericCount}</td>
                      <td className="mono-num px-3 py-1.5">{c.missingCount}</td>
                      <td className="mono-num px-3 py-1.5">{c.min === null ? "—" : c.min.toFixed(2)}</td>
                      <td className="mono-num px-3 py-1.5">{c.max === null ? "—" : c.max.toFixed(2)}</td>
                      <td className="px-3 py-1.5">{c.detectedUnit ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {c.suggestedChannel ? (
                          <span>
                            {c.suggestedChannel === "timestamp"
                              ? "Timestamp"
                              : SENSOR_MAP[c.suggestedChannel].label}{" "}
                            <span className="text-muted-foreground">
                              ({(c.suggestionConfidence * 100).toFixed(0)}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">none — map manually</span>
                        )}
                      </td>
                      <td className="mono-num px-3 py-1.5 text-muted-foreground">{c.sample.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 0 && (
              <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                First rows: {preview.map((r) => r.slice(0, 4).join(" | ")).join("  ···  ")}
              </div>
            )}
          </Panel>

          <Panel title="3 · Channel mapping" subtitle="Confirm each canonical channel. Unmapped channels stay UNAVAILABLE — they are never estimated.">
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs">
                <div className="label-xs mb-1">Timestamp column</div>
                <select
                  value={tsColumn ?? ""}
                  onChange={(e) => setTsColumn(e.target.value || null)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5"
                >
                  <option value="">None — assume fixed rate</option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <div className="label-xs mb-1">Assumed rate (if no timestamp)</div>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={rateHz}
                  onChange={(e) => setRateHz(+e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5"
                />
              </label>
              <label className="text-xs">
                <div className="label-xs mb-1">Target engine asset</div>
                <select
                  value={engineId}
                  onChange={(e) => setEngineId(e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5"
                >
                  {ENGINE_PROFILES.map((p) => (
                    <option key={p.engineId} value={p.engineId}>
                      {p.engineId} — {p.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface text-left">
                  <tr className="label-xs">
                    <th className="px-3 py-2 font-semibold">Canonical channel</th>
                    <th className="px-3 py-2 font-semibold">Target unit</th>
                    <th className="px-3 py-2 font-semibold">Source column</th>
                    <th className="px-3 py-2 font-semibold">Source unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mappings.map((m) => (
                    <tr key={m.channel}>
                      <td className="px-3 py-1.5 font-medium">{SENSOR_MAP[m.channel].label}</td>
                      <td className="mono-num px-3 py-1.5">{SENSOR_MAP[m.channel].unit}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={m.column ?? ""}
                          onChange={(e) =>
                            setMappings((prev) =>
                              prev.map((x) =>
                                x.channel === m.channel ? { ...x, column: e.target.value || null } : x,
                              ),
                            )
                          }
                          className="w-full rounded border border-border bg-card px-2 py-1"
                        >
                          <option value="">— not mapped —</option>
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={m.sourceUnit}
                          onChange={(e) =>
                            setMappings((prev) =>
                              prev.map((x) =>
                                x.channel === m.channel ? { ...x, sourceUnit: e.target.value } : x,
                              ),
                            )
                          }
                          className="w-full rounded border border-border bg-card px-2 py-1"
                        >
                          {UNIT_OPTIONS[m.channel as SensorId].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={build}
                disabled={mappedCount === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                Validate & load replay
              </button>
              <span className="text-xs text-muted-foreground">
                {mappedCount} of {SENSOR_SPECS.length} canonical channels mapped
              </span>
            </div>
          </Panel>
        </>
      )}

      {quality && (
        <Panel title="4 · Data-quality report" subtitle="Computed at import; bad rows are rejected, never repaired silently">
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            {[
              ["Total rows", quality.totalRows],
              ["Usable rows", quality.usableRows],
              ["Missing values", quality.missingValues],
              ["Out of physical range", quality.outOfRange],
              ["Duplicate timestamps", quality.duplicateTimestamps],
              ["Out-of-order rows", quality.outOfOrderTimestamps],
              ["Invalid timestamps", quality.invalidTimestamps],
              ["Rate-limit spikes", quality.spikes],
              ["Communication gaps", quality.gaps],
              ["Frozen channels", quality.frozenChannels.length],
              ["Unmapped channels", quality.unmappedChannels.length],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded border border-border bg-surface p-2">
                <div className="label-xs">{k}</div>
                <div className="mono-num">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Bar
              value={quality.totalRows ? quality.usableRows / quality.totalRows : 0}
              tone={quality.usableRows / Math.max(1, quality.totalRows) > 0.9 ? "ok" : "warn"}
            />
          </div>
          {quality.notes.map((n) => (
            <p key={n} className="mt-2 text-xs text-muted-foreground">
              {n}
            </p>
          ))}
        </Panel>
      )}

      {step === "loaded" && dataset && (
        <Panel title="5 · Replay control" subtitle="Time machine — the twin and 3D state evolve with the recorded run">
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            {[
              ["Dataset", dataset.name],
              ["Engine", dataset.engineId],
              ["Frames", `${replayPosition} / ${replayLength}`],
              ["Rejected at import", String(dataset.rejectedRows)],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-border bg-surface p-2">
                <div className="label-xs">{k}</div>
                <div className="mono-num truncate">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRunning(!running)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {running ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => seekReplay(0)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <SkipBack className="size-3.5" /> Restart
            </button>
            {[0.25, 0.5, 1, 2, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md border border-border px-2 py-1.5 text-xs ${speed === s ? "bg-accent font-semibold" : ""}`}
              >
                {s}×
              </button>
            ))}
            <button
              onClick={() => {
                clearDataset();
                useSimulator();
              }}
              className="ml-auto rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Return to simulator
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, replayLength - 1)}
            value={replayPosition}
            onChange={(e) => seekReplay(+e.target.value)}
            className="mt-3 w-full"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Provenance is fixed to REPLAY for every frame produced from this file. It is never
            displayed as LIVE or REAL ENGINE data.
          </p>
        </Panel>
      )}

      <PrototypeNotice>
        Import runs entirely in the browser. A CSV alone does not produce engine geometry: an
        engine-specific twin requires the recorded data plus an engine profile, a 3D asset and a
        confirmed component mapping.
      </PrototypeNotice>
    </div>
  );
}
