/**
 * Twin State Engine.
 *
 * The single place where a processed telemetry frame becomes the engineering
 * state of a specific engine asset and its components.
 *
 *   PipelineResult  +  EngineProfile   →   TwinState
 *
 * The 3D scene, the component tree, the inspection panel and the reasoning
 * graph all subscribe to this output. None of them computes engineering values
 * themselves and none of them may hardcode a visual state.
 */

import type { SensorId } from "@/lib/config/registry";
import type { PipelineResult } from "@/lib/pipeline/types";
import {
  sensorsForComponent,
  type ComponentId,
  type ComponentNode,
  type EngineProfile,
} from "@/lib/engine/profile";

export type ComponentStatus =
  | "NORMAL"
  | "MONITOR"
  | "WARNING"
  | "DEGRADED"
  | "CRITICAL"
  | "FAULT"
  | "UNKNOWN"
  | "NO_DATA";

export interface ComponentContribution {
  tag: string;
  channel: SensorId;
  weight: number;
  value: number | null;
  expected: number | null;
  residual: number | null;
  normResidual: number | null;
  quality: number;
  usable: boolean;
}

export interface ComponentState {
  id: ComponentId;
  name: string;
  subsystem: ComponentNode["subsystem"];
  status: ComponentStatus;
  /** 0..100 or null when there is no evidence. */
  health: number | null;
  /** 0..1 confidence in the health figure. */
  confidence: number;
  /** Largest normalised residual among contributing channels. */
  peakDeviation: number | null;
  contributions: ComponentContribution[];
  /** Fault hypotheses implicating this component. */
  faultHypotheses: { id: string; label: string; probability: number; weight: number }[];
  /** Plain-language reason for the current status. */
  reason: string;
  /** True when the state was rolled up from children rather than measured. */
  derived: boolean;
}

export interface SyncState {
  /** Timestamp stamped by the data source. */
  sourceTimestamp: number | null;
  /** Wall-clock ms at which the pipeline produced the state. */
  twinUpdatedAt: number | null;
  /** Measured processing time of the pipeline for this frame. */
  processingLatencyMs: number | null;
  /** Ingest latency reported by the adapter. */
  ingestLatencyMs: number | null;
  framesProcessed: number;
  /** Frames whose sequence numbers were skipped. */
  droppedFrames: number;
  /** Gap to the previous frame in ms. */
  gapMs: number | null;
  stale: boolean;
}

export interface TwinState {
  engineId: string;
  profileVersion: string;
  sourceType: string;
  isRealEngineData: boolean;
  synchronised: boolean;
  operatingState: string;
  engineHealth: number | null;
  engineStatus: string;
  dataQuality: number | null;
  twinConfidence: number | null;
  missionRisk: number | null;
  missionRiskLevel: string | null;
  rul: PipelineResult["rul"] | null;
  components: Record<ComponentId, ComponentState>;
  sync: SyncState;
  /** Null when no valid frame has been processed yet. */
  frame: PipelineResult | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Deviation (in σ) → severity 0..1. 1σ is noise; 4σ is unambiguous. */
function severityOf(dev: number): number {
  return clamp01((dev - 1) / 3);
}

function statusFromScore(score: number, faultProb: number, confidence: number): ComponentStatus {
  if (faultProb >= 0.6 && confidence >= 0.4) return "FAULT";
  if (score >= 92) return "NORMAL";
  if (score >= 82) return "MONITOR";
  if (score >= 68) return "WARNING";
  if (score >= 50) return "DEGRADED";
  return "CRITICAL";
}

export const COMPONENT_STATUS_TONE: Record<ComponentStatus, "ok" | "warn" | "crit" | "info" | "neutral"> = {
  NORMAL: "ok",
  MONITOR: "info",
  WARNING: "warn",
  DEGRADED: "warn",
  CRITICAL: "crit",
  FAULT: "crit",
  UNKNOWN: "neutral",
  NO_DATA: "neutral",
};

/** Hex colours consumed by the 3D scene. Derived from status only. */
export const COMPONENT_STATUS_COLOR: Record<ComponentStatus, string> = {
  NORMAL: "#3f8f5f",
  MONITOR: "#2f6fb5",
  WARNING: "#d18a19",
  DEGRADED: "#d1631b",
  CRITICAL: "#c0392b",
  FAULT: "#8e1f16",
  UNKNOWN: "#9aa3ad",
  NO_DATA: "#c3c9cf",
};

export interface TwinStateInput {
  profile: EngineProfile;
  result: PipelineResult | null;
  previous?: TwinState | null;
  framesProcessed: number;
  /** Wall-clock ms considered "now" for staleness evaluation. */
  now: number;
}

/** Empty twin state — used before any valid frame exists. Never fabricated. */
export function emptyTwinState(profile: EngineProfile): TwinState {
  const components: Record<ComponentId, ComponentState> = {};
  for (const c of profile.components) {
    components[c.id] = {
      id: c.id,
      name: c.name,
      subsystem: c.subsystem,
      status: "NO_DATA",
      health: null,
      confidence: 0,
      peakDeviation: null,
      contributions: [],
      faultHypotheses: [],
      reason: "No valid telemetry has been processed for this engine.",
      derived: false,
    };
  }
  return {
    engineId: profile.engineId,
    profileVersion: profile.twinModelVersion,
    sourceType: "NONE",
    isRealEngineData: false,
    synchronised: false,
    operatingState: "UNKNOWN",
    engineHealth: null,
    engineStatus: "NOT EVALUATED",
    dataQuality: null,
    twinConfidence: null,
    missionRisk: null,
    missionRiskLevel: null,
    rul: null,
    components,
    sync: {
      sourceTimestamp: null,
      twinUpdatedAt: null,
      processingLatencyMs: null,
      ingestLatencyMs: null,
      framesProcessed: 0,
      droppedFrames: 0,
      gapMs: null,
      stale: true,
    },
    frame: null,
  };
}

export function computeTwinState(input: TwinStateInput): TwinState {
  const { profile, result, previous, framesProcessed, now } = input;
  if (!result) return emptyTwinState(profile);

  const faultProbs = result.faultProbs.filter((f) => f.id !== "none" && f.supported);
  const components: Record<ComponentId, ComponentState> = {};

  /* --- Leaf/measured states -------------------------------------- */
  for (const c of profile.components) {
    const mapped = sensorsForComponent(profile, c.id);
    const contributions: ComponentContribution[] = mapped.map(({ sensor, weight }) => {
      const reading = result.readings[sensor.channel];
      const twin = result.twin[sensor.channel];
      const usable = !!reading && reading.status !== "UNAVAILABLE" && reading.value !== null;
      return {
        tag: sensor.tag,
        channel: sensor.channel,
        weight,
        value: reading?.value ?? null,
        expected: twin?.comparable ? twin.expected : null,
        residual: twin?.comparable ? twin.residual : null,
        normResidual: twin?.comparable ? twin.normResidual : null,
        quality: reading?.quality ?? 0,
        usable: usable && !!twin?.comparable,
      };
    });

    const hypotheses = (profile.faultComponents[c.id as never] ? [] : [])
      .concat([]) as ComponentState["faultHypotheses"];

    for (const f of faultProbs) {
      const targets = profile.faultComponents[f.id] ?? [];
      const t = targets.find((x) => x.componentId === c.id);
      if (t) {
        hypotheses.push({
          id: f.id,
          label: f.id.replace(/_/g, " "),
          probability: f.p,
          weight: t.weight,
        });
      }
    }
    hypotheses.sort((a, b) => b.probability * b.weight - a.probability * a.weight);

    const usable = contributions.filter((x) => x.usable);
    if (!contributions.length) {
      components[c.id] = {
        id: c.id,
        name: c.name,
        subsystem: c.subsystem,
        status: "UNKNOWN",
        health: null,
        confidence: 0,
        peakDeviation: null,
        contributions,
        faultHypotheses: hypotheses,
        reason: "No sensor is mapped to this component. State is rolled up or unknown.",
        derived: true,
      };
      continue;
    }
    if (!usable.length) {
      components[c.id] = {
        id: c.id,
        name: c.name,
        subsystem: c.subsystem,
        status: "NO_DATA",
        health: null,
        confidence: 0,
        peakDeviation: null,
        contributions,
        faultHypotheses: hypotheses,
        reason: "Every mapped channel is unavailable or failed validation. State not evaluated.",
        derived: false,
      };
      continue;
    }

    let wsum = 0;
    let sev = 0;
    let peak = 0;
    let quality = 0;
    for (const x of usable) {
      const dev = Math.abs(x.normResidual ?? 0);
      peak = Math.max(peak, dev);
      sev += severityOf(dev) * x.weight;
      quality += x.quality * x.weight;
      wsum += x.weight;
    }
    sev = wsum ? sev / wsum : 0;
    quality = wsum ? quality / wsum : 0;

    const faultProb = hypotheses.length ? hypotheses[0]!.probability * hypotheses[0]!.weight : 0;
    const score = Math.round(clamp01(1 - sev * 0.9 - faultProb * 0.25) * 100);
    const coverage = usable.length / contributions.length;
    const confidence = clamp01(quality * coverage * (result.twinConfidence || 0.5));
    const status = result.suppressed
      ? "UNKNOWN"
      : statusFromScore(score, faultProb, confidence);

    const top = usable.slice().sort((a, b) => Math.abs(b.normResidual ?? 0) - Math.abs(a.normResidual ?? 0))[0]!;
    const reason = result.suppressed
      ? `Outputs suppressed: ${result.suppressionReason ?? "insufficient data quality"}.`
      : peak < 1
        ? `All ${usable.length} mapped channel(s) within 1σ of twin expectation.`
        : `${top.tag} deviates ${(top.normResidual ?? 0).toFixed(2)}σ from twin expectation` +
          (faultProb > 0.15 ? `; consistent with ${hypotheses[0]!.label}.` : ".");

    components[c.id] = {
      id: c.id,
      name: c.name,
      subsystem: c.subsystem,
      status,
      health: result.suppressed ? null : score,
      confidence,
      peakDeviation: peak,
      contributions,
      faultHypotheses: hypotheses,
      reason,
      derived: false,
    };
  }

  /* --- Roll-up for components without their own sensors ----------- */
  const childrenOf = new Map<ComponentId, ComponentId[]>();
  for (const c of profile.components) {
    if (c.parent) {
      childrenOf.set(c.parent, [...(childrenOf.get(c.parent) ?? []), c.id]);
    }
  }
  const ORDER: ComponentStatus[] = [
    "NORMAL",
    "MONITOR",
    "WARNING",
    "DEGRADED",
    "CRITICAL",
    "FAULT",
  ];
  const rollUp = (id: ComponentId): ComponentState => {
    const self = components[id]!;
    const kids = (childrenOf.get(id) ?? []).map(rollUp);
    if (!self.derived || !kids.length) return self;
    const evaluated = kids.filter((k) => k.health !== null);
    if (!evaluated.length) {
      return { ...self, status: kids.some((k) => k.status === "NO_DATA") ? "NO_DATA" : "UNKNOWN" };
    }
    const health = Math.round(
      evaluated.reduce((a, k) => a + (k.health ?? 100), 0) / evaluated.length,
    );
    const worst = evaluated.reduce(
      (w, k) => (ORDER.indexOf(k.status) > ORDER.indexOf(w) ? k.status : w),
      "NORMAL" as ComponentStatus,
    );
    const rolled: ComponentState = {
      ...self,
      status: worst,
      health,
      confidence: evaluated.reduce((a, k) => a + k.confidence, 0) / evaluated.length,
      peakDeviation: Math.max(...evaluated.map((k) => k.peakDeviation ?? 0)),
      reason: `Rolled up from ${evaluated.length} child component(s); worst child state ${worst}.`,
      faultHypotheses: self.faultHypotheses,
      derived: true,
    };
    components[id] = rolled;
    return rolled;
  };
  const root = profile.components.find((c) => c.parent === null);
  if (root) rollUp(root.id);

  /* --- Synchronisation metrics (measured, never invented) --------- */
  const prevSync = previous?.sync;
  const prevSeq = previous?.frame?.seq ?? null;
  const dropped =
    prevSeq !== null && result.seq > prevSeq + 1
      ? (prevSync?.droppedFrames ?? 0) + (result.seq - prevSeq - 1)
      : (prevSync?.droppedFrames ?? 0);

  const sync: SyncState = {
    sourceTimestamp: result.t,
    twinUpdatedAt: now,
    processingLatencyMs: result.totalLatencyMs,
    ingestLatencyMs: result.frame.ingestLatencyMs,
    framesProcessed,
    droppedFrames: dropped,
    gapMs: previous?.frame ? result.t - previous.frame.t : null,
    stale: false,
  };

  return {
    engineId: profile.engineId,
    profileVersion: profile.twinModelVersion,
    sourceType: result.sourceType,
    isRealEngineData: result.frame.provenance.isRealEngineData,
    synchronised: true,
    operatingState: result.state,
    engineHealth: result.suppressed ? null : result.healthIndex,
    engineStatus: result.status,
    dataQuality: result.dataQuality,
    twinConfidence: result.twinConfidence,
    missionRisk: result.suppressed ? null : result.missionRisk,
    missionRiskLevel: result.suppressed ? null : result.missionRiskLevel,
    rul: result.rul,
    components,
    sync,
    frame: result,
  };
}

/**
 * Reasoning path for a component: sensor → feature → component → subsystem →
 * engine → mission. Used by the evidence panel and the trace view.
 */
export function reasoningPath(state: TwinState, componentId: ComponentId) {
  const c = state.components[componentId];
  if (!c) return [];
  const top = c.contributions
    .filter((x) => x.usable)
    .sort((a, b) => Math.abs(b.normResidual ?? 0) - Math.abs(a.normResidual ?? 0))[0];
  return [
    {
      layer: "Source",
      value: state.sourceType,
      detail: state.isRealEngineData ? "Real engine data" : "Not real engine data",
    },
    {
      layer: "Sensor",
      value: top?.tag ?? "—",
      detail: top ? `${top.value?.toFixed(2)} (quality ${(top.quality * 100).toFixed(0)}%)` : "No usable channel",
    },
    {
      layer: "Feature",
      value: top?.normResidual !== undefined && top?.normResidual !== null ? `${top.normResidual.toFixed(2)}σ residual` : "—",
      detail: top?.expected !== null && top?.expected !== undefined ? `Expected ${top.expected.toFixed(2)}` : "Twin comparison unavailable",
    },
    { layer: "Component", value: c.name, detail: `${c.status} · health ${c.health ?? "—"}` },
    { layer: "Subsystem", value: c.subsystem, detail: c.reason },
    {
      layer: "Engine",
      value: state.engineStatus,
      detail: state.engineHealth === null ? "Health not evaluated" : `Health index ${state.engineHealth.toFixed(1)}`,
    },
    {
      layer: "Mission",
      value: state.missionRiskLevel ?? "NOT AVAILABLE",
      detail: state.missionRisk === null ? "Insufficient evidence" : `Mission Risk Index ${state.missionRisk.toFixed(3)}`,
    },
  ];
}
