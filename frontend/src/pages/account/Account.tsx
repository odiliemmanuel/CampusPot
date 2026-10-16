import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowRight, CalendarDays, Check, ChevronRight, Copy, HandCoins,
  Loader2, PiggyBank, Receipt, Wallet,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import { getAccountOverview, type AccountOverview, type PotMembership } from "../../lib/api";
import { formatNaira } from "../../lib/format";

const stateMeta: Record<PotMembership["state"], { label: string; tint: string }> = {
  paid: { label: "Paid up", tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
  partial: { label: "Part-paid", tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
  unpaid: { label: "Not paid", tint: "bg-rose-50 text-rose-600 dark:bg-rose-500/10" },
  none: { label: "No open levy", tint: "bg-slate-100 text-slate-500 dark:bg-white/5" },
};

function AccountChip({ pot }: { pot: PotMembership }) {
  const [copied, setCopied] = useState(false);
  if (!pot.virtualAccountNumber) return null;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(pot.virtualAccountNumber ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
      <Wallet className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Wallet / account number</p>
        <p className="truncate font-mono text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
          {pot.virtualAccountNumber}
        </p>
        {(pot.virtualAccountBank || pot.virtualAccountName) && (
          <p className="truncate text-[11px] text-slate-400">
            {[pot.virtualAccountBank, pot.virtualAccountName].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy account number"
        className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-brand-600 dark:hover:bg-white/10"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PotRow({ pot }: { pot: PotMembership }) {
  const meta = stateMeta[pot.state];
  const pct = pot.levyAmountKobo > 0
    ? Math.min(100, Math.round((pot.paidKobo / pot.levyAmountKobo) * 100))
    : 0;

  return (
    <Link
      to={`/pots/${pot.groupId}`}
      className="group block rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5 dark:border-white/10 dark:bg-panel-dark"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <PiggyBank className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{pot.groupName}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarDays className="h-3 w-3" />
              {pot.joinedAt ? `Joined ${new Date(pot.joinedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}` : "Member"}
              <span className="capitalize">· {pot.role}</span>
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tint}`}>
          {meta.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Expected</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {pot.levyAmountKobo > 0 ? formatNaira(pot.levyAmountKobo) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Contributed</p>
          <p className="text-sm font-semibold text-emerald-600">{formatNaira(pot.paidKobo)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Remaining</p>
          <p className="text-sm font-semibold text-amber-600">
            {pot.outstandingKobo > 0 ? formatNaira(pot.outstandingKobo) : "₦0"}
          </p>
        </div>
      </div>

      {pot.levyAmountKobo > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className={`h-full rounded-full ${pot.outstandingKobo > 0 ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pot.levyTitle && (
            <p className="mt-1.5 truncate text-[11px] text-slate-400">Toward “{pot.levyTitle}”</p>
          )}
        </div>
      )}

      <AccountChip pot={pot} />

      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
        Open pot <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function Overview() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getAccountOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your overview."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  const pots = data?.pots ?? [];
  const owed = pots.filter((p) => p.outstandingKobo > 0);

  return (
    <>
      <PageHeader
        title="Balance & History"
        subtitle="Your dues across every pot, plus every payment you've made."
      />

      {/* My totals */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-panel-dark">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <PiggyBank className="h-4 w-4" />
            </span>
            <p className="text-[11px] text-slate-500 sm:text-sm">Pots joined</p>
          </div>
          <p className="mt-1 truncate font-sora text-base font-bold text-slate-900 sm:mt-2 sm:text-2xl dark:text-white">{pots.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-panel-dark">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <HandCoins className="h-4 w-4" />
            </span>
            <p className="text-[11px] text-slate-500 sm:text-sm">You've contributed</p>
          </div>
          <p className="mt-1 truncate font-sora text-base font-bold text-slate-900 sm:mt-2 sm:text-2xl dark:text-white">
            {formatNaira(data?.totalContributedKobo ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5 dark:border-white/10 dark:bg-panel-dark">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Receipt className="h-4 w-4" />
            </span>
            <p className="text-[11px] text-slate-500 sm:text-sm">Still owed</p>
          </div>
          <p className="mt-1 truncate font-sora text-base font-bold text-slate-900 sm:mt-2 sm:text-2xl dark:text-white">
            {formatNaira(data?.totalOutstandingKobo ?? 0)}
          </p>
        </div>
      </div>

      {/* Per-pot breakdown */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Your pots
      </h2>
      {pots.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center">
          <PiggyBank className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-slate-500">You haven't joined a pot yet.</p>
          <Link to="/pots/new" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
            Create a pot <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pots.map((p) => <PotRow key={p.groupId} pot={p} />)}
        </div>
      )}

      {owed.length > 0 && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          You have {owed.length} outstanding {owed.length === 1 ? "balance" : "balances"} totalling{" "}
          <strong>{formatNaira(data?.totalOutstandingKobo ?? 0)}</strong>.
        </p>
      )}

      {/* My transactions */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Your payments
      </h2>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {(data?.transactions ?? []).length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {(data?.transactions ?? []).map((t) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t.groupName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}<span className="capitalize">{t.status}</span>
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-emerald-600">
                  +{formatNaira(t.amountKobo)}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      {pots.length === 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-500">
          <Wallet className="h-4 w-4" /> Join or create a pot to start building your history.
        </div>
      )}
    </>
  );
}

export default function Account() {
  return (
    <AppShell>
      <Overview />
    </AppShell>
  );
}
