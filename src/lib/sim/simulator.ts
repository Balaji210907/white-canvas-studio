/**
 * Virtual ACTUAL engine.
 *
 * This module is a DATA SOURCE, not the Digital Twin. It represents what a
 * physical engine and its instrumentation would do, including faults, noise,
 * wear and sensor defects. It must never be used to judge the engine — that is
 * the Twin's job, and the Twin is deliberately implemented separately so the
 * two cannot silently share assumptions.
 */

import {
  SENSOR_SPECS,
  STATE_SEQUENCE,
  TWIN_CALIBRATION,
  type OperatingState,
  type SensorFaultId,
  type SensorId,
  type EngineFaultId,
} from "@/lib/config/registry";

export interface FaultInjection {
  engineFault: EngineFaultId;
  engineSeverity: number; // 0..1
  sensorFault: SensorFaultId;
  sensorTarget: SensorId;
  sensorSeverity: number; // 0..1
}

export interface GroundTruth {
  /** Actual physical condition of the virtual engine at this instant. */
  engineFault: EngineFaultId;
  engineSeverity: number;
  sensorFault: SensorFaultId;
  sensorTarget: SensorId | null;
  sensorSeverity: number;
  /** Accumulated wear, 0..1. */
  wear: number;
  operatingState: OperatingState;
  throttle: number;
  /** Noise-free physical values. Available only because this is a simulation. */
  trueValues: Record<SensorId, number>;
  /** Frame index at which the currently active engine fault began. */
  faultStartedAtSeq: number | null;
}

export interface SimulatedSample {
  seq: number;
  timestamp: number;
  dt: number;
  /** Raw sensor output as an acquisition unit would see it — may be null. */
  raw: Record<SensorId, number | null>;
  groundTruth: GroundTruth;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const CYCLE_SECONDS = STATE_SEQUENCE.reduce((a, s) => a + s.seconds, 0);

function programmeAt(tSec: number): { state: OperatingState; throttle: number } {
  let x = tSec % CYCLE_SECONDS;
  for (const seg of STATE_SEQUENCE) {
    if (x < seg.seconds) return { state: seg.state, throttle: seg.throttle };
    x -= seg.seconds;
  }
  return { state: "IDLE", throttle: 0.12 };
}

/**
 * Deterministic PRNG. Seeded so any scenario can be reproduced exactly —
 * a requirement for ground-truth validation runs.
 */
class Rng {
  constructor(private s: number) {}
  next() {
    this.s = (this.s * 1664525 + 1013904223) % 4294967296;
    return this.s / 4294967296;
  }
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 0.7;
  }
  reseed(s: number) {
    this.s = s;
  }
}

export class EngineSimulator {
  seq = 0;
  t0 = Date.now();
  private thermal = 0.08;
  private wear = 0;
  private stuckHold: Partial<Record<SensorId, number>> = {};
  private rng: Rng;
  private faultStartedAtSeq: number | null = null;
  private lastFault: EngineFaultId = "none";

  constructor(
    public injection: FaultInjection,
    private seed = 42,
  ) {
    this.rng = new Rng(seed);
  }

  reset() {
    this.seq = 0;
    this.t0 = Date.now();
    this.thermal = 0.08;
    this.wear = 0;
    this.stuckHold = {};
    this.faultStartedAtSeq = null;
    this.lastFault = "none";
    this.rng.reseed(this.seed);
  }

  /** Physical behaviour of the virtual engine, independent of the Twin model. */
  private physics(throttle: number, ambTemp: number, ambPress: number): Record<SensorId, number> {
    const c = TWIN_CALIBRATION.coefficients;
    // Intentionally similar in form to the twin but NOT the same code path:
    // the simulator carries thermal inertia, wear and stochastic behaviour.
    const rpm = c.idleRpm.value + throttle * c.rpmPerThrottle.value;
    const map = 28 + throttle * (ambPress - 28) * c.mapIntakeGain.value + throttle * c.mapRamGain.value;
    const load = (rpm / 5700) * (map / 100);
    const engTemp = ambTemp + (c.chtRiseBase.value + load * c.chtRiseLoad.value) * this.thermal;
    const oilTemp = ambTemp + (c.oilRiseBase.value + load * c.oilRiseLoad.value) * this.thermal;
    const oilPress = clamp(
      c.oilPressBase.value +
        (rpm / 5700) * c.oilPressPerRpm.value -
        (oilTemp - 90) * c.oilPressThermalLoss.value,
      0.4,
      7,
    );
    const vib =
      c.vibBase.value +
      load * c.vibLoadGain.value +
      Math.abs(rpm - c.vibResonanceRpm.value) / 9000;
    return { rpm, map: clamp(map, 15, 120), engTemp, oilTemp, oilPress, vib, ambTemp, ambPress };
  }

  step(dt = 1): SimulatedSample {
    this.seq += 1;
    const tSec = this.seq * dt;
    const timestamp = this.t0 + tSec * 1000;
    const { state, throttle } = programmeAt(tSec);
    this.thermal = clamp(this.thermal + (state === "SHUTDOWN" ? -0.01 : 0.006), 0.08, 1);
    this.wear = clamp(this.wear + 0.00025 * dt, 0, 1);

    const f = this.injection;
    if (f.engineFault !== this.lastFault) {
      this.lastFault = f.engineFault;
      this.faultStartedAtSeq = f.engineFault === "none" ? null : this.seq;
    }

    const ambTemp = 14 + Math.sin(tSec / 240) * 3;
    const ambPress = 88 + Math.cos(tSec / 300) * 4;
    const truth = this.physics(throttle, ambTemp, ambPress);
    const g = () => this.rng.gauss();

    truth.rpm += g() * 22;
    truth.map += g() * 0.7;
    truth.engTemp += g() * 1.1 + this.wear * 4;
    truth.oilTemp += g() * 0.8 + this.wear * 3;
    truth.oilPress += g() * 0.05 - this.wear * 0.15;
    truth.vib += Math.abs(g()) * 0.05 + this.wear * 0.12;
    truth.ambTemp += g() * 0.15;
    truth.ambPress += g() * 0.15;

    const sev = f.engineFault === "none" ? 0 : f.engineSeverity;
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

    /* Instrumentation layer: what the sensor actually outputs. */
    const raw = {} as Record<SensorId, number | null>;
    for (const spec of SENSOR_SPECS) {
      const id = spec.id;
      let v: number | null = truth[id];
      const isTarget = f.sensorFault !== "none" && f.sensorTarget === id;
      const ssev = isTarget ? f.sensorSeverity : 0;

      if (isTarget) {
        switch (f.sensorFault) {
          case "stuck":
            if (this.stuckHold[id] === undefined) this.stuckHold[id] = truth[id];
            v = this.stuckHold[id]!;
            break;
          case "bias":
            v = truth[id] + ssev * (spec.max - spec.min) * 0.12;
            break;
          case "noise":
            v = truth[id] + this.rng.gauss() * ssev * (spec.max - spec.min) * 0.07;
            break;
          case "dropout":
            if (this.rng.next() < 0.25 + ssev * 0.5) v = null;
            break;
          case "spike":
            if (this.rng.next() < 0.18 + ssev * 0.35) v = spec.max * (0.75 + ssev * 0.3);
            break;
        }
      } else {
        delete this.stuckHold[id];
      }
      raw[id] = v;
    }

    return {
      seq: this.seq,
      timestamp,
      dt,
      raw,
      groundTruth: {
        engineFault: f.engineFault,
        engineSeverity: sev,
        sensorFault: f.sensorFault,
        sensorTarget: f.sensorFault === "none" ? null : f.sensorTarget,
        sensorSeverity: f.sensorFault === "none" ? 0 : f.sensorSeverity,
        wear: this.wear,
        operatingState: state,
        throttle,
        trueValues: truth,
        faultStartedAtSeq: this.faultStartedAtSeq,
      },
    };
  }
}
