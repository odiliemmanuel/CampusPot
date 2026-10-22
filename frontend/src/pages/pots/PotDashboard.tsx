import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDownLeft, CalendarClock, CheckCircle2, Loader2, Lock, ShieldAlert, Wallet, Send,
} from "lucide-react";

import DataTable, { type Column } from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import { useGroup } from "../../providers/GroupProvider";
import {
  getOutstanding, getStoredUser, getSummary, listMembers, listPayments, listExpenses,
  listDisputes, raiseDispute, resolveDispute,
  type Dispute, type Membership, type OutstandingMember, type Payment, type GroupSummary, type ExpenseRequest,
} from "../../lib/api";
import { formatNaira } from "../../lib/format";

const PotSpendingInsights = lazy(() => import("./PotSpendingInsights"));

// The dashboard tab: your position in the pot, member disputes, and the
// contributions coming in. Contribution amounts are shown to the treasurer
// only; other members see the payment status without the figures.
export default function PotDashboard() {
  const { id } = useParams<{ id: string }>();
  const { activeGroup } = useGroup();
  const myId = getStoredUser()?.id;

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [reason, setReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);

  const loadDisputes = async () => {
    try {
      setDisputes(await listDisputes(id!));
    } catch {
      /* disputes are best-effort on old backends */
    }
  };

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      getSummary(id),
      listPayments(id),
      listExpenses(id).catch(() => [] as ExpenseRequest[]),
      listMembers(id).catch(() => [] as Membership[]),
      getOutstanding(id).catch(() => ({ members: [] as OutstandingMember[], levy: null })),
      listDisputes(id).catch(() => [] as Dispute[]),
    ])
      .then(([s, p, e, m, o, d]) => {
        if (!alive) return;
        setSummary(s);
        setPayments(p);
        setExpenses(e);
        setMembers(m);
        setOutstanding(o.members);
        setDisputes(d);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Couldn't load the pot."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const columns = useMemo<Column<Payment>[]>(() => {
    const base: Column<Payment>[] = [
      {
        key: "payer",
        header: "Contributor",
        render: (p) => (
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {p.payerName || p.quotedReference || "Deposit"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (p) => <span className="capitalize text-slate-600 dark:text-slate-300">{p.status}</span>,
      },
    ];
    if (canManage) {
      base.push({
        key: "amount",
        header: "Amount",
        className: "text-right",
        headerClassName: "text-right",
        render: (p) => <span className="font-semibold text-violet-600">+{formatNaira(p.amountKobo)}</span>,
      });
    }
    base.push({
      key: "date",
      header: "Date",
      render: (p) => (
        <span className="whitespace-nowrap text-slate-500">
          {new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    });
    return base;
  }, [canManage]);

  const mine = outstanding.find((o) => o.userId === myId);
  const levy = summary?.levy;
  const myStatus = levy
    ? mine
      ? { amount: mine.amountKobo, paid: mine.paidKobo, owed: mine.outstandingKobo }
      : { amount: levy.amountKobo, paid: levy.amountKobo, owed: 0 }
    : null;

  const ordered = useMemo(() => [...payments].reverse(), [payments]);
  const paged = useMemo(
    () => ordered.slice((page - 1) * pageSize, page * pageSize),
    [ordered, page, pageSize]
  );

  const openDisputes = disputes.filter((d) => d.status === "open");
  const iDisputed = openDisputes.some((d) => d.userId === myId);
  const frozen = summary?.spendingFrozen ?? openDisputes.length >= 2;
  const deadline = summary?.levy?.dueDate || activeGroup?.contributionDueDate;
  const deadlineState = useMemo(() => {
    if (!deadline) return null;
    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) return null;
    const dueDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.ceil((dueDay - today) / (24 * 60 * 60 * 1000));
  }, [deadline]);
  const targetKobo = summary?.expectedKobo ?? 0;
  const remainingKobo = summary?.outstandingKobo ?? 0;
  const collectedForLevy = Math.max(0, targetKobo - remainingKobo);
  const progressPct = targetKobo > 0 ? Math.min(100, Math.round((collectedForLevy / targetKobo) * 100)) : 0;

  const handleRaise = async () => {
    setDisputeBusy(true); setError("");
    try {
      await raiseDispute(id!, reason);
      setReason("");
      await loadDisputes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't raise the dispute.");
    } finally {
      setDisputeBusy(false);
    }
  };

  const handleResolve = async (disputeId: string) => {
    setDisputeBusy(true); setError("");
    try {
      await resolveDispute(id!, disputeId);
      await loadDisputes();
      getSummary(id!).then(setSummary).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resolve the dispute.");
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <>
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      {frozen && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2.5 dark:bg-violet-500/10">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Spending is frozen</p>
            <p className="text-xs text-violet-600/80 dark:text-violet-400/80">
              {openDisputes.length} member{openDisputes.length === 1 ? "" : "s"} have raised a dispute, so
              the treasurer can't move money until it's resolved.
            </p>
          </div>
        </div>
      )}

      {myStatus && (
        <div
          className={[
            "mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4",
            myStatus.owed > 0 ? "bg-violet-50 dark:bg-violet-500/10" : "bg-violet-50 dark:bg-violet-500/10",
          ].join(" ")}
        >
          <span className={["flex h-10 w-10 items-center justify-center rounded-xl", myStatus.owed > 0 ? "bg-violet-100 text-violet-600" : "bg-violet-100 text-violet-600"].join(" ")}>
            {myStatus.owed > 0 ? <Wallet className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {myStatus.owed > 0 ? `You owe ${formatNaira(myStatus.owed)}` : "You're fully paid up"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {levy?.title ? `${levy.title} · ` : ""}
              {formatNaira(myStatus.paid)} of {formatNaira(myStatus.amount)} paid
            </p>
          </div>
        </div>
      )}

      {summary && (
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-panel-dark sm:p-4">
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${deadlineState !== null && deadlineState < 0 && remainingKobo > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10" : "bg-violet-50 text-violet-600 dark:bg-violet-500/10"}`}>
              <CalendarClock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Contribution deadline</h2>
                  {deadlineState === null ? (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Set a due date to track this pot's contribution progress.</p>
                  ) : remainingKobo === 0 ? (
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">All contributions for this levy are in.</p>
                  ) : deadlineState < 0 ? (
                    <p className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-300">{Math.abs(deadlineState)} day{Math.abs(deadlineState) === 1 ? "" : "s"} overdue · {formatNaira(remainingKobo)} outstanding</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{deadlineState === 0 ? "Due today" : `Due in ${deadlineState} day${deadlineState === 1 ? "" : "s"}`} · {formatNaira(remainingKobo)} outstanding</p>
                  )}
                </div>
                <Link to={deadlineState === null ? `/pots/${id}?tab=settings` : `/pots/${id}?tab=contributions`} className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:border-white/10 dark:text-violet-300 dark:hover:bg-white/5">
                  {deadlineState === null ? "Set deadline" : "Review contributions"}
                </Link>
              </div>
              {targetKobo > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px] text-slate-500 dark:text-slate-400"><span>{formatNaira(collectedForLevy)} collected of {formatNaira(targetKobo)}</span><span>{progressPct}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progressPct}%` }} /></div>
                  {deadlineState !== null && deadlineState > 0 && remainingKobo > 0 && (
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">To meet the date, the group needs about {formatNaira(Math.ceil(remainingKobo / deadlineState))} per day.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {id && <Suspense fallback={<div className="mb-4 h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />}><PotSpendingInsights expenses={expenses} groupId={id} /></Suspense>}

      {/* Member disputes */}
      <section className="mb-4 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm sm:p-3 dark:border-white/10 dark:bg-panel-dark">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Disputes</h2>
            <p className="text-[10px] text-slate-400">
              Two or more open disputes freeze the treasurer's spending.
            </p>
          </div>
        </div>

        {openDisputes.length > 0 && (
          <div className="mb-2 space-y-1">
            {openDisputes.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-violet-100 bg-violet-50/50 px-2.5 py-1.5 dark:border-violet-500/20 dark:bg-violet-500/5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{d.name || d.userId}</p>
                  {d.reason && <p className="line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">{d.reason}</p>}
                </div>
                {(canManage || d.userId === myId) && (
                  <button
                    onClick={() => handleResolve(d.id)}
                    disabled={disputeBusy}
                    className="shrink-0 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-violet-600 shadow-sm disabled:opacity-60 dark:bg-slate-800"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {disputes.some((d) => d.status === "resolved") && (
          <p className="mb-2 text-[10px] text-slate-400">
            {disputes.filter((d) => d.status === "resolved").length} resolved.
          </p>
        )}

        {!iDisputed ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? (optional)"
              className="cp-input min-w-[150px] flex-1 py-2 text-xs"
            />
            <button onClick={handleRaise} disabled={disputeBusy} className="cp-btn-ghost shrink-0 text-violet-600">
              {disputeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Raise a dispute
            </button>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600">
            <AlertTriangle className="w-3.5 h-3.5" /> You have an open dispute on this pot.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:p-3.5 dark:border-white/10 dark:bg-panel-dark">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15">
              <ArrowDownLeft className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Contributions
            </h2>
          </div>
          <div className="flex items-center gap-2">
          <Link to={`/pots/${id}/members`} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-white/5 sm:text-xs">See members</Link>
            {!canManage && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <Lock className="w-3 h-3" /> amounts hidden
              </span>
            )}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={paged}
          getRowKey={(p) => p.id}
          empty={loading ? "Loading…" : "No contributions yet."}
        />

        <div className="mt-2">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={payments.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-panel-dark sm:mt-4 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Send className="h-4 w-4" /></span><h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent payouts</h2></div>
          <Link to={`/pots/${id}/payouts`} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-white/5 sm:text-xs">See all</Link>
        </div>
        {expenses.length === 0 ? <p className="px-1 py-1 text-xs text-slate-400">No payouts yet.</p> : <div className="divide-y divide-slate-100 dark:divide-white/5">{expenses.slice(0, 3).map((expense) => <div key={expense.id} className="flex items-center justify-between gap-2 py-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{expense.destination}</p><p className="text-[10px] capitalize text-slate-400">{expense.status.replace("_", " ")}</p></div><span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">{formatNaira(expense.amountKobo)}</span></div>)}</div>}
      </section>
    </>
  );
}
