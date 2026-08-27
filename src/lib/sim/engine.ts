/**
 * AERO-TWIN AI — compatibility façade.
 *
 * The monolithic simulator that used to live here has been split into:
 *   - src/lib/config/registry.ts   engineering constants & catalogues
 *   - src/lib/telemetry/frame.ts   canonical TelemetryFrame contract
 *   - src/lib/telemetry/adapters   data-source adapters (sim + hardware stubs)
 *   - src/lib/sim/simulator.ts     the virtual ACTUAL engine (a data source)
 *   - src/lib/twin/model.ts        the physics-informed Digital Twin
 *   - src/lib/pipeline/index.ts    validation → twin → diagnosis → decision
 *
 * This module wires them together and re-exports the shapes the UI consumes.
 * All values remain SIMULATED prototype values — not airworthiness relevant.
 */

import {
  FAULT_CATALOGUE,
  type EngineFaultId,
  type OperatingState,
} from "@/lib/config/registry";
import { EngineSimulator, type FaultInjection } from "@/lib/sim/simulator";
import { SimulatorAdapter } from "@/lib/telemetry/adapters";
import { TelemetryPipeline } from "@/lib/pipeline";
import type { EngineStatus, MissionRiskLevel, PipelineResult } from "@/lib/pipeline/types";

export {
  SENSOR_SPECS,
  SENSOR_MAP,
  SENSOR_FAULTS,
  STATE_SEQUENCE,
  THRESHOLDS,
  CONFIGURATION_VERSION,
  TWIN_CALIBRATION,
  type SensorId,
  type SensorSpec,
  type OperatingState,
  type EngineFaultId,
  type SensorFaultId,
} from "@/lib/config/registry";

export { type FaultInjection } from "@/lib/sim/simulator";
export type {
  Provenance,
  EngineStatus,
  MissionRiskLevel,
  Reading,
  TwinPoint,
  AlertRecord,
  PipelineResult,
} from "@/lib/pipeline/types";

/** The per-frame record consumed across the UI. */
export type Sample = PipelineResult;

/** Fault catalogue in the shape the UI already expects. */
export const ENGINE_FAULTS = FAULT_CATALOGUE.map((f) => ({
  id: f.id,
  label: f.label,
  description: f.description,
}));

/**
 * Composition root for the in-browser prototype:
 * simulator adapter → canonical frame → engineering pipeline.
 */
export class TwinSimulator {
  private sim: EngineSimulator;
  private adapter: SimulatorAdapter;
  private pipeline = new TelemetryPipeline();

  constructor(injection: FaultInjection) {
    this.sim = new EngineSimulator(injection);
    this.adapter = new SimulatorAdapter(this.sim);
  }

  get injection(): FaultInjection {
    return this.sim.injection;
  }
  set injection(f: FaultInjection) {
    this.sim.injection = f;
  }

  /** Ground truth for the last frame — validation and scoring only. */
  get groundTruth() {
    return this.adapter.lastSample?.groundTruth ?? null;
  }

  get seq() {
    return this.sim.seq;
  }

  reset() {
    this.adapter.reset();
    this.pipeline.reset();
  }

  step(dt = 1): Sample {
    const frame = this.adapter.next(dt);
    if (!frame) throw new Error("Telemetry adapter produced no frame");
    const result = this.pipeline.process(frame);
    return { ...result, groundTruth: this.groundTruth };
  }
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export const STATUS_TONE: Record<EngineStatus, "ok" | "warn" | "crit" | "info"> = {
  NORMAL: "ok",
  WARNING: "warn",
  DEGRADED: "warn",
  CRITICAL: "crit",
  SENSOR_FAULT: "warn",
  INSUFFICIENT_DATA: "info",
};

export const RISK_TONE: Record<MissionRiskLevel, "ok" | "warn" | "crit"> = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "warn",
  CRITICAL: "crit",
};

export function labelState(s: OperatingState) {
  return s.replace("_", " ");
}

export function faultLabel(id: EngineFaultId) {
  return FAULT_CATALOGUE.find((f) => f.id === id)?.label ?? id;
}
