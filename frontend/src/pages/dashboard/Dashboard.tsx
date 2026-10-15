import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet, TrendingUp, AlertCircle, CheckCircle2, Sparkles, ArrowRight,
  Clock, Loader2, Users,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import { useGroup } from "../../providers/GroupProvider";
import {
  getSummary, getOutstanding, listLedger, listExpenses,
  type GroupSummary, type OutstandingMember, type LedgerEntry, type ExpenseRequest,
} from "../../lib/api";
import { formatNaira, formatNairaCompact } from "../../lib/format";

function DashboardInner() {
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id;

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    setError("");
    Promise.all([
      getSummary(groupId),
      getOutstanding(groupId),
      listLedger(groupId),
      listExpenses(groupId),
    ])
      .then(([summaryRes, outstandingRes, ledgerList, expenseList]) => {
        setSummary(summaryRes);
        setOutstanding(outstandingRes.members);
        setLedger(ledgerList);
        setExpenses(expenseList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the dashboard."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="cp-card rounded-3xl p-8 text-center">
        <p className="text-slate-600 dark:text-slate-300">{error || "No data yet."}</p>
      </div>
    );
  }

  const owe = outstanding.filter((m) => m.state !== "paid");
  const pending = expenses.filter((e) => e.status === "pending_approval");

  const stats = [
    { label: "Pot balance", value: summary.balanceKobo, icon: Wallet, tint: "text-primary-600 bg-primary-100 dark:bg-primary-500/15" },
    { label: "Collected", value: summary.collectedKobo, icon: TrendingUp, tint: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15" },
    { label: "Outstanding", value: summary.outstandingKobo, icon: AlertCircle, tint: "text-amber-600 bg-amber-100 dark:bg-amber-500/15" },
  ];

  return (
    <>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 sm:p-8 mb-6 relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-primary-100 text-sm">{summary.groupName}</p>
            <h1 className="font-sora text-3xl sm:text-4xl font-bold text-white mt-1">
              {formatNaira(summary.balanceKobo)}
            </h1>
            <p className="text-primary-100 mt-1.5 text-sm">
              {summary.paidCount} of {summary.members} members have paid · {summary.currency}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-3">
              <p className="text-white font-bold leading-none">{summary.paidCount}/{summary.members}</p>
              <p className="text-primary-100 text-xs mt-1">paid</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-3">
              <p className="text-white font-bold leading-none">{summary.outstandingCount}</p>
              <p className="text-primary-100 text-xs mt-1">owing</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="cp-stat">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.tint}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="font-sora text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {formatNaira(s.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Who owes + AI insight */}
        <div className="lg:col-span-2 space-y-6">
          <div className="cp-card rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Who hasn't paid
              </p>
              <Link to="/contributions" className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
                Contributions <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {owe.length === 0 ? (
              <div className="flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" /> Everyone has paid — nice.
              </div>
            ) : (
              <div className="space-y-2">
                {owe.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {m.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</p>
                        <p className="text-xs text-slate-400">
                          {m.state === "partial" ? `Paid ${formatNaira(m.paidKobo)} of ${formatNaira(m.amountKobo)}` : "No payment yet"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-600 shrink-0">{formatNaira(m.outstandingKobo)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI insight */}
          <div className="rounded-3xl bg-gradient-to-br from-primary-50 to-primary-100/60 dark:from-primary-900/40 dark:to-primary-950/30 border border-primary-200 dark:border-primary-800/50 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">AI Treasurer</p>
            </div>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
              {owe.length === 0
                ? `All ${summary.members} members are square. The pot holds ${formatNaira(summary.balanceKobo)}.`
                : `${owe.length} member${owe.length > 1 ? "s" : ""} still owing — ${formatNaira(summary.outstandingKobo)} outstanding in total.`}
            </p>
            <Link to="/assistant" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300 mt-3 hover:gap-2.5 transition-all">
              Ask the AI Treasurer <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Approvals + activity */}
        <div className="space-y-6">
          <div className="cp-card rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Pending payouts
              </p>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400">No payouts awaiting approval.</p>
            ) : (
              <div className="space-y-3">
                {pending.map((e) => (
                  <Link key={e.id} to="/expenses" className="block p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 hover:border-primary-300 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{e.destination}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{formatNairaCompact(e.amountKobo)}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold mt-1 ${
                      e.riskLevel === "high" ? "text-rose-600" : e.riskLevel === "medium" ? "text-amber-600" : "text-slate-400"
                    }`}>
                      <Clock className="w-3 h-3" /> awaiting 2-of-3 approval
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="cp-card rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent activity</p>
              <Link to="/ledger" className="text-xs font-semibold text-primary-600 hover:text-primary-700">View all</Link>
            </div>
            {ledger.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing yet.</p>
            ) : (
              <div className="space-y-3">
                {ledger.slice(0, 5).map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      l.amountKobo >= 0 ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600" : "bg-rose-100 dark:bg-rose-500/15 text-rose-600"
                    }`}>
                      {l.amountKobo >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{l.description}</p>
                      <p className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${l.amountKobo >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {l.amountKobo >= 0 ? "+" : ""}{formatNairaCompact(l.amountKobo)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pending.length > 0 && (
            <Link to="/expenses" className="flex items-center justify-center gap-2 rounded-3xl bg-primary-600 text-white py-4 font-semibold hover:shadow-lg hover:shadow-primary-600/30 transition">
              <Users className="w-4 h-4" /> Review {pending.length} approval{pending.length > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <AppShell>
      <GroupGate>
        <DashboardInner />
      </GroupGate>
    </AppShell>
  );
}
