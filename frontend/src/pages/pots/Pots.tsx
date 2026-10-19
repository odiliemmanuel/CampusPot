import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, PiggyBank, Plus } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { getSummary, type Group, type GroupSummary } from "../../lib/api";
import { formatNaira } from "../../lib/format";

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

  const ids = groups.map((g) => g.id).join(",");

  // Balances come from each pot's own summary endpoint.
  useEffect(() => {
    if (!ids) return;
    let alive = true;
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
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
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
    </>
  );
}

export default function Pots() {
  return (
    <AppShell>
      <PotsGrid />
    </AppShell>
  );
}
