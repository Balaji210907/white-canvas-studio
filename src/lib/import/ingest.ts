/**
 * Data Import module.
 *
 * File → validation → format detection → column discovery → timestamp
 * detection → unit detection → channel mapping → data-quality check → frames.
 *
 * Column names are NEVER assumed. Auto-suggestions are offered, but the
 * engineer confirms every mapping before frames are produced.
 */

import {
  CONFIGURATION_VERSION,
  SENSOR_MAP,
  SENSOR_SPECS,
  type SensorId,
} from "@/lib/config/registry";
import type { Channel, TelemetryFrame } from "@/lib/telemetry/frame";
import type { ReplayDataset } from "@/lib/telemetry/replay";

export type FileFormat = "CSV" | "TSV" | "JSON" | "UNSUPPORTED";

export interface ParsedTable {
  format: FileFormat;
  columns: string[];
  rows: (string | number | null)[][];
  fileName: string;
  /** Problems found while reading the file itself. */
  issues: string[];
}

export interface ColumnProfile {
  name: string;
  index: number;
  /** Inferred kind of the column. */
  kind: "numeric" | "timestamp" | "text" | "empty";
  numericCount: number;
  missingCount: number;
  min: number | null;
  max: number | null;
  sample: string[];
  /** Unit parsed out of the header, e.g. "oil_temp_C" → "C". */
  detectedUnit: string | null;
  /** Best-guess canonical channel. Always user-confirmable. */
  suggestedChannel: SensorId | "timestamp" | null;
  suggestionConfidence: number;
}

export interface ChannelMapping {
  channel: SensorId;
  column: string | null;
  /** Unit of the source column; conversion is applied if it differs. */
  sourceUnit: string;
}

export interface QualityReport {
  totalRows: number;
  usableRows: number;
  missingValues: number;
  outOfRange: number;
  duplicateTimestamps: number;
  outOfOrderTimestamps: number;
  invalidTimestamps: number;
  frozenChannels: SensorId[];
  spikes: number;
  gaps: number;
  unmappedChannels: SensorId[];
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function splitDelimited(text: string, delim: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));
}

export function parseFile(fileName: string, text: string): ParsedTable {
  const issues: string[] = [];
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".json") || text.trimStart().startsWith("[") || text.trimStart().startsWith("{")) {
    try {
      const raw = JSON.parse(text) as unknown;
      const arr = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { frames?: unknown[] }).frames)
          ? (raw as { frames: unknown[] }).frames
          : null;
      if (!arr || !arr.length) {
        return { format: "JSON", columns: [], rows: [], fileName, issues: ["JSON contains no array of records."] };
      }
      const columns = Array.from(
        arr.reduce<Set<string>>((set, r) => {
          Object.keys(r as Record<string, unknown>).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()),
      );
      const rows = arr.map((r) =>
        columns.map((c) => {
          const v = (r as Record<string, unknown>)[c];
          if (v === null || v === undefined) return null;
          return typeof v === "number" || typeof v === "string" ? v : String(v);
        }),
      );
      return { format: "JSON", columns, rows, fileName, issues };
    } catch (e) {
      return { format: "JSON", columns: [], rows: [], fileName, issues: [`JSON parse failed: ${String(e)}`] };
    }
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".parquet")) {
    return {
      format: "UNSUPPORTED",
      columns: [],
      rows: [],
      fileName,
      issues: [
        `${lower.endsWith(".xlsx") ? "XLSX" : "Parquet"} is not decoded in the browser build. Export the run to CSV or JSON and re-import.`,
      ],
    };
  }

  const delim = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const cells = splitDelimited(text, delim);
  if (cells.length < 2) {
    return { format: delim === "\t" ? "TSV" : "CSV", columns: [], rows: [], fileName, issues: ["File has no data rows."] };
  }
  const columns = cells[0]!;
  const rows = cells.slice(1).map((r) => {
    if (r.length !== columns.length) issues.push(`Row with ${r.length} fields (expected ${columns.length}) — padded.`);
    return columns.map((_, i) => (r[i] === undefined || r[i] === "" ? null : r[i]!));
  });
  return {
    format: delim === "\t" ? "TSV" : "CSV",
    columns,
    rows,
    fileName,
    issues: issues.slice(0, 5),
  };
}

/* ------------------------------------------------------------------ */
/* Column discovery                                                    */
/* ------------------------------------------------------------------ */

const UNIT_PATTERNS: [RegExp, string][] = [
  [/[_\s(\[](deg\s?c|degc|celsius|c)\)?\]?$/i, "°C"],
  [/[_\s(\[](deg\s?f|degf|fahrenheit|f)\)?\]?$/i, "°F"],
  [/[_\s(\[](k|kelvin)\)?\]?$/i, "K"],
  [/[_\s(\[](kpa)\)?\]?$/i, "kPa"],
  [/[_\s(\[](bar)\)?\]?$/i, "bar"],
  [/[_\s(\[](psi)\)?\]?$/i, "psi"],
  [/[_\s(\[](rpm)\)?\]?$/i, "rpm"],
  [/[_\s(\[](g|grms)\)?\]?$/i, "g"],
  [/[_\s(\[](mm\/s)\)?\]?$/i, "mm/s"],
];

const CHANNEL_HINTS: Record<SensorId, RegExp[]> = {
  rpm: [/\brpm\b/i, /eng.?speed/i, /crank.?speed/i, /\bn1\b/i],
  engTemp: [/\bcht\b/i, /cyl.*(head)?.*temp/i, /head.?temp/i, /eng.*temp/i],
  oilTemp: [/oil.*temp/i, /\bot\b/i],
  oilPress: [/oil.*(press|pres|p\b)/i, /\bop\b/i],
  map: [/\bmap\b/i, /manifold/i, /intake.*press/i, /boost/i],
  vib: [/\bvib/i, /accel/i, /rms/i],
  ambTemp: [/\boat\b/i, /amb.*temp/i, /outside.*temp/i, /air.?temp/i],
  ambPress: [/amb.*press/i, /static.*press/i, /baro/i],
};

const TIME_HINTS = [/time/i, /\bts\b/i, /timestamp/i, /date/i, /clock/i, /\bt\b/i];

function toNumber(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseTimestamp(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
  }
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : null;
}

export function profileColumns(table: ParsedTable): ColumnProfile[] {
  return table.columns.map((name, index) => {
    const raw = table.rows.map((r) => r[index] ?? null);
    const nums = raw.map(toNumber);
    const numericCount = nums.filter((n) => n !== null).length;
    const missingCount = raw.filter((v) => v === null || v === "").length;
    const present = nums.filter((n): n is number => n !== null);
    const tsParsed = raw.slice(0, 20).map(parseTimestamp).filter((x) => x !== null).length;

    const detectedUnit = UNIT_PATTERNS.find(([re]) => re.test(name))?.[1] ?? null;

    let kind: ColumnProfile["kind"] = "text";
    if (numericCount === 0 && missingCount === raw.length) kind = "empty";
    else if (TIME_HINTS.some((re) => re.test(name)) && tsParsed > raw.length * 0.5) kind = "timestamp";
    else if (numericCount > raw.length * 0.6) kind = "numeric";
    else if (tsParsed > raw.length * 0.5) kind = "timestamp";

    let suggestedChannel: ColumnProfile["suggestedChannel"] = null;
    let confidence = 0;
    if (kind === "timestamp") {
      suggestedChannel = "timestamp";
      confidence = 0.9;
    } else if (kind === "numeric") {
      for (const [ch, patterns] of Object.entries(CHANNEL_HINTS) as [SensorId, RegExp[]][]) {
        if (patterns.some((re) => re.test(name))) {
          suggestedChannel = ch;
          confidence = 0.75;
          break;
        }
      }
    }

    return {
      name,
      index,
      kind,
      numericCount,
      missingCount,
      min: present.length ? Math.min(...present) : null,
      max: present.length ? Math.max(...present) : null,
      sample: raw.slice(0, 3).map((v) => (v === null ? "—" : String(v))),
      detectedUnit,
      suggestedChannel,
      suggestionConfidence: confidence,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

export const UNIT_OPTIONS: Record<SensorId, string[]> = {
  rpm: ["rpm", "1/s"],
  engTemp: ["°C", "°F", "K"],
  oilTemp: ["°C", "°F", "K"],
  oilPress: ["bar", "kPa", "psi"],
  map: ["kPa", "bar", "psi", "inHg"],
  vib: ["g", "m/s²", "mm/s"],
  ambTemp: ["°C", "°F", "K"],
  ambPress: ["kPa", "bar", "psi", "hPa"],
};

export function convertUnit(channel: SensorId, value: number, from: string): number {
  const target = SENSOR_MAP[channel].unit;
  if (from === target) return value;
  switch (`${from}→${target}`) {
    case "°F→°C":
      return ((value - 32) * 5) / 9;
    case "K→°C":
      return value - 273.15;
    case "psi→bar":
      return value * 0.0689476;
    case "kPa→bar":
      return value / 100;
    case "bar→kPa":
      return value * 100;
    case "psi→kPa":
      return value * 6.89476;
    case "inHg→kPa":
      return value * 3.38639;
    case "hPa→kPa":
      return value / 10;
    case "1/s→rpm":
      return value * 60;
    case "m/s²→g":
      return value / 9.80665;
    case "mm/s→g":
      return value / 100; // advisory: velocity→acceleration is not exact
    default:
      return value;
  }
}

/* ------------------------------------------------------------------ */
/* Frame construction + data-quality engine                            */
/* ------------------------------------------------------------------ */

export interface BuildOptions {
  table: ParsedTable;
  timestampColumn: string | null;
  mappings: ChannelMapping[];
  engineId: string;
  vehicleId: string;
  datasetName: string;
  /** Used when no timestamp column exists. */
  assumedRateHz: number;
}

export function buildDataset(opts: BuildOptions): { dataset: ReplayDataset; quality: QualityReport } {
  const { table, timestampColumn, mappings, engineId, vehicleId, datasetName, assumedRateHz } = opts;
  const colIndex = (name: string | null) => (name === null ? -1 : table.columns.indexOf(name));
  const tsIdx = colIndex(timestampColumn);

  const quality: QualityReport = {
    totalRows: table.rows.length,
    usableRows: 0,
    missingValues: 0,
    outOfRange: 0,
    duplicateTimestamps: 0,
    outOfOrderTimestamps: 0,
    invalidTimestamps: 0,
    frozenChannels: [],
    spikes: 0,
    gaps: 0,
    unmappedChannels: SENSOR_SPECS.filter(
      (s) => !mappings.find((m) => m.channel === s.id && m.column),
    ).map((s) => s.id),
    notes: [],
  };

  const frames: TelemetryFrame[] = [];
  const seen = new Set<number>();
  let prevTs: number | null = null;
  let prevValues: Partial<Record<SensorId, number>> = {};
  const frozenCount: Partial<Record<SensorId, number>> = {};
  let rejected = 0;
  const dt0 = 1 / Math.max(0.001, assumedRateHz);

  table.rows.forEach((row, i) => {
    let ts: number | null = tsIdx >= 0 ? parseTimestamp(row[tsIdx] ?? null) : null;
    if (tsIdx >= 0 && ts === null) {
      quality.invalidTimestamps += 1;
      rejected += 1;
      return;
    }
    if (ts === null) ts = Date.now() + i * dt0 * 1000;
    if (seen.has(ts)) {
      quality.duplicateTimestamps += 1;
      rejected += 1;
      return;
    }
    if (prevTs !== null && ts < prevTs) {
      quality.outOfOrderTimestamps += 1;
      rejected += 1;
      return;
    }
    seen.add(ts);

    const dt = prevTs === null ? dt0 : Math.max(0.001, (ts - prevTs) / 1000);
    if (prevTs !== null && dt > dt0 * 5) quality.gaps += 1;

    const channels = {} as Record<SensorId, Channel>;
    for (const spec of SENSOR_SPECS) {
      const m = mappings.find((x) => x.channel === spec.id && x.column);
      if (!m) {
        channels[spec.id] = {
          value: null,
          raw: null,
          unit: spec.unit,
          status: "UNAVAILABLE",
          quality: 0,
          flags: ["NOT_MAPPED"],
          sampledAt: ts,
        };
        continue;
      }
      const rawVal = toNumber(row[colIndex(m.column)] ?? null);
      if (rawVal === null) {
        quality.missingValues += 1;
        channels[spec.id] = {
          value: null,
          raw: null,
          unit: spec.unit,
          status: "MISSING",
          quality: 0,
          flags: ["MISSING_VALUE"],
          sampledAt: ts,
        };
        continue;
      }
      const value = convertUnit(spec.id, rawVal, m.sourceUnit);
      const flags: string[] = [];
      let status: Channel["status"] = "VALID";
      let q = 1;

      if (value < spec.min || value > spec.max) {
        flags.push("OUT_OF_PHYSICAL_RANGE");
        status = "INVALID";
        q = 0;
        quality.outOfRange += 1;
      }
      const prev = prevValues[spec.id];
      if (prev !== undefined && status === "VALID") {
        const rate = Math.abs(value - prev) / dt;
        if (rate > spec.maxRate * 1.5) {
          flags.push("RATE_LIMIT_EXCEEDED");
          status = "DEGRADED";
          q = 0.35;
          quality.spikes += 1;
        }
        if (value === prev) frozenCount[spec.id] = (frozenCount[spec.id] ?? 0) + 1;
        else frozenCount[spec.id] = 0;
        if ((frozenCount[spec.id] ?? 0) > 12) {
          flags.push("FROZEN_CHANNEL");
          status = "STALE";
          q = 0.2;
          if (!quality.frozenChannels.includes(spec.id)) quality.frozenChannels.push(spec.id);
        }
      }
      if (status === "VALID" || status === "DEGRADED") prevValues[spec.id] = value;

      channels[spec.id] = {
        value: status === "INVALID" ? null : value,
        raw: rawVal,
        unit: spec.unit,
        status,
        quality: q,
        flags,
        sampledAt: ts,
      };
    }

    frames.push({
      engineId,
      vehicleId,
      missionId: null,
      timestamp: ts,
      sequenceNumber: frames.length,
      dt,
      provenance: {
        sourceType: "REPLAY",
        sourceId: `import-${datasetName}`,
        adapter: "ReplayAdapter",
        configurationVersion: CONFIGURATION_VERSION,
        scenarioId: null,
        isRealEngineData: false,
      },
      channels,
      communicationQuality: 1,
      ingestLatencyMs: 0,
    });
    prevTs = ts;
    quality.usableRows += 1;
  });

  if (tsIdx < 0) {
    quality.notes.push(
      `No timestamp column selected — frames were spaced at the declared ${assumedRateHz} Hz. Timing-derived results are approximate.`,
    );
  }
  if (quality.unmappedChannels.length) {
    quality.notes.push(
      `${quality.unmappedChannels.length} canonical channel(s) unmapped: downstream stages will report them UNAVAILABLE rather than estimate them.`,
    );
  }

  return {
    dataset: {
      id: `${Date.now()}`,
      name: datasetName,
      engineId,
      frames,
      importedAt: Date.now(),
      fileName: table.fileName,
      fileFormat: table.format,
      rowCount: frames.length,
      rejectedRows: rejected,
    },
    quality,
  };
}
