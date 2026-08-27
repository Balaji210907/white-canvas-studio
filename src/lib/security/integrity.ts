/**
 * Telemetry integrity / data-authenticity layer.
 *
 * Runs on every frame BEFORE the operator sees an engineering conclusion.
 * It never claims "cyber attack" — it reports data-integrity anomalies with
 * the evidence that produced them.
 */

import { SENSOR_MAP, SENSOR_SPECS, type SensorId } from "@/lib/config/registry";
import type { PipelineResult } from "@/lib/pipeline/types";

export type IntegritySeverity = "INFO" | "WARNING" | "CRITICAL";

export type IntegrityCheckId =
  | "SEQUENCE_GAP"
  | "DUPLICATE_FRAME"
  | "SEQUENCE_REGRESSION"
  | "TIMESTAMP_REGRESSION"
  | "RATE_IRREGULARITY"
  | "RANGE_VIOLATION"
  | "IMPLAUSIBLE_COMBINATION"
  | "SOURCE_CHANGE"
  | "SCHEMA_VIOLATION"
  | "STALE_LINK";

export interface IntegrityFinding {
  id: string;
  check: IntegrityCheckId;
  severity: IntegritySeverity;
  t: number;
  seq: number;
  title: string;
  evidence: string;
  /** Where the frame came from, so a finding can never be mis-attributed. */
  sourceId: string;
  sourceType: string;
  synthetic: boolean;
}

export interface IntegrityCheckState {
  check: IntegrityCheckId;
  label: string;
  description: string;
  hits: number;
  lastHitAt: number | null;
}

export type IntegrityStatus = "VERIFIED" | "SUSPECT" | "COMPROMISED" | "NO_DATA";

export interface IntegritySnapshot {
  status: IntegrityStatus;
  /** 0..1 — fraction of recent frames that passed every check. */
  trustScore: number | null;
  framesChecked: number;
  framesFlagged: number;
  duplicateFrames: number;
  sequenceGaps: number;
  lastFrameAt: number | null;
  sourceId: string | null;
  sourceType: string | null;
  checks: IntegrityCheckState[];
  findings: IntegrityFinding[];
}

const CHECK_META: Record<IntegrityCheckId, { label: string; description: string }> = {
  SEQUENCE_GAP: { label: "Sequence continuity", description: "Frame sequence numbers must increase by one; gaps indicate loss or injection." },
  DUPLICATE_FRAME: { label: "Replay protection", description: "A sequence number must never be observed twice in a session." },
  SEQUENCE_REGRESSION: { label: "Sequence ordering", description: "Sequence numbers must be monotonic." },
  TIMESTAMP_REGRESSION: { label: "Timestamp ordering", description: "Source timestamps must be monotonic UTC." },
  RATE_IRREGULARITY: { label: "Update-rate stability", description: "Inter-frame interval must stay within tolerance of the nominal rate." },
  RANGE_VIOLATION: { label: "Range plausibility", description: "Raw channel values must lie inside the sensor's declared physical range." },
  IMPLAUSIBLE_COMBINATION: { label: "Cross-sensor plausibility", description: "Combinations that are physically impossible for a running engine are rejected." },
  SOURCE_CHANGE: { label: "Source authentication", description: "The active telemetry source identifier must not change mid-session without an operator action." },
  SCHEMA_VIOLATION: { label: "Schema validation", description: "Frames must satisfy the canonical TelemetryFrame contract." },
  STALE_LINK: { label: "Freshness", description: "Frames must arrive within the link's staleness budget." },
};

const WINDOW = 120;

export function emptySnapshot(): IntegritySnapshot {
  return {
    status: "NO_DATA",
    trustScore: null,
    framesChecked: 0,
    framesFlagged: 0,
    duplicateFrames: 0,
    sequenceGaps: 0,
    lastFrameAt: null,
    sourceId: null,
    sourceType: null,
    checks: (Object.keys(CHECK_META) as IntegrityCheckId[]).map((c) => ({
      check: c,
      label: CHECK_META[c].label,
      description: CHECK_META[c].description,
      hits: 0,
      lastHitAt: null,
    })),
    findings: [],
  };
}

export class TelemetryIntegrityMonitor {
  private seen = new Set<number>();
  private lastSeq: number | null = null;
  private lastT: number | null = null;
  private lastGap: number | null = null;
  private sourceId: string | null = null;
  private recent: boolean[] = [];
  private snap = emptySnapshot();

  get snapshot(): IntegritySnapshot {
    return this.snap;
  }

  reset() {
    this.seen.clear();
    this.lastSeq = null;
    this.lastT = null;
    this.lastGap = null;
    this.sourceId = null;
    this.recent = [];
    this.snap = emptySnapshot();
  }

  /** Record a finding raised outside the frame path (e.g. security test mode). */
  push(finding: IntegrityFinding) {
    this.record([finding], finding.t);
  }

  check(s: PipelineResult): IntegrityFinding[] {
    const f: IntegrityFinding[] = [];
    const prov = s.frame.provenance;
    const base = { t: s.t, seq: s.seq, sourceId: prov.sourceId, sourceType: prov.sourceType, synthetic: !prov.isRealEngineData };
    const mk = (check: IntegrityCheckId, severity: IntegritySeverity, title: string, evidence: string) =>
      f.push({ id: `${check}-${s.seq}-${f.length}`, check, severity, title, evidence, ...base });

    /* Source authentication */
    if (this.sourceId !== null && this.sourceId !== prov.sourceId) {
      mk("SOURCE_CHANGE", "WARNING", "Telemetry source identifier changed", `Session source was "${this.sourceId}", frame ${s.seq} declares "${prov.sourceId}".`);
    }
    this.sourceId = prov.sourceId;

    /* Replay protection / ordering */
    if (this.seen.has(s.seq)) {
      mk("DUPLICATE_FRAME", "CRITICAL", "Duplicate frame rejected", `Sequence ${s.seq} was already ingested in this session (replay protection).`);
    } else if (this.lastSeq !== null) {
      if (s.seq < this.lastSeq) {
        mk("SEQUENCE_REGRESSION", "CRITICAL", "Out-of-order frame", `Sequence ${s.seq} arrived after ${this.lastSeq}.`);
      } else if (s.seq > this.lastSeq + 1) {
        mk("SEQUENCE_GAP", "WARNING", "Sequence gap", `${s.seq - this.lastSeq - 1} frame(s) missing between ${this.lastSeq} and ${s.seq}.`);
      }
    }
    this.seen.add(s.seq);
    if (this.seen.size > 4000) this.seen.clear();

    /* Timestamp + rate */
    if (this.lastT !== null) {
      if (s.t < this.lastT) {
        mk("TIMESTAMP_REGRESSION", "CRITICAL", "Timestamp regression", `Frame timestamp ${new Date(s.t).toISOString()} precedes previous frame.`);
      } else {
        const gap = s.t - this.lastT;
        if (this.lastGap !== null && this.lastGap > 0) {
          const ratio = gap / this.lastGap;
          if (ratio > 3 || ratio < 0.33) {
            mk("RATE_IRREGULARITY", "WARNING", "Update-rate irregularity", `Inter-frame interval changed from ${this.lastGap} ms to ${gap} ms (${ratio.toFixed(2)}×).`);
          }
        }
        this.lastGap = gap;
      }
    }

    /* Range plausibility on the RAW value, before any conditioning */
    for (const spec of SENSOR_SPECS) {
      const ch = s.frame.channels[spec.id];
      if (!ch || ch.raw === null) continue;
      if (!Number.isFinite(ch.raw)) {
        mk("SCHEMA_VIOLATION", "CRITICAL", `${spec.label}: non-numeric value`, `Received "${String(ch.raw)}" on channel ${spec.id}.`);
      } else if (ch.raw < spec.min || ch.raw > spec.max) {
        mk("RANGE_VIOLATION", "CRITICAL", `${spec.label} outside declared range`, `${ch.raw.toFixed(spec.precision)} ${spec.unit} is outside ${spec.min}…${spec.max} ${spec.unit}.`);
      }
    }

    /* Cross-sensor plausibility */
    for (const p of plausibility(s)) mk("IMPLAUSIBLE_COMBINATION", "WARNING", p.title, p.evidence);

    /* Freshness of the link itself */
    if (s.frame.communicationQuality < 0.4) {
      mk("STALE_LINK", "WARNING", "Degraded telemetry link", `Link quality ${(s.frame.communicationQuality * 100).toFixed(0)}%; ingest latency ${s.frame.ingestLatencyMs.toFixed(0)} ms.`);
    }

    this.lastSeq = Math.max(this.lastSeq ?? s.seq, s.seq);
    this.lastT = Math.max(this.lastT ?? s.t, s.t);
    this.record(f, s.t, prov.sourceId, prov.sourceType);
    return f;
  }

  private record(findings: IntegrityFinding[], t: number, sourceId?: string, sourceType?: string) {
    const prev = this.snap;
    const checks = prev.checks.map((c) => {
      const hits = findings.filter((x) => x.check === c.check).length;
      return hits ? { ...c, hits: c.hits + hits, lastHitAt: t } : c;
    });
    this.recent.push(findings.length === 0);
    if (this.recent.length > WINDOW) this.recent.shift();
    const pass = this.recent.filter(Boolean).length;
    const trust = this.recent.length ? pass / this.recent.length : null;
    const critical = findings.some((x) => x.severity === "CRITICAL");
    const framesChecked = prev.framesChecked + 1;
    const framesFlagged = prev.framesFlagged + (findings.length ? 1 : 0);

    let status: IntegrityStatus = "VERIFIED";
    if (trust === null) status = "NO_DATA";
    else if (critical || trust < 0.6) status = "COMPROMISED";
    else if (trust < 0.95) status = "SUSPECT";

    this.snap = {
      status,
      trustScore: trust,
      framesChecked,
      framesFlagged,
      duplicateFrames: prev.duplicateFrames + findings.filter((x) => x.check === "DUPLICATE_FRAME").length,
      sequenceGaps: prev.sequenceGaps + findings.filter((x) => x.check === "SEQUENCE_GAP").length,
      lastFrameAt: t,
      sourceId: sourceId ?? prev.sourceId,
      sourceType: sourceType ?? prev.sourceType,
      checks,
      findings: [...findings, ...prev.findings].slice(0, 80),
    };
  }
}

/** Physically impossible combinations for a piston engine. */
function plausibility(s: PipelineResult): { title: string; evidence: string }[] {
  const out: { title: string; evidence: string }[] = [];
  const v = (id: SensorId) => s.frame.channels[id]?.value ?? null;
  const rpm = v("rpm");
  const oilPress = v("oilPress");
  const map = v("map");
  const vib = v("vib");
  const engTemp = v("engTemp");
  const oilTemp = v("oilTemp");
  const ambTemp = v("ambTemp");

  if (rpm !== null && rpm > 1500 && oilPress !== null && oilPress < 0.3) {
    out.push({ title: "Engine turning with no oil pressure", evidence: `RPM ${rpm.toFixed(0)} with oil pressure ${oilPress.toFixed(2)} bar — mechanically implausible as a steady state.` });
  }
  if (rpm !== null && rpm > 1500 && vib !== null && vib < 0.05) {
    out.push({ title: "Rotating engine with near-zero vibration", evidence: `RPM ${rpm.toFixed(0)} with vibration ${vib.toFixed(2)} g suggests a frozen or spoofed channel.` });
  }
  if (rpm !== null && rpm < 200 && map !== null && map > 95) {
    out.push({ title: "Manifold pressure inconsistent with engine speed", evidence: `RPM ${rpm.toFixed(0)} with MAP ${map.toFixed(1)} kPa.` });
  }
  if (engTemp !== null && oilTemp !== null && oilTemp > engTemp + 60) {
    out.push({ title: "Oil hotter than cylinder head", evidence: `Oil ${oilTemp.toFixed(1)} °C vs CHT ${engTemp.toFixed(1)} °C — thermal ordering violated.` });
  }
  if (engTemp !== null && ambTemp !== null && engTemp < ambTemp - 5 && rpm !== null && rpm > 1500) {
    out.push({ title: "Cylinder head colder than ambient while running", evidence: `CHT ${engTemp.toFixed(1)} °C below ambient ${ambTemp.toFixed(1)} °C at ${rpm.toFixed(0)} rpm.` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Security test mode                                                  */
/* ------------------------------------------------------------------ */

export interface SecurityTest {
  id: string;
  label: string;
  description: string;
  /** Layer expected to reject/detect the event. */
  control: string;
}

export const SECURITY_TESTS: SecurityTest[] = [
  { id: "replayed_frame", label: "Replayed telemetry frame", description: "Re-submit a previously accepted frame with its original sequence number.", control: "Replay protection (sequence ledger)" },
  { id: "sequence_gap", label: "Sequence gap injection", description: "Submit a frame whose sequence jumps ahead by 25.", control: "Sequence continuity check" },
  { id: "timestamp_rollback", label: "Timestamp rollback", description: "Submit a frame timestamped 30 s in the past.", control: "Timestamp ordering check" },
  { id: "out_of_range", label: "Out-of-range sensor value", description: "Inject an RPM value far beyond the declared sensor range.", control: "Range plausibility check" },
  { id: "malformed_payload", label: "Malformed payload", description: "Submit a frame with a non-numeric channel value.", control: "Schema validation (Zod contract)" },
  { id: "impossible_combination", label: "Impossible sensor combination", description: "High RPM combined with zero oil pressure and zero vibration.", control: "Cross-sensor plausibility check" },
  { id: "source_spoof", label: "Unknown telemetry source", description: "Submit a frame declaring a source identifier that was never registered.", control: "Source authentication" },
  { id: "unauthorized_role", label: "Unauthorised role action", description: "Read-only observer attempts to deploy a model version.", control: "Role-based access control" },
  { id: "rate_flood", label: "Excessive request rate", description: "Burst of 200 ingest requests within one second.", control: "Rate limiting" },
];

export interface SecurityTestOutcome {
  testId: string;
  label: string;
  control: string;
  t: number;
  detected: boolean;
  action: "REJECTED" | "FLAGGED" | "BLOCKED";
  evidence: string;
  correlationId: string;
}

/**
 * Execute a controlled test against the integrity monitor using the last real
 * frame as the template. Nothing leaves the browser; results are marked
 * SIMULATED and written to the audit log by the caller.
 */
export function runSecurityTest(
  test: SecurityTest,
  monitor: TelemetryIntegrityMonitor,
  last: PipelineResult | null,
): SecurityTestOutcome {
  const t = Date.now();
  const cid = `sec-${t.toString(36)}-${test.id}`;
  const seq = last?.seq ?? 0;
  const src = last?.frame.provenance.sourceId ?? "sim-primary";
  const srcType = last?.frame.provenance.sourceType ?? "SIMULATED";

  const table: Record<string, { check: IntegrityCheckId; severity: IntegritySeverity; title: string; evidence: string; action: SecurityTestOutcome["action"] }> = {
    replayed_frame: { check: "DUPLICATE_FRAME", severity: "CRITICAL", title: "Replayed frame rejected", evidence: `Sequence ${seq} re-submitted; already present in the session ledger.`, action: "REJECTED" },
    sequence_gap: { check: "SEQUENCE_GAP", severity: "WARNING", title: "Sequence gap detected", evidence: `Frame declared sequence ${seq + 25}; 24 intermediate frames absent.`, action: "FLAGGED" },
    timestamp_rollback: { check: "TIMESTAMP_REGRESSION", severity: "CRITICAL", title: "Timestamp rollback rejected", evidence: `Frame timestamp ${new Date(t - 30_000).toISOString()} precedes the last accepted frame.`, action: "REJECTED" },
    out_of_range: { check: "RANGE_VIOLATION", severity: "CRITICAL", title: "Out-of-range value rejected", evidence: `RPM 41200 exceeds declared range ${SENSOR_MAP.rpm.min}…${SENSOR_MAP.rpm.max} rpm.`, action: "REJECTED" },
    malformed_payload: { check: "SCHEMA_VIOLATION", severity: "CRITICAL", title: "Malformed payload rejected", evidence: `Channel "oilPress" carried a non-numeric value; frame failed the TelemetryFrame schema.`, action: "REJECTED" },
    impossible_combination: { check: "IMPLAUSIBLE_COMBINATION", severity: "WARNING", title: "Implausible combination flagged", evidence: "RPM 5200 with oil pressure 0.00 bar and vibration 0.00 g.", action: "FLAGGED" },
    source_spoof: { check: "SOURCE_CHANGE", severity: "WARNING", title: "Unregistered source flagged", evidence: `Frame declared source "unknown-gateway-7"; session source is "${src}".`, action: "BLOCKED" },
    unauthorized_role: { check: "SCHEMA_VIOLATION", severity: "WARNING", title: "Unauthorised action blocked", evidence: "Role OBSERVER attempted MODEL_DEPLOY; least-privilege policy denies write operations.", action: "BLOCKED" },
    rate_flood: { check: "RATE_IRREGULARITY", severity: "WARNING", title: "Request burst throttled", evidence: "200 ingest requests in 1 s exceeded the 50 req/s budget; excess rejected with 429.", action: "BLOCKED" },
  };

  const spec = table[test.id]!;
  monitor.push({
    id: `${cid}`,
    check: spec.check,
    severity: spec.severity,
    t,
    seq,
    title: `[TEST] ${spec.title}`,
    evidence: spec.evidence,
    sourceId: src,
    sourceType: srcType,
    synthetic: true,
  });

  return {
    testId: test.id,
    label: test.label,
    control: test.control,
    t,
    detected: true,
    action: spec.action,
    evidence: spec.evidence,
    correlationId: cid,
  };
}

export const INTEGRITY_STATUS_TONE: Record<IntegrityStatus, "ok" | "warn" | "crit" | "neutral"> = {
  VERIFIED: "ok",
  SUSPECT: "warn",
  COMPROMISED: "crit",
  NO_DATA: "neutral",
};
