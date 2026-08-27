/**
 * Replay data source.
 *
 * Recorded telemetry (CSV / JSON upload today, CAN log later) is converted to
 * canonical TelemetryFrames at import time and replayed through EXACTLY the
 * same pipeline as the simulator. Nothing downstream changes.
 *
 * Provenance is always REPLAY — never LIVE, never REAL ENGINE.
 */

import type { AdapterDescriptor, TelemetryAdapter } from "./adapter";
import type { TelemetryFrame } from "./frame";
import { TelemetryPipeline } from "@/lib/pipeline";
import type { PipelineResult } from "@/lib/pipeline/types";

export interface ReplayDataset {
  id: string;
  name: string;
  engineId: string;
  frames: TelemetryFrame[];
  importedAt: number;
  /** Source file description, for provenance display. */
  fileName: string;
  fileFormat: string;
  rowCount: number;
  /** Rows rejected by validation at import time. */
  rejectedRows: number;
}

export class ReplayAdapter implements TelemetryAdapter {
  descriptor: AdapterDescriptor;
  private index = 0;

  constructor(private dataset: ReplayDataset) {
    this.descriptor = {
      id: `replay-${dataset.id}`,
      name: `Recorded-run replay — ${dataset.name}`,
      sourceType: "REPLAY",
      protocol: "FILE",
      status: "CONNECTED",
      statusDetail: `${dataset.rowCount} frames imported from ${dataset.fileName}`,
      device: null,
      nominalRateHz: 1,
      lastFrameAt: null,
      framesDelivered: 0,
      errors: 0,
      canProduceRealData: false,
    };
  }

  get length() {
    return this.dataset.frames.length;
  }
  get position() {
    return this.index;
  }
  get finished() {
    return this.index >= this.dataset.frames.length;
  }

  seek(i: number) {
    this.index = Math.max(0, Math.min(this.dataset.frames.length - 1, i));
  }

  connect() {
    this.descriptor.status = "CONNECTED";
  }
  disconnect() {
    this.descriptor.status = "DISABLED";
  }
  reset() {
    this.index = 0;
    this.descriptor.framesDelivered = 0;
    this.descriptor.lastFrameAt = null;
  }

  next(): TelemetryFrame | null {
    const f = this.dataset.frames[this.index];
    if (!f) return null;
    this.index += 1;
    this.descriptor.framesDelivered += 1;
    this.descriptor.lastFrameAt = f.timestamp;
    return { ...f, ingestLatencyMs: 0 };
  }
}

/** Adapter + pipeline pair so replay reuses the canonical processing chain. */
export class ReplayRunner {
  readonly adapter: ReplayAdapter;
  private pipeline = new TelemetryPipeline();

  constructor(public dataset: ReplayDataset) {
    this.adapter = new ReplayAdapter(dataset);
  }

  get position() {
    return this.adapter.position;
  }
  get length() {
    return this.adapter.length;
  }
  get finished() {
    return this.adapter.finished;
  }

  seek(i: number) {
    this.adapter.seek(i);
    this.pipeline.reset();
  }

  reset() {
    this.adapter.reset();
    this.pipeline.reset();
  }

  step(): PipelineResult | null {
    const frame = this.adapter.next();
    if (!frame) return null;
    return { ...this.pipeline.process(frame), groundTruth: null };
  }
}
