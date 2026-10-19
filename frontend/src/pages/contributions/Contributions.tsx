import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Bell, CheckCircle2, ArrowDownLeft, RefreshCw,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listPayments, listMembers,
  draftReminder, sendReminder, walletPayPot, getStoredUser, getContributions,
  type Payment, type Membership, type ContributionsResponse, type ContributionRow,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

function statusBadge(row: ContributionRow) {
  switch (row.state) {
    case "paid":
      return { label: "Paid in full", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    case "partial":
      return { label: "Partial", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    case "unpaid":
      return { label: "Not paid", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    default:
      return { label: "—", tint: "bg-slate-100 text-slate-500 dark:bg-white/5" };
  }
}

export function ContributionsInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [contrib, setContrib] = useState<ContributionsResponse | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  const load = async () => {
    const [p, c, m] = await Promise.all([
      listPayments(gid).catch(() => [] as Payment[]),
      getContributions(gid).catch(() => null),
      listMembers(gid),
    ]);
    setPayments(p);
    setContrib(c);
    setMembers(m);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load contributions."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id]);

  const handleRemind = async (userId: string) => {
    setError("");
    try {
      const draft = await draftReminder(gid, userId);
      await sendReminder(gid, draft.id);
      setReminded((r) => ({ ...r, [userId]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reminder.");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const rows = contrib?.rows ?? [];
  const shownRows = showAllRows ? rows : rows.slice(0, 5);
  const mine = rows.find((r) => r.isMe);
  const myOwed = mine && mine.state !== "paid" && mine.state !== "none"
    ? Math.max(0, mine.amountKobo - mine.paidKobo)
    : 0;
  const unpaid = rows.filter((r) => r.state !== "paid");

  const handlePayFromWallet = async (full: boolean) => {
    setError(""); setNotice("");
    const target = full ? myOwed : nairaToKobo(payAmount);
    if (target <= 0) { setError("Enter an amount to pay."); return; }
    setPayBusy(true);
    try {
      await walletPayPot(gid, target);
      setNotice("Paid from your wallet — your contribution is updated.");
      setPayAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pay from your wallet.");
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Contributions" subtitle="Track what each member has paid and what's still due." />

      {notice && (
        <div className="mb-4 flex items-center gap-2 text-sm text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
        <div className="cp-card rounded-2xl p-3 sm:rounded-3xl sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Who has paid
            </p>
          </div>

          {contrib && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:gap-3">
              <div className="rounded-xl bg-violet-100 p-3 dark:bg-violet-500/10 sm:rounded-2xl sm:p-4">
                <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">Collected</p>
                <p className="mt-0.5 truncate font-sora text-base font-bold text-violet-800 dark:text-violet-200 sm:text-lg">
                  {formatNaira(contrib.collectedKobo)}
                </p>
              </div>
              <div className="rounded-xl bg-violet-100 p-3 dark:bg-violet-500/10 sm:rounded-2xl sm:p-4">
                <p className="text-[11px] font-medium text-brand-700 dark:text-brand-300">Target</p>
                <p className="mt-0.5 font-sora text-lg font-bold text-brand-700 dark:text-brand-300">
                  {formatNaira(contrib.expectedKobo)}
                </p>
                {contrib.levyAmountKobo > 0 && (
                  <p className="text-[10px] text-slate-400">
                    {formatNaira(contrib.levyAmountKobo)} × {rows.length} members
                  </p>
                )}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {shownRows.map((r) => {
                const badge = statusBadge(r);
                return (
                  <div key={r.userId} className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white px-2.5 py-2 dark:border-violet-300/10 dark:bg-slate-800/60 sm:gap-3 sm:p-3">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-800 text-sm font-bold text-white sm:h-9 sm:w-9">
                        {(r.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {r.name || r.userId}
                          {r.isMe && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                        </p>
                        {r.showAmount && r.state !== "none" ? (
                          <p className="text-xs text-slate-400">
                            {formatNaira(r.paidKobo)} of {formatNaira(r.amountKobo)}
                          </p>
                        ) : (
                          <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tint}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.showAmount && r.state !== "none" && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.tint}`}>
                          {badge.label}
                        </span>
                      )}
                      {canManage && r.state !== "paid" && (
                        <button
                          onClick={() => handleRemind(r.userId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200 sm:px-2.5 sm:text-[11px]"
                        >
                          {reminded[r.userId] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                          {reminded[r.userId] ? "Sent" : "Remind"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rows.length > 5 && (
            <button type="button" onClick={() => setShowAllRows((shown) => !shown)} className="mt-3 w-full rounded-xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 dark:border-violet-300/15 dark:text-violet-200 dark:hover:bg-white/5 sm:w-auto">
              {showAllRows ? "Show fewer" : `Show all ${rows.length} members`}
            </button>
          )}

        </div>

        {/* Right column */}
        <div className="space-y-6">
          {mine && mine.state !== "none" && (
            <div className="cp-card rounded-2xl p-3 sm:rounded-3xl sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Your dues
              </p>
              <div className="flex items-baseline justify-between">
                <span className="font-sora text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNaira(Math.max(0, mine.amountKobo - mine.paidKobo))}
                </span>
                <span className="text-xs text-slate-400">left to pay</span>
              </div>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Your dues</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{formatNaira(mine.amountKobo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Paid so far</span>
                  <span className="font-medium text-violet-600 dark:text-violet-400">{formatNaira(mine.paidKobo)}</span>
                </div>
              </div>
              {myOwed > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount ₦"
                      inputMode="numeric"
                      className="cp-input flex-1"
                    />
                    <button onClick={() => handlePayFromWallet(false)} disabled={payBusy} className="cp-btn-primary shrink-0 px-4">
                      {payBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Pay"}
                    </button>
                  </div>
                  <button onClick={() => handlePayFromWallet(true)} disabled={payBusy} className="cp-btn-ghost w-full text-xs">
                    Pay full balance · {formatNaira(myOwed)}
                  </button>
                </div>
              )}
            </div>
          )}

          {canManage ? (
            <div className="cp-card rounded-2xl p-3 sm:rounded-3xl sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
                Recent payments
              </p>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-400">No payments yet.</p>
              ) : (
                <div className="space-y-2">
                  {payments.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/15">
                        <ArrowDownLeft className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{p.payerName || p.quotedReference || "Deposit"}</p>
                        <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-violet-700 dark:text-violet-300">{formatNaira(p.amountKobo)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="cp-card rounded-3xl p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Still to pay ({unpaid.length})
              </p>
              {unpaid.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                  <CheckCircle2 className="w-4 h-4" /> Everyone is paid up.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {unpaid.map((r) => (
                    <span key={r.userId} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(r).tint}`}>
                      {r.name || r.userId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Contributions() {
  return (
    <AppShell>
      <GroupGate>
        <ContributionsInner />
      </GroupGate>
    </AppShell>
  );
}
