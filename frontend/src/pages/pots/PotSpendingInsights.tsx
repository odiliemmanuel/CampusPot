import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Repeat2, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { ExpenseRequest } from "../../lib/api";
import { formatNaira } from "../../lib/format";

interface Props {
  expenses: ExpenseRequest[];
  groupId: string;
}

function completedAt(expense: ExpenseRequest) {
  const date = new Date(expense.executedAt || expense.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function categoryKey(expense: ExpenseRequest) {
  return expense.category?.trim().toLocaleLowerCase() || "";
}

export default function PotSpendingInsights({ expenses, groupId }: Props) {
  const completed = useMemo(
    () => expenses.filter((expense) => expense.status === "completed" && completedAt(expense)),
    [expenses],
  );

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { key, month: date.toLocaleDateString("en-NG", { month: "short" }), amount: 0 };
    });
  }, []);

  const chartData = useMemo(() => {
    const totals = new Map(months.map((month) => [month.key, 0]));
    completed.forEach((expense) => {
      const date = completedAt(expense)!;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (totals.has(key)) totals.set(key, totals.get(key)! + expense.amountKobo);
    });
    return months.map((month) => ({ ...month, amount: totals.get(month.key) || 0 }));
  }, [completed, months]);

  const recurring = useMemo(() => {
    const byCategory = new Map<string, ExpenseRequest[]>();
    completed.forEach((expense) => {
      const category = categoryKey(expense);
      if (!category) return;
      byCategory.set(category, [...(byCategory.get(category) || []), expense]);
    });
    const matches: { category: string; count: number; average: number; cadence: string }[] = [];
    byCategory.forEach((items, category) => {
      const dated = items.map((expense) => ({ expense, date: completedAt(expense)! })).sort((a, b) => a.date.getTime() - b.date.getTime());
      const intervals = dated.slice(1).map((item, index) => item.date.getTime() - dated[index].date.getTime());
      const monthly = intervals.filter((interval) => interval >= 25 * 86400000 && interval <= 35 * 86400000).length;
      const weekly = intervals.filter((interval) => interval >= 5 * 86400000 && interval <= 9 * 86400000).length;
      const cadence = monthly ? "Monthly" : weekly ? "Weekly" : "";
      if (!cadence) return;
      const picked = dated.slice(-Math.max(2, (cadence === "Monthly" ? monthly : weekly) + 1));
      matches.push({
        category: dated[dated.length - 1]?.expense.category?.trim() || category,
        count: picked.length,
        average: Math.round(picked.reduce((sum, item) => sum + item.expense.amountKobo, 0) / picked.length),
        cadence,
      });
    });
    return matches.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [completed]);

  const last = chartData[chartData.length - 1]?.amount || 0;
  const prior = chartData[chartData.length - 2]?.amount || 0;
  const change = prior > 0 ? Math.round(((last - prior) / prior) * 100) : null;

  return (
    <section className="mb-4 rounded-xl border border-slate-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-panel-dark sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Spending & recurring patterns</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Completed payouts, grouped by payment date</p>
        </div>
        {change !== null && prior > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${change > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
            {change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change > 0 ? "+" : ""}{change}% vs last month
          </span>
        )}
      </div>

      {completed.length === 0 ? (
        <div className="rounded-lg bg-slate-50 px-3 py-5 text-center text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Completed payout history will appear here as this pot is used.
        </div>
      ) : (
        <div className="h-48 w-full sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} tickFormatter={(value: number) => value >= 100000000 ? `₦${(value / 100000000).toFixed(0)}m` : value >= 100000 ? `₦${(value / 100000).toFixed(0)}k` : `₦${Math.round(value / 100)}`} />
              <Tooltip
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <p className="mb-1 text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{formatNaira(Number(payload[0].value))}</p>
                  </div>
                ) : null}
              />
              <Bar dataKey="amount" name="Completed payouts" fill="#7c3aed" radius={[5, 5, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <Repeat2 className="h-3.5 w-3.5 text-violet-600" /> Potential recurring payouts
        </div>
        {recurring.length ? (
          <div className="space-y-1.5">
            {recurring.map((item) => (
              <div key={item.category} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/5">
                <p className="min-w-0 text-xs text-slate-700 dark:text-slate-200"><span className="font-semibold">{item.category}</span><span className="text-slate-500"> · {item.cadence.toLowerCase()} pattern, {item.count} payouts</span></p>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">~{formatNaira(item.average)}</span>
              </div>
            ))}
            <p className="text-[10px] text-slate-400">Pattern hints use completed payouts with a category and regular dates. Review before treating a cost as recurring.</p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">No regular pattern is clear yet. Repeated categorized payouts will be highlighted here.</p>
        )}
        <Link to={`/pots/${groupId}?tab=payouts`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
          Review payout history <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
