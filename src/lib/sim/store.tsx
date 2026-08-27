import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TwinSimulator,
  SENSOR_MAP,
  type AlertRecord,
  type FaultInjection,
  type Sample,
} from "./engine";
import { ENGINE_001, getProfile, type EngineProfile } from "@/lib/engine/profile";
import { computeTwinState, emptyTwinState, type TwinState } from "@/lib/twin/state";
import { ReplayRunner, type ReplayDataset } from "@/lib/telemetry/replay";

const HISTORY = 240;

export type SourceMode = "SIMULATED" | "REPLAY";

export interface TelemetryState {
  samples: Sample[];
  latest: Sample | null;
  alerts: AlertRecord[];
  running: boolean;
  rate: number;
  injection: FaultInjection;
  connected: boolean;
  setRunning: (v: boolean) => void;
  setRate: (v: number) => void;
  setInjection: (f: Partial<FaultInjection>) => void;
  resetRun: () => void;
  clearAlerts: () => void;

  /* Engine asset + twin state */
  engineId: string;
  profile: EngineProfile;
  setEngineId: (id: string) => void;
  twinState: TwinState;
  selectedComponent: string | null;
  selectComponent: (id: string | null) => void;

  /* Data source / replay */
  source: SourceMode;
  dataset: ReplayDataset | null;
  replayPosition: number;
  replayLength: number;
  speed: number;
  setSpeed: (v: number) => void;
  loadDataset: (d: ReplayDataset) => void;
  clearDataset: () => void;
  seekReplay: (i: number) => void;
  useSimulator: () => void;
}

const Ctx = createContext<TelemetryState | null>(null);

const DEFAULT_INJECTION: FaultInjection = {
  engineFault: "none",
  engineSeverity: 0.5,
  sensorFault: "none",
  sensorTarget: "engTemp",
  sensorSeverity: 0.6,
};

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState(1000);
  const [speed, setSpeed] = useState(1);
  const [injection, setInjectionState] = useState<FaultInjection>(DEFAULT_INJECTION);
  const [engineId, setEngineIdState] = useState(ENGINE_001.engineId);
  const [selectedComponent, selectComponent] = useState<string | null>(null);
  const [source, setSource] = useState<SourceMode>("SIMULATED");
  const [dataset, setDataset] = useState<ReplayDataset | null>(null);
  const [replayPosition, setReplayPosition] = useState(0);

  const profile = useMemo(() => getProfile(engineId), [engineId]);
  const [twinState, setTwinState] = useState<TwinState>(() => emptyTwinState(getProfile(ENGINE_001.engineId)));

  const simRef = useRef<TwinSimulator | null>(null);
  const replayRef = useRef<ReplayRunner | null>(null);
  const twinRef = useRef<TwinState | null>(null);
  const framesRef = useRef(0);
  const lastStatus = useRef<string>("");

  if (!simRef.current) simRef.current = new TwinSimulator(DEFAULT_INJECTION);

  const setInjection = useCallback((f: Partial<FaultInjection>) => {
    setInjectionState((prev) => {
      const next = { ...prev, ...f };
      if (simRef.current) simRef.current.injection = next;
      return next;
    });
  }, []);

  const resetRun = useCallback(() => {
    simRef.current?.reset();
    replayRef.current?.reset();
    framesRef.current = 0;
    twinRef.current = null;
    setSamples([]);
    setAlerts([]);
    setReplayPosition(0);
    setTwinState(emptyTwinState(getProfile(engineId)));
    lastStatus.current = "";
  }, [engineId]);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const setEngineId = useCallback((id: string) => {
    setEngineIdState(id);
    selectComponent(null);
    twinRef.current = null;
    framesRef.current = 0;
    setSamples([]);
    setTwinState(emptyTwinState(getProfile(id)));
  }, []);

  const loadDataset = useCallback((d: ReplayDataset) => {
    replayRef.current = new ReplayRunner(d);
    setDataset(d);
    setSource("REPLAY");
    setEngineIdState(d.engineId);
    twinRef.current = null;
    framesRef.current = 0;
    setSamples([]);
    setReplayPosition(0);
    setTwinState(emptyTwinState(getProfile(d.engineId)));
    setRunning(true);
  }, []);

  const clearDataset = useCallback(() => {
    replayRef.current = null;
    setDataset(null);
    setSource("SIMULATED");
    twinRef.current = null;
    setSamples([]);
    setReplayPosition(0);
  }, []);

  const useSimulator = useCallback(() => {
    setSource("SIMULATED");
    twinRef.current = null;
    setSamples([]);
  }, []);

  const seekReplay = useCallback((i: number) => {
    replayRef.current?.seek(i);
    setReplayPosition(i);
    twinRef.current = null;
    setSamples([]);
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = Math.max(60, rate / Math.max(0.25, speed));
    const id = setInterval(() => {
      let s: Sample | null = null;
      if (source === "REPLAY") {
        const runner = replayRef.current;
        if (!runner) return;
        s = runner.step();
        if (!s) {
          setRunning(false);
          return;
        }
        setReplayPosition(runner.position);
      } else {
        s = simRef.current!.step(1);
      }
      if (!s) return;

      framesRef.current += 1;
      const next = computeTwinState({
        profile: getProfile(engineId),
        result: s,
        previous: twinRef.current,
        framesProcessed: framesRef.current,
        now: Date.now(),
      });
      twinRef.current = next;
      setTwinState(next);

      const frame = s;
      setSamples((prev) => {
        const arr = [...prev, frame];
        return arr.length > HISTORY ? arr.slice(arr.length - HISTORY) : arr;
      });

      const newAlerts: AlertRecord[] = [];
      if (frame.status !== lastStatus.current) {
        lastStatus.current = frame.status;
        if (frame.status !== "NORMAL") {
          newAlerts.push({
            id: `st-${frame.seq}`,
            t: frame.t,
            severity: frame.status === "CRITICAL" ? "CRITICAL" : "WARNING",
            source: frame.status === "SENSOR_FAULT" ? "SENSOR" : "ENGINE",
            title: `Engine status → ${frame.status.replace("_", " ")}`,
            detail: frame.recommendation,
          });
        } else {
          newAlerts.push({
            id: `st-${frame.seq}`,
            t: frame.t,
            severity: "INFO",
            source: "ENGINE",
            title: "Engine status → NORMAL",
            detail: "All fused indicators returned within prototype thresholds.",
          });
        }
      }
      for (const [id2, r] of Object.entries(frame.readings)) {
        if (r.flags.length && frame.seq % 5 === 0) {
          newAlerts.push({
            id: `dq-${id2}-${frame.seq}`,
            t: frame.t,
            severity: r.status === "UNAVAILABLE" ? "CRITICAL" : "WARNING",
            source: "DATA",
            title: `${SENSOR_MAP[id2 as keyof typeof SENSOR_MAP].label}: ${r.flags[0]}`,
            detail: `Quality score ${(r.quality * 100).toFixed(0)}% — value withheld from fusion weighting.`,
          });
        }
      }
      if (newAlerts.length) setAlerts((prev) => [...newAlerts, ...prev].slice(0, 120));
    }, interval);
    return () => clearInterval(id);
  }, [running, rate, speed, source, engineId]);

  const value = useMemo<TelemetryState>(
    () => ({
      samples,
      latest: samples.length ? samples[samples.length - 1]! : null,
      alerts,
      running,
      rate,
      injection,
      connected: running,
      setRunning,
      setRate,
      setInjection,
      resetRun,
      clearAlerts,
      engineId,
      profile,
      setEngineId,
      twinState,
      selectedComponent,
      selectComponent,
      source,
      dataset,
      replayPosition,
      replayLength: dataset?.frames.length ?? 0,
      speed,
      setSpeed,
      loadDataset,
      clearDataset,
      seekReplay,
      useSimulator,
    }),
    [
      samples,
      alerts,
      running,
      rate,
      injection,
      setInjection,
      resetRun,
      clearAlerts,
      engineId,
      profile,
      setEngineId,
      twinState,
      selectedComponent,
      source,
      dataset,
      replayPosition,
      speed,
      loadDataset,
      clearDataset,
      seekReplay,
      useSimulator,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelemetry() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTelemetry must be used inside TelemetryProvider");
  return ctx;
}
