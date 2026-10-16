import { useEffect, useState, type FormEvent } from "react";
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
  draftReminder, sendReminder,
  type Payment, type OutstandingMember, type Membership,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

export function ContributionsInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
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

  const load = async () => {
    const [p, o, m] = await Promise.all([
      listPayments(gid),
      getOutstanding(gid),
      listMembers(gid),
    ]);
    setPayments(p);
    setOutstanding(o.members);
    setMembers(m);
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

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const owe = outstanding.filter((m) => m.state !== "paid");

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle="Every deposit reconciles to a member automatically."
        action={
          <button onClick={() => setShowDeposit((v) => !v)} className="cp-btn-primary">
            <Landmark className="w-4 h-4" /> Simulate deposit
          </button>
        }
      />

      {notice && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showDeposit && (
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
        {/* Outstanding */}
        <div className="lg:col-span-2 cp-card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
            Outstanding · {formatNaira(owe.reduce((s, m) => s + m.outstandingKobo, 0))}
          </p>
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

          {/* Manual record for treasurers */}
          {members.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Record a cash payment
              </p>
              <ManualPayRow members={members} onSubmit={handleManual} />
            </div>
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
