import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, PiggyBank, Plus } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
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
      className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
        <PiggyBank className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{group.name}</p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {summary ? `${summary.paidCount}/${summary.members} paid` : "…"}
          {outstanding > 0 && (
            <span className="text-amber-600"> · {formatNaira(outstanding)} due</span>
          )}
          <span className="text-slate-300"> · </span>
          <span className="tracking-widest">{group.joinCode}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-sora text-sm font-bold text-slate-900">
          {summary ? formatNaira(summary.expectedKobo) : "—"}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Expected</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
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
        subtitle="Open a pot to see everything it owns — its money, members and history."
        action={
          <Link to="/pots/new" className="cp-btn-primary text-sm">
            <Plus className="h-4 w-4" /> Create a pot
          </Link>
        }
      />

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
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-400 transition hover:border-brand-300 hover:text-brand-600"
        >
          <Plus className="h-4 w-4" /> Create a pot
        </Link>
      </div>
    </>
  );
}

export default function Pots() {
  return (
    <AppShell>
      <GroupGate>
        <PotsGrid />
      </GroupGate>
    </AppShell>
  );
}
