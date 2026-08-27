/**
 * Physics-informed Digital Twin.
 *
 * Structurally separate from the simulator: the twin only ever sees a
 * TelemetryFrame plus estimated operating conditions. It never reads ground
 * truth. Each submodel declares its own validity domain and confidence so the
 * platform can say WHY it trusts (or distrusts) an expectation.
 */

import {
  TWIN_CALIBRATION,
  SENSOR_SPECS,
  type SensorId,
  type Subsystem,
} from "@/lib/config/registry";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface TwinInputs {
  /** Estimated throttle / power demand, 0..1. */
  throttle: number;
  ambTemp: number;
  ambPress: number;
  /** Warm-up progress 0..1, estimated from observed temperatures. */
  thermalState: number;
}

export interface SubmodelResult {
  id: string;
  name: string;
  subsystem: Subsystem;
  /** Governing relation, stated in plain engineering terms. */
  basis: string;
  /** 0..1 confidence for this submodel under the current conditions. */
  confidence: number;
  inDomain: boolean;
  domainNote: string;
  channels: SensorId[];
}

export interface TwinExpectation {
  expected: Record<SensorId, number>;
  submodels: SubmodelResult[];
  /** Overall twin confidence, 0..1 — bounded by calibration quality. */
  confidence: number;
  calibrationVersion: string;
  calibrationQuality: number;
  /** True when inputs are outside the domain any submodel was tuned for. */
  extrapolating: boolean;
}

const c = TWIN_CALIBRATION.coefficients;

export function computeTwin(i: TwinInputs): TwinExpectation {
  const throttle = clamp(i.throttle, 0, 1);
  const thermal = clamp(i.thermalState, 0, 1);

  // --- Rotating assembly / performance -------------------------------
  const rpm = c.idleRpm.value + throttle * c.rpmPerThrottle.value;

  // --- Induction ------------------------------------------------------
  const mapRaw = 28 + throttle * (i.ambPress - 28) * c.mapIntakeGain.value + throttle * c.mapRamGain.value;
  const map = clamp(mapRaw, 15, 120);

  const load = (rpm / 5700) * (map / 100);

  // --- Thermal --------------------------------------------------------
  const engTemp = i.ambTemp + (c.chtRiseBase.value + load * c.chtRiseLoad.value) * thermal;

  // --- Lubrication ----------------------------------------------------
  const oilTemp = i.ambTemp + (c.oilRiseBase.value + load * c.oilRiseLoad.value) * thermal;
  const oilPress = clamp(
    c.oilPressBase.value + (rpm / 5700) * c.oilPressPerRpm.value - (oilTemp - 90) * c.oilPressThermalLoss.value,
    0.4,
    7,
  );

  // --- Mechanical -----------------------------------------------------
  const vib = c.vibBase.value + load * c.vibLoadGain.value + Math.abs(rpm - c.vibResonanceRpm.value) / 9000;

  const warmingUp = thermal < 0.45;
  const transient = throttle > 0.85 || throttle < 0.13;
  const ambientOdd = i.ambTemp < -20 || i.ambTemp > 45;

  const submodels: SubmodelResult[] = [
    {
      id: "performance",
      name: "Speed & power demand",
      subsystem: "MECHANICAL",
      basis: "Crank speed is affine in throttle demand between idle and redline.",
      confidence: transient ? 0.6 : 0.86,
      inDomain: !transient,
      domainNote: transient ? "Throttle at a programme extreme — transient dynamics not modelled." : "Within tuned throttle band.",
      channels: ["rpm"],
    },
    {
      id: "induction",
      name: "Induction & manifold filling",
      subsystem: "INDUCTION",
      basis: "Manifold pressure follows ambient pressure recovery plus a ram term proportional to throttle.",
      confidence: ambientOdd ? 0.55 : 0.8,
      inDomain: !ambientOdd,
      domainNote: ambientOdd ? "Ambient conditions outside calibration envelope." : "Ambient within calibration envelope.",
      channels: ["map"],
    },
    {
      id: "thermal",
      name: "Cylinder-head thermal balance",
      subsystem: "THERMAL",
      basis: "Head temperature rises above ambient in proportion to load, scaled by warm-up progress.",
      confidence: warmingUp ? 0.45 : 0.82,
      inDomain: !warmingUp,
      domainNote: warmingUp ? "Engine still warming — steady-state thermal relation not yet valid." : "Thermally stabilised.",
      channels: ["engTemp"],
    },
    {
      id: "lubrication",
      name: "Oil thermal & pressure model",
      subsystem: "LUBRICATION",
      basis: "Gallery pressure scales with pump speed and falls with oil temperature through viscosity.",
      confidence: warmingUp ? 0.5 : 0.78,
      inDomain: !warmingUp,
      domainNote: warmingUp ? "Cold oil viscosity is outside the fitted range." : "Oil within modelled viscosity range.",
      channels: ["oilTemp", "oilPress"],
    },
    {
      id: "vibration",
      name: "Structural vibration",
      subsystem: "MECHANICAL",
      basis: "Broadband RMS grows with load and with distance from the structural resonance speed.",
      confidence: 0.6,
      inDomain: true,
      domainNote: "Broadband approximation only — no order tracking or spectral model implemented.",
      channels: ["vib"],
    },
    {
      id: "environment",
      name: "Environment pass-through",
      subsystem: "INSTRUMENTATION",
      basis: "Ambient channels are boundary conditions, not predictions.",
      confidence: 0.95,
      inDomain: true,
      domainNote: "Measured boundary conditions echoed unchanged.",
      channels: ["ambTemp", "ambPress"],
    },
  ];

  const mean = submodels.reduce((a, s) => a + s.confidence, 0) / submodels.length;
  // Confidence can never exceed how well the twin itself is calibrated.
  const confidence = clamp(mean * (0.55 + 0.45 * TWIN_CALIBRATION.calibrationQuality), 0, 1);

  return {
    expected: {
      rpm,
      map,
      engTemp,
      oilTemp,
      oilPress,
      vib,
      ambTemp: i.ambTemp,
      ambPress: i.ambPress,
    },
    submodels,
    confidence,
    calibrationVersion: TWIN_CALIBRATION.version,
    calibrationQuality: TWIN_CALIBRATION.calibrationQuality,
    extrapolating: submodels.some((s) => !s.inDomain),
  };
}

/** Channels the twin actually predicts (excludes pass-through boundaries). */
export const PREDICTED_CHANNELS: SensorId[] = SENSOR_SPECS.filter(
  (s) => s.subsystem !== "INSTRUMENTATION",
).map((s) => s.id);
