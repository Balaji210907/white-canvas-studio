/**
 * AERO-TWIN AI — Engineering Configuration Registry.
 *
 * Single source of truth for every engineering constant in the system.
 * Nothing in this file may be duplicated inside React components or services.
 *
 * Each constant carries: name, value, unit, description, source, validity range.
 * The whole registry is versioned; every downstream result records
 * `configuration_version` so a result can be reproduced later.
 */

export const CONFIGURATION_VERSION = "cfg-2026.08.27-1";

export interface EngineeringConstant {
  name: string;
  value: number;
  unit: string;
  description: string;
  /** Where the value comes from. No value may be sourced as "guess". */
  source: "PROTOTYPE_TUNING" | "PHYSICAL_LIMIT" | "DATASHEET" | "CALIBRATION";
  validFrom: number;
  validTo: number;
}

function k(
  name: string,
  value: number,
  unit: string,
  description: string,
  source: EngineeringConstant["source"],
  validFrom: number,
  validTo: number,
): EngineeringConstant {
  return { name, value, unit, description, source, validFrom, validTo };
}

/* ------------------------------------------------------------------ */
/* Sensor / channel definitions                                        */
/* ------------------------------------------------------------------ */

export type SensorId =
  | "rpm"
  | "engTemp"
  | "oilTemp"
  | "oilPress"
  | "map"
  | "vib"
  | "ambTemp"
  | "ambPress";

export type Subsystem =
  | "MECHANICAL"
  | "THERMAL"
  | "LUBRICATION"
  | "INDUCTION"
  | "INSTRUMENTATION";

export interface SensorSpec {
  id: SensorId;
  label: string;
  unit: string;
  /** Physically valid range — outside this the reading is INVALID. */
  min: number;
  max: number;
  /** Physically plausible change per second. */
  maxRate: number;
  sampleHz: number;
  precision: number;
  bus: string;
  subsystem: Subsystem;
  /** 1σ residual scale used to normalise twin residuals. */
  residualScale: number;
  /** Frames after which a value is considered STALE. */
  staleAfterMs: number;
}

export const SENSOR_SPECS: SensorSpec[] = [
  { id: "rpm", label: "Engine Speed", unit: "rpm", min: 0, max: 7000, maxRate: 2500, sampleHz: 50, precision: 0, bus: "CAN-A", subsystem: "MECHANICAL", residualScale: 140, staleAfterMs: 3000 },
  { id: "engTemp", label: "Cylinder Head Temp", unit: "°C", min: -40, max: 300, maxRate: 12, sampleHz: 10, precision: 1, bus: "CAN-A", subsystem: "THERMAL", residualScale: 6, staleAfterMs: 5000 },
  { id: "oilTemp", label: "Oil Temperature", unit: "°C", min: -40, max: 200, maxRate: 6, sampleHz: 5, precision: 1, bus: "CAN-B", subsystem: "LUBRICATION", residualScale: 4.5, staleAfterMs: 6000 },
  { id: "oilPress", label: "Oil Pressure", unit: "bar", min: 0, max: 10, maxRate: 3, sampleHz: 20, precision: 2, bus: "CAN-B", subsystem: "LUBRICATION", residualScale: 0.28, staleAfterMs: 3000 },
  { id: "map", label: "Manifold Pressure", unit: "kPa", min: 10, max: 130, maxRate: 60, sampleHz: 50, precision: 1, bus: "CAN-A", subsystem: "INDUCTION", residualScale: 4, staleAfterMs: 3000 },
  { id: "vib", label: "Vibration RMS", unit: "g", min: 0, max: 12, maxRate: 5, sampleHz: 200, precision: 2, bus: "DAQ-1", subsystem: "MECHANICAL", residualScale: 0.28, staleAfterMs: 2000 },
  { id: "ambTemp", label: "Ambient Temperature", unit: "°C", min: -60, max: 60, maxRate: 2, sampleHz: 1, precision: 1, bus: "AIR-DATA", subsystem: "INSTRUMENTATION", residualScale: 1.2, staleAfterMs: 10000 },
  { id: "ambPress", label: "Ambient Pressure", unit: "kPa", min: 20, max: 105, maxRate: 5, sampleHz: 1, precision: 1, bus: "AIR-DATA", subsystem: "INSTRUMENTATION", residualScale: 1.2, staleAfterMs: 10000 },
];

export const SENSOR_MAP: Record<SensorId, SensorSpec> = Object.fromEntries(
  SENSOR_SPECS.map((s) => [s.id, s]),
) as Record<SensorId, SensorSpec>;

/** Channels that describe the environment rather than engine condition. */
export const ENVIRONMENT_CHANNELS: SensorId[] = ["ambTemp", "ambPress"];

/* ------------------------------------------------------------------ */
/* Digital-twin calibration set (versioned, replaceable by test data)  */
/* ------------------------------------------------------------------ */

export interface TwinCalibration {
  id: string;
  version: string;
  /** Dataset the coefficients were fitted against. */
  dataset: string;
  calibratedAt: string;
  /** 0..1 — how much validated data backs these coefficients. */
  calibrationQuality: number;
  notes: string;
  coefficients: {
    idleRpm: EngineeringConstant;
    rpmPerThrottle: EngineeringConstant;
    mapIntakeGain: EngineeringConstant;
    mapRamGain: EngineeringConstant;
    chtRiseBase: EngineeringConstant;
    chtRiseLoad: EngineeringConstant;
    oilRiseBase: EngineeringConstant;
    oilRiseLoad: EngineeringConstant;
    oilPressBase: EngineeringConstant;
    oilPressPerRpm: EngineeringConstant;
    oilPressThermalLoss: EngineeringConstant;
    vibBase: EngineeringConstant;
    vibLoadGain: EngineeringConstant;
    vibResonanceRpm: EngineeringConstant;
  };
}

export const TWIN_CALIBRATION: TwinCalibration = {
  id: "twin-piston-male-uav",
  version: "twin-1.2.0",
  dataset: "SYNTHETIC — no test-rig data ingested yet",
  calibratedAt: "2026-08-27T00:00:00Z",
  calibrationQuality: 0.35,
  notes:
    "Prototype coefficients fitted against the synthetic generator only. NOT validated against a physical engine. Replace via a calibration run once test-rig data exists.",
  coefficients: {
    idleRpm: k("idleRpm", 1200, "rpm", "Expected crank speed at closed throttle", "PROTOTYPE_TUNING", 600, 2000),
    rpmPerThrottle: k("rpmPerThrottle", 4500, "rpm", "Speed span from closed to full throttle", "PROTOTYPE_TUNING", 2000, 6000),
    mapIntakeGain: k("mapIntakeGain", 1.02, "-", "Fraction of ambient recovered in the manifold at full throttle", "PROTOTYPE_TUNING", 0.8, 1.1),
    mapRamGain: k("mapRamGain", 22, "kPa", "Additional manifold pressure from induction at full throttle", "PROTOTYPE_TUNING", 5, 40),
    chtRiseBase: k("chtRiseBase", 55, "°C", "Cylinder-head rise over ambient at zero load, fully warm", "PROTOTYPE_TUNING", 20, 90),
    chtRiseLoad: k("chtRiseLoad", 165, "°C", "Additional cylinder-head rise at unity load", "PROTOTYPE_TUNING", 80, 240),
    oilRiseBase: k("oilRiseBase", 35, "°C", "Oil temperature rise over ambient at zero load", "PROTOTYPE_TUNING", 10, 60),
    oilRiseLoad: k("oilRiseLoad", 85, "°C", "Additional oil temperature rise at unity load", "PROTOTYPE_TUNING", 40, 140),
    oilPressBase: k("oilPressBase", 1.1, "bar", "Oil gallery pressure at idle, warm oil", "PROTOTYPE_TUNING", 0.4, 2.5),
    oilPressPerRpm: k("oilPressPerRpm", 3.6, "bar", "Pump pressure gain from idle to redline", "PROTOTYPE_TUNING", 1, 6),
    oilPressThermalLoss: k("oilPressThermalLoss", 0.006, "bar/°C", "Pressure lost per °C of oil above 90 °C (viscosity)", "PROTOTYPE_TUNING", 0.001, 0.02),
    vibBase: k("vibBase", 0.35, "g", "Baseline broadband vibration at idle", "PROTOTYPE_TUNING", 0.1, 1),
    vibLoadGain: k("vibLoadGain", 1.5, "g", "Vibration growth at unity load", "PROTOTYPE_TUNING", 0.5, 3),
    vibResonanceRpm: k("vibResonanceRpm", 3400, "rpm", "Speed of minimum structural excitation", "PROTOTYPE_TUNING", 2000, 5000),
  },
};

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

export const THRESHOLDS = {
  dataQuality: {
    degraded: k("dq.degraded", 0.85, "-", "Frame data quality below this is DEGRADED", "PROTOTYPE_TUNING", 0.5, 1),
    invalid: k("dq.invalid", 0.4, "-", "Below this, engineering outputs are suppressed", "PROTOTYPE_TUNING", 0.1, 0.7),
  },
  sensorHealth: {
    degraded: k("sh.degraded", 0.55, "-", "Channel quality below this is DEGRADED", "PROTOTYPE_TUNING", 0.2, 0.9),
    suspicion: k("sh.suspicion", 0.55, "-", "Isolation score above this suspects a sensor fault", "PROTOTYPE_TUNING", 0.3, 0.9),
  },
  anomaly: {
    warning: k("an.warning", 0.22, "-", "Fused normalised residual score raising a WARNING", "PROTOTYPE_TUNING", 0.1, 0.5),
    critical: k("an.critical", 0.55, "-", "Score at which engine cause outweighs sensor cause", "PROTOTYPE_TUNING", 0.3, 0.9),
  },
  health: {
    degraded: k("hi.degraded", 68, "/100", "Health index below this is DEGRADED", "PROTOTYPE_TUNING", 40, 90),
    critical: k("hi.critical", 45, "/100", "Health index below this is CRITICAL", "PROTOTYPE_TUNING", 20, 70),
    rulFloor: k("hi.rulFloor", 50, "/100", "Health index used as the RUL end-of-life target", "PROTOTYPE_TUNING", 20, 80),
  },
  missionRisk: {
    medium: k("mr.medium", 0.24, "-", "Mission Risk Index boundary LOW→MEDIUM", "PROTOTYPE_TUNING", 0.1, 0.4),
    high: k("mr.high", 0.48, "-", "Mission Risk Index boundary MEDIUM→HIGH", "PROTOTYPE_TUNING", 0.3, 0.7),
    critical: k("mr.critical", 0.72, "-", "Mission Risk Index boundary HIGH→CRITICAL", "PROTOTYPE_TUNING", 0.5, 0.95),
  },
  degradation: {
    /** Below this many frames, degradation slope is not reported. */
    minimumHistoryFrames: k("dg.minFrames", 90, "frames", "Minimum history before a degradation slope is meaningful", "PROTOTYPE_TUNING", 30, 600),
  },
  rul: {
    /** Frames of validated degradation history required before RUL is emitted at all. */
    minimumValidatedFrames: k("rul.minFrames", 100000, "frames", "Validated run-to-failure history required before RUL may be reported. Deliberately unreachable with synthetic data.", "PROTOTYPE_TUNING", 1000, 1e9),
  },
} as const;

/** Minimum number of available channels before diagnosis is allowed. */
export const MIN_CHANNELS_FOR_DIAGNOSIS = 4;

/* ------------------------------------------------------------------ */
/* Fault catalogue (configuration, not UI code)                        */
/* ------------------------------------------------------------------ */

export type EngineFaultId =
  | "none"
  | "oil_degradation"
  | "cooling_loss"
  | "bearing_wear"
  | "mixture_lean"
  | "ignition_misfire"
  | "intake_leak";

export interface FaultDefinition {
  id: EngineFaultId;
  label: string;
  description: string;
  subsystem: Subsystem | "NONE";
  /**
   * Residual signature: weight applied to each channel's *signed* normalised
   * residual. Positive weight = the fault raises the channel above expectation.
   */
  signature: Partial<Record<SensorId, number>>;
  /** Channels that must be usable before this hypothesis may be scored. */
  requires: SensorId[];
}

export const FAULT_CATALOGUE: FaultDefinition[] = [
  { id: "none", label: "No engine fault", description: "Nominal mechanical condition.", subsystem: "NONE", signature: {}, requires: [] },
  {
    id: "oil_degradation",
    label: "Oil system degradation",
    description: "Reduced oil pressure and elevated oil temperature.",
    subsystem: "LUBRICATION",
    signature: { oilPress: -0.55, oilTemp: 0.35, vib: 0.1 },
    requires: ["oilPress", "oilTemp"],
  },
  {
    id: "cooling_loss",
    label: "Cooling efficiency loss",
    description: "Cylinder head temperature rises above twin expectation.",
    subsystem: "THERMAL",
    signature: { engTemp: 0.7, oilTemp: 0.3 },
    requires: ["engTemp"],
  },
  {
    id: "bearing_wear",
    label: "Bearing / mechanical degradation",
    description: "Broadband vibration growth with slight friction heating.",
    subsystem: "MECHANICAL",
    signature: { vib: 0.7, oilTemp: 0.2, rpm: -0.1 },
    requires: ["vib"],
  },
  {
    id: "mixture_lean",
    label: "Lean mixture",
    description: "High CHT with reduced manifold pressure at a given load.",
    subsystem: "INDUCTION",
    signature: { engTemp: 0.5, map: -0.35, rpm: -0.15 },
    requires: ["engTemp", "map"],
  },
  {
    id: "ignition_misfire",
    label: "Ignition misfire",
    description: "RPM instability and vibration harmonics.",
    subsystem: "MECHANICAL",
    signature: { rpm: -0.5, vib: 0.4, engTemp: -0.1 },
    requires: ["rpm", "vib"],
  },
  {
    id: "intake_leak",
    label: "Intake leak",
    description: "Manifold pressure deviation and unstable idle.",
    subsystem: "INDUCTION",
    signature: { map: -0.6, rpm: -0.25, engTemp: 0.15 },
    requires: ["map"],
  },
];

export const FAULT_MAP: Record<EngineFaultId, FaultDefinition> = Object.fromEntries(
  FAULT_CATALOGUE.map((f) => [f.id, f]),
) as Record<EngineFaultId, FaultDefinition>;

export type SensorFaultId = "none" | "stuck" | "bias" | "noise" | "dropout" | "spike";

export const SENSOR_FAULTS: { id: SensorFaultId; label: string }[] = [
  { id: "none", label: "No sensor fault" },
  { id: "stuck", label: "Stuck / constant value" },
  { id: "bias", label: "Calibration bias" },
  { id: "noise", label: "Excessive noise" },
  { id: "dropout", label: "Intermittent dropout" },
  { id: "spike", label: "Impossible spike" },
];

/* ------------------------------------------------------------------ */
/* Operating-state programme (used by the simulator only)              */
/* ------------------------------------------------------------------ */

export type OperatingState =
  | "STARTING"
  | "IDLE"
  | "ACCELERATION"
  | "STEADY_STATE"
  | "HIGH_LOAD"
  | "DECELERATION"
  | "SHUTDOWN"
  | "UNKNOWN";

export const STATE_SEQUENCE: { state: OperatingState; seconds: number; throttle: number }[] = [
  { state: "STARTING", seconds: 8, throttle: 0.15 },
  { state: "IDLE", seconds: 20, throttle: 0.12 },
  { state: "ACCELERATION", seconds: 14, throttle: 0.72 },
  { state: "STEADY_STATE", seconds: 60, throttle: 0.6 },
  { state: "HIGH_LOAD", seconds: 34, throttle: 0.92 },
  { state: "STEADY_STATE", seconds: 45, throttle: 0.58 },
  { state: "DECELERATION", seconds: 14, throttle: 0.2 },
  { state: "IDLE", seconds: 18, throttle: 0.12 },
];

/** Flat list for the Settings / Configuration pages. */
export function listConstants(): EngineeringConstant[] {
  const out: EngineeringConstant[] = [];
  for (const c of Object.values(TWIN_CALIBRATION.coefficients)) out.push(c);
  for (const group of Object.values(THRESHOLDS)) {
    for (const c of Object.values(group)) out.push(c as EngineeringConstant);
  }
  return out;
}
