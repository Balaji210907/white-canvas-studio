import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Crosshair,
  EyeOff,
  Layers,
  RotateCcw,
  Scissors,
  Search,
  Signal as SignalIcon,
} from "lucide-react";

import { PageHeader, Panel, StatusPill, PrototypeNotice, Bar, type Tone } from "@/components/ui-kit";
import { TrendChart } from "@/components/charts";
import { useTelemetry } from "@/lib/sim/store";
import { SENSOR_MAP } from "@/lib/config/registry";
import {
  ENGINE_PROFILES,
  buildTree,
  flattenTree,
  mappingCoverage,
  sensorsForComponent,
} from "@/lib/engine/profile";
import {
  COMPONENT_STATUS_TONE,
  reasoningPath,
  type ComponentState,
} from "@/lib/twin/state";
import type { ViewerOptions } from "@/components/engine-3d";

const Engine3D = lazy(() => import("@/components/engine-3d"));

export const Route = createFileRoute("/twin")({
  head: () => ({
    meta: [
      { title: "Digital Twin Workspace — AERO-TWIN AI" },
      {
        name: "description",
        content:
          "Engine-centric 3D digital twin: component hierarchy, state-driven 3D representation, component inspection, sensor overlay and synchronisation monitor.",
      },
      { property: "og:title", content: "Digital Twin Workspace — AERO-TWIN AI" },
      {
        property: "og:description",
        content:
          "Component-level digital twin of an aero piston engine, synchronised to validated telemetry.",
      },
    ],
  }),
  component: TwinWorkspace,
});

const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : v.toFixed(d);

function StatusDot({ status }: { status: ComponentState["status"] }) {
  const tone = COMPONENT_STATUS_TONE[status];
  const cls: Record<string, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    crit: "bg-crit",
    info: "bg-info",
    neutral: "bg-muted-foreground/50",
  };
  return <span className={`size-2 shrink-0 rounded-full ${cls[tone]}`} />;
}

function TwinWorkspace() {
  const {
    profile,
    engineId,
    setEngineId,
    twinState,
    selectedComponent,
    selectComponent,
    samples,
    source,
    dataset,
    running,
  } = useTelemetry();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [query, setQuery] = useState("");
  const [resetToken, setResetToken] = useState(0);
  const [options, setOptions] = useState<ViewerOptions>({
    exploded: 0,
    isolate: false,
    hidden: [],
    showSensors: true,
    section: false,
    overlay: "status",
  });

  const tree = useMemo(() => buildTree(profile), [profile]);
  const nodes = useMemo(() => flattenTree(tree), [tree]);
  const filtered = useMemo(
    () =>
      query.trim()
        ? nodes.filter(
            (n) =>
              n.name.toLowerCase().includes(query.toLowerCase()) ||
              n.id.toLowerCase().includes(query.toLowerCase()),
          )
        : nodes,
    [nodes, query],
  );

  const coverage = useMemo(() => mappingCoverage(profile), [profile]);
  const selected = selectedComponent ? twinState.components[selectedComponent] ?? null : null;
  const sync = twinState.sync;

  const trendChannels = useMemo(() => {
    if (!selected) return [];
    return sensorsForComponent(profile, selected.id).map((x) => x.sensor.channel);
  }, [profile, selected]);

  const trendData = useMemo(() => {
    const w = samples.slice(-90);
    return w.map((s) => {
      const row: Record<string, string | number> = {
        x: new Date(s.t).toISOString().slice(14, 19),
      };
      for (const ch of trendChannels) {
        const v = s.readings[ch]?.value;
        if (v !== null && v !== undefined) row[ch] = +v.toFixed(2);
      }
      return row;
    });
  }, [samples, trendChannels]);

  const events = useMemo(
    () =>
      samples
        .slice(-120)
        .filter((s) => s.status !== "NORMAL")
        .slice(-8)
        .reverse(),
    [samples],
  );

  const provenanceTone: Tone = twinState.isRealEngineData ? "ok" : "info";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Digital Twin Workspace"
        description="The Digital Twin is the synchronised engineering state of one engine asset. The 3D scene is a representation of that state — never the other way round."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium"
            >
              {ENGINE_PROFILES.map((p) => (
                <option key={p.engineId} value={p.engineId}>
                  {p.engineId} — {p.model}
                </option>
              ))}
            </select>
            <StatusPill tone={provenanceTone}>
              {source === "REPLAY" ? "REPLAY" : "SIMULATED"}
            </StatusPill>
            <StatusPill tone={twinState.synchronised && running ? "ok" : "neutral"}>
              {twinState.synchronised ? (running ? "SYNCHRONISED" : "PAUSED") : "WAITING FOR DATA"}
            </StatusPill>
          </div>
        }
      />

      {/* Identity + synchronisation strip */}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 text-xs md:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Engine ID", v: profile.engineId },
          { k: "Model / configuration", v: `${profile.model} · ${profile.configuration}` },
          { k: "Data source", v: dataset ? `${dataset.fileName} (replay)` : "Physics simulator" },
          { k: "Twin model", v: `${profile.twinModelVersion} · ${profile.calibrationVersion}` },
          { k: "Sensor map", v: profile.sensorMapVersion },
          {
            k: "3D asset",
            v:
              profile.asset3d.fidelity === "UNAVAILABLE"
                ? "NOT AVAILABLE"
                : `${profile.asset3d.format} · ${profile.asset3d.fidelity.replace("_", " ")}`,
          },
        ].map((x) => (
          <div key={x.k}>
            <div className="label-xs">{x.k}</div>
            <div className="mono-num truncate text-foreground" title={x.v}>
              {x.v}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* LEFT — component tree */}
        <Panel title="Component tree" subtitle={`${nodes.length} declared components`} bodyClassName="p-0">
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search components"
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>
          <ul className="max-h-[430px] overflow-y-auto py-1 text-xs">
            {filtered.map((n) => {
              const st = twinState.components[n.id];
              const active = selectedComponent === n.id;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => selectComponent(active ? null : n.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent ${
                      active ? "bg-accent font-semibold" : ""
                    }`}
                    style={{ paddingLeft: 12 + (query ? 0 : n.depth * 12) }}
                  >
                    <StatusDot status={st?.status ?? "UNKNOWN"} />
                    <span className="truncate">{n.name}</span>
                    <span className="mono-num ml-auto text-[10px] text-muted-foreground">
                      {st?.health === null || st?.health === undefined ? "—" : st.health}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* CENTER — 3D */}
        <Panel
          title="3D engine representation"
          subtitle={
            profile.asset3d.fidelity === "GENERIC_APPROXIMATE"
              ? "GENERIC / APPROXIMATE MODEL — not the real engine geometry"
              : profile.asset3d.note
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2 text-xs">
            <button
              onClick={() => setResetToken((t) => t + 1)}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent"
            >
              <RotateCcw className="size-3.5" /> Reset view
            </button>
            <button
              onClick={() => setOptions((o) => ({ ...o, isolate: !o.isolate }))}
              className={`inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent ${options.isolate ? "bg-accent font-semibold" : ""}`}
            >
              <Crosshair className="size-3.5" /> Isolate
            </button>
            <button
              onClick={() => setOptions((o) => ({ ...o, section: !o.section }))}
              className={`inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent ${options.section ? "bg-accent font-semibold" : ""}`}
            >
              <Scissors className="size-3.5" /> Section
            </button>
            <button
              onClick={() =>
                setOptions((o) => ({
                  ...o,
                  hidden: selectedComponent
                    ? o.hidden.includes(selectedComponent)
                      ? o.hidden.filter((x) => x !== selectedComponent)
                      : [...o.hidden, selectedComponent]
                    : o.hidden,
                }))
              }
              disabled={!selectedComponent}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-40"
            >
              <EyeOff className="size-3.5" /> Hide/show
            </button>
            <button
              onClick={() => setOptions((o) => ({ ...o, hidden: [] }))}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent"
            >
              <Layers className="size-3.5" /> Show all
            </button>
            <label className="ml-1 inline-flex items-center gap-1.5">
              <Boxes className="size-3.5" /> Explode
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={options.exploded}
                onChange={(e) => setOptions((o) => ({ ...o, exploded: +e.target.value }))}
                className="w-24"
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              <SignalIcon className="size-3.5" />
              <input
                type="checkbox"
                checked={options.showSensors}
                onChange={(e) => setOptions((o) => ({ ...o, showSensors: e.target.checked }))}
              />
              Sensors
            </label>
            <select
              value={options.overlay}
              onChange={(e) =>
                setOptions((o) => ({ ...o, overlay: e.target.value as ViewerOptions["overlay"] }))
              }
              className="ml-auto rounded border border-border bg-card px-2 py-1"
            >
              <option value="status">Overlay: component status</option>
              <option value="temperature">Overlay: temperature deviation</option>
              <option value="vibration">Overlay: vibration deviation</option>
              <option value="pressure">Overlay: pressure deviation</option>
            </select>
          </div>

          <div className="h-[430px] w-full bg-surface">
            {mounted ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Loading 3D engine…
                  </div>
                }
              >
                <Engine3D
                  profile={profile}
                  state={twinState}
                  selected={selectedComponent}
                  onSelect={selectComponent}
                  options={options}
                  resetToken={resetToken}
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Initialising viewer…
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              Colours are derived from Twin State only ·{" "}
              {twinState.synchronised
                ? `3D updated ${sync.twinUpdatedAt ? new Date(sync.twinUpdatedAt).toISOString().slice(11, 23) : "—"}`
                : "3D shows STATIC CONFIGURATION — no valid telemetry"}
            </span>
            <span className="mono-num">
              {profile.asset3d.fidelity === "GENERIC_APPROXIMATE" ? "GENERIC / APPROXIMATE" : profile.asset3d.fidelity}
            </span>
          </div>
        </Panel>

        {/* RIGHT — component inspection */}
        <Panel
          title={selected ? selected.name : "Component inspection"}
          subtitle={selected ? `${selected.id} · ${selected.subsystem}` : "Select a component in the tree or the 3D scene"}
        >
          {!selected ? (
            <div className="space-y-3 text-xs text-muted-foreground">
              <div>
                <div className="label-xs">Engine health</div>
                <div className="mono-num text-2xl text-foreground">
                  {twinState.engineHealth === null ? "NOT EVALUATED" : fmt(twinState.engineHealth)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Operating state", twinState.operatingState.replace("_", " ")],
                  ["Engine status", twinState.engineStatus],
                  ["Data quality", twinState.dataQuality === null ? "—" : `${(twinState.dataQuality * 100).toFixed(0)}%`],
                  ["Twin confidence", twinState.twinConfidence === null ? "—" : `${(twinState.twinConfidence * 100).toFixed(0)}%`],
                  ["Mission risk", twinState.missionRiskLevel ?? "NOT AVAILABLE"],
                  ["RUL", twinState.rul?.available ? `${fmt(twinState.rul.hours)} h` : "NOT AVAILABLE"],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded border border-border bg-surface p-2">
                    <div className="label-xs">{k}</div>
                    <div className="mono-num text-foreground">{v}</div>
                  </div>
                ))}
              </div>
              {twinState.rul && !twinState.rul.available && (
                <p>Reason: {twinState.rul.reason}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <StatusPill tone={COMPONENT_STATUS_TONE[selected.status]}>{selected.status}</StatusPill>
                <span className="mono-num text-muted-foreground">
                  confidence {(selected.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <div className="label-xs">Component health</div>
                <div className="mono-num text-2xl">
                  {selected.health === null ? "NOT EVALUATED" : selected.health}
                </div>
                {selected.health !== null && <Bar value={selected.health / 100} tone={COMPONENT_STATUS_TONE[selected.status] as Tone} />}
              </div>
              <p className="text-muted-foreground">{selected.reason}</p>

              <div>
                <div className="label-xs mb-1">Contributing telemetry</div>
                {selected.contributions.length === 0 ? (
                  <p className="text-muted-foreground">No sensor mapped to this component.</p>
                ) : (
                  <table className="w-full">
                    <tbody className="divide-y divide-border">
                      {selected.contributions.map((c) => (
                        <tr key={c.tag}>
                          <td className="py-1 pr-2">
                            <div className="font-medium">{SENSOR_MAP[c.channel].label}</div>
                            <div className="text-[10px] text-muted-foreground">{c.tag} · w {c.weight}</div>
                          </td>
                          <td className="mono-num py-1 text-right">
                            {c.value === null ? "—" : c.value.toFixed(2)} {SENSOR_MAP[c.channel].unit}
                          </td>
                          <td className="mono-num py-1 pl-2 text-right text-muted-foreground">
                            {c.normResidual === null ? "n/a" : `${c.normResidual.toFixed(2)}σ`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <div className="label-xs mb-1">Fault hypotheses</div>
                {selected.faultHypotheses.length === 0 ? (
                  <p className="text-muted-foreground">No supported hypothesis implicates this component.</p>
                ) : (
                  selected.faultHypotheses.slice(0, 4).map((h) => (
                    <div key={h.id} className="mb-1">
                      <div className="flex justify-between">
                        <span className="capitalize">{h.label}</span>
                        <span className="mono-num">{(h.probability * 100).toFixed(0)}%</span>
                      </div>
                      <Bar value={h.probability} tone={h.probability > 0.6 ? "crit" : "warn"} />
                    </div>
                  ))
                )}
              </div>

              <div>
                <div className="label-xs mb-1">Last update</div>
                <div className="mono-num text-muted-foreground">
                  {sync.sourceTimestamp ? new Date(sync.sourceTimestamp).toISOString().slice(11, 23) : "—"} UTC
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* BOTTOM — trends, reasoning, sync, validation */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Component telemetry trend"
          subtitle={selected ? `Channels mapped to ${selected.name}` : "Select a component"}
        >
          {selected && trendChannels.length ? (
            <TrendChart
              data={trendData}
              height={200}
              series={trendChannels.map((ch, i) => ({
                key: ch,
                label: SENSOR_MAP[ch].label,
                color: `var(--color-chart-${(i % 5) + 1})`,
              }))}
            />
          ) : (
            <p className="p-4 text-xs text-muted-foreground">
              No mapped channel to plot for the current selection.
            </p>
          )}
        </Panel>

        <Panel title="Reasoning path" subtitle="Sensor → feature → component → subsystem → engine → mission">
          {selected ? (
            <ol className="space-y-1.5 text-xs">
              {reasoningPath(twinState, selected.id).map((step) => (
                <li key={step.layer} className="rounded border border-border bg-surface px-2.5 py-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="label-xs">{step.layer}</span>
                    <span className="mono-num">{step.value}</span>
                  </div>
                  <div className="text-muted-foreground">{step.detail}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-4 text-xs text-muted-foreground">
              Select a component to trace its conclusion back to the source data.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Synchronisation monitor" subtitle="Measured, not estimated">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {[
              ["Source", source === "REPLAY" ? "Replay file" : "Simulator"],
              ["Source timestamp", sync.sourceTimestamp ? new Date(sync.sourceTimestamp).toISOString().slice(11, 23) : "—"],
              ["Twin update", sync.twinUpdatedAt ? new Date(sync.twinUpdatedAt).toISOString().slice(11, 23) : "—"],
              ["Processing latency", sync.processingLatencyMs === null ? "—" : `${sync.processingLatencyMs.toFixed(2)} ms`],
              ["Ingest latency", sync.ingestLatencyMs === null ? "—" : `${sync.ingestLatencyMs.toFixed(0)} ms`],
              ["Frames processed", String(sync.framesProcessed)],
              ["Dropped frames", String(sync.droppedFrames)],
              ["Frame gap", sync.gapMs === null ? "—" : `${sync.gapMs} ms`],
              ["Synchronised", twinState.synchronised ? "YES" : "NO"],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-border bg-surface p-2">
                <div className="label-xs">{k}</div>
                <div className="mono-num">{v}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="3D twin configuration validation" subtitle="Coverage of the declared model package">
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-border bg-surface p-2">
                <div className="label-xs">Engine model</div>
                <div className="mono-num">{profile.engineId}</div>
              </div>
              <div className="rounded border border-border bg-surface p-2">
                <div className="label-xs">3D asset</div>
                <div className="mono-num">{profile.asset3d.url ?? "none supplied"}</div>
              </div>
              <div className="rounded border border-border bg-surface p-2">
                <div className="label-xs">Component mapping</div>
                <div className="mono-num">{coverage.coveragePct}% complete</div>
              </div>
              <div className="rounded border border-border bg-surface p-2">
                <div className="label-xs">Unmapped 3D components</div>
                <div className="mono-num">{coverage.unmappedComponents.length}</div>
              </div>
            </div>
            <Bar value={coverage.coveragePct / 100} tone={coverage.coveragePct > 80 ? "ok" : "warn"} />
            <p className="text-muted-foreground">
              Unmapped telemetry channels: {coverage.unmappedChannels.length}
              {coverage.unmappedComponents.length > 0 && (
                <>
                  {" "}
                  · Unmapped components:{" "}
                  {coverage.unmappedComponents.map((c) => c.id).join(", ")}
                </>
              )}
            </p>
            <p className="text-muted-foreground">{profile.asset3d.note}</p>
          </div>
        </Panel>
      </div>

      <Panel title="Event timeline" subtitle="Non-nominal frames in the retained window" bodyClassName="p-0">
        {events.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No non-nominal frame in the retained window.</p>
        ) : (
          <ul className="divide-y divide-border text-xs">
            {events.map((e) => (
              <li key={e.seq} className="flex items-center gap-3 px-4 py-2">
                <span className="mono-num text-muted-foreground">
                  {new Date(e.t).toISOString().slice(11, 19)}
                </span>
                <StatusPill tone={e.status === "CRITICAL" ? "crit" : "warn"}>{e.status}</StatusPill>
                <span className="truncate text-muted-foreground">{e.recommendation}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <PrototypeNotice>
        The 3D representation is a generic approximate layout built from the declared component
        hierarchy — no vendor CAD geometry has been supplied. Component states are computed from
        simulated or replayed telemetry and have not been validated against a physical engine.
      </PrototypeNotice>
    </div>
  );
}
