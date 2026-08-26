/**
 * AERO-TWIN AI — prototype simulation & analytics core.
 *
 * This module is a self-contained, deterministic-ish engineering simulator that
 * mimics the pipeline described in the system architecture:
 *
 *   sensors -> data validation -> sensor health -> signal processing ->
 *   operating state -> digital twin -> residuals -> AI anomaly/fault ->
 *   fusion -> health index -> mission risk -> decision support
 *
 * IMPORTANT: all numbers produced here are SIMULATED prototype values.
 * They are not certified, validated, or airworthiness-relevant.
 */

export type Provenance = "measured" | "calculated" | "model" | "simulated";

export type OperatingState =
  | "IDLE"
  | "START"
  | "ACCELERATION"
  | "STEADY_STATE"
  | "HIGH_LOAD"
  | "DECELERATION"
  | "SHUTDOWN";

export type EngineStatus =
  | "NORMAL"
  | "WARNING"
  | "DEGRADED"
  | "CRITICAL"
  | "SENSOR_FAULT"
  | "INSUFFICIENT_DATA";

export type MissionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SensorId =
  | "rpm"
  | "engTemp"
  | "oilTemp"
  | "oilPress"
  | "map"
  | "vib"
  | "ambTemp"
  | "ambPress";

export interface SensorSpec {
  id: SensorId;
  label: string;
  unit: string;
  min: number;
  max: number;
  maxRate: number; // physically plausible change per second
  sampleHz: number;
  precision: number;
  bus: string;
}

export const SENSOR_SPECS: SensorSpec[] = [
  { id: "rpm", label: "Engine Speed", unit: "rpm", min: 0, max: 7000, maxRate: 2500, sampleHz: 50, precision: 0, bus: "CAN-A" },
  { id: "engTemp", label: "Cylinder Head Temp", unit: "°C", min: -40, max: 300, maxRate: 12, sampleHz: 10, precision: 1, bus: "CAN-A" },
  { id: "oilTemp", label: "Oil Temperature", unit: "°C", min: -40, max: 200, maxRate: 6, sampleHz: 5, precision: 1, bus: "CAN-B" },
  { id: "oilPress", label: "Oil Pressure", unit: "bar", min: 0, max: 10, maxRate: 3, sampleHz: 20, precision: 2, bus: "CAN-B" },
  { id: "map", label: "Manifold Pressure", unit: "kPa", min: 10, max: 130, maxRate: 60, sampleHz: 50, precision: 1, bus: "CAN-A" },
  { id: "vib", label: "Vibration RMS", unit: "g", min: 0, max: 12, maxRate: 5, sampleHz: 200, precision: 2, bus: "DAQ-1" },
  { id: "ambTemp", label: "Ambient Temperature", unit: "°C", min: -60, max: 60, maxRate: 2, sampleHz: 1, precision: 1, bus: "AIR-DATA" },
  { id: "ambPress", label: "Ambient Pressure", unit: "kPa", min: 20, max: 105, maxRate: 5, sampleHz: 1, precision: 1, bus: "AIR-DATA" },
];

export const SENSOR_MAP: Record<SensorId, SensorSpec> = Object.fromEntries(
  SENSOR_SPECS.map((s) => [s.id, s]),
) as Record<SensorId, SensorSpec>;

/* ------------------------------------------------------------------ */
/* Fault injection                                                     */
/* ------------------------------------------------------------------ */

export type EngineFaultId =
  | "none"
  | "oil_degradation"
  | "cooling_loss"
  | "bearing_wear"
  | "mixture_lean"
  | "ignition_misfire"
  | "intake_leak";

export type SensorFaultId = "none" | "stuck" | "bias" | "noise" | "dropout" | "spike";

export interface FaultInjection {
  engineFault: EngineFaultId;
  engineSeverity: number; // 0..1
  sensorFault: SensorFaultId;
  sensorTarget: SensorId;
  sensorSeverity: number; // 0..1
}

export const ENGINE_FAULTS: { id: EngineFaultId; label: string; description: string }[] = [
  { id: "none", label: "No engine fault", description: "Nominal mechanical condition." },
  { id: "oil_degradation", label: "Oil system degradation", description: "Reduced oil pressure and elevated oil temperature." },
  { id: "cooling_loss", label: "Cooling efficiency loss", description: "Cylinder head temperature rises above twin expectation." },
  { id: "bearing_wear", label: "Bearing wear", description: "Broadband vibration growth with slight friction heating." },
  { id: "mixture_lean", label: "Lean mixture", description: "High CHT with reduced manifold pressure at given load." },
  { id: "ignition_misfire", label: "Ignition misfire", description: "RPM instability and vibration harmonics." },
  { id: "intake_leak", label: "Intake leak", description: "Manifold pressure deviation and unstable idle." },
];

export const SENSOR_FAULTS: { id: SensorFaultId; label: string }[] = [
  { id: "none", label: "No sensor fault" },
  { id: "stuck", label: "Stuck / constant value" },
  { id: "bias", label: "Calibration bias" },
  { id: "noise", label: "Excessive noise" },
  { id: "dropout", label: "Intermittent dropout" },
  { id: "spike", label: "Impossible spike" },
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Reading {
  value: number | null;
  raw: number | null;
  truth: number;
  quality: number; // 0..1
  flags: string[];
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  confidence: number;
}

export interface TwinPoint {
  expected: number;
  residual: number;
  normResidual: number;
}

export interface Sample {
  t: number;
  seq: number;
  state: OperatingState;
  throttle: number;
  readings: Record<SensorId, Reading>;
  twin: Record<SensorId, TwinPoint>;
  twinConfidence: number;
  dataQuality: number;
  anomalyScore: number;
  anomalyConfidence: number;
  healthIndex: number;
  healthBand: number;
  faultProbs: { id: EngineFaultId; p: number }[];
  sensorSuspicion: { id: SensorId; p: number }[];
  missionRisk: number;
  missionRiskLevel: MissionRiskLevel;
  status: EngineStatus;
  evidence: { label: string; weight: number; provenance: Provenance }[];
  recommendation: string;
}

export interface AlertRecord {
  id: string;
  t: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: "ENGINE" | "SENSOR" | "DATA" | "TWIN";
  title: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

let noiseSeed = 42;
function rnd() {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) % 4294967296;
  return noiseSeed / 4294967296;
}
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.7;

export const STATE_SEQUENCE: { state: OperatingState; seconds: number; throttle: number }[] = [
  { state: "START", seconds: 8, throttle: 0.15 },
  { state: "IDLE", seconds: 20, throttle: 0.12 },
  { state: "ACCELERATION", seconds: 14, throttle: 0.72 },
  { state: "STEADY_STATE", seconds: 60, throttle: 0.6 },
  { state: "HIGH_LOAD", seconds: 34, throttle: 0.92 },
  { state: "STEADY_STATE", seconds: 45, throttle: 0.58 },
  { state: "DECELERATION", seconds: 14, throttle: 0.2 },
  { state: "IDLE", seconds: 18, throttle: 0.12 },
];

const CYCLE_SECONDS = STATE_SEQUENCE.reduce((a, s) => a + s.seconds, 0);

export function stateAt(tSec: number): { state: OperatingState; throttle: number } {
  let x = tSec % CYCLE_SECONDS;
  for (const seg of STATE_SEQUENCE) {
    if (x < seg.seconds) return { state: seg.state, throttle: seg.throttle };
    x -= seg.seconds;
  }
  return { state: "IDLE", throttle: 0.12 };
}

/* ------------------------------------------------------------------ */
/* Physics-informed digital twin                                       */
/* ------------------------------------------------------------------ */

export interface TwinInputs {
  throttle: number;
  ambTemp: number;
  ambPress: number;
  thermalState: number; // 0..1 warm-up progress
}

export function twinExpectation(i: TwinInputs): Record<SensorId, number> {
  const rpm = 1200 + i.throttle * 4500;
  const map = 28 + i.throttle * (i.ambPress - 28) * 1.02 + i.throttle * 22;
  const load = (rpm / 5700) * (map / 100);
  const engTemp = i.ambTemp + (55 + load * 165) * i.thermalState;
  const oilTemp = i.ambTemp + (35 + load * 85) * i.thermalState;
  const oilPress = clamp(1.1 + (rpm / 5700) * 3.6 - (oilTemp - 90) * 0.006, 0.4, 7);
  const vib = 0.35 + load * 1.5 + Math.abs(rpm - 3400) / 9000;
  return {
    rpm,
    map: clamp(map, 15, 120),
    engTemp,
    oilTemp,
    oilPress,
    vib,
    ambTemp: i.ambTemp,
    ambPress: i.ambPress,
  };
}

/* residual normalisation scales (prototype tuned) */
const RES_SCALE: Record<SensorId, number> = {
  rpm: 140,
  engTemp: 6,
  oilTemp: 4.5,
  oilPress: 0.28,
  map: 4,
  vib: 0.28,
  ambTemp: 1.2,
  ambPress: 1.2,
};

/* ------------------------------------------------------------------ */
/* Simulator                                                           */
/* ------------------------------------------------------------------ */

export class TwinSimulator {
  seq = 0;
  t0 = Date.now();
  thermal = 0.08;
  private prevTruth: Record<SensorId, number> | null = null;
  private prevOut: Record<SensorId, number | null> | null = null;
  private stuckHold: Partial<Record<SensorId, number>> = {};
  private wear = 0; // slow degradation accumulator

  constructor(public injection: FaultInjection) {}

  reset() {
    this.seq = 0;
    this.t0 = Date.now();
    this.thermal = 0.08;
    this.prevTruth = null;
    this.prevOut = null;
    this.stuckHold = {};
    this.wear = 0;
  }

  step(dt = 1): Sample {
    this.seq += 1;
    const tSec = this.seq * dt;
    const t = this.t0 + tSec * 1000;
    const { state, throttle } = stateAt(tSec);
    this.thermal = clamp(this.thermal + (state === "SHUTDOWN" ? -0.01 : 0.006), 0.08, 1);
    this.wear = clamp(this.wear + 0.00025, 0, 1);

    const ambTemp = 14 + Math.sin(tSec / 240) * 3;
    const ambPress = 88 + Math.cos(tSec / 300) * 4;

    const expected = twinExpectation({ throttle, ambTemp, ambPress, thermalState: this.thermal });

    /* --- ground truth = twin + engine fault effects + natural noise --- */
    const f = this.injection;
    const sev = f.engineFault === "none" ? 0 : f.engineSeverity;
    const truth: Record<SensorId, number> = { ...expected };

    truth.rpm += gauss() * 22;
    truth.map += gauss() * 0.7;
    truth.engTemp += gauss() * 1.1 + this.wear * 4;
    truth.oilTemp += gauss() * 0.8 + this.wear * 3;
    truth.oilPress += gauss() * 0.05 - this.wear * 0.15;
    truth.vib += Math.abs(gauss()) * 0.05 + this.wear * 0.12;
    truth.ambTemp += gauss() * 0.15;
    truth.ambPress += gauss() * 0.15;

    switch (f.engineFault) {
      case "oil_degradation":
        truth.oilPress -= sev * 1.6;
        truth.oilTemp += sev * 17;
        truth.vib += sev * 0.25;
        break;
      case "cooling_loss":
        truth.engTemp += sev * 42;
        truth.oilTemp += sev * 14;
        break;
      case "bearing_wear":
        truth.vib += sev * 2.4;
        truth.oilTemp += sev * 9;
        truth.rpm -= sev * 60;
        break;
      case "mixture_lean":
        truth.engTemp += sev * 30;
        truth.map -= sev * 6;
        truth.rpm -= sev * 90;
        break;
      case "ignition_misfire":
        truth.rpm += Math.sin(tSec * 2.3) * sev * 260;
        truth.vib += Math.abs(Math.sin(tSec * 3.1)) * sev * 1.5;
        truth.engTemp -= sev * 8;
        break;
      case "intake_leak":
        truth.map -= sev * 9;
        truth.rpm -= sev * 130;
        truth.engTemp += sev * 12;
        break;
      default:
        break;
    }

    /* --- sensor layer: acquisition + sensor faults + validation --- */
    const readings = {} as Record<SensorId, Reading>;
    for (const spec of SENSOR_SPECS) {
      const id = spec.id;
      let raw: number | null = truth[id];
      const flags: string[] = [];
      const isTarget = f.sensorFault !== "none" && f.sensorTarget === id;
      const ssev = isTarget ? f.sensorSeverity : 0;

      if (isTarget) {
        switch (f.sensorFault) {
          case "stuck": {
            if (this.stuckHold[id] === undefined) this.stuckHold[id] = truth[id];
            raw = this.stuckHold[id]!;
            break;
          }
          case "bias":
            raw = truth[id] + ssev * (spec.max - spec.min) * 0.12;
            break;
          case "noise":
            raw = truth[id] + gauss() * ssev * (spec.max - spec.min) * 0.07;
            break;
          case "dropout":
            if (rnd() < 0.25 + ssev * 0.5) raw = null;
            break;
          case "spike":
            if (rnd() < 0.18 + ssev * 0.35) raw = spec.max * (0.75 + ssev * 0.3);
            break;
        }
      } else {
        delete this.stuckHold[id];
      }

      /* ---- data validation layer ---- */
      let quality = 1;
      let value = raw;
      if (raw === null) {
        flags.push("MISSING_PACKET");
        quality = 0;
      } else {
        if (raw < spec.min || raw > spec.max) {
          flags.push("RANGE_VIOLATION");
          quality -= 0.6;
        }
        const prev = this.prevTruth?.[id];
        if (prev !== undefined) {
          const rate = Math.abs(raw - prev) / dt;
          if (rate > spec.maxRate) {
            flags.push("RATE_OF_CHANGE_VIOLATION");
            quality -= 0.45;
          }
        }
        const prevOut = this.prevOut?.[id];
        if (prevOut !== null && prevOut !== undefined && Math.abs(prevOut - raw) < 1e-9) {
          flags.push("STUCK_VALUE");
          quality -= 0.35;
        }
        if (isTarget && f.sensorFault === "noise") {
          flags.push("EXCESSIVE_NOISE");
          quality -= 0.3 * ssev;
        }
        value = clamp(raw, spec.min, spec.max);
      }
      quality = clamp(quality, 0, 1);
      const status: Reading["status"] =
        raw === null ? "UNAVAILABLE" : quality < 0.55 ? "DEGRADED" : "HEALTHY";

      readings[id] = {
        value,
        raw,
        truth: truth[id],
        quality,
        flags,
        status,
        confidence: clamp(quality * (isTarget ? 1 - ssev * 0.6 : 1), 0, 1),
      };
    }

    this.prevTruth = truth;
    this.prevOut = Object.fromEntries(
      SENSOR_SPECS.map((s) => [s.id, readings[s.id].value]),
    ) as Record<SensorId, number | null>;

    /* --- twin comparison using validated measurements --- */
    const measuredAmbT = readings.ambTemp.value ?? ambTemp;
    const measuredAmbP = readings.ambPress.value ?? ambPress;
    const twinExpectedNow = twinExpectation({
      throttle,
      ambTemp: measuredAmbT,
      ambPress: measuredAmbP,
      thermalState: this.thermal,
    });

    const twin = {} as Record<SensorId, TwinPoint>;
    for (const spec of SENSOR_SPECS) {
      const id = spec.id;
      const exp = twinExpectedNow[id];
      const meas = readings[id].value;
      const residual = meas === null ? 0 : meas - exp;
      twin[id] = { expected: exp, residual, normResidual: residual / RES_SCALE[id] };
    }

    const available = SENSOR_SPECS.filter((s) => readings[s.id].value !== null);
    const dataQuality =
      SENSOR_SPECS.reduce((a, s) => a + readings[s.id].quality, 0) / SENSOR_SPECS.length;
    const twinConfidence = clamp(0.55 + dataQuality * 0.4 - Math.abs(1 - this.thermal) * 0.15, 0, 0.98);

    /* --- sensor-vs-engine discrimination --- */
    const sensorSuspicion = SENSOR_SPECS.map((s) => {
      const r = readings[s.id];
      const nres = Math.abs(twin[s.id].normResidual);
      const othersAgree =
        available
          .filter((o) => o.id !== s.id)
          .reduce((a, o) => a + Math.abs(twin[o.id].normResidual), 0) /
        Math.max(1, available.length - 1);
      // large isolated residual + poor quality => sensor fault, not engine fault
      const isolation = clamp((nres - othersAgree * 1.3) / 4, 0, 1);
      const p = clamp(isolation * 0.75 + (1 - r.quality) * 0.6 + (r.value === null ? 0.5 : 0), 0, 1);
      return { id: s.id, p };
    }).sort((a, b) => b.p - a.p);

    const topSensorSuspicion = sensorSuspicion[0]!;
    const sensorFaultSuspected = topSensorSuspicion.p > 0.55;

    /* --- anomaly score from fused residuals, discounting suspect sensors --- */
    let weighted = 0;
    let wsum = 0;
    for (const s of SENSOR_SPECS) {
      if (s.id === "ambTemp" || s.id === "ambPress") continue;
      const susp = sensorSuspicion.find((x) => x.id === s.id)!.p;
      const w = readings[s.id].confidence * (1 - susp);
      weighted += Math.abs(twin[s.id].normResidual) * w;
      wsum += w;
    }
    const fusedResidual = wsum > 0.2 ? weighted / wsum : 0;
    const anomalyScore = clamp(fusedResidual / 6, 0, 1);
    const anomalyConfidence = clamp(twinConfidence * (wsum / 4.5), 0.05, 0.97);

    /* --- fault diagnosis: residual signature matching --- */
    const nr = (id: SensorId) => twin[id].normResidual;
    const sig: Record<Exclude<EngineFaultId, "none">, number> = {
      oil_degradation: clamp(-nr("oilPress") * 0.55 + nr("oilTemp") * 0.35 + nr("vib") * 0.1, 0, 99),
      cooling_loss: clamp(nr("engTemp") * 0.7 + nr("oilTemp") * 0.3, 0, 99),
      bearing_wear: clamp(nr("vib") * 0.7 + nr("oilTemp") * 0.2 - nr("rpm") * 0.1, 0, 99),
      mixture_lean: clamp(nr("engTemp") * 0.5 - nr("map") * 0.35 - nr("rpm") * 0.15, 0, 99),
      ignition_misfire: clamp(Math.abs(nr("rpm")) * 0.5 + nr("vib") * 0.4 - nr("engTemp") * 0.1, 0, 99),
      intake_leak: clamp(-nr("map") * 0.6 - nr("rpm") * 0.25 + nr("engTemp") * 0.15, 0, 99),
    };
    const sigSum = Object.values(sig).reduce((a, b) => a + b, 0);
    const noneScore = Math.max(0.35, 2.2 - sigSum);
    const total = sigSum + noneScore;
    const faultProbs = [
      { id: "none" as EngineFaultId, p: noneScore / total },
      ...(Object.entries(sig) as [EngineFaultId, number][]).map(([id, v]) => ({ id, p: v / total })),
    ].sort((a, b) => b.p - a.p);

    /* --- health index --- */
    const penalty =
      clamp(fusedResidual, 0, 8) * 5.5 + this.wear * 9 + (1 - dataQuality) * 12;
    const healthIndex = clamp(100 - penalty, 0, 100);
    const healthBand = clamp(3 + (1 - twinConfidence) * 18 + (1 - dataQuality) * 10, 2, 30);

    /* --- mission risk --- */
    const riskRaw =
      anomalyScore * 0.42 +
      (1 - healthIndex / 100) * 0.33 +
      (1 - dataQuality) * 0.15 +
      (faultProbs[0]!.id !== "none" ? faultProbs[0]!.p * 0.2 : 0);
    const missionRisk = clamp(riskRaw, 0, 1);
    const missionRiskLevel: MissionRiskLevel =
      missionRisk > 0.72 ? "CRITICAL" : missionRisk > 0.48 ? "HIGH" : missionRisk > 0.24 ? "MEDIUM" : "LOW";

    /* --- overall status --- */
    let status: EngineStatus;
    if (available.length < 4) status = "INSUFFICIENT_DATA";
    else if (sensorFaultSuspected && anomalyScore < 0.55) status = "SENSOR_FAULT";
    else if (healthIndex < 45 || missionRisk > 0.72) status = "CRITICAL";
    else if (healthIndex < 68) status = "DEGRADED";
    else if (anomalyScore > 0.22 || dataQuality < 0.85) status = "WARNING";
    else status = "NORMAL";

    /* --- explainability --- */
    const evidence = SENSOR_SPECS.filter((s) => s.id !== "ambTemp" && s.id !== "ambPress")
      .map((s) => ({
        label: `${s.label} residual ${twin[s.id].residual >= 0 ? "+" : ""}${twin[s.id].residual.toFixed(s.precision)} ${s.unit}`,
        weight: Math.abs(twin[s.id].normResidual),
        provenance: "calculated" as Provenance,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
    if (sensorFaultSuspected) {
      evidence.unshift({
        label: `Isolated deviation on ${SENSOR_MAP[topSensorSuspicion.id].label} with cross-sensor agreement elsewhere`,
        weight: topSensorSuspicion.p * 4,
        provenance: "model",
      });
    }

    const recommendation =
      status === "SENSOR_FAULT"
        ? `Inspect ${SENSOR_MAP[topSensorSuspicion.id].label} wiring/calibration before acting on engine indications. Continue mission with degraded instrumentation.`
        : status === "CRITICAL"
          ? "Reduce power to minimum safe setting, abort mission profile and initiate recovery. Ground inspection required."
          : status === "DEGRADED"
            ? `Limit sustained high-load operation. Schedule inspection for ${ENGINE_FAULTS.find((x) => x.id === faultProbs[0]!.id)?.label ?? "top-ranked fault"}.`
            : status === "WARNING"
              ? "Continue monitoring. Re-evaluate residual trend over next 5 minutes."
              : status === "INSUFFICIENT_DATA"
                ? "Diagnostics withheld — restore telemetry link before relying on health outputs."
                : "No action required. Continue nominal mission profile.";

    return {
      t,
      seq: this.seq,
      state,
      throttle,
      readings,
      twin,
      twinConfidence,
      dataQuality,
      anomalyScore,
      anomalyConfidence,
      healthIndex,
      healthBand,
      faultProbs,
      sensorSuspicion,
      missionRisk,
      missionRiskLevel,
      status,
      evidence,
      recommendation,
    };
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
  return ENGINE_FAULTS.find((f) => f.id === id)?.label ?? id;
}
