/**
 * Engineering 3D viewer.
 *
 * Renders the engine's declared component hierarchy with WebGL (three.js via
 * react-three-fiber). Every component colour comes from the Twin State Engine —
 * there is no decorative animation and no hardcoded visual state.
 *
 * If the engine profile has no CAD/GLB asset, the scene is built from the
 * declared component geometry primitives and is labelled GENERIC / APPROXIMATE.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Environment, Grid, Html, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { EngineProfile, GeometrySpec } from "@/lib/engine/profile";
import { buildParts } from "@/components/engine-parts";
import { COMPONENT_STATUS_COLOR, type TwinState } from "@/lib/twin/state";

export interface ViewerOptions {
  exploded: number;
  isolate: boolean;
  hidden: string[];
  showSensors: boolean;
  section: boolean;
  /** Which scalar drives the overlay tint: none = component status. */
  overlay: "status" | "temperature" | "vibration" | "pressure";
}

/** Apply a per-part lightness multiplier to the state colour. */
function shadeColor(hex: string, shade: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0.05, Math.min(0.95, hsl.l * shade)));
  return c;
}

function ComponentMesh({
  id,
  name,
  spec,
  color,
  selected,
  dimmed,
  explode,
  onSelect,
  pulse,
}: {
  id: string;
  name: string;
  spec: GeometrySpec;
  color: string;
  selected: boolean;
  dimmed: boolean;
  explode: number;
  onSelect: (id: string) => void;
  pulse: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const base = spec.position;
  const pos: [number, number, number] = [
    base[0] * (1 + explode * 0.55),
    base[1] * (1 + explode * 0.9) + explode * 0.05,
    base[2] * (1 + explode * 1.1),
  ];

  const parts = useMemo(() => buildParts(spec), [spec]);
  const colors = useMemo(() => parts.map((p) => shadeColor(color, p.shade)), [parts, color]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const intensity = pulse
      ? 0.32 + 0.22 * Math.sin(clock.elapsedTime * 4)
      : selected
        ? 0.4
        : hover
          ? 0.22
          : 0.04;
    group.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (m && "emissiveIntensity" in m) m.emissiveIntensity = intensity;
    });
  });

  return (
    <group
      ref={group}
      position={pos}
      rotation={spec.rotation ?? [0, 0, 0]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {parts.map((p, i) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation ?? [0, 0, 0]}>
          {p.geometry}
          <meshStandardMaterial
            color={colors[i] ?? color}
            emissive={color}
            transparent={dimmed}
            opacity={dimmed ? 0.1 : 1}
            roughness={p.roughness}
            metalness={p.metalness}
          />
        </mesh>
      ))}
      {(selected || hover) && !dimmed && (
        <Html distanceFactor={2.4} position={[0, 0.16, 0]} className="pointer-events-none">
          <div className="whitespace-nowrap rounded border border-border bg-card/95 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow">
            {name}
            <span className="ml-1 font-mono text-[9px] font-normal text-muted-foreground">{id}</span>
          </div>
        </Html>
      )}
    </group>
  );
}


function SensorMarkers({
  profile,
  state,
  onSelect,
}: {
  profile: EngineProfile;
  state: TwinState;
  onSelect: (tag: string) => void;
}) {
  return (
    <>
      {profile.sensors
        .filter((s) => s.location)
        .map((s) => {
          const reading = state.frame?.readings[s.channel];
          const ok = reading && reading.status === "HEALTHY";
          const col = ok ? "#1f6feb" : reading ? "#d18a19" : "#9aa3ad";
          const loc = s.location as [number, number, number];
          return (
            <group
              key={s.tag}
              position={loc}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(s.tag);
              }}
            >
              {/* mount boss */}
              <mesh>
                <cylinderGeometry args={[0.012, 0.014, 0.02, 12]} />
                <meshStandardMaterial color={col} metalness={0.7} roughness={0.35} />
              </mesh>
              {/* sensor body */}
              <mesh position={[0, 0.024, 0]}>
                <cylinderGeometry args={[0.009, 0.009, 0.03, 12]} />
                <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.35} metalness={0.6} roughness={0.4} />
              </mesh>
              {/* harness lead */}
              <mesh position={[0, 0.05, 0]} rotation={[0, 0, 0.5]}>
                <cylinderGeometry args={[0.003, 0.003, 0.05, 8]} />
                <meshStandardMaterial color="#4a5158" metalness={0.2} roughness={0.9} />
              </mesh>
              <Html distanceFactor={3} position={[0, 0.085, 0]} className="pointer-events-none">
                <div className="whitespace-nowrap rounded border border-border bg-card/90 px-1 text-[9px] font-mono text-muted-foreground">
                  {s.tag}
                </div>
              </Html>
            </group>
          );
        })}
    </>
  );
}

export interface Engine3DProps {
  profile: EngineProfile;
  state: TwinState;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onSelectSensor?: (tag: string) => void;
  options: ViewerOptions;
  /** Bumping this number resets the camera. */
  resetToken: number;
}

function overlayColor(
  overlay: ViewerOptions["overlay"],
  state: TwinState,
  componentId: string,
  fallback: string,
) {
  if (overlay === "status") return fallback;
  const c = state.components[componentId];
  if (!c) return "#c3c9cf";
  const channelFor: Record<string, string[]> = {
    temperature: ["engTemp", "oilTemp"],
    vibration: ["vib"],
    pressure: ["oilPress", "map"],
  };
  const wanted = channelFor[overlay] ?? [];
  const contrib = c.contributions.filter((x) => wanted.includes(x.channel) && x.usable);
  if (!contrib.length) return "#c3c9cf";
  const dev = Math.max(...contrib.map((x) => Math.abs(x.normResidual ?? 0)));
  const t = Math.min(1, dev / 4);
  const col = new THREE.Color().setHSL((1 - t) * 0.58, 0.7, 0.45);
  return `#${col.getHexString()}`;
}

function CameraRig({ resetToken }: { resetToken: number }) {
  const controls = useRef<{ reset: () => void } | null>(null);
  useEffect(() => {
    controls.current?.reset();
  }, [resetToken]);
  return (
    <OrbitControls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={controls as any}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.6}
      maxDistance={6}
    />
  );
}

export default function Engine3D({
  profile,
  state,
  selected,
  onSelect,
  onSelectSensor,
  options,
  resetToken,
}: Engine3DProps) {
  const meshes = useMemo(() => profile.components.filter((c) => c.geometry), [profile]);

  if (!meshes.length) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-surface p-8 text-center">
        <div>
          <div className="text-sm font-bold tracking-wide text-crit">
            3D GEOMETRY NOT AVAILABLE — ENGINE MODEL REQUIRED
          </div>
          <p className="mt-2 max-w-md text-xs text-muted-foreground">
            {profile.asset3d.note}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Canvas camera={{ position: [1.5, 0.9, 1.6], fov: 40 }} dpr={[1, 1.75]} shadows={false}>
      <color attach="background" args={["#f4f6f8"]} />
      <hemisphereLight args={["#ffffff", "#c8ced4", 0.55]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 2]} intensity={1.05} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />
      <directionalLight position={[0, -2, 3]} intensity={0.2} />
      <Suspense fallback={null}>
        {/* Local light probe — gives metal parts something to reflect. No CDN HDR. */}
        <Environment resolution={128}>
          <Lightformer intensity={1.6} position={[0, 3, 0]} scale={[6, 6, 1]} />
          <Lightformer intensity={0.7} color="#dfe6ec" position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
          <Lightformer intensity={0.5} color="#c9d3db" position={[4, 1, -1]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        </Environment>

        <group onPointerMissed={() => onSelect(null)}>
          {meshes.map((c) => {
            const cs = state.components[c.id];
            const status = cs?.status ?? "UNKNOWN";
            const base = COMPONENT_STATUS_COLOR[status];
            const color = overlayColor(options.overlay, state, c.id, base);
            const hidden = options.hidden.includes(c.id);
            if (hidden) return null;
            if (options.section && c.geometry!.position[2] > 0.1) return null;
            const dimmed = options.isolate && selected !== null && selected !== c.id;
            return (
              <ComponentMesh
                key={c.id}
                id={c.id}
                name={c.name}
                spec={c.geometry!}
                color={color}
                selected={selected === c.id}
                dimmed={dimmed}
                explode={options.exploded}
                onSelect={onSelect}
                pulse={status === "CRITICAL" || status === "FAULT"}
              />
            );
          })}
          {options.showSensors && (
            <SensorMarkers profile={profile} state={state} onSelect={(t) => onSelectSensor?.(t)} />
          )}
        </group>
        <Grid
          args={[6, 6]}
          position={[0, -0.42, 0]}
          cellColor="#d5dade"
          sectionColor="#c0c7cd"
          fadeDistance={9}
          infiniteGrid
        />
      </Suspense>
      <CameraRig resetToken={resetToken} />
    </Canvas>
  );
}
