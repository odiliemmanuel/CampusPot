import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronDown, Clock, Download, Filter, List, MoreVertical,
  Receipt, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import StatusBadge, { type StatusTone } from "../../components/StatusBadge";
import DataTable, { type Column } from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import { useGroup } from "../../providers/GroupProvider";
import { formatNaira } from "../../lib/format";
import {
  dashboardStats, recentContributions, periodOptions,
  type ContributionRow, type ContributionStatus, type StatIcon,
} from "./dashboardMock";

// ---------- static maps ----------

const iconMap: Record<StatIcon, LucideIcon> = {
  wallet: Wallet,
  users: Users,
  clock: Clock,
  trending: TrendingUp,
};

const statusMeta: Record<ContributionStatus, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "success" },
  processing: { label: "Processing", tone: "info" },
  pending: { label: "Pending", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
};

const filterOptions = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });

const columns: Column<ContributionRow>[] = [
  {
    key: "reference",
    header: "Reference",
    render: (r) => (
      <Link to="/ledger" className="font-semibold text-brand-600 hover:underline">
        {r.reference}
      </Link>
    ),
  },
  {
    key: "member",
    header: "Member",
    render: (r) => <span className="font-medium text-slate-700">{r.member}</span>,
  },
  {
    key: "levy",
    header: "Levy",
    render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-slate-600">
        <Receipt className="h-4 w-4 text-slate-400" />
        {r.levy}
      </span>
    ),
  },
  {
    key: "channel",
    header: "Channel",
    render: (r) => <span className="text-slate-600">{r.channel}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusBadge label={statusMeta[r.status].label} tone={statusMeta[r.status].tone} />,
  },
  {
    key: "date",
    header: "Date",
    render: (r) => (
      <span>
        <span className="block text-slate-700">{fmtDate(r.date)}</span>
        <span className="block text-xs text-slate-400">{fmtTime(r.date)}</span>
      </span>
    ),
  },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    headerClassName: "w-12",
    className: "text-right",
    render: () => (
      <button
        type="button"
        aria-label="Row actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    ),
  },
];

// ---------- small dropdown used for the period + filter controls ----------

function Dropdown({
  icon: Icon,
  options,
  value,
  onChange,
}: {
  icon?: LucideIcon;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {current}
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 z-10 mt-2 min-w-[10rem] rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg"
          >
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    o.value === value
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                  {o.value === value && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- page ----------

function DashboardInner() {
  const { activeGroup } = useGroup();

  const [period, setPeriod] = useState("This Week");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? recentContributions
        : recentContributions.filter((r) => r.status === statusFilter),
    [statusFilter]
  );

  // Reset to the first page whenever the filter or page size changes.
  useEffect(() => setPage(1), [statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * pageSize, current * pageSize);

  const exportCsv = () => {
    const header = ["Reference", "Member", "Levy", "Channel", "Status", "Date"];
    const rows = filtered.map((r) => [
      r.reference, r.member, r.levy, r.channel, statusMeta[r.status].label, r.date,
    ]);
    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "campuspot-contributions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Here's how ${activeGroup?.name ?? "your pot"} is doing ${period.toLowerCase()}.`}
        action={
          <Dropdown
            options={periodOptions.map((p) => ({ value: p, label: p }))}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => {
          const Icon = iconMap[stat.icon];
          return (
            <StatCard
              key={stat.id}
              icon={<Icon className="h-5 w-5" />}
              label={stat.label}
              value={stat.valueKobo != null ? formatNaira(stat.valueKobo) : stat.valueText ?? ""}
              trend={stat.trend}
              color={stat.color}
              spark={stat.spark}
            />
          );
        })}
      </div>

      {/* Recent contributions */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <List className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Recent Contributions</h2>
          </div>

          <div className="flex items-center gap-2">
            <Dropdown icon={Filter} options={filterOptions} value={statusFilter} onChange={setStatusFilter} />
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        <DataTable columns={columns} rows={paged} getRowKey={(r) => r.id} empty="No contributions match this filter." />

        <div className="border-t border-slate-100 p-4">
          <Pagination
            page={current}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>
    </>
  );
}

export default function Dashboard() {
  return (
    <AppShell>
      <GroupGate>
        <DashboardInner />
      </GroupGate>
    </AppShell>
  );
}
