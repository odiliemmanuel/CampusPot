import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Sparkline from "./Sparkline";

export type StatColor = "blue" | "green" | "orange" | "purple";

const palette: Record<StatColor, { tile: string; stroke: string }> = {
  blue: { tile: "bg-brand-50 text-brand-600", stroke: "#2F5BEA" },
  green: { tile: "bg-green-50 text-green-600", stroke: "#22C55E" },
  orange: { tile: "bg-amber-50 text-amber-600", stroke: "#F59E0B" },
  purple: { tile: "bg-violet-50 text-violet-600", stroke: "#8B5CF6" },
};

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Percent change vs the previous period; negative renders red/down. */
  trend: number;
  color?: StatColor;
  spark: number[];
}

export default function StatCard({ icon, label, value, trend, color = "blue", spark }: StatCardProps) {
  const up = trend >= 0;
  const c = palette[color];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.tile}`}>{icon}</div>
        <Sparkline data={spark} stroke={c.stroke} className="mt-0.5" />
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>

      <p className="mt-2 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-green-600" : "text-red-500"}`}
        >
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(trend)}%
        </span>
        <span className="text-slate-400">vs last week</span>
      </p>
    </div>
  );
}
