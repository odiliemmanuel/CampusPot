import { useEffect } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { ArrowRight, Loader2, PiggyBank } from "lucide-react";

import AppShell from "./AppShell";
import GroupGate from "../components/GroupGate";
import { useGroup } from "../providers/GroupProvider";

// Wraps every pot-scoped page. It makes the pot in the URL the active pot, so
// the sidebar and all child pages operate on that pot alone.
export default function PotLayout() {
  const { id } = useParams<{ id: string }>();
  const { groups, activeGroup, setActiveGroupById } = useGroup();

  useEffect(() => {
    if (id && activeGroup?.id !== id) setActiveGroupById(id);
  }, [id, activeGroup?.id, setActiveGroupById]);

  const group = groups.find((g) => g.id === id) ?? null;
  const active = group !== null && activeGroup?.id === id;

  return (
    <AppShell>
      <GroupGate>
        {active ? (
          <Outlet />
        ) : group === null ? (
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
        ) : (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        )}
      </GroupGate>
    </AppShell>
  );
}
