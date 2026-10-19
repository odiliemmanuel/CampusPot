import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, Lock, LogOut, RefreshCw, Save, ShieldAlert } from "lucide-react";

import PageHeader from "../../components/PageHeader";
import JoinCard from "../../components/JoinCard";
import { useGroup } from "../../providers/GroupProvider";
import {
  getStoredUser, leaveGroup, listMembers, regenerateJoinCode, updateGroup, type Membership,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

export default function PotSettings() {
  const { activeGroup, refresh } = useGroup();
  const navigate = useNavigate();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Draft settings
  const [name, setName] = useState(activeGroup!.name);
  const [threshold, setThreshold] = useState(activeGroup!.approvalThreshold);
  const [total, setTotal] = useState(activeGroup!.approvalTotal);
  const [largeLimit, setLargeLimit] = useState(
    activeGroup!.largeExpenseKobo > 0 ? String(activeGroup!.largeExpenseKobo / 100) : ""
  );

  useEffect(() => {
    setLoading(true);
    listMembers(gid)
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load members."))
      .finally(() => setLoading(false));
  }, [gid]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await updateGroup(gid, {
        name,
        approvalThreshold: threshold,
        approvalTotal: total,
        largeExpenseKobo: largeLimit.trim() ? nairaToKobo(largeLimit) : 0,
      });
      await refresh();
      setNotice("Pot settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save settings.");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!window.confirm("Leave this pot? You'll lose access to its chat and contributions.")) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      await leaveGroup(gid);
      await refresh();
      navigate("/pots", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave the pot.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      await regenerateJoinCode(gid);
      await refresh();
      setNotice("New join code generated. The old code no longer works.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a new code.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Pot settings"
        subtitle={canManage ? "Manage this pot's name, spending rules and join code." : "This pot's details. Only the treasurer can change them."}
      />

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={save} className="space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Pot name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              className="cp-input mt-1 disabled:opacity-60"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Approvals required</label>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={!canManage}
                className="cp-input mt-1 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Out of how many approvers</label>
              <input
                type="number"
                min={1}
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                disabled={!canManage}
                className="cp-input mt-1 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Large-spend alert above (₦, leave blank for none)
            </label>
            <input
              value={largeLimit}
              onChange={(e) => setLargeLimit(e.target.value)}
              disabled={!canManage}
              placeholder="e.g. 50000"
              className="cp-input mt-1 disabled:opacity-60"
            />
            {activeGroup!.largeExpenseKobo > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                Payouts above {formatNaira(activeGroup!.largeExpenseKobo)} are flagged as high-risk.
              </p>
            )}
          </div>

          {canManage ? (
            <button type="submit" disabled={busy} className="cp-btn-primary">
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </button>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" /> Only the treasurer can edit these.
            </p>
          )}
        </form>

        <div className="space-y-6">
          <JoinCard code={activeGroup!.joinCode} />

          {canManage && (
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-violet-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Join code</p>
              </div>
              <p className="text-sm text-slate-500">
                Rotate the code if it leaks. Anyone with a code can join as a member.
              </p>
              <button
                type="button"
                onClick={regenerate}
                disabled={busy}
                className="cp-btn-ghost mt-3"
              >
                <RefreshCw className="h-4 w-4" /> Generate new code
              </button>
            </div>
          )}

          <div className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm dark:border-violet-500/20">
            <div className="mb-2 flex items-center gap-2">
              <LogOut className="h-4 w-4 text-violet-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leave pot</p>
            </div>
            <p className="text-sm text-slate-500">
              Leaving removes you from the pot and its chat. A pot always keeps at least one treasurer.
            </p>
            <button
              type="button"
              onClick={leave}
              disabled={busy}
              className="cp-btn-ghost mt-3 text-violet-600"
            >
              <LogOut className="h-4 w-4" /> Leave this pot
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
