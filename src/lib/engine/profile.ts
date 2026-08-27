/**
 * AERO-TWIN — Engine Model Package.
 *
 * An Engine Model Package binds one physical engine asset to everything the
 * Digital Twin needs to represent it:
 *   identity → component hierarchy → sensor mapping → limits → 3D asset ref
 *
 * NOTHING here is a visual decoration. The component tree drives the 3D scene,
 * the sensor map drives component health, and the fault map drives localisation.
 *
 * Geometry note: no vendor CAD/GLB asset has been supplied to this deployment.
 * Where `asset3d.url` is null the viewer renders a GENERIC / APPROXIMATE
 * primitive representation built from the declared component hierarchy. It is
 * explicitly NOT the real engine geometry and is labelled as such everywhere.
 */

import type { EngineFaultId, SensorId, Subsystem } from "@/lib/config/registry";

export type ComponentId = string;

/**
 * Representative part kind. Drives the procedural detail assembly rendered by
 * the viewer. It is a VISUAL contract only — no engineering state depends on
 * it, so registering real CAD later removes it without touching twin logic.
 */
export type PartDetail =
  | "generic"
  | "crankcase"
  | "cylinder"
  | "piston"
  | "conrod"
  | "crankshaft"
  | "bearing"
  | "oil"
  | "fuel"
  | "cooling"
  | "intake"
  | "exhaust"
  | "ignition"
  | "propshaft";

export interface GeometrySpec {
  /** Primitive used by the generic representation. */
  shape: "box" | "cylinder" | "sphere" | "torus";
  /** Metres, engine-local frame. */
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  /** Representative part kind; defaults to the bare primitive. */
  detail?: PartDetail;
}


export interface ComponentNode {
  id: ComponentId;
  name: string;
  subsystem: Subsystem;
  /** Free-text engineering description shown in the inspection panel. */
  description: string;
  /** Parent component id, or null for the engine root. */
  parent: ComponentId | null;
  /** Present only for components that have a geometric representation. */
  geometry: GeometrySpec | null;
  /** Structural/functional links used by the reasoning graph. */
  influences: ComponentId[];
}

export interface SensorMapping {
  /** Physical sensor tag as it would appear on the harness. */
  tag: string;
  /** Canonical telemetry channel this sensor feeds. */
  channel: SensorId;
  /** Components this sensor observes, with contribution weight 0..1. */
  targets: { componentId: ComponentId; weight: number }[];
  /** Where the sensor physically sits (engine-local metres) for the 3D overlay. */
  location: [number, number, number] | null;
  type: string;
  sampleHz: number;
  calibration: string | null;
}

export interface OperatingLimit {
  channel: SensorId;
  caution: [number, number] | null;
  limit: [number, number];
  note: string;
}

export interface EngineProfile {
  /* Identity */
  engineId: string;
  engineType: string;
  manufacturer: string;
  model: string;
  serialNumber: string | null;
  configuration: string;
  build: string;
  createdAt: string;
  dataSource: "SIMULATED" | "REPLAY" | "TEST_RIG" | "REAL_ENGINE" | "NONE";

  /* Versions — every result must be attributable to these */
  twinModelVersion: string;
  calibrationVersion: string;
  sensorMapVersion: string;
  faultModelVersion: string;

  /* 3D asset */
  asset3d: {
    /** URL of a real GLB/GLTF asset. Null = geometry not supplied. */
    url: string | null;
    format: "GLB" | "GLTF" | "OBJ" | "FBX" | "NONE";
    fidelity: "EXACT_VALIDATED" | "GENERIC_APPROXIMATE" | "UNAVAILABLE";
    note: string;
  };

  components: ComponentNode[];
  sensors: SensorMapping[];
  limits: OperatingLimit[];
  /** Which components a diagnosed fault implicates, with weight 0..1. */
  faultComponents: Partial<Record<EngineFaultId, { componentId: ComponentId; weight: number }[]>>;
}

/* ------------------------------------------------------------------ */
/* ENGINE-001 — 4-cylinder inline aero piston engine (generic layout)  */
/* ------------------------------------------------------------------ */

function cylinder(i: number): ComponentNode[] {
  const x = -0.33 + i * 0.22;
  const n = i + 1;
  return [
    {
      id: `CYL_${n}`,
      name: `Cylinder ${n}`,
      subsystem: "THERMAL",
      description: `Cylinder ${n} assembly: barrel, head, valves and cooling fins.`,
      parent: "CYLINDER_ASSY",
      geometry: { shape: "cylinder", position: [x, 0.3, 0], size: [0.09, 0.09, 0.26] , detail: "cylinder"},
      influences: [`PISTON_${n}`, "EXHAUST", "COOLING"],
    },
    {
      id: `PISTON_${n}`,
      name: `Piston ${n}`,
      subsystem: "MECHANICAL",
      description: `Piston, rings and gudgeon pin for cylinder ${n}.`,
      parent: "CYLINDER_ASSY",
      geometry: { shape: "cylinder", position: [x, 0.14, 0], size: [0.075, 0.075, 0.07] , detail: "piston"},
      influences: [`CONROD_${n}`],
    },
    {
      id: `CONROD_${n}`,
      name: `Connecting rod ${n}`,
      subsystem: "MECHANICAL",
      description: `Connecting rod ${n} with big-end bearing shell.`,
      parent: "CRANK_ASSY",
      geometry: { shape: "box", position: [x, 0.02, 0], size: [0.03, 0.14, 0.03] , detail: "conrod"},
      influences: ["CRANKSHAFT"],
    },
  ];
}

const ENGINE_001_COMPONENTS: ComponentNode[] = [
  {
    id: "ENGINE",
    name: "Engine assembly",
    subsystem: "MECHANICAL",
    description: "Complete powerplant as installed on the airframe.",
    parent: null,
    geometry: null,
    influences: [],
  },
  {
    id: "BLOCK",
    name: "Engine block / crankcase",
    subsystem: "MECHANICAL",
    description: "Structural crankcase carrying the cylinder assembly and main bearings.",
    parent: "ENGINE",
    geometry: { shape: "box", position: [0, -0.05, 0], size: [0.95, 0.2, 0.26] , detail: "crankcase"},
    influences: ["BEARING_1", "BEARING_2"],
  },
  {
    id: "CYLINDER_ASSY",
    name: "Cylinder assembly",
    subsystem: "THERMAL",
    description: "Four air-cooled cylinders with heads, valves and cooling fins.",
    parent: "ENGINE",
    geometry: null,
    influences: [],
  },
  ...cylinder(0),
  ...cylinder(1),
  ...cylinder(2),
  ...cylinder(3),
  {
    id: "CRANK_ASSY",
    name: "Crank assembly",
    subsystem: "MECHANICAL",
    description: "Crankshaft, connecting rods and main bearings.",
    parent: "ENGINE",
    geometry: null,
    influences: [],
  },
  {
    id: "CRANKSHAFT",
    name: "Crankshaft",
    subsystem: "MECHANICAL",
    description: "Rotating assembly transmitting piston force to the propeller shaft.",
    parent: "CRANK_ASSY",
    geometry: { shape: "cylinder", position: [0, -0.05, 0], size: [0.04, 0.04, 0.86], rotation: [0, 0, Math.PI / 2] , detail: "crankshaft"},
    influences: ["PROP_SHAFT", "BEARING_1", "BEARING_2"],
  },
  {
    id: "BEARING_1",
    name: "Main bearing 1 (front)",
    subsystem: "MECHANICAL",
    description: "Forward main journal bearing, closest to the propeller load path.",
    parent: "CRANK_ASSY",
    geometry: { shape: "torus", position: [0.36, -0.05, 0], size: [0.055, 0.018, 0.02], rotation: [0, Math.PI / 2, 0] , detail: "bearing"},
    influences: ["CRANKSHAFT"],
  },
  {
    id: "BEARING_2",
    name: "Main bearing 2 (rear)",
    subsystem: "MECHANICAL",
    description: "Rear main journal bearing.",
    parent: "CRANK_ASSY",
    geometry: { shape: "torus", position: [-0.36, -0.05, 0], size: [0.055, 0.018, 0.02], rotation: [0, Math.PI / 2, 0] , detail: "bearing"},
    influences: ["CRANKSHAFT"],
  },
  {
    id: "OIL_SYSTEM",
    name: "Oil system",
    subsystem: "LUBRICATION",
    description: "Pump, gallery, filter and cooler supplying pressurised oil to the bearings.",
    parent: "ENGINE",
    geometry: { shape: "box", position: [0, -0.22, 0.02], size: [0.42, 0.13, 0.2] , detail: "oil"},
    influences: ["BEARING_1", "BEARING_2", "CRANKSHAFT"],
  },
  {
    id: "FUEL_SYSTEM",
    name: "Fuel system",
    subsystem: "INDUCTION",
    description: "Fuel pump, metering unit and injectors / carburettor.",
    parent: "ENGINE",
    geometry: { shape: "box", position: [-0.3, 0.08, -0.2], size: [0.2, 0.1, 0.1] , detail: "fuel"},
    influences: ["CYLINDER_ASSY"],
  },
  {
    id: "COOLING",
    name: "Cooling system",
    subsystem: "THERMAL",
    description: "Cooling airflow ducting and baffles over the cylinder fins.",
    parent: "ENGINE",
    geometry: { shape: "box", position: [0, 0.46, 0], size: [0.9, 0.05, 0.3] , detail: "cooling"},
    influences: ["CYLINDER_ASSY"],
  },
  {
    id: "INTAKE",
    name: "Intake system",
    subsystem: "INDUCTION",
    description: "Air filter, throttle body and inlet manifold runners.",
    parent: "ENGINE",
    geometry: { shape: "cylinder", position: [0, 0.2, -0.22], size: [0.05, 0.05, 0.8], rotation: [0, 0, Math.PI / 2] , detail: "intake"},
    influences: ["CYLINDER_ASSY"],
  },
  {
    id: "EXHAUST",
    name: "Exhaust system",
    subsystem: "THERMAL",
    description: "Exhaust headers and collector.",
    parent: "ENGINE",
    geometry: { shape: "cylinder", position: [0, 0.16, 0.24], size: [0.045, 0.045, 0.8], rotation: [0, 0, Math.PI / 2] , detail: "exhaust"},
    influences: [],
  },
  {
    id: "IGNITION",
    name: "Ignition system",
    subsystem: "MECHANICAL",
    description: "Dual ignition modules, coils and harness.",
    parent: "ENGINE",
    geometry: { shape: "box", position: [0.34, 0.1, -0.2], size: [0.16, 0.1, 0.09] , detail: "ignition"},
    influences: ["CYLINDER_ASSY"],
  },
  {
    id: "PROP_SHAFT",
    name: "Propeller shaft",
    subsystem: "MECHANICAL",
    description: "Output shaft / reduction drive to the propeller.",
    parent: "ENGINE",
    geometry: { shape: "cylinder", position: [0.62, -0.05, 0], size: [0.05, 0.05, 0.3], rotation: [0, 0, Math.PI / 2] , detail: "propshaft"},
    influences: [],
  },
];

const ENGINE_001_SENSORS: SensorMapping[] = [
  {
    tag: "RPM_SENSOR_01",
    channel: "rpm",
    type: "Hall-effect crank speed pickup",
    sampleHz: 50,
    calibration: "60-2 tooth wheel, factory default",
    location: [-0.42, -0.05, 0.1],
    targets: [
      { componentId: "CRANKSHAFT", weight: 1 },
      { componentId: "IGNITION", weight: 0.4 },
      { componentId: "PROP_SHAFT", weight: 0.3 },
    ],
  },
  {
    tag: "CHT_SENSOR_02",
    channel: "engTemp",
    type: "K-type cylinder-head thermocouple",
    sampleHz: 10,
    calibration: null,
    location: [-0.11, 0.42, 0],
    targets: [
      { componentId: "CYL_1", weight: 0.6 },
      { componentId: "CYL_2", weight: 1 },
      { componentId: "CYL_3", weight: 0.6 },
      { componentId: "CYL_4", weight: 0.4 },
      { componentId: "COOLING", weight: 0.8 },
    ],
  },
  {
    tag: "OIL_TEMP_01",
    channel: "oilTemp",
    type: "PT1000 oil gallery probe",
    sampleHz: 5,
    calibration: null,
    location: [0.14, -0.26, 0.1],
    targets: [
      { componentId: "OIL_SYSTEM", weight: 1 },
      { componentId: "BEARING_1", weight: 0.45 },
      { componentId: "BEARING_2", weight: 0.45 },
    ],
  },
  {
    tag: "OIL_PRESSURE_01",
    channel: "oilPress",
    type: "Piezoresistive gallery pressure transducer",
    sampleHz: 20,
    calibration: null,
    location: [-0.14, -0.26, 0.1],
    targets: [
      { componentId: "OIL_SYSTEM", weight: 1 },
      { componentId: "BEARING_1", weight: 0.6 },
      { componentId: "BEARING_2", weight: 0.6 },
    ],
  },
  {
    tag: "MAP_SENSOR_01",
    channel: "map",
    type: "Absolute manifold pressure sensor",
    sampleHz: 50,
    calibration: null,
    location: [0.1, 0.24, -0.24],
    targets: [
      { componentId: "INTAKE", weight: 1 },
      { componentId: "FUEL_SYSTEM", weight: 0.5 },
    ],
  },
  {
    tag: "VIB_SENSOR_01",
    channel: "vib",
    type: "Triaxial MEMS accelerometer (RMS band)",
    sampleHz: 200,
    calibration: null,
    location: [0.3, -0.14, 0.12],
    targets: [
      { componentId: "BEARING_1", weight: 1 },
      { componentId: "BEARING_2", weight: 0.8 },
      { componentId: "CRANKSHAFT", weight: 0.7 },
      { componentId: "PROP_SHAFT", weight: 0.4 },
    ],
  },
  {
    tag: "OAT_01",
    channel: "ambTemp",
    type: "Air-data outside temperature probe",
    sampleHz: 1,
    calibration: null,
    location: null,
    targets: [],
  },
  {
    tag: "PAMB_01",
    channel: "ambPress",
    type: "Air-data static pressure",
    sampleHz: 1,
    calibration: null,
    location: null,
    targets: [],
  },
];

const ENGINE_001_LIMITS: OperatingLimit[] = [
  { channel: "rpm", caution: [800, 5600], limit: [0, 6200], note: "Continuous max 5600 rpm; transient to 6200 rpm." },
  { channel: "engTemp", caution: [60, 210], limit: [-40, 245], note: "CHT red line 245 °C." },
  { channel: "oilTemp", caution: [50, 115], limit: [-40, 135], note: "Oil red line 135 °C." },
  { channel: "oilPress", caution: [1.4, 5.5], limit: [0.8, 7], note: "Minimum 0.8 bar at idle." },
  { channel: "map", caution: [25, 108], limit: [10, 120], note: "Manifold pressure envelope." },
  { channel: "vib", caution: [0, 3.2], limit: [0, 6], note: "Broadband RMS advisory limit." },
];

export const ENGINE_001: EngineProfile = {
  engineId: "ENGINE-001",
  engineType: "4-cylinder, 4-stroke, air-cooled aero piston engine",
  manufacturer: "NOT SPECIFIED",
  model: "GENERIC-MALE-UAV-4C",
  serialNumber: null,
  configuration: "Inline-4, direct drive, dual ignition",
  build: "Prototype configuration — no build record supplied",
  createdAt: "2026-08-27T00:00:00Z",
  dataSource: "SIMULATED",
  twinModelVersion: "twin-1.2.0",
  calibrationVersion: "cal-synthetic-0.3",
  sensorMapVersion: "map-1.0.0",
  faultModelVersion: "fault-1.1.0",
  asset3d: {
    url: null,
    format: "NONE",
    fidelity: "GENERIC_APPROXIMATE",
    note:
      "No vendor CAD/GLB asset supplied. Viewer renders an approximate primitive layout derived from the declared component hierarchy. This is NOT the real engine geometry.",
  },
  components: ENGINE_001_COMPONENTS,
  sensors: ENGINE_001_SENSORS,
  limits: ENGINE_001_LIMITS,
  faultComponents: {
    oil_degradation: [
      { componentId: "OIL_SYSTEM", weight: 1 },
      { componentId: "BEARING_1", weight: 0.5 },
      { componentId: "BEARING_2", weight: 0.5 },
    ],
    cooling_loss: [
      { componentId: "COOLING", weight: 1 },
      { componentId: "CYL_2", weight: 0.7 },
      { componentId: "CYL_3", weight: 0.5 },
    ],
    bearing_wear: [
      { componentId: "BEARING_1", weight: 1 },
      { componentId: "BEARING_2", weight: 0.8 },
      { componentId: "CRANKSHAFT", weight: 0.5 },
    ],
    mixture_lean: [
      { componentId: "FUEL_SYSTEM", weight: 1 },
      { componentId: "CYLINDER_ASSY", weight: 0.6 },
    ],
    ignition_misfire: [
      { componentId: "IGNITION", weight: 1 },
      { componentId: "CYL_2", weight: 0.4 },
      { componentId: "CRANKSHAFT", weight: 0.3 },
    ],
    intake_leak: [
      { componentId: "INTAKE", weight: 1 },
      { componentId: "FUEL_SYSTEM", weight: 0.4 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* ENGINE-TEST-001 — 2-cylinder test-cell asset, no geometry supplied  */
/* ------------------------------------------------------------------ */

export const ENGINE_TEST_001: EngineProfile = {
  engineId: "ENGINE-TEST-001",
  engineType: "2-cylinder, 2-stroke test-cell engine",
  manufacturer: "NOT SPECIFIED",
  model: "TEST-CELL-2C",
  serialNumber: null,
  configuration: "Opposed-twin, test-stand mounted",
  build: "Test-cell article — no build record supplied",
  createdAt: "2026-08-27T00:00:00Z",
  dataSource: "NONE",
  twinModelVersion: "twin-1.2.0",
  calibrationVersion: "cal-none",
  sensorMapVersion: "map-0.1.0",
  faultModelVersion: "fault-1.1.0",
  asset3d: {
    url: null,
    format: "NONE",
    fidelity: "UNAVAILABLE",
    note: "3D GEOMETRY NOT AVAILABLE — ENGINE MODEL REQUIRED. Register a GLB/GLTF asset for this engine before the 3D twin can be used.",
  },
  components: [
    {
      id: "ENGINE",
      name: "Engine assembly",
      subsystem: "MECHANICAL",
      description: "Test-cell engine. Component hierarchy not yet defined.",
      parent: null,
      geometry: null,
      influences: [],
    },
  ],
  sensors: [],
  limits: [],
  faultComponents: {},
};

export const ENGINE_PROFILES: EngineProfile[] = [ENGINE_001, ENGINE_TEST_001];

export function getProfile(engineId: string): EngineProfile {
  return ENGINE_PROFILES.find((p) => p.engineId === engineId) ?? ENGINE_001;
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

export interface TreeNode extends ComponentNode {
  children: TreeNode[];
  depth: number;
}

export function buildTree(profile: EngineProfile): TreeNode | null {
  const byId = new Map<string, TreeNode>(
    profile.components.map((c) => [c.id, { ...c, children: [], depth: 0 }]),
  );
  let root: TreeNode | null = null;
  for (const node of byId.values()) {
    if (node.parent === null) root = node;
    else byId.get(node.parent)?.children.push(node);
  }
  const setDepth = (n: TreeNode, d: number) => {
    n.depth = d;
    n.children.forEach((c) => setDepth(c, d + 1));
  };
  if (root) setDepth(root, 0);
  return root;
}

export function flattenTree(root: TreeNode | null): TreeNode[] {
  if (!root) return [];
  return [root, ...root.children.flatMap((c) => flattenTree(c))];
}

/** Sensors that contribute to a component, with weights. */
export function sensorsForComponent(profile: EngineProfile, componentId: ComponentId) {
  return profile.sensors
    .map((s) => {
      const t = s.targets.find((x) => x.componentId === componentId);
      return t ? { sensor: s, weight: t.weight } : null;
    })
    .filter((x): x is { sensor: SensorMapping; weight: number } => x !== null);
}

/** Coverage statistics used by the 3D twin validation panel. */
export function mappingCoverage(profile: EngineProfile) {
  const mappedComponents = new Set(
    profile.sensors.flatMap((s) => s.targets.map((t) => t.componentId)),
  );
  const geometric = profile.components.filter((c) => c.geometry !== null);
  const unmappedComponents = geometric.filter((c) => !mappedComponents.has(c.id));
  const unmappedChannels = profile.sensors.filter((s) => s.targets.length === 0);
  const pct = geometric.length
    ? Math.round(((geometric.length - unmappedComponents.length) / geometric.length) * 100)
    : 0;
  return {
    geometricComponents: geometric.length,
    mappedComponents: geometric.length - unmappedComponents.length,
    unmappedComponents,
    unmappedChannels,
    coveragePct: pct,
  };
}
