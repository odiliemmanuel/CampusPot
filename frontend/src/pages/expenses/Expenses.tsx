import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Clock, Gavel, Landmark, Loader2, Plus,
  Send, ShieldCheck, ThumbsDown, ThumbsUp, User, Users, X,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listExpenses, listApprovals, listMembers, listDisputes, createExpense,
  decideExpense, executeExpense, raiseDispute, getStoredUser,
  type AuthUser, type ExpenseRequest, type Approval, type Role, type Membership, type Dispute,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

const BANKS = ["B Moni", "GTBank", "Opay", "Access Bank", "Zenith Bank", "UBA", "Kuda", "Moniepoint"];

const statusStyle: Record<string, string> = {
  pending_approval: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  executing: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
  failed: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

type DestMode = "member" | "user" | "bank";

export function ExpensesInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [approvals, setApprovals] = useState<Record<string, Approval[]>>({});
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [destMode, setDestMode] = useState<DestMode>("member");
  const [memberId, setMemberId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [bankName, setBankName] = useState(BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const uid = getStoredUser<AuthUser>()?.id;
  const [myRole, setMyRole] = useState<Role | null>(null);
  const isTreasurer = myRole === "treasurer";

  const load = async () => {
    const [list, people, openDisputes] = await Promise.all([
      listExpenses(gid),
      listMembers(gid),
      listDisputes(gid).catch(() => [] as Dispute[]),
    ]);
    setExpenses(list);
    setMembers(people);
    setDisputes(openDisputes);
    setMyRole((people.find((m) => m.userId === uid)?.role as Role) ?? null);
    const entries = await Promise.all(
      list
        .filter((e) => e.status === "pending_approval")
        .map(async (e) => [e.id, await listApprovals(gid, e.id)] as const)
    );
    setApprovals(Object.fromEntries(entries));
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load payouts."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid, uid]);

  const destination = (() => {
    if (destMode === "member") {
      const m = members.find((x) => x.userId === memberId);
      return m ? `Member: ${m.user?.name ?? "member"} (${m.reference})` : "";
    }
    if (destMode === "user") {
      return recipient.trim() ? `PotKeeper: ${recipient.trim()}` : "";
    }
    return accountNumber.trim()
      ? `Bank: ${bankName} · ${accountNumber.trim()}${accountName.trim() ? ` · ${accountName.trim()}` : ""}`
      : "";
  })();

  const resetForm = () => {
    setAmount(""); setCategory(""); setNote("");
    setMemberId(""); setRecipient(""); setAccountNumber(""); setAccountName("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await createExpense(gid, {
        amountKobo: nairaToKobo(amount),
        destinationType: destMode,
        recipient:
          destMode === "member" ? memberId : destMode === "user" ? recipient.trim() : accountNumber.trim(),
        bankName: destMode === "bank" ? bankName : undefined,
        accountName: destMode === "bank" ? accountName.trim() : undefined,
        category,
        note,
      });
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the request.");
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (id: string, decision: "approve" | "reject") => {
    setError(""); setBusy(true);
    try {
      await decideExpense(gid, id, decision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record your decision.");
    } finally {
      setBusy(false);
    }
  };

  const handleExecute = async (id: string) => {
    setError(""); setBusy(true);
    try {
      await executeExpense(gid, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't run the payout.");
    } finally {
      setBusy(false);
    }
  };

  const handleDispute = async (id: string) => {
    setError(""); setBusy(true);
    try {
      await raiseDispute(gid, "Disputing this payout.", id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't raise the dispute.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle={
          isTreasurer
            ? `Move pot money out. Every payout needs ${activeGroup!.approvalThreshold} of ${activeGroup!.approvalTotal} approvals.`
            : "Track what the treasurer spends. Raise a dispute if a payout looks wrong."
        }
        action={
          isTreasurer ? (
            <button onClick={() => setShowForm((v) => !v)} className="cp-btn-primary">
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? "Cancel" : "New payout"}
            </button>
          ) : undefined
        }
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showForm && isTreasurer && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="cp-card rounded-3xl p-6 mb-6 grid sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount (₦)</label>
            <input required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" inputMode="numeric" className="cp-input mt-1" />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Pay to</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                { key: "member", label: "Pot member", icon: Users },
                { key: "user", label: "PotKeeper user", icon: User },
                { key: "bank", label: "External bank", icon: Landmark },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setDestMode(o.key)}
                  className={[
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition sm:flex-row sm:justify-center",
                    destMode === o.key
                      ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-slate-400",
                  ].join(" ")}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {destMode === "member" && (
                <select required value={memberId} onChange={(e) => setMemberId(e.target.value)} className="cp-input">
                  <option value="">Choose a pot member…</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.name ?? "Member"} · {m.role}
                    </option>
                  ))}
                </select>
              )}
              {destMode === "user" && (
                <input required value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Their PotKeeper email or phone" className="cp-input" />
              )}
              {destMode === "bank" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <select value={bankName} onChange={(e) => setBankName(e.target.value)} className="cp-input">
                    {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" inputMode="numeric" className="cp-input" />
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" className="cp-input" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. transport" className="cp-input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it for?" className="cp-input mt-1" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || !destination} className="cp-btn-primary disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit for approval
            </button>
          </div>
        </motion.form>
      )}

      {expenses.length === 0 ? (
        <div className="cp-card rounded-3xl p-10 text-center">
          <Send className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No payouts yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {expenses.map((e) => {
            const approvalsFor = approvals[e.id] ?? [];
            const approvalsCount = approvalsFor.filter((a) => a.decision === "approve").length;
            const rejection = approvalsFor.find((a) => a.decision === "reject");
            const alreadyDecided = approvalsFor.some((a) => a.approverUserId === uid);
            const isRequester = e.requestedBy === uid;
            const isApprover = myRole === "treasurer" || myRole === "cosigner";
            const canDecide = e.status === "pending_approval" && isApprover && !alreadyDecided && !isRequester;
            const pct = Math.min(100, (approvalsCount / activeGroup!.approvalThreshold) * 100);
            const expenseDisputes = disputes.filter((d) => d.expenseRequestId === e.id && d.status === "open");
            const disputed = expenseDisputes.length > 0;
            const canDispute = !isTreasurer && !disputed &&
              ["pending_approval", "approved", "executing", "completed"].includes(e.status);

            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cp-card rounded-3xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-sora font-bold text-slate-900 dark:text-white">{formatNaira(e.amountKobo)}</h3>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusStyle[e.status] ?? ""}`}>
                        {e.status.replace("_", " ")}
                      </span>
                      {disputed && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400">
                          <Gavel className="w-3 h-3" /> Disputed
                        </span>
                      )}
                      {e.riskLevel !== "low" && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          e.riskLevel === "high"
                            ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400"
                            : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        }`}>
                          <AlertTriangle className="w-3 h-3" /> {e.riskLevel} risk
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">To {e.destination}{e.category ? ` · ${e.category}` : ""}</p>
                    {e.note && <p className="text-xs text-slate-400 mt-0.5">{e.note}</p>}
                  </div>
                </div>

                {e.riskReasons && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                    {e.riskReasons}
                  </p>
                )}

                {disputed && (
                  <p className="mt-3 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
                    {expenseDisputes.length} member{expenseDisputes.length === 1 ? "" : "s"} disputed this payout
                    {expenseDisputes.map((d) => d.name).filter(Boolean).length
                      ? `: ${expenseDisputes.map((d) => d.name).filter(Boolean).join(", ")}`
                      : ""}. It can't be paid until resolved.
                  </p>
                )}

                {/* Approval progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {approvalsCount} of {activeGroup!.approvalThreshold} approvals
                    </span>
                    {rejection && <span className="text-rose-600 font-semibold">Rejected — blocked</span>}
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${rejection ? "bg-rose-500" : "bg-gradient-to-r from-brand-500 to-brand-700"}`}
                      style={{ width: rejection ? "100%" : `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {e.status === "pending_approval" && (
                    canDecide ? (
                      <>
                        <button
                          onClick={() => handleDecision(e.id, "approve")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
                        >
                          <ThumbsUp className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleDecision(e.id, "reject")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-rose-600 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition disabled:opacity-60"
                        >
                          <ThumbsDown className="w-4 h-4" /> Reject
                        </button>
                      </>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {!isApprover
                          ? "Only the treasurer and co-signers can approve payouts."
                          : isRequester
                          ? "You requested this — another approver must sign off."
                          : alreadyDecided
                          ? "You've already voted."
                          : "Awaiting decisions."}
                      </p>
                    )
                  )}

                  {e.status === "approved" && isTreasurer && (
                    <button
                      onClick={() => handleExecute(e.id)}
                      disabled={busy || disputed}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-60"
                    >
                      <Send className="w-4 h-4" /> Pay out
                    </button>
                  )}

                  {e.status === "completed" && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Paid out · {new Date(e.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}

                  {canDispute && (
                    <button
                      onClick={() => handleDispute(e.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-rose-600 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition disabled:opacity-60"
                    >
                      <Gavel className="w-4 h-4" /> Dispute this payout
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Expenses() {
  return (
    <AppShell>
      <GroupGate>
        <ExpensesInner />
      </GroupGate>
    </AppShell>
  );
}
