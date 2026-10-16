import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, ScrollText,
  TrendingUp, Users, Wallet,
} from "lucide-react";

import PageHeader from "../../components/PageHeader";
import DataTable, { type Column } from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import { useGroup } from "../../providers/GroupProvider";
import {
  getOutstanding, getStoredUser, getSummary, listLedger, listMembers,
  type GroupSummary, type LedgerEntry, type Membership, type OutstandingMember,
} from "../../lib/api";
import { formatNaira } from "../../lib/format";

const kindLabel: Record<string, string> = {
  credit: "Deposit",
  debit: "Payout",
  opening: "Opening balance",
};

// A real, trend-free money tile (unlike the marketing StatCard, which invented
// a "vs last week" delta).
function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "brand" | "green" | "amber" | "rose";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 font-sora text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
    </div>
  );
}

const columns: Column<LedgerEntry>[] = [
  {
    key: "description",
    header: "Transaction",
    render: (e) => (
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            e.amountKobo >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
          }`}
        >
          {e.amountKobo >= 0 ? (
            <ArrowDownLeft className="h-4 w-4" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
        </span>
        <span className="font-medium text-slate-700">{e.description}</span>
      </div>
    ),
  },
  {
    key: "kind",
    header: "Type",
    render: (e) => (
      <span className="text-slate-600 capitalize">
        {kindLabel[e.kind] ?? e.kind.replace("_", " ")}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "text-right",
    headerClassName: "text-right",
    render: (e) => (
      <span
        className={
          e.amountKobo >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"
        }
      >
        {e.amountKobo >= 0 ? "+" : "−"}
        {formatNaira(Math.abs(e.amountKobo))}
      </span>
    ),
  },
  {
    key: "date",
    header: "Date",
    render: (e) => (
      <span className="whitespace-nowrap text-slate-500">
        {new Date(e.createdAt).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </span>
    ),
  },
];

export default function PotDashboard() {
  const { id } = useParams<{ id: string }>();
  const { activeGroup } = useGroup();

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      getSummary(id),
      listLedger(id),
      listMembers(id),
      getOutstanding(id).then((o) => o.members).catch(() => [] as OutstandingMember[]),
    ])
      .then(([s, l, m, o]) => {
        if (!alive) return;
        setSummary(s);
        setLedger(l);
        setMembers(m);
        setOutstanding(o);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Couldn't load this pot.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    setPage(1);
  }, [id]);

  // The API returns the ledger oldest-first; show the newest on top.
  const ordered = useMemo(() => [...ledger].reverse(), [ledger]);
  const paged = useMemo(
    () => ordered.slice((page - 1) * pageSize, page * pageSize),
    [ordered, page, pageSize]
  );

  const myId = getStoredUser()?.id;
  const mine = outstanding.find((o) => o.userId === myId);
  const levy = summary?.levy;
  // The signed-in user's own position against the current levy, if any.
  const myStatus = levy
    ? mine
      ? { amount: mine.amountKobo, paid: mine.paidKobo, owed: mine.outstandingKobo, state: mine.state }
      : { amount: levy.amountKobo, paid: levy.amountKobo, owed: 0, state: "paid" as const }
    : null;

  return (
    <>
      <PageHeader
        title={activeGroup?.name ?? "Pot"}
        subtitle="This pot's dashboard — every figure and transaction below belongs to this pot alone."
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {/* Money overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={<Wallet className="h-4 w-4" />}
          label="Balance"
          value={formatNaira(summary?.balanceKobo ?? 0)}
          tone="brand"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Collected"
          value={formatNaira(summary?.collectedKobo ?? 0)}
          tone="green"
        />
        <StatTile
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="Spent"
          value={formatNaira(summary?.spentKobo ?? 0)}
          tone="rose"
        />
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="Outstanding"
          value={formatNaira(summary?.outstandingKobo ?? 0)}
          tone="amber"
        />
      </div>

      {/* Your own position in this pot */}
      {myStatus && (
        <div
          className={[
            "mt-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4",
            myStatus.owed > 0
              ? "bg-amber-50 dark:bg-amber-500/10"
              : "bg-emerald-50 dark:bg-emerald-500/10",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-10 w-10 items-center justify-center rounded-xl",
              myStatus.owed > 0 ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600",
            ].join(" ")}
          >
            {myStatus.owed > 0 ? <Wallet className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {myStatus.owed > 0
                ? `You've paid ${formatNaira(myStatus.paid)} of ${formatNaira(myStatus.amount)}`
                : `You're all paid up — ${formatNaira(myStatus.amount)}`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {levy?.title ? `Toward “${levy.title}”` : "Current levy"}
              {myStatus.owed > 0 && ` · ${formatNaira(myStatus.owed)} remaining`}
            </p>
          </div>
          {myStatus.owed > 0 && (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              {formatNaira(myStatus.owed)} due
            </span>
          )}
        </div>
      )}

      {/* This pot's transactions only */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ScrollText className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Transactions in this pot</h2>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>

        <DataTable
          columns={columns}
          rows={paged}
          getRowKey={(e) => e.id}
          empty={loading ? "Loading…" : "No transactions yet."}
        />

        <div className="border-t border-slate-100 p-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={ledger.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>
    </>
  );
}
