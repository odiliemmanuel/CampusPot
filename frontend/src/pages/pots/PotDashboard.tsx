import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDownLeft, CheckCircle2, Loader2, Lock, ShieldAlert, Wallet,
} from "lucide-react";

import DataTable, { type Column } from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import { useGroup } from "../../providers/GroupProvider";
import {
  getOutstanding, getStoredUser, getSummary, listMembers, listPayments,
  listDisputes, raiseDispute, resolveDispute,
  type Dispute, type Membership, type OutstandingMember, type Payment, type GroupSummary,
} from "../../lib/api";
import { formatNaira } from "../../lib/format";

// The dashboard tab: your position in the pot, member disputes, and the
// contributions coming in. Contribution amounts are shown to the treasurer
// only; other members see the payment status without the figures.
export default function PotDashboard() {
  const { id } = useParams<{ id: string }>();
  const { activeGroup } = useGroup();
  const myId = getStoredUser()?.id;

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
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
      listMembers(id).catch(() => [] as Membership[]),
      getOutstanding(id).catch(() => ({ members: [] as OutstandingMember[], levy: null })),
      listDisputes(id).catch(() => [] as Dispute[]),
    ])
      .then(([s, p, m, o, d]) => {
        if (!alive) return;
        setSummary(s);
        setPayments(p);
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
        render: (p) => <span className="font-semibold text-emerald-600">+{formatNaira(p.amountKobo)}</span>,
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
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {frozen && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3.5 dark:bg-rose-500/10">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Spending is frozen</p>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
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
            myStatus.owed > 0 ? "bg-amber-50 dark:bg-amber-500/10" : "bg-emerald-50 dark:bg-emerald-500/10",
          ].join(" ")}
        >
          <span className={["flex h-10 w-10 items-center justify-center rounded-xl", myStatus.owed > 0 ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"].join(" ")}>
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

      {/* Member disputes */}
      <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-panel-dark">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Disputes</h2>
            <p className="text-xs text-slate-400">
              Two or more open disputes freeze the treasurer's spending.
            </p>
          </div>
        </div>

        {openDisputes.length > 0 && (
          <div className="mb-4 space-y-2">
            {openDisputes.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{d.name || d.userId}</p>
                  {d.reason && <p className="text-xs text-slate-500 dark:text-slate-400">{d.reason}</p>}
                </div>
                {(canManage || d.userId === myId) && (
                  <button
                    onClick={() => handleResolve(d.id)}
                    disabled={disputeBusy}
                    className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm disabled:opacity-60 dark:bg-slate-800"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {disputes.some((d) => d.status === "resolved") && (
          <p className="mb-3 text-xs text-slate-400">
            {disputes.filter((d) => d.status === "resolved").length} resolved.
          </p>
        )}

        {!iDisputed ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? (optional)"
              className="cp-input flex-1 min-w-[160px]"
            />
            <button onClick={handleRaise} disabled={disputeBusy} className="cp-btn-ghost shrink-0 text-rose-600">
              {disputeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Raise a dispute
            </button>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" /> You have an open dispute on this pot.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-panel-dark">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Contributions
            </h2>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={payments.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>
    </>
  );
}
