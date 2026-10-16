import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, PiggyBank, Plus, Users } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { getSummary, type Group, type GroupSummary } from "../../lib/api";
import { formatNaira } from "../../lib/format";

// One card per pot. Clicking a card opens that pot's own dashboard.
function PotCard({
  group,
  summary,
  onOpen,
}: {
  group: Group;
  summary?: GroupSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-3xl border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <PiggyBank className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sora text-base font-bold text-slate-900">{group.name}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Join code ·{" "}
            <span className="font-semibold tracking-widest text-slate-500">{group.joinCode}</span>
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Balance</p>
        <p className="font-sora text-2xl font-bold text-slate-900">
          {summary ? formatNaira(summary.balanceKobo) : "—"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          {summary ? `${summary.paidCount}/${summary.members} paid` : "—"}
        </span>
        {summary && summary.outstandingKobo > 0 && (
          <span className="font-medium text-amber-600">
            {formatNaira(summary.outstandingKobo)} outstanding
          </span>
        )}
      </div>

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
        Open dashboard
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
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
        subtitle="Every pot keeps its own money, members and history."
        action={
          <Link to="/pots/new" className="cp-btn-primary text-sm">
            <Plus className="h-4 w-4" /> Create a pot
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
          className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:text-brand-600"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-semibold">Create a pot</span>
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
