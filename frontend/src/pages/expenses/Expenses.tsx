import { useEffect, useState, useCallback, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Plus, X, Send, ShieldCheck, ThumbsUp, ThumbsDown,
  CheckCircle2, Clock, AlertTriangle, CircleDollarSign,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listExpenses, listApprovals, listMembers, createExpense, decideExpense, executeExpense,
  getStoredUser, type AuthUser, type ExpenseRequest, type Approval, type Role,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

const statusStyle: Record<string, string> = {
  pending_approval: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  executing: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
  failed: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const statusLabel: Record<string, string> = {
  pending_approval: "Awaiting approval",
  approved: "Approved — ready to pay",
  executing: "Executing",
  completed: "Paid out",
  rejected: "Rejected",
  failed: "Failed",
};

function ExpensesInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [approvals, setApprovals] = useState<Record<string, Approval[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const uid = getStoredUser<AuthUser>()?.id;
  const [myRole, setMyRole] = useState<Role | null>(null);

  const load = useCallback(async () => {
    const [list, members] = await Promise.all([listExpenses(gid), listMembers(gid)]);
    setExpenses(list);
    setMyRole((members.find((m) => m.userId === uid)?.role as Role) ?? null);
    const approvalEntries = await Promise.all(
      list
        .filter((e) => e.status === "pending_approval")
        .map(async (e) => [e.id, await listApprovals(gid, e.id)] as const)
    );
    setApprovals(Object.fromEntries(approvalEntries));
  }, [gid, uid]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load expenses."))
      .finally(() => setLoading(false));
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await createExpense(gid, nairaToKobo(amount), destination, category, note);
      setAmount(""); setDestination(""); setCategory(""); setNote(""); setShowForm(false);
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

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`Every payout needs ${activeGroup!.approvalThreshold} of ${activeGroup!.approvalTotal} approvals.`}
        action={
          <button onClick={() => setShowForm((v) => !v)} className="cp-btn-primary">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? "Cancel" : "New request"}
          </button>
        }
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="cp-card rounded-3xl p-6 mb-6 grid sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount (₦)</label>
            <input required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" className="cp-input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Destination</label>
            <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Lagos Bus Terminal" className="cp-input mt-1" />
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
            <button type="submit" disabled={busy} className="cp-btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit for approval
            </button>
          </div>
        </motion.form>
      )}

      {expenses.length === 0 ? (
        <div className="cp-card rounded-3xl p-10 text-center">
          <CircleDollarSign className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No expense requests yet.</p>
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

            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cp-card rounded-3xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-sora font-bold text-slate-900 dark:text-white">{formatNaira(e.amountKobo)}</h3>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusStyle[e.status] ?? ""}`}>
                        {e.status.replace("_", " ")}
                      </span>
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
                      className={`h-full rounded-full transition-all ${rejection ? "bg-rose-500" : "bg-gradient-to-r from-primary-500 to-primary-700"}`}
                      style={{ width: rejection ? "100%" : `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                {e.status === "pending_approval" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canDecide ? (
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
                    )}
                  </div>
                )}

                {e.status === "completed" && (
                  <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Paid out · {new Date(e.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}

                {e.status === "approved" && (
                  <button
                    onClick={async () => {
                      setError("");
                      setBusy(true);
                      try {
                        await executeExpense(gid, e.id);
                        await load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Couldn't execute the payout.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:shadow-lg hover:shadow-primary-600/30 transition disabled:opacity-60"
                  >
                    <Send className="w-4 h-4" /> Execute payout
                  </button>
                )}
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
