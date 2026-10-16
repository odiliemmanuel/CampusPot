import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, HandCoins, Loader2, PiggyBank,
  Receipt, ScrollText, TrendingUp, Users, Wallet,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import DataTable, { type Column } from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import { useGroup } from "../../providers/GroupProvider";
import { getSummary, listLedger, type GroupSummary, type LedgerEntry } from "../../lib/api";
import { formatNaira } from "../../lib/format";

const kindLabel: Record<string, string> = {
  credit: "Deposit",
  debit: "Payout",
  opening: "Opening balance",
};

// A real, trend-free money tile (unlike the marketing StatCard, which invents a
// "vs last week" delta).
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
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 font-sora text-2xl font-bold text-slate-900">{value}</p>
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
            e.amountKobo >= 0
              ? "bg-emerald-100 text-emerald-600"
              : "bg-rose-100 text-rose-600"
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
      <span className={e.amountKobo >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
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

function PotDashboardInner() {
  const { id } = useParams<{ id: string }>();
  const { groups, activeGroup, setActiveGroupById } = useGroup();

  const group = groups.find((g) => g.id === id) ?? null;

  // Keep the rest of the app scoped to whichever pot is open.
  useEffect(() => {
    if (id && activeGroup?.id !== id) setActiveGroupById(id);
  }, [id, activeGroup?.id, setActiveGroupById]);

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([getSummary(id), listLedger(id)])
      .then(([s, l]) => {
        if (!alive) return;
        setSummary(s);
        setLedger(l);
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

  if (!id) return <Navigate to="/pots" replace />;

  if (!group) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center">
        <PiggyBank className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-slate-500">This pot isn't one you belong to.</p>
        <Link
          to="/pots"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
        >
          Back to your pots <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={group.name}
        subtitle="This pot's dashboard — every figure and transaction below belongs to this pot alone."
        action={
          <Link to="/pots" className="cp-btn-ghost text-sm">
            All pots
          </Link>
        }
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {/* Money overview */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Wallet className="h-5 w-5" />}
          label="Balance"
          value={formatNaira(summary?.balanceKobo ?? 0)}
          tone="brand"
        />
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Collected"
          value={formatNaira(summary?.collectedKobo ?? 0)}
          tone="green"
        />
        <StatTile
          icon={<ArrowUpRight className="h-5 w-5" />}
          label="Spent"
          value={formatNaira(summary?.spentKobo ?? 0)}
          tone="rose"
        />
        <StatTile
          icon={<Users className="h-5 w-5" />}
          label="Outstanding"
          value={formatNaira(summary?.outstandingKobo ?? 0)}
          tone="amber"
        />
      </div>

      {/* Shortcuts into this pot's other pages */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/contributions" className="cp-btn-ghost text-sm">
          <HandCoins className="h-4 w-4" /> Contributions
        </Link>
        <Link to="/levies" className="cp-btn-ghost text-sm">
          <Receipt className="h-4 w-4" /> Levies
        </Link>
        <Link to="/expenses" className="cp-btn-ghost text-sm">
          <ArrowUpRight className="h-4 w-4" /> Payouts
        </Link>
        <Link to="/members" className="cp-btn-ghost text-sm">
          <Users className="h-4 w-4" /> Members
        </Link>
        <Link to="/ledger" className="cp-btn-ghost text-sm">
          <ScrollText className="h-4 w-4" /> Full ledger
        </Link>
      </div>

      {/* This pot's transactions only */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-100 p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ScrollText className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">Transactions in this pot</h2>
        </div>

        <DataTable
          columns={columns}
          rows={paged}
          getRowKey={(e) => e.id}
          empty="No transactions in this pot yet."
        />

        <div className="border-t border-slate-100 p-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={ledger.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      </section>
    </>
  );
}

export default function PotDashboard() {
  return (
    <AppShell>
      <GroupGate>
        <PotDashboardInner />
      </GroupGate>
    </AppShell>
  );
}
