import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  Activity,
  Boxes,
  Cpu,
  Gauge,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Pause,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldAlert,
  Signal,
  Stethoscope,
  TestTubeDiagonal,
  ClipboardCheck,
  Radio,
  Route as RouteIcon,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTelemetry } from "@/lib/sim/store";
import { STATUS_TONE, labelState } from "@/lib/sim/engine";
import { StatusPill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const NAV: { group: string; items: { to: string; label: string; icon: typeof Gauge }[] }[] = [
  {
    group: "Operations",
    items: [
      { to: "/", label: "Command Center", icon: LayoutDashboard },
      { to: "/telemetry", label: "Live Telemetry", icon: Activity },
      { to: "/twin", label: "Digital Twin", icon: GitCompareArrows },
      { to: "/sources", label: "Data Sources", icon: Radio },
    ],
  },
  {
    group: "Prognostics",
    items: [
      { to: "/health", label: "Health & PHM", icon: Gauge },
      { to: "/diagnosis", label: "Fault Diagnosis", icon: Stethoscope },
      { to: "/mission", label: "Mission Reliability", icon: ShieldAlert },
    ],
  },
  {
    group: "Engineering",
    items: [
      { to: "/history", label: "Historical Analysis", icon: History },
      { to: "/simulation", label: "Simulation Lab", icon: TestTubeDiagonal },
      { to: "/validation", label: "Validation Center", icon: ClipboardCheck },
      { to: "/models", label: "Model Management", icon: Boxes },
    ],
  },
  {
    group: "Platform",
    items: [
      { to: "/trace", label: "Trace Mode", icon: RouteIcon },
      { to: "/configuration", label: "Configuration", icon: SlidersHorizontal },
      { to: "/system", label: "System Health", icon: Cpu },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

function Clock({ t }: { t: number | null }) {
  // Rendered only after hydration: a live clock cannot match the SSR snapshot.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const label = mounted ? new Date(t ?? Date.now()).toISOString().slice(11, 19) : "--:--:--";
  return <span className="mono-num text-xs text-muted-foreground">{label} UTC</span>;
}


export function AppShell({ children }: { children: ReactNode }) {
  const { latest, running, setRunning, resetRun, samples } = useTelemetry();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Signal className="size-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">AERO-TWIN AI</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Digital Twin Platform
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.group} className="mb-5">
              <div className="label-xs px-2 pb-1.5">{group.group}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-semibold text-sidebar-primary"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3">
          <div className="label-xs">Build</div>
          <div className="mono-num text-xs text-muted-foreground">v0.9.3-prototype</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-sm font-semibold lg:hidden">AERO-TWIN AI</div>
            <p className="hidden text-xs text-muted-foreground lg:block">
              Physics-Informed Real-Time Digital Twin &amp; Prognostics Platform
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill tone={running ? "ok" : "neutral"}>
              {running ? "STREAM LIVE" : "STREAM PAUSED"}
            </StatusPill>
            <StatusPill tone={latest ? STATUS_TONE[latest.status] : "info"}>
              {latest ? latest.status.replace("_", " ") : "AWAITING DATA"}
            </StatusPill>
            <StatusPill tone="info" dot={false}>
              {latest ? labelState(latest.state) : "—"}
            </StatusPill>
            <span className="mono-num text-xs text-muted-foreground">
              {samples.length} pkt
            </span>
            <Clock t={latest?.t ?? null} />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRunning(!running)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                {running ? "Pause" : "Resume"}
              </button>
              <button
                onClick={resetRun}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </button>
            </div>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {NAV.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
                pathname === item.to ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 space-y-5 p-5">{children}</main>

        <footer className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
          AERO-TWIN AI engineering prototype — simulated telemetry. Not a certified aircraft engine
          control or airworthiness monitoring system.
        </footer>
      </div>
    </div>
  );
}
