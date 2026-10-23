import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Compass, Loader2, PiggyBank, Plus, Search, Repeat2, Target, Users } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { discoverPots, getSummary, joinPublicPot, type DiscoverablePot, type Group, type GroupSummary } from "../../lib/api";
import { formatNaira } from "../../lib/format";

const PotPortfolioCharts = lazy(() => import("./PotPortfolioCharts"));

// One compact row per pot. Clicking it opens that pot's own dashboard.
function PotCard({
  group,
  summary,
  onOpen,
}: {
  group: Group;
  summary?: GroupSummary;
  onOpen: () => void;
}) {
  const outstanding = summary?.outstandingKobo ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 items-center gap-3 rounded-[1.4rem] border border-slate-200/70 bg-white p-3.5 text-left shadow-[0_8px_24px_-18px_rgba(76,29,149,.25)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:gap-4 sm:p-4 dark:border-white/10 dark:bg-[#171626]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-800 text-white shadow-md shadow-violet-900/20">
        <PiggyBank className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{group.name}</p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {summary ? `${summary.paidCount}/${summary.members} paid` : "…"}
          {outstanding > 0 && (
            <span className="text-violet-600"> · {formatNaira(outstanding)} due</span>
          )}
          <span className="hidden text-slate-300 sm:inline"> · </span>
          <span className="hidden tracking-widest sm:inline">{group.joinCode}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-sora text-sm font-bold text-violet-800 dark:text-violet-200">
          {summary ? formatNaira(summary.expectedKobo) : "—"}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Expected</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
    </button>
  );
}

function PotsGrid() {
  const { groups, loading } = useGroup();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<Record<string, GroupSummary>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [potTypeFilter, setPotTypeFilter] = useState<"all" | Group["potType"]>("all");

  const ids = groups.map((g) => g.id).join(",");

  // Balances come from each pot's own summary endpoint.
  useEffect(() => {
    if (!ids) {
      setSummaries({});
      setSummariesLoading(false);
      return;
    }
    let alive = true;
    setSummariesLoading(true);
    Promise.all(
      groups.map((g) =>
        getSummary(g.id)
          .then((s) => [g.id, s] as const)
          .catch(() => null)
      )
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, GroupSummary> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setSummaries(next);
      setSummariesLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const chartRows = useMemo(() => groups.flatMap((group) => {
    const summary = summaries[group.id];
    return summary ? [{
      name: group.name,
      collected: summary.collectedKobo,
      spent: summary.spentKobo,
      balance: summary.balanceKobo,
      outstanding: summary.outstandingKobo,
      paid: summary.paidCount,
      partial: summary.partialCount,
      unpaid: summary.outstandingCount,
    }] : [];
  }), [groups, summaries]);

  const visibleGroups = useMemo(
    () => potTypeFilter === "all" ? groups : groups.filter((group) => group.potType === potTypeFilter),
    [groups, potTypeFilter],
  );

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
        title="Pots"
        subtitle="Shared money, clear records, decisions made together."
        action={
          <Link to="/pots/new" className="cp-btn-primary text-sm">
            <Plus className="h-4 w-4" /> Create a pot
          </Link>
        }
      />

      {groups.length === 0 ? (
        <div className="mt-4 overflow-hidden rounded-[1.8rem] border border-violet-900/10 bg-gradient-to-br from-violet-700 via-violet-700 to-purple-900 p-6 text-center text-white shadow-xl shadow-violet-950/10 sm:p-10">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[1.2rem] bg-white/10 text-violet-100 ring-1 ring-white/15"><PiggyBank className="h-7 w-7" /></span>
          <h2 className="font-sora text-xl font-bold">A shared pot starts here</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-violet-50/75">Start a trusted space for class dues, trips, and plans—or join a pot with the code your treasurer shared.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/pots/new" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-violet-800 shadow-lg shadow-black/10 transition hover:bg-violet-50"><Plus className="h-4 w-4" /> Create a pot</Link>
            <Link to="/join" className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">Join a pot</Link>
          </div>
        </div>
      ) : (

      <>
      {chartRows.length > 0 && (
        <Suspense fallback={<div className="my-4 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading pot charts…</div>}>
          <PotPortfolioCharts rows={chartRows} totalPots={groups.length} />
        </Suspense>
      )}
      {summariesLoading && chartRows.length === 0 && <div className="my-4 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading pot overview…</div>}
      {chartRows.length === 0 && !summariesLoading && <p className="my-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">Pot overview charts are unavailable right now.</p>}

      <section aria-label="Your pots" className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Your pots</h2>
          <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Filter pots by type">
            {([
              { value: "all", label: "All", count: groups.length },
              { value: "goal", label: "One-time goal", count: groups.filter((group) => group.potType === "goal").length },
              { value: "rotating", label: "Recurring", count: groups.filter((group) => group.potType === "rotating").length },
            ] as const).map((filter) => {
              const active = potTypeFilter === filter.value;
              const Icon = filter.value === "goal" ? Target : filter.value === "rotating" ? Repeat2 : null;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPotTypeFilter(filter.value)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${active ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {filter.label}<span className={active ? "text-violet-200" : "text-slate-400"}>{filter.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {visibleGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">No {potTypeFilter === "goal" ? "one-time goal" : "recurring"} pots yet.</p>
        ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleGroups.map((group) => (
          <PotCard
            key={group.id}
            group={group}
            summary={summaries[group.id]}
            onOpen={() => navigate(`/pots/${group.id}`)}
          />
        ))}

        <Link
          to="/pots/new"
          className="flex min-h-[76px] items-center justify-center gap-2 rounded-[1.4rem] border border-dashed border-violet-800/20 bg-violet-50/50 p-4 text-sm font-bold text-violet-800 transition hover:border-violet-500 hover:bg-violet-50 dark:border-violet-100/15 dark:bg-violet-400/5 dark:text-violet-200 dark:hover:bg-violet-400/10"
        >
          <Plus className="h-4 w-4" /> Create a pot
        </Link>
      </div>
        )}
      </section>
      </>
      )}
    </>
  );
}

// Public pots anyone can join — searchable by name, category or purpose.
function DiscoverSection() {
  const { refresh, setActiveGroupById } = useGroup();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [pots, setPots] = useState<DiscoverablePot[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      discoverPots(query)
        .then(setPots)
        .catch(() => setPots([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const join = async (pot: DiscoverablePot) => {
    setError(""); setBusyId(pot.id);
    try {
      await joinPublicPot(pot.id);
      await refresh();
      setActiveGroupById(pot.id);
      navigate(`/pots/${pot.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that pot.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section id="discover-public-pots" aria-label="Discover public pots" className="mt-8 scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Compass className="h-4 w-4 text-violet-600" /> Discover public pots
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Open pots anyone can join — or keep yours invite-only.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or category…"
            aria-label="Search public pots"
            className="cp-input pl-9"
          />
        </div>
      </div>

      {error && <p role="alert" className="mb-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {pots === null ? (
        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Looking for public pots…</div>
      ) : pots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          {query ? "No public pots match that search." : "No public pots yet — create one and set it public to appear here."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pots.map((pot) => (
            <div key={pot.id} className="flex flex-col rounded-[1.4rem] border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(76,29,149,.25)] dark:border-white/10 dark:bg-[#171626]">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-700 text-white">
                  <PiggyBank className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{pot.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                    <Users className="h-3 w-3" /> {pot.members} member{pot.members === 1 ? "" : "s"}
                    {pot.category && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{pot.category}</span>}
                  </p>
                </div>
              </div>

              {pot.description && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{pot.description}</p>
              )}

              {pot.targetKobo > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Goal · {formatNaira(pot.targetKobo)}</span>
                    <span className="font-semibold text-violet-600">{formatNaira(pot.balanceKobo)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600" style={{ width: `${Math.min(100, Math.round((pot.balanceKobo / pot.targetKobo) * 100))}%` }} />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  {pot.contributionAmountKobo > 0 ? `${formatNaira(pot.contributionAmountKobo)} per member` : "No fixed contribution"}
                </p>
              )}

              {pot.joined ? (
                <Link to={`/pots/${pot.id}`} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Open
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void join(pot)}
                  disabled={busyId === pot.id}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 py-2 text-xs font-bold text-white transition hover:shadow-lg disabled:opacity-60"
                >
                  {busyId === pot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Join pot
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Pots() {
  return (
    <AppShell>
      <PotsGrid />
      <DiscoverSection />
    </AppShell>
  );
}
