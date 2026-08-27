/**
 * Canonical telemetry contract.
 *
 * EVERY data source — simulator, replay, serial, CAN, DAQ, ECU — must emit this
 * exact structure. No downstream module may know where a frame came from,
 * except by reading `provenance`.
 */

import { z } from "zod";
import { SENSOR_SPECS, type SensorId } from "@/lib/config/registry";

/** How the data was produced. Never mislabel one as another. */
export type SourceType =
  | "SIMULATED"
  | "SYNTHETIC"
  | "REPLAY"
  | "HIL"
  | "TEST_RIG"
  | "REAL_ENGINE";

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  SIMULATED: "Simulated",
  SYNTHETIC: "Synthetic dataset",
  REPLAY: "Replay",
  HIL: "Hardware-in-the-loop",
  TEST_RIG: "Test rig",
  REAL_ENGINE: "Real engine",
};

/** Per-channel acquisition state. A channel is never silently absent. */
export type ChannelStatus =
  | "VALID"
  | "MISSING"
  | "STALE"
  | "INVALID"
  | "DEGRADED"
  | "UNAVAILABLE";

export interface Channel {
  /** Validated engineering value, or null when it cannot be trusted. */
  value: number | null;
  /** Value exactly as received, before validation/clamping. */
  raw: number | null;
  unit: string;
  status: ChannelStatus;
  /** 0..1 acquisition quality for this channel in this frame. */
  quality: number;
  /** Validation rule identifiers that fired on this frame. */
  flags: string[];
  /** UTC ms at which this channel was last sampled. */
  sampledAt: number;
}

export interface Provenance {
  sourceType: SourceType;
  /** Identifier of the concrete adapter instance. */
  sourceId: string;
  /** Adapter that produced the frame. */
  adapter: string;
  /** Configuration version in force when the frame was produced. */
  configurationVersion: string;
  /** Scenario / test-run identifier when applicable. */
  scenarioId: string | null;
  /** True only when a physical engine produced the values. */
  isRealEngineData: boolean;
}

export interface TelemetryFrame {
  engineId: string;
  vehicleId: string;
  missionId: string | null;
  /** UTC milliseconds. Storage is always UTC; display converts. */
  timestamp: number;
  sequenceNumber: number;
  /** Interval since the previous frame, seconds. */
  dt: number;
  provenance: Provenance;
  channels: Record<SensorId, Channel>;
  /** 0..1 — link quality of the transport that delivered the frame. */
  communicationQuality: number;
  /** Milliseconds between sampling and ingestion. */
  ingestLatencyMs: number;
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const channelSchema = z.object({
  value: z.number().nullable(),
  raw: z.number().nullable(),
  unit: z.string(),
  status: z.enum(["VALID", "MISSING", "STALE", "INVALID", "DEGRADED", "UNAVAILABLE"]),
  quality: z.number().min(0).max(1),
  flags: z.array(z.string()),
  sampledAt: z.number(),
});

export const provenanceSchema = z.object({
  sourceType: z.enum(["SIMULATED", "SYNTHETIC", "REPLAY", "HIL", "TEST_RIG", "REAL_ENGINE"]),
  sourceId: z.string().min(1),
  adapter: z.string().min(1),
  configurationVersion: z.string().min(1),
  scenarioId: z.string().nullable(),
  isRealEngineData: z.boolean(),
});

export const telemetryFrameSchema = z.object({
  engineId: z.string().min(1),
  vehicleId: z.string().min(1),
  missionId: z.string().nullable(),
  timestamp: z.number().int(),
  sequenceNumber: z.number().int().nonnegative(),
  dt: z.number().positive(),
  provenance: provenanceSchema,
  channels: z.record(z.string(), channelSchema),
  communicationQuality: z.number().min(0).max(1),
  ingestLatencyMs: z.number().nonnegative(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function emptyChannels(sampledAt: number): Record<SensorId, Channel> {
  return Object.fromEntries(
    SENSOR_SPECS.map((s) => [
      s.id,
      {
        value: null,
        raw: null,
        unit: s.unit,
        status: "UNAVAILABLE" as ChannelStatus,
        quality: 0,
        flags: ["NO_SOURCE"],
        sampledAt,
      },
    ]),
  ) as Record<SensorId, Channel>;
}

export function isUsable(c: Channel): boolean {
  return c.value !== null && c.status !== "UNAVAILABLE" && c.status !== "MISSING" && c.status !== "INVALID";
}

/** Frame-level data quality: mean of channel qualities, scaled by link quality. */
export function frameDataQuality(frame: TelemetryFrame): number {
  const vals = SENSOR_SPECS.map((s) => frame.channels[s.id]?.quality ?? 0);
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  return Math.max(0, Math.min(1, mean * frame.communicationQuality));
}
