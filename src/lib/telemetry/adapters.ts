/**
 * Concrete telemetry adapters.
 *
 * Only the simulator adapter produces data today. Every other adapter is a
 * declared, inspectable interface reporting NOT_CONNECTED — the architecture is
 * ready for hardware, and the UI says so honestly instead of pretending.
 */

import { CONFIGURATION_VERSION, SENSOR_SPECS, type SensorId } from "@/lib/config/registry";
import { EngineSimulator, type FaultInjection, type SimulatedSample } from "@/lib/sim/simulator";
import { UnconnectedAdapter, type AdapterDescriptor, type TelemetryAdapter } from "./adapter";
import type { Channel, TelemetryFrame } from "./frame";

export class SimulatorAdapter implements TelemetryAdapter {
  descriptor: AdapterDescriptor = {
    id: "sim-primary",
    name: "Physics simulator (virtual engine)",
    sourceType: "SIMULATED",
    protocol: "INTERNAL",
    status: "CONNECTED",
    statusDetail: "Deterministic virtual engine with seeded noise and fault injection",
    device: null,
    nominalRateHz: 1,
    lastFrameAt: null,
    framesDelivered: 0,
    errors: 0,
    canProduceRealData: false,
  };

  /** Ground truth for the most recent frame — validation use only. */
  lastSample: SimulatedSample | null = null;

  constructor(
    private sim: EngineSimulator,
    private engineId = "ENG-01",
    private vehicleId = "UAV-ALPHA",
    private scenarioId: string | null = null,
  ) {}

  connect() {
    this.descriptor.status = "CONNECTED";
  }
  disconnect() {
    this.descriptor.status = "DISABLED";
  }
  reset() {
    this.sim.reset();
    this.lastSample = null;
    this.descriptor.framesDelivered = 0;
  }
  setInjection(f: FaultInjection) {
    this.sim.injection = f;
  }
  setScenario(id: string | null) {
    this.scenarioId = id;
  }

  next(dt: number): TelemetryFrame | null {
    if (this.descriptor.status !== "CONNECTED") return null;
    const s = this.sim.step(dt);
    this.lastSample = s;
    this.descriptor.framesDelivered += 1;
    this.descriptor.lastFrameAt = s.timestamp;

    const channels = {} as Record<SensorId, Channel>;
    for (const spec of SENSOR_SPECS) {
      const raw = s.raw[spec.id];
      channels[spec.id] = {
        value: raw,
        raw,
        unit: spec.unit,
        status: raw === null ? "MISSING" : "VALID",
        quality: raw === null ? 0 : 1,
        flags: raw === null ? ["NO_DATA"] : [],
        sampledAt: s.timestamp,
      };
    }

    return {
      engineId: this.engineId,
      vehicleId: this.vehicleId,
      missionId: null,
      timestamp: s.timestamp,
      sequenceNumber: s.seq,
      dt: s.dt,
      provenance: {
        sourceType: "SIMULATED",
        sourceId: this.descriptor.id,
        adapter: "SimulatorAdapter",
        configurationVersion: CONFIGURATION_VERSION,
        scenarioId: this.scenarioId,
        isRealEngineData: false,
      },
      channels,
      communicationQuality: 1,
      ingestLatencyMs: 0,
    };
  }
}

/** Declared but unimplemented hardware paths. */
export function hardwareAdapters(): UnconnectedAdapter[] {
  return [
    new UnconnectedAdapter({
      id: "serial-1",
      name: "Serial / UART telemetry link",
      sourceType: "TEST_RIG",
      protocol: "SERIAL",
      statusDetail: "Interface defined. No serial device bound to this deployment.",
      device: "/dev/ttyUSB0",
      nominalRateHz: 20,
      canProduceRealData: true,
    }),
    new UnconnectedAdapter({
      id: "can-1",
      name: "CAN bus gateway (J1939 / CANopen)",
      sourceType: "TEST_RIG",
      protocol: "CAN",
      statusDetail: "Interface defined. No CAN gateway reachable.",
      device: "can0 @ 500 kbit/s",
      nominalRateHz: 50,
      canProduceRealData: true,
    }),
    new UnconnectedAdapter({
      id: "daq-1",
      name: "Vibration DAQ (high-rate analogue)",
      sourceType: "TEST_RIG",
      protocol: "DAQ",
      statusDetail: "Interface defined. No DAQ hardware present.",
      device: "AI0-AI3 @ 20 kHz",
      nominalRateHz: 200,
      canProduceRealData: true,
    }),
    new UnconnectedAdapter({
      id: "ecu-1",
      name: "ECU parameter logger",
      sourceType: "REAL_ENGINE",
      protocol: "ECU",
      statusDetail: "Interface defined. No ECU session established.",
      device: "OBD/UDS",
      nominalRateHz: 10,
      canProduceRealData: true,
    }),
    new UnconnectedAdapter({
      id: "replay-1",
      name: "Recorded-run replay",
      sourceType: "REPLAY",
      protocol: "FILE",
      statusDetail: "No recorded run selected.",
      device: null,
      nominalRateHz: 1,
      canProduceRealData: false,
    }),
  ];
}
