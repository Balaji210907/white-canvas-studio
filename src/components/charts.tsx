import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 10,
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 10 },
};

export interface Series {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export function TrendChart({
  data,
  series,
  height = 180,
  yDomain,
  zeroLine,
  xKey = "x",
}: {
  data: Record<string, number | string>[];
  series: Series[];
  height?: number;
  yDomain?: [number | string, number | string];
  zeroLine?: boolean;
  xKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey={xKey} {...axis} minTickGap={40} />
        <YAxis {...axis} width={46} domain={yDomain ?? ["auto", "auto"]} />
        <Tooltip {...tooltipStyle} />
        {zeroLine && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BandChart({
  data,
  height = 200,
}: {
  data: { x: string; value: number; lo: number; hi: number }[];
  height?: number;
}) {
  const shaped = data.map((d) => ({ ...d, band: [d.lo, d.hi] as [number, number] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={shaped} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="x" {...axis} minTickGap={40} />
        <YAxis {...axis} width={46} domain={[0, 100]} />
        <Tooltip {...tooltipStyle} />
        <Area
          dataKey="band"
          stroke="none"
          fill="var(--color-info)"
          fillOpacity={0.12}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="Health Index"
          stroke="var(--color-info)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
