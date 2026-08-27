/**
 * Representative engine part geometry.
 *
 * Each engineering component declares a `detail` kind in its EngineProfile
 * geometry spec. This module turns that kind into a small assembly of
 * primitives that reads as real hardware (finned barrels, bolted flanges,
 * webbed crankshaft, bent exhaust headers) instead of a single box.
 *
 * IMPORTANT — this is REPRESENTATIVE geometry, not vendor CAD. It carries no
 * engineering state of its own: colour, opacity and emphasis are supplied by
 * the Twin State Engine through <Engine3D>. When an authenticated GLB/STEP
 * asset is registered on the profile, this module is bypassed entirely and no
 * telemetry / twin / AI code changes.
 */

import type { ReactNode } from "react";
import type { GeometrySpec, PartDetail } from "@/lib/engine/profile";

export interface PartPiece {
  key: string;
  geometry: ReactNode;
  position: [number, number, number];
  rotation?: [number, number, number];
  /** Lightness multiplier applied to the state colour (0.6 dark … 1.35 bright). */
  shade: number;
  metalness: number;
  roughness: number;
}

const HALF_PI = Math.PI / 2;

function bolts(
  count: number,
  radius: number,
  y: number,
  axis: "y" | "x" = "y",
  size = 0.008,
): PartPiece[] {
  const out: PartPiece[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const p: [number, number, number] =
      axis === "y"
        ? [Math.cos(a) * radius, y, Math.sin(a) * radius]
        : [y, Math.cos(a) * radius, Math.sin(a) * radius];
    out.push({
      key: `bolt-${axis}-${i}-${y.toFixed(3)}`,
      geometry: <cylinderGeometry args={[size, size, size * 1.6, 6]} />,
      position: p,
      rotation: axis === "y" ? [0, 0, 0] : [0, 0, HALF_PI],
      shade: 0.72,
      metalness: 0.9,
      roughness: 0.3,
    });
  }
  return out;
}

/** Cooling fin stack around a barrel. */
function fins(count: number, r: number, from: number, to: number): PartPiece[] {
  const out: PartPiece[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push({
      key: `fin-${i}`,
      geometry: <cylinderGeometry args={[r, r, 0.006, 24]} />,
      position: [0, from + (to - from) * t, 0],
      shade: 1.12 - 0.05 * (i % 2),
      metalness: 0.35,
      roughness: 0.62,
    });
  }
  return out;
}

export function buildParts(spec: GeometrySpec): PartPiece[] {
  const [a, b, c] = spec.size;
  const detail: PartDetail = spec.detail ?? "generic";

  switch (detail) {
    /* ---------------- structure ---------------- */
    case "crankcase": {
      const [w, h, d] = [a, b, c];
      return [
        {
          key: "case",
          geometry: <boxGeometry args={[w, h, d]} />,
          position: [0, 0, 0],
          shade: 1,
          metalness: 0.45,
          roughness: 0.55,
        },
        {
          key: "sump",
          geometry: <boxGeometry args={[w * 0.72, h * 0.45, d * 0.8]} />,
          position: [0, -h * 0.6, 0],
          shade: 0.86,
          metalness: 0.5,
          roughness: 0.5,
        },
        {
          key: "deck",
          geometry: <boxGeometry args={[w * 1.02, h * 0.16, d * 1.04]} />,
          position: [0, h * 0.52, 0],
          shade: 1.15,
          metalness: 0.4,
          roughness: 0.5,
        },
        {
          key: "front-flange",
          geometry: <cylinderGeometry args={[d * 0.42, d * 0.42, 0.02, 24]} />,
          position: [w * 0.5, 0, 0],
          rotation: [0, 0, HALF_PI],
          shade: 1.1,
          metalness: 0.6,
          roughness: 0.4,
        },
        {
          key: "rear-flange",
          geometry: <cylinderGeometry args={[d * 0.42, d * 0.42, 0.02, 24]} />,
          position: [-w * 0.5, 0, 0],
          rotation: [0, 0, HALF_PI],
          shade: 1.1,
          metalness: 0.6,
          roughness: 0.4,
        },
        ...bolts(8, d * 0.34, w * 0.51, "x"),
        ...bolts(8, d * 0.34, -w * 0.51, "x"),
        // side ribs
        ...[-0.3, 0, 0.3].map((k, i) => ({
          key: `rib-${i}`,
          geometry: <boxGeometry args={[0.02, h * 0.9, d * 1.02]} />,
          position: [w * k, 0, 0] as [number, number, number],
          shade: 0.92,
          metalness: 0.45,
          roughness: 0.6,
        })),
      ];
    }

    case "cylinder": {
      // a = barrel radius, c = total height
      const rBarrel = a;
      const h = c;
      return [
        {
          key: "barrel",
          geometry: <cylinderGeometry args={[rBarrel * 0.82, rBarrel * 0.82, h * 0.6, 28]} />,
          position: [0, -h * 0.17, 0],
          shade: 0.95,
          metalness: 0.5,
          roughness: 0.55,
        },
        ...fins(9, rBarrel, -h * 0.44, h * 0.08),
        {
          key: "head",
          geometry: <boxGeometry args={[rBarrel * 1.9, h * 0.24, rBarrel * 1.8]} />,
          position: [0, h * 0.26, 0],
          shade: 1.1,
          metalness: 0.42,
          roughness: 0.5,
        },
        // head cooling fins
        ...[0, 1, 2].map((i) => ({
          key: `hfin-${i}`,
          geometry: <boxGeometry args={[rBarrel * 2.05, 0.006, rBarrel * 1.95]} />,
          position: [0, h * 0.2 + i * 0.022, 0] as [number, number, number],
          shade: 1.18,
          metalness: 0.35,
          roughness: 0.6,
        })),
        {
          key: "rocker-cover",
          geometry: <boxGeometry args={[rBarrel * 1.4, h * 0.13, rBarrel * 1.2]} />,
          position: [0, h * 0.44, 0],
          shade: 0.82,
          metalness: 0.55,
          roughness: 0.35,
        },
        // valve stems (intake / exhaust)
        {
          key: "valve-in",
          geometry: <cylinderGeometry args={[0.007, 0.007, h * 0.3, 10]} />,
          position: [0, h * 0.28, -rBarrel * 0.42],
          shade: 0.7,
          metalness: 0.95,
          roughness: 0.2,
        },
        {
          key: "valve-ex",
          geometry: <cylinderGeometry args={[0.007, 0.007, h * 0.3, 10]} />,
          position: [0, h * 0.28, rBarrel * 0.42],
          shade: 0.7,
          metalness: 0.95,
          roughness: 0.2,
        },
        {
          key: "intake-port",
          geometry: <cylinderGeometry args={[0.018, 0.018, rBarrel * 1.1, 14]} />,
          position: [0, h * 0.26, -rBarrel * 1.25],
          rotation: [HALF_PI, 0, 0],
          shade: 0.9,
          metalness: 0.5,
          roughness: 0.5,
        },
        {
          key: "exhaust-port",
          geometry: <cylinderGeometry args={[0.017, 0.017, rBarrel * 1.1, 14]} />,
          position: [0, h * 0.24, rBarrel * 1.25],
          rotation: [HALF_PI, 0, 0],
          shade: 0.78,
          metalness: 0.6,
          roughness: 0.45,
        },
        {
          key: "spark-plug",
          geometry: <cylinderGeometry args={[0.009, 0.009, 0.05, 10]} />,
          position: [rBarrel * 0.9, h * 0.3, 0],
          rotation: [0, 0, HALF_PI],
          shade: 0.68,
          metalness: 0.9,
          roughness: 0.3,
        },
        ...bolts(6, rBarrel * 0.95, h * 0.13),
      ];
    }

    case "piston": {
      const r = a;
      const h = c;
      return [
        {
          key: "crown",
          geometry: <cylinderGeometry args={[r, r, h * 0.55, 26]} />,
          position: [0, h * 0.2, 0],
          shade: 1.05,
          metalness: 0.6,
          roughness: 0.35,
        },
        {
          key: "skirt",
          geometry: <cylinderGeometry args={[r * 0.96, r * 0.94, h * 0.6, 26]} />,
          position: [0, -h * 0.22, 0],
          shade: 0.9,
          metalness: 0.55,
          roughness: 0.45,
        },
        ...[0, 1, 2].map((i) => ({
          key: `ring-${i}`,
          geometry: <torusGeometry args={[r * 1.005, 0.004, 8, 26]} />,
          position: [0, h * 0.34 - i * 0.012, 0] as [number, number, number],
          rotation: [HALF_PI, 0, 0] as [number, number, number],
          shade: 0.66,
          metalness: 0.95,
          roughness: 0.25,
        })),
        {
          key: "gudgeon",
          geometry: <cylinderGeometry args={[r * 0.22, r * 0.22, r * 2.05, 14]} />,
          position: [0, -h * 0.05, 0],
          rotation: [HALF_PI, 0, HALF_PI],
          shade: 0.7,
          metalness: 0.92,
          roughness: 0.25,
        },
      ];
    }

    case "conrod": {
      const [w, h, d] = [a, b, c];
      return [
        {
          key: "shank",
          geometry: <boxGeometry args={[w * 0.55, h * 0.72, d * 0.5]} />,
          position: [0, 0, 0],
          shade: 1,
          metalness: 0.75,
          roughness: 0.35,
        },
        {
          key: "web",
          geometry: <boxGeometry args={[w * 0.22, h * 0.74, d * 0.9]} />,
          position: [0, 0, 0],
          shade: 0.92,
          metalness: 0.75,
          roughness: 0.35,
        },
        {
          key: "small-end",
          geometry: <torusGeometry args={[w * 0.6, w * 0.22, 10, 20]} />,
          position: [0, h * 0.46, 0],
          rotation: [HALF_PI, 0, 0],
          shade: 1.1,
          metalness: 0.8,
          roughness: 0.3,
        },
        {
          key: "big-end",
          geometry: <torusGeometry args={[w * 0.95, w * 0.28, 10, 22]} />,
          position: [0, -h * 0.48, 0],
          rotation: [HALF_PI, 0, 0],
          shade: 1.1,
          metalness: 0.8,
          roughness: 0.3,
        },
        {
          key: "cap-bolt-a",
          geometry: <cylinderGeometry args={[0.005, 0.005, w * 1.1, 6]} />,
          position: [w * 0.55, -h * 0.48, 0],
          shade: 0.7,
          metalness: 0.9,
          roughness: 0.3,
        },
        {
          key: "cap-bolt-b",
          geometry: <cylinderGeometry args={[0.005, 0.005, w * 1.1, 6]} />,
          position: [-w * 0.55, -h * 0.48, 0],
          shade: 0.7,
          metalness: 0.9,
          roughness: 0.3,
        },
      ];
    }

    case "crankshaft": {
      // spec is authored as a cylinder laid along X by rotation
      const r = a;
      const len = c;
      const out: PartPiece[] = [
        {
          key: "journal",
          geometry: <cylinderGeometry args={[r * 0.55, r * 0.55, len, 22]} />,
          position: [0, 0, 0],
          shade: 0.95,
          metalness: 0.85,
          roughness: 0.28,
        },
      ];
      for (let i = 0; i < 4; i++) {
        const y = -len * 0.33 + i * (len * 0.22);
        out.push({
          key: `web-a-${i}`,
          geometry: <cylinderGeometry args={[r * 1.35, r * 1.35, r * 0.5, 20]} />,
          position: [0, y - r * 0.5, 0],
          shade: 1.08,
          metalness: 0.8,
          roughness: 0.35,
        });
        out.push({
          key: `web-b-${i}`,
          geometry: <cylinderGeometry args={[r * 1.35, r * 1.35, r * 0.5, 20]} />,
          position: [0, y + r * 0.5, 0],
          shade: 1.08,
          metalness: 0.8,
          roughness: 0.35,
        });
        out.push({
          key: `pin-${i}`,
          geometry: <cylinderGeometry args={[r * 0.45, r * 0.45, r * 1.1, 16]} />,
          position: [0, y, i % 2 === 0 ? r * 0.8 : -r * 0.8],
          shade: 0.82,
          metalness: 0.9,
          roughness: 0.25,
        });
      }
      out.push({
        key: "flywheel",
        geometry: <cylinderGeometry args={[r * 2.4, r * 2.4, r * 0.5, 28]} />,
        position: [0, -len * 0.52, 0],
        shade: 0.9,
        metalness: 0.7,
        roughness: 0.4,
      });
      return out;
    }

    case "bearing": {
      const r = a;
      const t = b;
      return [
        {
          key: "shell",
          geometry: <torusGeometry args={[r, t, 12, 26]} />,
          position: [0, 0, 0],
          shade: 1,
          metalness: 0.85,
          roughness: 0.3,
        },
        {
          key: "housing",
          geometry: <cylinderGeometry args={[r * 1.3, r * 1.3, t * 1.2, 22]} />,
          position: [0, 0, 0],
          rotation: [HALF_PI, 0, 0],
          shade: 0.86,
          metalness: 0.5,
          roughness: 0.55,
        },
        ...bolts(4, r * 1.1, 0),
      ];
    }

    /* ---------------- systems ---------------- */
    case "oil": {
      const [w, h, d] = [a, b, c];
      return [
        {
          key: "pan",
          geometry: <boxGeometry args={[w, h * 0.7, d]} />,
          position: [0, -h * 0.1, 0],
          shade: 0.95,
          metalness: 0.5,
          roughness: 0.5,
        },
        {
          key: "pump",
          geometry: <cylinderGeometry args={[h * 0.42, h * 0.42, w * 0.2, 20]} />,
          position: [-w * 0.34, h * 0.3, d * 0.2],
          rotation: [0, 0, HALF_PI],
          shade: 1.1,
          metalness: 0.6,
          roughness: 0.4,
        },
        {
          key: "filter",
          geometry: <cylinderGeometry args={[h * 0.34, h * 0.34, h * 1.05, 20]} />,
          position: [w * 0.3, h * 0.32, -d * 0.18],
          rotation: [0, 0, HALF_PI],
          shade: 0.78,
          metalness: 0.45,
          roughness: 0.6,
        },
        {
          key: "cooler",
          geometry: <boxGeometry args={[w * 0.34, h * 0.7, d * 0.3]} />,
          position: [w * 0.05, h * 0.34, d * 0.42],
          shade: 1.16,
          metalness: 0.4,
          roughness: 0.55,
        },
        {
          key: "gallery",
          geometry: <cylinderGeometry args={[0.008, 0.008, w * 0.9, 12]} />,
          position: [0, h * 0.2, -d * 0.35],
          rotation: [0, 0, HALF_PI],
          shade: 0.72,
          metalness: 0.85,
          roughness: 0.3,
        },
        ...bolts(6, Math.min(w, d) * 0.4, -h * 0.45),
      ];
    }

    case "fuel": {
      const [w, h, d] = [a, b, c];
      return [
        {
          key: "metering-unit",
          geometry: <boxGeometry args={[w * 0.8, h, d]} />,
          position: [0, 0, 0],
          shade: 1,
          metalness: 0.55,
          roughness: 0.45,
        },
        {
          key: "pump",
          geometry: <cylinderGeometry args={[h * 0.4, h * 0.4, w * 0.4, 18]} />,
          position: [w * 0.5, 0, 0],
          rotation: [0, 0, HALF_PI],
          shade: 0.85,
          metalness: 0.65,
          roughness: 0.4,
        },
        ...[0, 1, 2, 3].map((i) => ({
          key: `injector-${i}`,
          geometry: <cylinderGeometry args={[0.006, 0.006, 0.05, 8]} />,
          position: [-w * 0.3 + i * (w * 0.2), h * 0.5, 0] as [number, number, number],
          shade: 0.7,
          metalness: 0.9,
          roughness: 0.3,
        })),
        {
          key: "rail",
          geometry: <cylinderGeometry args={[0.007, 0.007, w * 1.1, 12]} />,
          position: [0, h * 0.62, 0],
          rotation: [0, 0, HALF_PI],
          shade: 0.75,
          metalness: 0.85,
          roughness: 0.3,
        },
      ];
    }

    case "cooling": {
      const [w, h, d] = [a, b, c];
      const out: PartPiece[] = [
        {
          key: "plenum",
          geometry: <boxGeometry args={[w, h, d]} />,
          position: [0, 0, 0],
          shade: 1.08,
          metalness: 0.3,
          roughness: 0.7,
        },
      ];
      for (let i = 0; i < 6; i++) {
        out.push({
          key: `baffle-${i}`,
          geometry: <boxGeometry args={[0.008, h * 2.2, d * 0.95]} />,
          position: [-w * 0.42 + i * (w * 0.168), -h * 1.1, 0],
          shade: 0.9,
          metalness: 0.35,
          roughness: 0.65,
        });
      }
      out.push({
        key: "inlet-duct",
        geometry: <cylinderGeometry args={[d * 0.3, d * 0.34, w * 0.18, 20]} />,
        position: [w * 0.46, h * 0.6, 0],
        rotation: [0, 0, HALF_PI],
        shade: 1.15,
        metalness: 0.3,
        roughness: 0.7,
      });
      return out;
    }

    case "intake": {
      const r = a;
      const len = c;
      const out: PartPiece[] = [
        {
          key: "plenum",
          geometry: <cylinderGeometry args={[r, r, len * 0.85, 22]} />,
          position: [0, 0, 0],
          shade: 1,
          metalness: 0.45,
          roughness: 0.5,
        },
        {
          key: "throttle-body",
          geometry: <cylinderGeometry args={[r * 1.25, r * 1.25, r * 1.1, 22]} />,
          position: [0, len * 0.46, 0],
          shade: 0.85,
          metalness: 0.65,
          roughness: 0.4,
        },
        {
          key: "air-filter",
          geometry: <cylinderGeometry args={[r * 1.6, r * 1.6, r * 2.2, 22]} />,
          position: [0, len * 0.62, 0],
          shade: 0.72,
          metalness: 0.2,
          roughness: 0.85,
        },
      ];
      for (let i = 0; i < 4; i++) {
        out.push({
          key: `runner-${i}`,
          geometry: <cylinderGeometry args={[r * 0.5, r * 0.55, r * 3.2, 16]} />,
          position: [0, -len * 0.33 + i * (len * 0.22), r * 1.7],
          rotation: [HALF_PI, 0, 0],
          shade: 1.1,
          metalness: 0.5,
          roughness: 0.45,
        });
      }
      return out;
    }

    case "exhaust": {
      const r = a;
      const len = c;
      const out: PartPiece[] = [
        {
          key: "collector",
          geometry: <cylinderGeometry args={[r * 1.15, r * 1.15, len * 0.8, 20]} />,
          position: [0, 0, 0],
          shade: 0.8,
          metalness: 0.7,
          roughness: 0.45,
        },
        {
          key: "tailpipe",
          geometry: <cylinderGeometry args={[r * 1.25, r * 1.25, len * 0.22, 20]} />,
          position: [0, -len * 0.5, 0],
          shade: 0.7,
          metalness: 0.75,
          roughness: 0.4,
        },
      ];
      for (let i = 0; i < 4; i++) {
        const y = -len * 0.33 + i * (len * 0.22);
        out.push({
          key: `header-${i}`,
          geometry: <cylinderGeometry args={[r * 0.55, r * 0.55, r * 3.4, 16]} />,
          position: [0, y, -r * 1.8],
          rotation: [HALF_PI, 0, 0],
          shade: 0.95,
          metalness: 0.72,
          roughness: 0.42,
        });
        out.push({
          key: `bend-${i}`,
          geometry: <torusGeometry args={[r * 0.9, r * 0.55, 10, 20, Math.PI / 2]} />,
          position: [0, y, -r * 0.1],
          rotation: [0, 0, 0],
          shade: 0.95,
          metalness: 0.72,
          roughness: 0.42,
        });
        out.push({
          key: `flange-${i}`,
          geometry: <cylinderGeometry args={[r * 0.95, r * 0.95, r * 0.16, 16]} />,
          position: [0, y, -r * 3.3],
          rotation: [HALF_PI, 0, 0],
          shade: 1.1,
          metalness: 0.7,
          roughness: 0.4,
        });
      }
      return out;
    }

    case "ignition": {
      const [w, h, d] = [a, b, c];
      const out: PartPiece[] = [
        {
          key: "module",
          geometry: <boxGeometry args={[w, h, d]} />,
          position: [0, 0, 0],
          shade: 0.8,
          metalness: 0.45,
          roughness: 0.55,
        },
        {
          key: "coil-a",
          geometry: <cylinderGeometry args={[h * 0.24, h * 0.24, h * 0.9, 16]} />,
          position: [-w * 0.22, h * 0.7, 0],
          shade: 0.66,
          metalness: 0.4,
          roughness: 0.6,
        },
        {
          key: "coil-b",
          geometry: <cylinderGeometry args={[h * 0.24, h * 0.24, h * 0.9, 16]} />,
          position: [w * 0.22, h * 0.7, 0],
          shade: 0.66,
          metalness: 0.4,
          roughness: 0.6,
        },
      ];
      // HT lead representation
      for (let i = 0; i < 4; i++) {
        out.push({
          key: `ht-${i}`,
          geometry: <cylinderGeometry args={[0.004, 0.004, w * 2.4 - i * 0.05, 8]} />,
          position: [-w * 1.1 + i * 0.03, h * 0.55 + i * 0.012, 0],
          rotation: [0, 0, HALF_PI],
          shade: 0.6,
          metalness: 0.2,
          roughness: 0.9,
        });
      }
      return out;
    }

    case "propshaft": {
      const r = a;
      const len = c;
      return [
        {
          key: "shaft",
          geometry: <cylinderGeometry args={[r * 0.7, r * 0.7, len, 20]} />,
          position: [0, 0, 0],
          shade: 0.95,
          metalness: 0.85,
          roughness: 0.3,
        },
        {
          key: "hub-flange",
          geometry: <cylinderGeometry args={[r * 1.9, r * 1.9, len * 0.12, 24]} />,
          position: [0, len * 0.48, 0],
          shade: 1.1,
          metalness: 0.7,
          roughness: 0.4,
        },
        ...bolts(6, r * 1.45, len * 0.55),
        {
          key: "seal",
          geometry: <torusGeometry args={[r * 0.85, r * 0.16, 10, 20]} />,
          position: [0, -len * 0.42, 0],
          rotation: [HALF_PI, 0, 0],
          shade: 0.65,
          metalness: 0.3,
          roughness: 0.85,
        },
      ];
    }

    /* ---------------- fallback ---------------- */
    default: {
      switch (spec.shape) {
        case "cylinder":
          return [
            {
              key: "body",
              geometry: <cylinderGeometry args={[a, b, c, 28]} />,
              position: [0, 0, 0],
              shade: 1,
              metalness: 0.35,
              roughness: 0.55,
            },
          ];
        case "sphere":
          return [
            {
              key: "body",
              geometry: <sphereGeometry args={[a, 20, 16]} />,
              position: [0, 0, 0],
              shade: 1,
              metalness: 0.35,
              roughness: 0.55,
            },
          ];
        case "torus":
          return [
            {
              key: "body",
              geometry: <torusGeometry args={[a, b, 12, 28]} />,
              position: [0, 0, 0],
              shade: 1,
              metalness: 0.6,
              roughness: 0.4,
            },
          ];
        default:
          return [
            {
              key: "body",
              geometry: <boxGeometry args={[a, b, c]} />,
              position: [0, 0, 0],
              shade: 1,
              metalness: 0.3,
              roughness: 0.6,
            },
          ];
      }
    }
  }
}
