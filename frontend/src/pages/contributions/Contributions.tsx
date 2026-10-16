import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Send, Bell, CheckCircle2, Landmark, ArrowDownLeft, RefreshCw, Plus,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listPayments, getOutstanding, simulateDeposit, recordManualPayment, listMembers,
  draftReminder, sendReminder, walletPayPot, getStoredUser, getSummary,
  type Payment, type OutstandingMember, type Membership, type Levy, type GroupSummary,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

export function ContributionsInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
  const [levy, setLevy] = useState<Levy | undefined>(undefined);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Deposit simulator form state
  const [depAmount, setDepAmount] = useState("");
  const [depRef, setDepRef] = useState("");
  const [depPayer, setDepPayer] = useState("");
  const [showDeposit, setShowDeposit] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // Who has paid and how much, summed from matched/partial payments. Only the
  // treasurer sees this breakdown.
  const paidBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of payments) {
      if (!p.userId || (p.status !== "matched" && p.status !== "partial")) continue;
      totals.set(p.userId, (totals.get(p.userId) ?? 0) + p.amountKobo);
    }
    return members
      .map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? m.userId,
        paidKobo: totals.get(m.userId) ?? 0,
      }))
      .filter((r) => r.paidKobo > 0)
      .sort((a, b) => b.paidKobo - a.paidKobo);
  }, [payments, members]);

  const load = async () => {
    const [p, o, m, s] = await Promise.all([
      listPayments(gid),
      // A pot with no open levy isn't an error — it just has nothing to track.
      getOutstanding(gid).catch(() => ({ members: [] as OutstandingMember[], levy: null as Levy | null })),
      listMembers(gid),
      getSummary(gid).catch(() => null),
    ]);
    setPayments(p);
    setOutstanding(o.members);
    setLevy(o.levy ?? undefined);
    setMembers(m);
    setSummary(s);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load contributions."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  const handleSimulate = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await simulateDeposit(gid, nairaToKobo(depAmount), depRef, depPayer);
      setNotice("Deposit reconciled — see it in the ledger.");
      setDepAmount(""); setDepRef(""); setDepPayer(""); setShowDeposit(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the deposit.");
    } finally {
      setBusy(false);
    }
  };

  const handleManual = async (userId: string, amountNaira: string) => {
    setError(""); setNotice("");
    try {
      await recordManualPayment(gid, userId, nairaToKobo(amountNaira));
      setNotice("Payment recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
    }
  };

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

  const handlePayFromWallet = async (full: boolean) => {
    setError(""); setNotice("");
    const target = full && mine ? mine.outstandingKobo : nairaToKobo(payAmount);
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

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const owe = outstanding.filter((m) => m.state !== "paid");

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";
  const mine = outstanding.find((m) => m.userId === myId);
  const myStatus = levy
    ? mine
      ? { amount: mine.amountKobo, paid: mine.paidKobo, owed: mine.outstandingKobo }
      : { amount: levy.amountKobo, paid: levy.amountKobo, owed: 0 }
    : null;

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle={canManage
          ? "Every deposit reconciles to a member automatically."
          : "Your dues and every deposit in this pot."}
        action={canManage ? (
          <button onClick={() => setShowDeposit((v) => !v)} className="cp-btn-primary">
            <Landmark className="w-4 h-4" /> Simulate deposit
          </button>
        ) : undefined}
      />

      {notice && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {canManage && showDeposit && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          onSubmit={handleSimulate}
          className="cp-card rounded-3xl p-5 mb-6 grid sm:grid-cols-4 gap-3 items-end"
        >
          <div className="sm:col-span-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount (₦)</label>
            <input required value={depAmount} onChange={(e) => setDepAmount(e.target.value)} placeholder="5000" className="cp-input mt-1" />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Reference</label>
            <input value={depRef} onChange={(e) => setDepRef(e.target.value)} placeholder="member ref code" className="cp-input mt-1" />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Payer name</label>
            <input value={depPayer} onChange={(e) => setDepPayer(e.target.value)} placeholder="e.g. FATIMA B" className="cp-input mt-1" />
          </div>
          <button type="submit" disabled={busy} className="cp-btn-primary">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowDownLeft className="w-4 h-4" />} Record
          </button>
        </motion.form>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Outstanding — treasurers see the full breakdown; members see their own */}
        <div className="lg:col-span-2 cp-card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
            {canManage
              ? `Outstanding · ${formatNaira(owe.reduce((s, m) => s + m.outstandingKobo, 0))}`
              : "Your status"}
          </p>

          {canManage ? (
            <>
              {levy && members.length > 0 && (
                <div className="mb-4 -mt-1 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-400/80">Collected</p>
                    <p className="font-sora text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatNaira(summary?.collectedKobo ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-brand-50 px-3 py-2 dark:bg-brand-500/10">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600/80">Target</p>
                    <p className="font-sora text-base font-bold text-brand-700 dark:text-brand-300">
                      {formatNaira(summary?.expectedKobo ?? levy.amountKobo * members.length)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatNaira(levy.amountKobo)} × {members.length} members
                    </p>
                  </div>
                </div>
              )}
              {owe.length === 0 ? (
                <div className="flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" /> Everyone is fully paid up.
                </div>
              ) : (
                <div className="space-y-2">
                  {owe.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</p>
                        <p className="text-xs text-slate-400">
                          {m.state === "partial" ? `Paid ${formatNaira(m.paidKobo)} of ${formatNaira(m.amountKobo)}` : `Owes ${formatNaira(m.amountKobo)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-amber-600">{formatNaira(m.outstandingKobo)}</span>
                        <button
                          onClick={() => handleRemind(m.userId)}
                          disabled={reminded[m.userId]}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-500/25 transition disabled:opacity-60"
                        >
                          {reminded[m.userId] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                          {reminded[m.userId] ? "Sent" : "Remind"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Who has paid, and how much — treasurer only */}
              {paidBreakdown.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                    Paid ({paidBreakdown.length})
                  </p>
                  <div className="space-y-2">
                    {paidBreakdown.map((r) => (
                      <div key={r.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.name}</p>
                        <span className="text-sm font-bold text-emerald-600 shrink-0">+{formatNaira(r.paidKobo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual record for treasurers */}
              {members.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                    Record a cash payment
                  </p>
                  <ManualPayRow members={members} onSubmit={handleManual} />
                </div>
              )}
            </>
          ) : myStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {levy?.title ?? "Current levy"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Paid {formatNaira(myStatus.paid)} of {formatNaira(myStatus.amount)}
                  </p>
                </div>
                <span className={`text-sm font-bold ${myStatus.owed > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {myStatus.owed > 0 ? `${formatNaira(myStatus.owed)} left` : "Paid up"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Quote reference <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{activeGroup!.joinCode}</span> on a bank transfer, or pay straight from your wallet.
              </p>

              {myStatus.owed > 0 && (
                <div className="rounded-xl border border-primary-100 dark:border-primary-500/20 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Pay from wallet
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount ₦"
                      inputMode="numeric"
                      className="cp-input flex-1"
                    />
                    <button
                      onClick={() => handlePayFromWallet(false)}
                      disabled={payBusy}
                      className="cp-btn-primary shrink-0 px-4"
                    >
                      {payBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Pay"}
                    </button>
                  </div>
                  <button
                    onClick={() => handlePayFromWallet(true)}
                    disabled={payBusy}
                    className="cp-btn-ghost w-full text-xs"
                  >
                    Pay full balance · {formatNaira(myStatus.owed)}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No open levy right now.</p>
          )}
        </div>

        {/* Recent payments */}
        <div className="cp-card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
            Recent payments
          </p>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{p.payerName || p.quotedReference || "Deposit"}</p>
                    <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 shrink-0">{formatNaira(p.amountKobo)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ManualPayRow({
  members,
  onSubmit,
}: {
  members: Membership[];
  onSubmit: (userId: string, amount: string) => void;
}) {
  const [userId, setUserId] = useState(members[0]?.userId ?? "");
  const [amount, setAmount] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!userId || !amount) return;
        onSubmit(userId, amount);
        setAmount("");
      }}
      className="flex flex-wrap gap-2 items-end"
    >
      <select value={userId} onChange={(e) => setUserId(e.target.value)} className="cp-input flex-1 min-w-[140px]">
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {(m.user?.name ?? m.userId) + (m.user?.email ? ` (${m.user.email})` : "")}
          </option>
        ))}
      </select>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₦" className="cp-input w-32" />
      <button type="submit" className="cp-btn-ghost"><Plus className="w-4 h-4" /> Record</button>
    </form>
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
