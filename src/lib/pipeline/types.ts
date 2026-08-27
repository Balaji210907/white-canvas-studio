import type {
  EngineFaultId,
  OperatingState,
  SensorId,
  Subsystem,
} from "@/lib/config/registry";
import type { SourceType, TelemetryFrame } from "@/lib/telemetry/frame";
import type { SubmodelResult } from "@/lib/twin/model";
import type { GroundTruth } from "@/lib/sim/simulator";

export type Provenance = "measured" | "calculated" | "model" | "simulated";

export type EngineStatus =
  | "NORMAL"
  | "WARNING"
  | "DEGRADED"
  | "CRITICAL"
  | "SENSOR_FAULT"
  | "INSUFFICIENT_DATA";

export type MissionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Reading {
  value: number | null;
  raw: number | null;
  quality: number;
  flags: string[];
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  confidence: number;
}

export interface TwinPoint {
  expected: number;
  residual: number;
  normResidual: number;
  /** False when the channel could not be compared (missing / not predicted). */
  comparable: boolean;
}

export interface ComponentHealth {
  subsystem: Subsystem;
  name: string;
  /** 0..100, or null when evidence is insufficient. */
  score: number | null;
  confidence: number;
  reason: string;
  channels: SensorId[];
}

export interface DegradationEstimate {
  /** Health-index change per hour, or null when history is too short. */
  ratePerHour: number | null;
  windowFrames: number;
  sufficient: boolean;
  note: string;
}

export interface RulEstimate {
  /** Always null in this build — no validated run-to-failure data exists. */
  hours: number | null;
  available: boolean;
  reason: string;
  requiredFrames: number;
  availableFrames: number;
}

export interface StageTrace {
  id: string;
  name: string;
  status: "OK" | "DEGRADED" | "SUPPRESSED" | "SKIPPED";
  detail: string;
  durationMs: number;
  /** Inputs the stage consumed, for the trace view. */
  inputs: string[];
}

export interface Evidence {
  label: string;
  weight: number;
  provenance: Provenance;
}

export interface PipelineResult {
  /* Canonical identity */
  t: number;
  seq: number;
  frame: TelemetryFrame;
  sourceType: SourceType;
  configurationVersion: string;

  /* Stage outputs */
  state: OperatingState;
  throttle: number;
  thermalState: number;
  readings: Record<SensorId, Reading>;
  twin: Record<SensorId, TwinPoint>;
  twinConfidence: number;
  twinSubmodels: SubmodelResult[];
  twinCalibrationVersion: string;
  twinExtrapolating: boolean;
  dataQuality: number;
  anomalyScore: number;
  anomalyConfidence: number;
  healthIndex: number;
  healthBand: number;
  componentHealth: ComponentHealth[];
  degradation: DegradationEstimate;
  rul: RulEstimate;
  faultProbs: { id: EngineFaultId; p: number; supported: boolean }[];
  sensorSuspicion: { id: SensorId; p: number }[];
  missionRisk: number;
  missionRiskLevel: MissionRiskLevel;
  status: EngineStatus;
  evidence: Evidence[];
  recommendation: string;

  /** Present only for simulated/replay sources. Never for real engine data. */
  groundTruth: GroundTruth | null;

  /* Observability */
  stages: StageTrace[];
  /** True when outputs were suppressed because evidence was too weak. */
  suppressed: boolean;
  suppressionReason: string | null;
  totalLatencyMs: number;
}

export interface AlertRecord {
  id: string;
  t: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: "ENGINE" | "SENSOR" | "DATA" | "TWIN";
  title: string;
  detail: string;
}
