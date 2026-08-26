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

const HISTORY = 240;

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
  const [injection, setInjectionState] = useState<FaultInjection>(DEFAULT_INJECTION);
  const simRef = useRef<TwinSimulator | null>(null);
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
    setSamples([]);
    setAlerts([]);
    lastStatus.current = "";
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const sim = simRef.current!;
      const s = sim.step(1);
      setSamples((prev) => {
        const next = [...prev, s];
        return next.length > HISTORY ? next.slice(next.length - HISTORY) : next;
      });

      const newAlerts: AlertRecord[] = [];
      if (s.status !== lastStatus.current) {
        lastStatus.current = s.status;
        if (s.status !== "NORMAL") {
          newAlerts.push({
            id: `st-${s.seq}`,
            t: s.t,
            severity: s.status === "CRITICAL" ? "CRITICAL" : s.status === "NORMAL" ? "INFO" : "WARNING",
            source: s.status === "SENSOR_FAULT" ? "SENSOR" : "ENGINE",
            title: `Engine status → ${s.status.replace("_", " ")}`,
            detail: s.recommendation,
          });
        } else {
          newAlerts.push({
            id: `st-${s.seq}`,
            t: s.t,
            severity: "INFO",
            source: "ENGINE",
            title: "Engine status → NORMAL",
            detail: "All fused indicators returned within prototype thresholds.",
          });
        }
      }
      for (const [id2, r] of Object.entries(s.readings)) {
        if (r.flags.length && s.seq % 5 === 0) {
          newAlerts.push({
            id: `dq-${id2}-${s.seq}`,
            t: s.t,
            severity: r.status === "UNAVAILABLE" ? "CRITICAL" : "WARNING",
            source: "DATA",
            title: `${SENSOR_MAP[id2 as keyof typeof SENSOR_MAP].label}: ${r.flags[0]}`,
            detail: `Quality score ${(r.quality * 100).toFixed(0)}% — value withheld from fusion weighting.`,
          });
        }
      }
      if (newAlerts.length) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 120));
      }
    }, rate);
    return () => clearInterval(id);
  }, [running, rate]);

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
    }),
    [samples, alerts, running, rate, injection, setInjection, resetRun, clearAlerts],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelemetry() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTelemetry must be used inside TelemetryProvider");
  return ctx;
}
