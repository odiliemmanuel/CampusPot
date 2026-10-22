import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatNaira } from "../../lib/format";

const COLORS = { collected: "#7c3aed", spent: "#f59e0b", balance: "#10b981", paid: "#7c3aed", partial: "#f59e0b", unpaid: "#cbd5e1" };

function shortMoney(kobo: number) {
  const naira = kobo / 100;
  if (Math.abs(naira) >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`;
  if (Math.abs(naira) >= 1_000) return `₦${(naira / 1_000).toFixed(0)}k`;
  return `₦${Math.round(naira)}`;
}

export interface PotChartRow {
  name: string;
  collected: number;
  spent: number;
  balance: number;
  outstanding: number;
  paid: number;
  partial: number;
  unpaid: number;
}

export default function PotPortfolioCharts({ rows, totalPots }: { rows: PotChartRow[]; totalPots: number }) {
  const chartHeight = Math.max(230, rows.length * 42);
  const nameTick = (value: unknown) => String(value).length > 15 ? `${String(value).slice(0, 14)}…` : String(value);
  return (
    <>
      <div className="mb-2 mt-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-sora text-base font-bold text-slate-900 dark:text-white sm:text-lg">All pots overview</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Balances, collection, spending, and member payment progress.</p>
        </div>
        <span className="shrink-0 text-[10px] text-slate-400">{rows.length} of {totalPots} pots</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["Combined balance", rows.reduce((n, row) => n + row.balance, 0)],
          ["Collected", rows.reduce((n, row) => n + row.collected, 0)],
          ["Spent", rows.reduce((n, row) => n + row.spent, 0)],
          ["Outstanding", rows.reduce((n, row) => n + row.outstanding, 0)],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#171626]">
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-0.5 truncate font-sora text-sm font-bold text-slate-900 dark:text-white">{formatNaira(value)}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#171626] sm:p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Money by pot</h3>
          <p className="mb-2 text-[11px] text-slate-400">Collected, spent, and current balance</p>
          <div className="max-h-[420px] overflow-y-auto overflow-x-hidden">
            <div style={{ height: chartHeight, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }} barCategoryGap="24%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={(value) => shortMoney(Number(value))} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={92} tickFormatter={nameTick} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => formatNaira(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="collected" name="Collected" fill={COLORS.collected} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="spent" name="Spent" fill={COLORS.spent} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="balance" name="Balance" fill={COLORS.balance} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#171626] sm:p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Contribution progress</h3>
          <p className="mb-2 text-[11px] text-slate-400">Members paid, part-paid, or still owing</p>
          <div className="max-h-[420px] overflow-y-auto overflow-x-hidden">
            <div style={{ height: chartHeight, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }} barCategoryGap="24%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={92} tickFormatter={nameTick} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value, name) => [Number(value), name]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="paid" name="Paid" stackId="members" fill={COLORS.paid} />
                  <Bar dataKey="partial" name="Part-paid" stackId="members" fill={COLORS.partial} />
                  <Bar dataKey="unpaid" name="Owing" stackId="members" fill={COLORS.unpaid} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
