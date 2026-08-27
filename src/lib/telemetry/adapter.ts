/**
 * Data-source abstraction.
 *
 * Hardware → Edge adapter → TelemetryFrame → backend pipeline → UI.
 * The frontend never talks to a sensor. Every adapter, connected or not,
 * implements the same interface so the pipeline is source-agnostic.
 */

import type { SourceType, TelemetryFrame } from "./frame";

export type AdapterStatus =
  | "CONNECTED"
  | "CONNECTING"
  | "NOT_CONNECTED"
  | "ERROR"
  | "DISABLED";

export type AdapterProtocol =
  | "INTERNAL"
  | "FILE"
  | "SERIAL"
  | "CAN"
  | "DAQ"
  | "ECU"
  | "HTTP";

export interface AdapterDescriptor {
  id: string;
  name: string;
  sourceType: SourceType;
  protocol: AdapterProtocol;
  status: AdapterStatus;
  /** Human-readable reason for the current status. */
  statusDetail: string;
  device: string | null;
  /** Nominal frame rate, Hz. */
  nominalRateHz: number;
  lastFrameAt: number | null;
  framesDelivered: number;
  errors: number;
  /** True only when the adapter is capable of producing real engine data. */
  canProduceRealData: boolean;
}

export interface TelemetryAdapter {
  readonly descriptor: AdapterDescriptor;
  connect(): Promise<void> | void;
  disconnect(): Promise<void> | void;
  /**
   * Produce the next frame, or null when the adapter has no data.
   * Returning null is the correct behaviour for an unconnected adapter —
   * never synthesise a value to fill the gap.
   */
  next(dt: number): TelemetryFrame | null;
  reset(): void;
}

/** Adapter that exists as an interface but has no hardware behind it yet. */
export class UnconnectedAdapter implements TelemetryAdapter {
  descriptor: AdapterDescriptor;

  constructor(init: Omit<AdapterDescriptor, "status" | "lastFrameAt" | "framesDelivered" | "errors">) {
    this.descriptor = {
      ...init,
      status: "NOT_CONNECTED",
      lastFrameAt: null,
      framesDelivered: 0,
      errors: 0,
    };
  }

  connect() {
    this.descriptor.status = "NOT_CONNECTED";
  }
  disconnect() {
    this.descriptor.status = "NOT_CONNECTED";
  }
  /** No hardware, no data. This must stay null. */
  next(): TelemetryFrame | null {
    return null;
  }
  reset() {
    this.descriptor.framesDelivered = 0;
    this.descriptor.errors = 0;
    this.descriptor.lastFrameAt = null;
  }
}
