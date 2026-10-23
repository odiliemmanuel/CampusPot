import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Clock, Gavel, Headphones, Landmark, LifeBuoy,
  Loader2, Plus, Send, ShieldCheck, ThumbsDown, ThumbsUp, User, Users, X,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import AlertError from "../../components/AlertError";
import { useGroup } from "../../providers/GroupProvider";
import {
  listExpenses, listApprovals, listMembers, listDisputes, createExpense,
  decideExpense, escalateDispute, executeExpense, listSupportCases, raiseDispute,
  getStoredUser, getSummary, listBanks, lookupUser, verifyBankAccount,
  type AuthUser, type ExpenseRequest, type Approval, type Role, type Membership,
  type Dispute, type BankOption, type LookedUpUser, type SupportCase, type VerifiedAccount,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

const FALLBACK_BANKS: BankOption[] = [
  { name: "GTBank", code: "058" }, { name: "Zenith Bank", code: "057" },
  { name: "Access Bank", code: "044" }, { name: "First Bank of Nigeria", code: "011" },
  { name: "United Bank for Africa", code: "033" },
];

const statusStyle: Record<string, string> = {
  pending_approval: "bg-violet-100 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200",
  approved: "bg-violet-100 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200",
  executing: "bg-violet-100 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200",
  completed: "bg-violet-100 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200",
  rejected: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
  failed: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

type DestMode = "member" | "user" | "bank";

export function ExpensesInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [approvals, setApprovals] = useState<Record<string, Approval[]>>({});
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
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
  const [bankName, setBankName] = useState(FALLBACK_BANKS[0].name);
  const [banks, setBanks] = useState<BankOption[]>(FALLBACK_BANKS);
  const [accountNumber, setAccountNumber] = useState("");

  // Name enquiry — the payout destination is confirmed before it's submitted.
  const [verified, setVerified] = useState<VerifiedAccount | null>(null);
  const [lookedUp, setLookedUp] = useState<LookedUpUser | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [potBalance, setPotBalance] = useState(0);
  const verifySeq = useRef(0);

  const uid = getStoredUser<AuthUser>()?.id;
  const [myRole, setMyRole] = useState<Role | null>(null);
  const isTreasurer = myRole === "treasurer";

  const load = async () => {
    const [list, people, openDisputes, supportCases] = await Promise.all([
      listExpenses(gid),
      listMembers(gid),
      listDisputes(gid).catch(() => [] as Dispute[]),
      listSupportCases(gid).catch(() => [] as SupportCase[]),
    ]);
    setExpenses(list);
    setMembers(people);
    setDisputes(openDisputes);
    setCases(supportCases);
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

  // Bank list + current pot balance (for the low-balance warning).
  useEffect(() => {
    listBanks().then((list) => { if (list.length > 0) setBanks(list); }).catch(() => { /* keep fallbacks */ });
    getSummary(gid).then((s) => setPotBalance(s.balanceKobo)).catch(() => { /* optional */ });
  }, [gid]);

  // Look the payout destination up whenever it changes. A stale response is
  // dropped by comparing sequence numbers.
  const refreshLookup = useCallback((value: string, mode: DestMode, bank: string) => {
    const seq = ++verifySeq.current;
    const target = value.trim();
    setVerified(null); setLookedUp(null); setCheckError("");
    if (mode === "bank") {
      if (!/^\d{10}$/.test(target)) return;
      setChecking(true);
      verifyBankAccount(target, bank)
        .then((v) => { if (seq === verifySeq.current) setVerified(v); })
        .catch((err) => { if (seq === verifySeq.current) setCheckError(err instanceof Error ? err.message : "We couldn't confirm that account."); })
        .finally(() => { if (seq === verifySeq.current) setChecking(false); });
      return;
    }
    if (mode === "user") {
      if (target.length < 3) return;
      setChecking(true);
      lookupUser(target)
        .then((u) => { if (seq === verifySeq.current) setLookedUp(u); })
        .catch((err) => { if (seq === verifySeq.current) setCheckError(err instanceof Error ? err.message : "No PotKeeper account matches that."); })
        .finally(() => { if (seq === verifySeq.current) setChecking(false); });
    }
  }, []);

  useEffect(() => {
    if (destMode === "bank") refreshLookup(accountNumber, destMode, bankName);
    else if (destMode === "user") refreshLookup(recipient, destMode, bankName);
  }, [accountNumber, recipient, destMode, bankName, refreshLookup]);

  const destination = (() => {
    if (destMode === "member") {
      const m = members.find((x) => x.userId === memberId);
      return m ? `Member: ${m.user?.name ?? "member"} (${m.reference})` : "";
    }
    if (destMode === "user") {
      return lookedUp ? `PotKeeper: ${lookedUp.name} (${lookedUp.email || lookedUp.phone || recipient.trim()})` : "";
    }
    return verified ? `Bank: ${verified.bankName} · ${verified.accountNumber} · ${verified.accountHolderName}` : "";
  })();

  // The destination must be confirmed by name enquiry before submitting.
  const destinationConfirmed =
    destMode === "member" ? !!memberId : destMode === "user" ? !!lookedUp : !!verified;

  // Low-balance alert: the requested payout exceeds what the pot holds.
  const overBalance = nairaToKobo(amount) > potBalance && nairaToKobo(amount) > 0;

  const resetForm = () => {
    setAmount(""); setCategory(""); setNote("");
    setMemberId(""); setRecipient(""); setAccountNumber("");
    setVerified(null); setLookedUp(null); setCheckError("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!destinationConfirmed) {
      setError("Confirm the payout destination's name before submitting.");
      return;
    }
    setError(""); setBusy(true);
    try {
      await createExpense(gid, {
        amountKobo: nairaToKobo(amount),
        destinationType: destMode,
        recipient:
          destMode === "member" ? memberId : destMode === "user" ? recipient.trim() : accountNumber.trim(),
        bankName: destMode === "bank" ? verified!.bankName : undefined,
        bankCode: destMode === "bank" ? verified!.bankCode : undefined,
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

  // Send a dispute to customer support — opens a case both sides can track.
  const handleEscalate = async (disputeId: string) => {
    const note = window.prompt("What should support review? (optional)") ?? "";
    setError(""); setBusy(true);
    try {
      await escalateDispute(gid, disputeId, note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't escalate the dispute.");
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
            ? members.length === 1
              ? "Move pot money out. As the only member, your payout requests are approved immediately."
              : `Move pot money out. Every payout needs ${activeGroup!.approvalThreshold} of ${activeGroup!.approvalTotal} approvals.`
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

      {error && <AlertError message={error} className="mb-4" />}

      {showForm && isTreasurer && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="mb-4 grid gap-3 rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-[#171626]/70 sm:mb-5 sm:grid-cols-2 sm:gap-3.5 sm:p-4"
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <select value={bankName} onChange={(e) => setBankName(e.target.value)} className="cp-input">
                    {banks.map((b) => <option key={b.code} value={b.name}>{b.name}</option>)}
                  </select>
                  <input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="Account number" inputMode="numeric" className="cp-input" />
                </div>
              )}

              {/* Name enquiry — confirm who gets paid before money can move. */}
              {checking && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking recipient…
                </p>
              )}
              {!checking && verified && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Paying</p>
                    <p className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-200">{verified.accountHolderName}</p>
                    <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-300/80">{verified.bankName} · {verified.accountNumber}</p>
                  </div>
                </div>
              )}
              {!checking && lookedUp && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Paying</p>
                    <p className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-200">{lookedUp.name}</p>
                    <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-300/80">PotKeeper · {lookedUp.email || lookedUp.phone || ""}</p>
                  </div>
                </div>
              )}
              {!checking && checkError && (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{checkError}</span>
                </p>
              )}
            </div>
          </div>

          {overBalance && (
            <p className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Low balance — this payout is {formatNaira(nairaToKobo(amount))} but the pot only holds {formatNaira(potBalance)}. Co-signers will see a high-risk flag.</span>
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. transport" className="cp-input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it for?" className="cp-input mt-1" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || !destination || !destinationConfirmed || checking} className="cp-btn-primary disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit for approval
            </button>
          </div>
        </motion.form>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-white/10">
          <Send className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-slate-500 dark:text-slate-400">No payouts yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
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
              <motion.div key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200/80 bg-white/80 p-2.5 shadow-sm dark:border-white/10 dark:bg-[#171626]/70 sm:p-3">
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-sora text-base font-bold text-slate-900 dark:text-white sm:text-lg">{formatNaira(e.amountKobo)}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle[e.status] ?? ""}`}>
                        {e.status.replace("_", " ")}
                      </span>
                      {disputed && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400">
                          <Gavel className="w-3 h-3" /> Disputed
                        </span>
                      )}
                      {e.riskLevel !== "low" && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          e.riskLevel === "high"
                            ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400"
                            : "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400"
                        }`}>
                          <AlertTriangle className="w-3 h-3" /> {e.riskLevel} risk
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">To {e.destination}{e.category ? ` · ${e.category}` : ""}</p>
                    {e.note && <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{e.note}</p>}
                  </div>
                </div>

                {e.riskReasons && (
                  <p className="mt-1 rounded-md bg-violet-50 px-2 py-1.5 text-[11px] text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                    {e.riskReasons}
                  </p>
                )}

                {disputed && (
                  <div className="mt-1 space-y-1">
                    <p className="rounded-md bg-violet-50 px-2 py-1.5 text-[11px] text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                      {expenseDisputes.length} member{expenseDisputes.length === 1 ? "" : "s"} disputed this payout
                      {expenseDisputes.map((d) => d.name).filter(Boolean).length
                        ? `: ${expenseDisputes.map((d) => d.name).filter(Boolean).join(", ")}`
                        : ""}. It can't be paid until resolved.
                    </p>
                    {expenseDisputes.filter((d) => !d.escalatedAt && (d.userId === uid || isTreasurer)).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => void handleEscalate(d.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-50 disabled:opacity-60 dark:border-violet-900/50 dark:bg-slate-800 dark:text-violet-300"
                      >
                        <Headphones className="h-3 w-3" /> Escalate to support
                      </button>
                    ))}
                    {expenseDisputes.some((d) => d.escalatedAt) && (
                      <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Escalated to support
                      </p>
                    )}
                  </div>
                )}

                {/* Approval progress */}
                <div className="mt-1.5">
                  {members.length === 1 && e.status === "approved" ? (
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">
                      <ShieldCheck className="w-3.5 h-3.5" /> Approved automatically · only member
                    </p>
                  ) : (
                    <>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {approvalsCount} of {activeGroup!.approvalThreshold} approvals
                    </span>
                    {rejection && <span className="text-violet-600 font-semibold">Rejected — blocked</span>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${rejection ? "bg-violet-500" : "bg-gradient-to-r from-brand-500 to-brand-700"}`}
                      style={{ width: rejection ? "100%" : `${pct}%` }}
                    />
                  </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {e.status === "pending_approval" && (
                    canDecide ? (
                      <>
                        <button
                          onClick={() => handleDecision(e.id, "approve")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleDecision(e.id, "reject")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-50 disabled:opacity-60 dark:border-violet-900/50 dark:bg-slate-800 dark:hover:bg-violet-900/20"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" /> Reject
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
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" /> Pay out
                    </button>
                  )}

                  {e.status === "completed" && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Paid out · {new Date(e.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}

                  {canDispute && (
                    <button
                      onClick={() => handleDispute(e.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-50 disabled:opacity-60 dark:border-violet-900/50 dark:bg-slate-800 dark:hover:bg-violet-900/20"
                    >
                      <Gavel className="h-3.5 w-3.5" /> Dispute payout
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Cases escalated to customer support — the paper trail both sides see. */}
      {cases.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">With customer support</h2>
          </div>
          <div className="space-y-2">
            {cases.map((sc) => (
              <div key={sc.id} className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-[#171626]/70">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{sc.subject}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    sc.status === "open"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  }`}>
                    {sc.status}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    opened {new Date(sc.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </span>
                </div>
                {sc.detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sc.detail}</p>}
              </div>
            ))}
          </div>
        </section>
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
