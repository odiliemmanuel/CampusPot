import { useEffect, useState } from "react";
import { Loader2, ScrollText, ArrowDownLeft, ArrowUpRight } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { listLedger, type LedgerEntry } from "../../lib/api";
import { formatNaira } from "../../lib/format";

const kindLabel: Record<string, string> = {
  deposit: "Deposit",
  manual_payment: "Cash payment",
  expense: "Payout",
  reversal: "Reversal",
  opening: "Opening balance",
};

function LedgerInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    listLedger(gid)
      .then(setLedger)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the ledger."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const latestBalance = ledger.length > 0 ? ledger[0].balanceAfterKobo : 0;

  return (
    <>
      <PageHeader title="Ledger" subtitle="An append-only record — nothing here can be quietly edited." />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="cp-stat mb-6 inline-flex flex-col">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Current balance</p>
        <p className="font-sora text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{formatNaira(latestBalance)}</p>
      </div>

      {ledger.length === 0 ? (
        <div className="cp-card rounded-3xl p-10 text-center">
          <ScrollText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No transactions yet.</p>
        </div>
      ) : (
        <div className="cp-card rounded-3xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <span className="col-span-5">Description</span>
            <span className="col-span-3">Type</span>
            <span className="col-span-2 text-right">Amount</span>
            <span className="col-span-2 text-right">Balance</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {ledger.map((l) => (
              <div key={l.id} className="grid sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3.5 items-center">
                <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    l.amountKobo >= 0 ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600" : "bg-rose-100 dark:bg-rose-500/15 text-rose-600"
                  }`}>
                    {l.amountKobo >= 0 ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{l.description}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(l.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <span className="sm:col-span-3 text-xs text-slate-400 capitalize">{kindLabel[l.kind] ?? l.kind.replace("_", " ")}</span>
                <span className={`sm:col-span-2 sm:text-right text-sm font-semibold ${l.amountKobo >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {l.amountKobo >= 0 ? "+" : ""}{formatNaira(l.amountKobo)}
                </span>
                <span className="sm:col-span-2 sm:text-right text-sm text-slate-500 dark:text-slate-400">
                  {formatNaira(l.balanceAfterKobo)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function Ledger() {
  return (
    <AppShell>
      <GroupGate>
        <LedgerInner />
      </GroupGate>
    </AppShell>
  );
}
