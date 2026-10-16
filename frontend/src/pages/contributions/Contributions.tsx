import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Bell, CheckCircle2, Landmark, ArrowDownLeft, RefreshCw, Plus, Lock,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listPayments, listMembers, simulateDeposit, recordManualPayment,
  draftReminder, sendReminder, walletPayPot, getStoredUser, getContributions,
  type Payment, type Membership, type ContributionsResponse, type ContributionRow,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

function statusBadge(row: ContributionRow) {
  switch (row.state) {
    case "paid":
      return { label: "Paid in full", tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" };
    case "partial":
      return { label: "Partial", tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" };
    case "unpaid":
      return { label: "Not paid", tint: "bg-rose-50 text-rose-600 dark:bg-rose-500/10" };
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

  const handleSimulate = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await simulateDeposit(gid, nairaToKobo(depAmount), depRef, depPayer);
      setNotice("Deposit reconciled.");
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

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const rows = contrib?.rows ?? [];
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
      <PageHeader
        title="Contributions"
        subtitle={canManage
          ? "Every deposit reconciles to a member automatically."
          : "See who has paid — figures stay with the treasurer."}
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
        <div className="lg:col-span-2 cp-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {canManage ? "Who has paid" : "Contribution status"}
            </p>
            {!canManage && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <Lock className="w-3 h-3" /> amounts visible to treasurer
              </span>
            )}
          </div>

          {canManage && contrib && (
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Collected</p>
                <p className="mt-0.5 font-sora text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {formatNaira(contrib.collectedKobo)}
                </p>
              </div>
              <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-500/10">
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
              {rows.map((r) => {
                const badge = statusBadge(r);
                return (
                  <div key={r.userId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold shrink-0">
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
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
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

          {canManage && members.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Record a cash payment
              </p>
              <ManualPayRow members={members} onSubmit={handleManual} />
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {mine && mine.state !== "none" && (
            <div className="cp-card rounded-3xl p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Your dues
              </p>
              <div className="flex items-baseline justify-between">
                <span className="font-sora text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNaira(Math.max(0, mine.amountKobo - mine.paidKobo))}
                </span>
                <span className="text-xs text-slate-400">left to pay</span>
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
          ) : (
            <div className="cp-card rounded-3xl p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Still to pay ({unpaid.length})
              </p>
              {unpaid.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
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
