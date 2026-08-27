/**
 * Engineering pipeline.
 *
 * Frame in → validated, twin-compared, diagnosed, scored result out.
 * Every stage is timed and traced. Nothing here knows or cares whether the
 * frame came from a simulator, a replay file or a CAN bus.
 *
 * Hard rules enforced in this module:
 *  - No engineering output is produced from data that failed validation.
 *  - Sensor faults are isolated BEFORE engine faults are diagnosed.
 *  - Confidence is reported alongside every derived number.
 *  - RUL is never emitted without validated run-to-failure history.
 */

import {
  CONFIGURATION_VERSION,
  ENVIRONMENT_CHANNELS,
  FAULT_CATALOGUE,
  MIN_CHANNELS_FOR_DIAGNOSIS,
  SENSOR_MAP,
  SENSOR_SPECS,
  THRESHOLDS,
  type EngineFaultId,
  type OperatingState,
  type SensorId,
  type Subsystem,
} from "@/lib/config/registry";
import { isUsable, type TelemetryFrame } from "@/lib/telemetry/frame";
import { computeTwin, PREDICTED_CHANNELS } from "@/lib/twin/model";
import type {
  ComponentHealth,
  DegradationEstimate,
  EngineStatus,
  Evidence,
  MissionRiskLevel,
  PipelineResult,
  Reading,
  RulEstimate,
  StageTrace,
  TwinPoint,
} from "./types";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

interface HistoryEntry {
  t: number;
  healthIndex: number;
  values: Partial<Record<SensorId, number>>;
}

const SUBSYSTEM_NAMES: Record<Subsystem, string> = {
  MECHANICAL: "Rotating assembly",
  THERMAL: "Thermal management",
  LUBRICATION: "Lubrication",
  INDUCTION: "Induction",
  INSTRUMENTATION: "Instrumentation",
};

export class TelemetryPipeline {
  private prev: Record<SensorId, number | null> | null = null;
  private repeats: Partial<Record<SensorId, number>> = {};
  private history: HistoryEntry[] = [];
  private thermalState = 0.08;
  private totalFrames = 0;

  reset() {
    this.prev = null;
    this.repeats = {};
    this.history = [];
    this.thermalState = 0.08;
    this.totalFrames = 0;
  }

  process(frame: TelemetryFrame): PipelineResult {
    const stages: StageTrace[] = [];
    const t0 = now();
    this.totalFrames += 1;

    /* ---------- Stage 1: validation & data quality ---------- */
    const s1 = now();
    const readings = this.validate(frame);
    const usableIds = SENSOR_SPECS.filter((s) => readings[s.id].status !== "UNAVAILABLE").map((s) => s.id);
    const dataQuality = clamp(
      (SENSOR_SPECS.reduce((a, s) => a + readings[s.id].quality, 0) / SENSOR_SPECS.length) *
        frame.communicationQuality,
      0,
      1,
    );
    const flaggedCount = SENSOR_SPECS.filter((s) => readings[s.id].flags.length).length;
    stages.push({
      id: "validation",
      name: "Data validation",
      status: dataQuality < THRESHOLDS.dataQuality.degraded.value ? "DEGRADED" : "OK",
      detail: `${usableIds.length}/${SENSOR_SPECS.length} channels usable, ${flaggedCount} flagged, quality ${(dataQuality * 100).toFixed(0)}%`,
      durationMs: now() - s1,
      inputs: ["telemetry frame"],
    });

    /* ---------- Stage 2: operating-state estimation ---------- */
    const s2 = now();
    const est = this.estimateState(readings);
    stages.push({
      id: "state",
      name: "Operating state estimation",
      status: est.state === "UNKNOWN" ? "SUPPRESSED" : "OK",
      detail:
        est.state === "UNKNOWN"
          ? "Speed and manifold channels unusable — state cannot be estimated"
          : `${est.state.replace("_", " ")} at ${(est.throttle * 100).toFixed(0)}% demand, warm-up ${(est.thermalState * 100).toFixed(0)}%`,
      durationMs: now() - s2,
      inputs: ["validated channels"],
    });

    /* ---------- Stage 3: digital twin ---------- */
    const s3 = now();
    const amb = {
      ambTemp: readings.ambTemp.value ?? 15,
      ambPress: readings.ambPress.value ?? 90,
    };
    const twinOut = computeTwin({
      throttle: est.throttle,
      ambTemp: amb.ambTemp,
      ambPress: amb.ambPress,
      thermalState: est.thermalState,
    });
    stages.push({
      id: "twin",
      name: "Digital twin expectation",
      status: twinOut.extrapolating ? "DEGRADED" : "OK",
      detail: `${twinOut.calibrationVersion}, confidence ${(twinOut.confidence * 100).toFixed(0)}%${twinOut.extrapolating ? ", extrapolating outside calibration domain" : ""}`,
      durationMs: now() - s3,
      inputs: ["operating state", "ambient boundary conditions", "twin calibration"],
    });

    /* ---------- Stage 4: residual generation ---------- */
    const s4 = now();
    const twin = {} as Record<SensorId, TwinPoint>;
    for (const spec of SENSOR_SPECS) {
      const expected = twinOut.expected[spec.id];
      const r = readings[spec.id];
      const comparable = r.value !== null && PREDICTED_CHANNELS.includes(spec.id) && r.status !== "UNAVAILABLE";
      const residual = comparable ? r.value! - expected : 0;
      twin[spec.id] = {
        expected,
        residual,
        normResidual: comparable ? residual / spec.residualScale : 0,
        comparable,
      };
    }
    const comparableIds = PREDICTED_CHANNELS.filter((id) => twin[id].comparable);
    stages.push({
      id: "residual",
      name: "Residual generation",
      status: comparableIds.length ? "OK" : "SUPPRESSED",
      detail: `${comparableIds.length}/${PREDICTED_CHANNELS.length} predicted channels compared`,
      durationMs: now() - s4,
      inputs: ["validated channels", "twin expectation"],
    });

    /* ---------- Stage 5: sensor-fault isolation (before diagnosis) ---------- */
    const s5 = now();
    const sensorSuspicion = this.isolateSensors(readings, twin);
    const topSensor = sensorSuspicion[0]!;
    stages.push({
      id: "sensor-health",
      name: "Sensor fault isolation",
      status: topSensor.p > THRESHOLDS.sensorHealth.suspicion.value ? "DEGRADED" : "OK",
      detail: `Leading suspicion ${SENSOR_MAP[topSensor.id].label} at ${(topSensor.p * 100).toFixed(0)}%`,
      durationMs: now() - s5,
      inputs: ["validation flags", "residual isolation"],
    });

    /* ---------- Data-quality gate ---------- */
    const suppressed = dataQuality < THRESHOLDS.dataQuality.invalid.value || comparableIds.length === 0;
    const suppressionReason = suppressed
      ? comparableIds.length === 0
        ? "No predicted channel could be compared against the twin."
        : `Frame data quality ${(dataQuality * 100).toFixed(0)}% is below the ${(THRESHOLDS.dataQuality.invalid.value * 100).toFixed(0)}% floor.`
      : null;

    /* ---------- Stage 6: anomaly scoring ---------- */
    const s6 = now();
    const absRes = comparableIds.map((id) => Math.abs(twin[id].normResidual));
    const anomalyScore = suppressed
      ? 0
      : clamp(absRes.reduce((a, b) => a + b, 0) / Math.max(1, absRes.length) / 3, 0, 1.5);
    const anomalyConfidence = suppressed
      ? 0
      : clamp(twinOut.confidence * dataQuality * (comparableIds.length / PREDICTED_CHANNELS.length), 0, 1);
    stages.push({
      id: "anomaly",
      name: "Anomaly scoring",
      status: suppressed ? "SUPPRESSED" : anomalyScore > THRESHOLDS.anomaly.warning.value ? "DEGRADED" : "OK",
      detail: suppressed
        ? suppressionReason!
        : `Score ${anomalyScore.toFixed(3)} at ${(anomalyConfidence * 100).toFixed(0)}% confidence`,
      durationMs: now() - s6,
      inputs: ["normalised residuals", "twin confidence", "data quality"],
    });

    /* ---------- Stage 7: fault diagnosis ---------- */
    const s7 = now();
    const canDiagnose =
      !suppressed &&
      usableIds.length >= MIN_CHANNELS_FOR_DIAGNOSIS &&
      topSensor.p <= THRESHOLDS.sensorHealth.suspicion.value;
    const faultProbs = this.diagnose(twin, readings, canDiagnose, anomalyScore);
    stages.push({
      id: "diagnosis",
      name: "Fault diagnosis",
      status: canDiagnose ? "OK" : "SUPPRESSED",
      detail: canDiagnose
        ? `Leading hypothesis ${faultProbs[0]!.id} at ${(faultProbs[0]!.p * 100).toFixed(0)}%`
        : topSensor.p > THRESHOLDS.sensorHealth.suspicion.value
          ? "Suppressed: a sensor fault must be resolved before engine diagnosis"
          : "Suppressed: insufficient validated evidence",
      durationMs: now() - s7,
      inputs: ["residual signatures", "sensor isolation result"],
    });

    /* ---------- Stage 8: health ---------- */
    const s8 = now();
    const componentHealth = this.componentHealth(readings, twin);
    const scored = componentHealth.filter((c) => c.score !== null);
    const healthIndex = suppressed
      ? this.history.length
        ? this.history[this.history.length - 1]!.healthIndex
        : 100
      : clamp(
          scored.reduce((a, c) => a + c.score!, 0) / Math.max(1, scored.length),
          0,
          100,
        );
    const healthBand = clamp(
      6 + (1 - anomalyConfidence) * 16 + (1 - twinOut.calibrationQuality) * 10,
      4,
      40,
    );
    stages.push({
      id: "health",
      name: "Health index fusion",
      status: suppressed ? "SUPPRESSED" : "OK",
      detail: suppressed
        ? "Held at last valid value — no fresh evidence"
        : `HI ${healthIndex.toFixed(1)} ± ${(healthBand / 2).toFixed(1)} from ${scored.length} subsystem scores`,
      durationMs: now() - s8,
      inputs: ["component residuals", "sensor confidence"],
    });

    this.history.push({
      t: frame.timestamp,
      healthIndex,
      values: Object.fromEntries(SENSOR_SPECS.map((s) => [s.id, readings[s.id].value ?? undefined])),
    });
    if (this.history.length > 600) this.history.shift();

    /* ---------- Stage 9: degradation & RUL ---------- */
    const s9 = now();
    const degradation = this.degradation();
    const rul: RulEstimate = {
      hours: null,
      available: false,
      requiredFrames: THRESHOLDS.rul.minimumValidatedFrames.value,
      availableFrames: this.totalFrames,
      reason:
        "No validated run-to-failure data exists for this configuration. A remaining-useful-life figure would be fabricated, so none is reported.",
    };
    stages.push({
      id: "prognostics",
      name: "Degradation & prognostics",
      status: degradation.sufficient ? "OK" : "SUPPRESSED",
      detail: degradation.sufficient
        ? `${degradation.ratePerHour!.toFixed(2)} HI/h over ${degradation.windowFrames} frames; RUL withheld (no validated failure data)`
        : degradation.note,
      durationMs: now() - s9,
      inputs: ["health index history"],
    });

    /* ---------- Stage 10: status, risk, decision support ---------- */
    const s10 = now();
    const status = this.status(suppressed, topSensor.p, healthIndex, anomalyScore);
    const missionRisk = suppressed
      ? 0
      : clamp(
          (1 - healthIndex / 100) * 0.55 +
            clamp(anomalyScore, 0, 1) * 0.25 +
            (1 - dataQuality) * 0.1 +
            (1 - twinOut.confidence) * 0.1,
          0,
          1,
        );
    const missionRiskLevel: MissionRiskLevel =
      missionRisk >= THRESHOLDS.missionRisk.critical.value
        ? "CRITICAL"
        : missionRisk >= THRESHOLDS.missionRisk.high.value
          ? "HIGH"
          : missionRisk >= THRESHOLDS.missionRisk.medium.value
            ? "MEDIUM"
            : "LOW";

    const evidence = this.evidence(twin, readings, dataQuality, twinOut.confidence);
    const recommendation = this.recommend(status, faultProbs[0]!.id, topSensor, suppressionReason);
    stages.push({
      id: "decision",
      name: "Fusion & decision support",
      status: suppressed ? "SUPPRESSED" : "OK",
      detail: `${status.replace("_", " ")} · risk ${missionRiskLevel}`,
      durationMs: now() - s10,
      inputs: ["health index", "diagnosis", "data quality", "twin confidence"],
    });

    return {
      t: frame.timestamp,
      seq: frame.sequenceNumber,
      frame,
      sourceType: frame.provenance.sourceType,
      configurationVersion: CONFIGURATION_VERSION,
      state: est.state,
      throttle: est.throttle,
      thermalState: est.thermalState,
      readings,
      twin,
      twinConfidence: twinOut.confidence,
      twinSubmodels: twinOut.submodels,
      twinCalibrationVersion: twinOut.calibrationVersion,
      twinExtrapolating: twinOut.extrapolating,
      dataQuality,
      anomalyScore,
      anomalyConfidence,
      healthIndex,
      healthBand,
      componentHealth,
      degradation,
      rul,
      faultProbs,
      sensorSuspicion,
      missionRisk,
      missionRiskLevel,
      status,
      evidence,
      recommendation,
      groundTruth: null,
      stages,
      suppressed,
      suppressionReason,
      totalLatencyMs: now() - t0,
    };
  }

  /* ---------------------------------------------------------------- */

  private validate(frame: TelemetryFrame): Record<SensorId, Reading> {
    const out = {} as Record<SensorId, Reading>;
    for (const spec of SENSOR_SPECS) {
      const ch = frame.channels[spec.id];
      const flags: string[] = [];
      let quality = 1;
      let value = ch?.value ?? null;
      const raw = ch?.raw ?? null;

      if (!ch || value === null || !Number.isFinite(value)) {
        flags.push("MISSING");
        quality = 0;
        value = null;
      } else {
        if (value < spec.min || value > spec.max) {
          flags.push("OUT_OF_RANGE");
          quality -= 0.7;
          value = null;
        }
        const prev = this.prev?.[spec.id] ?? null;
        if (value !== null && prev !== null) {
          const rate = Math.abs(value - prev) / Math.max(frame.dt, 1e-3);
          if (rate > spec.maxRate) {
            flags.push("RATE_VIOLATION");
            quality -= 0.45;
          }
          if (Math.abs(value - prev) < 1e-9) {
            this.repeats[spec.id] = (this.repeats[spec.id] ?? 0) + 1;
          } else {
            this.repeats[spec.id] = 0;
          }
          if ((this.repeats[spec.id] ?? 0) >= 4 && !ENVIRONMENT_CHANNELS.includes(spec.id)) {
            flags.push("STUCK");
            quality -= 0.55;
          }
        }
        if (!isUsable(ch)) {
          flags.push(ch.status);
          quality -= 0.4;
        }
        if (frame.timestamp - ch.sampledAt > spec.staleAfterMs) {
          flags.push("STALE");
          quality -= 0.5;
        }
      }

      quality = clamp(quality, 0, 1);
      const status: Reading["status"] =
        value === null || quality <= 0.15
          ? "UNAVAILABLE"
          : quality < THRESHOLDS.sensorHealth.degraded.value
            ? "DEGRADED"
            : "HEALTHY";
      out[spec.id] = { value, raw, quality, flags, status, confidence: quality };
    }
    this.prev = Object.fromEntries(SENSOR_SPECS.map((s) => [s.id, out[s.id].value])) as Record<SensorId, number | null>;
    return out;
  }

  /** Operating state is INFERRED from measurements, never taken from the source. */
  private estimateState(r: Record<SensorId, Reading>): {
    state: OperatingState;
    throttle: number;
    thermalState: number;
  } {
    const rpm = r.rpm.value;
    const map = r.map.value;
    if (rpm === null) return { state: "UNKNOWN", throttle: 0, thermalState: this.thermalState };

    const throttle = clamp((rpm - 1200) / 4500, 0, 1);
    const prevRpm = this.history.length ? (this.history[this.history.length - 1]!.values.rpm ?? rpm) : rpm;
    const drpm = rpm - prevRpm;

    let state: OperatingState;
    if (rpm < 600) state = "SHUTDOWN";
    else if (rpm < 1000) state = "STARTING";
    else if (drpm > 250) state = "ACCELERATION";
    else if (drpm < -250) state = "DECELERATION";
    else if (throttle > 0.8) state = "HIGH_LOAD";
    else if (throttle < 0.2) state = "IDLE";
    else state = "STEADY_STATE";

    // Warm-up progress estimated from observed oil temperature against ambient.
    const oil = r.oilTemp.value;
    const amb = r.ambTemp.value ?? 15;
    if (oil !== null) {
      const observed = clamp((oil - amb) / 90, 0.05, 1);
      this.thermalState = this.thermalState + (observed - this.thermalState) * 0.15;
    }
    if (map === null) {
      // still usable, just less certain — noted by the twin's confidence
    }
    return { state, throttle, thermalState: clamp(this.thermalState, 0.05, 1) };
  }

  /**
   * Sensor-vs-engine discrimination. A single channel deviating while its
   * subsystem peers agree with the twin points at the instrument, not the engine.
   */
  private isolateSensors(
    r: Record<SensorId, Reading>,
    twin: Record<SensorId, TwinPoint>,
  ): { id: SensorId; p: number }[] {
    const scores = SENSOR_SPECS.map((spec) => {
      const own = Math.abs(twin[spec.id].normResidual);
      const peers = SENSOR_SPECS.filter(
        (o) => o.id !== spec.id && o.subsystem === spec.subsystem && twin[o.id].comparable,
      );
      const peerMean = peers.length
        ? peers.reduce((a, o) => a + Math.abs(twin[o.id].normResidual), 0) / peers.length
        : SENSOR_SPECS.filter((o) => o.id !== spec.id && twin[o.id].comparable).reduce(
            (a, o) => a + Math.abs(twin[o.id].normResidual),
            0,
          ) / Math.max(1, PREDICTED_CHANNELS.length - 1);
      const isolation = clamp((own - peerMean) / 3, 0, 1);
      const flagPenalty = clamp(r[spec.id].flags.length * 0.28, 0, 0.8);
      const qualityPenalty = 1 - r[spec.id].quality;
      return { id: spec.id, p: clamp(isolation * 0.55 + flagPenalty * 0.6 + qualityPenalty * 0.5, 0, 1) };
    });
    return scores.sort((a, b) => b.p - a.p);
  }

  private diagnose(
    twin: Record<SensorId, TwinPoint>,
    r: Record<SensorId, Reading>,
    allowed: boolean,
    anomalyScore: number,
  ): { id: EngineFaultId; p: number; supported: boolean }[] {
    if (!allowed) {
      return FAULT_CATALOGUE.map((f) => ({ id: f.id, p: f.id === "none" ? 1 : 0, supported: false }));
    }
    const raw = FAULT_CATALOGUE.map((f) => {
      if (f.id === "none") {
        return { id: f.id, score: Math.max(0.05, 1 - anomalyScore * 2.5), supported: true };
      }
      const supported = f.requires.every((id) => r[id].status !== "UNAVAILABLE" && twin[id].comparable);
      if (!supported) return { id: f.id, score: 0, supported: false };
      let dot = 0;
      let norm = 0;
      for (const [ch, w] of Object.entries(f.signature) as [SensorId, number][]) {
        if (!twin[ch].comparable) continue;
        dot += w * twin[ch].normResidual;
        norm += Math.abs(w);
      }
      const match = norm > 0 ? clamp(dot / norm / 2.2, 0, 1) : 0;
      return { id: f.id, score: match * clamp(anomalyScore * 2.2, 0, 1), supported: true };
    });
    const total = raw.reduce((a, x) => a + x.score, 0) || 1;
    return raw
      .map((x) => ({ id: x.id, p: x.score / total, supported: x.supported }))
      .sort((a, b) => b.p - a.p);
  }

  private componentHealth(
    r: Record<SensorId, Reading>,
    twin: Record<SensorId, TwinPoint>,
  ): ComponentHealth[] {
    const groups = new Map<Subsystem, SensorId[]>();
    for (const s of SENSOR_SPECS) {
      groups.set(s.subsystem, [...(groups.get(s.subsystem) ?? []), s.id]);
    }
    return [...groups.entries()].map(([subsystem, channels]) => {
      const usable = channels.filter((id) => r[id].status !== "UNAVAILABLE" && twin[id].comparable);
      if (subsystem === "INSTRUMENTATION") {
        const q = channels.reduce((a, id) => a + r[id].quality, 0) / channels.length;
        return {
          subsystem,
          name: SUBSYSTEM_NAMES[subsystem],
          score: q * 100,
          confidence: 0.9,
          reason: "Scored on acquisition quality only — boundary channels are not predicted.",
          channels,
        };
      }
      if (!usable.length) {
        return {
          subsystem,
          name: SUBSYSTEM_NAMES[subsystem],
          score: null,
          confidence: 0,
          reason: "No usable channel — health cannot be assessed for this subsystem.",
          channels,
        };
      }
      const res = usable.reduce((a, id) => a + Math.abs(twin[id].normResidual), 0) / usable.length;
      const q = usable.reduce((a, id) => a + r[id].quality, 0) / usable.length;
      return {
        subsystem,
        name: SUBSYSTEM_NAMES[subsystem],
        score: clamp(100 - res * 14 - (1 - q) * 25, 0, 100),
        confidence: clamp(q * (usable.length / channels.length), 0, 1),
        reason: `${usable.length}/${channels.length} channels compared, mean |residual| ${res.toFixed(2)} σ`,
        channels,
      };
    });
  }

  private degradation(): DegradationEstimate {
    const minFrames = THRESHOLDS.degradation.minimumHistoryFrames.value;
    const w = this.history.slice(-240);
    if (w.length < minFrames) {
      return {
        ratePerHour: null,
        windowFrames: w.length,
        sufficient: false,
        note: `Degradation slope withheld — ${w.length}/${minFrames} frames of history.`,
      };
    }
    const n = w.length;
    const meanX = (n - 1) / 2;
    const meanY = w.reduce((a, s) => a + s.healthIndex, 0) / n;
    let num = 0;
    let den = 0;
    w.forEach((s, i) => {
      num += (i - meanX) * (s.healthIndex - meanY);
      den += (i - meanX) ** 2;
    });
    const spanHours = Math.max(1e-6, (w[n - 1]!.t - w[0]!.t) / 3600000);
    const slopePerFrame = den > 0 ? num / den : 0;
    return {
      ratePerHour: (slopePerFrame * (n - 1)) / spanHours,
      windowFrames: n,
      sufficient: true,
      note: `Least-squares slope over ${n} frames (${(spanHours * 60).toFixed(1)} min).`,
    };
  }

  private status(
    suppressed: boolean,
    sensorP: number,
    hi: number,
    anomaly: number,
  ): EngineStatus {
    if (suppressed) return "INSUFFICIENT_DATA";
    if (sensorP > THRESHOLDS.sensorHealth.suspicion.value) return "SENSOR_FAULT";
    if (hi < THRESHOLDS.health.critical.value || anomaly > THRESHOLDS.anomaly.critical.value) return "CRITICAL";
    if (hi < THRESHOLDS.health.degraded.value) return "DEGRADED";
    if (anomaly > THRESHOLDS.anomaly.warning.value) return "WARNING";
    return "NORMAL";
  }

  private evidence(
    twin: Record<SensorId, TwinPoint>,
    r: Record<SensorId, Reading>,
    dq: number,
    twinConf: number,
  ): Evidence[] {
    const channelEvidence: Evidence[] = PREDICTED_CHANNELS.filter((id) => twin[id].comparable)
      .map((id) => ({
        label: `${SENSOR_MAP[id].label} residual ${twin[id].normResidual >= 0 ? "+" : ""}${twin[id].normResidual.toFixed(2)} σ`,
        weight: clamp(Math.abs(twin[id].normResidual) / 4, 0, 1) * r[id].confidence,
        provenance: "calculated" as const,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
    return [
      ...channelEvidence,
      { label: `Frame data quality ${(dq * 100).toFixed(0)}%`, weight: 1 - dq, provenance: "measured" },
      { label: `Twin confidence ${(twinConf * 100).toFixed(0)}%`, weight: 1 - twinConf, provenance: "model" },
    ];
  }

  private recommend(
    status: EngineStatus,
    fault: EngineFaultId,
    sensor: { id: SensorId; p: number },
    suppressionReason: string | null,
  ): string {
    switch (status) {
      case "INSUFFICIENT_DATA":
        return `No engineering conclusion is available. ${suppressionReason ?? "Evidence is insufficient."} Restore acquisition before relying on this display.`;
      case "SENSOR_FAULT":
        return `Evidence points at instrumentation, not the engine: ${SENSOR_MAP[sensor.id].label} is deviating while its subsystem peers track the twin. Verify wiring and calibration before treating this as an engine condition.`;
      case "CRITICAL":
        return `Leading hypothesis: ${fault.replace(/_/g, " ")}. Reduce power demand, plan an early return and inspect the affected subsystem before the next sortie.`;
      case "DEGRADED":
        return `Sustained deviation consistent with ${fault.replace(/_/g, " ")}. Continue with monitoring, avoid extended high-load operation and schedule inspection.`;
      case "WARNING":
        return "Residuals are above the nominal band but within tolerance. Continue monitoring; no immediate action required.";
      default:
        return "All fused indicators are within prototype thresholds. Continue normal operation.";
    }
  }
}
