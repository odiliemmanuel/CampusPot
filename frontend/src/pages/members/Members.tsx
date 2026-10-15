import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Copy, Check, ShieldCheck, Shield, User as UserIcon, Landmark, Info,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import JoinCard from "../../components/JoinCard";
import { useGroup } from "../../providers/GroupProvider";
import {
  listMembers, updateMemberRole, getStoredUser, type Membership, type Role,
} from "../../lib/api";

const roleMeta: Record<Role, { label: string; icon: typeof Shield; tint: string }> = {
  treasurer: { label: "Treasurer", icon: ShieldCheck, tint: "bg-brand-50 text-brand-700" },
  cosigner: { label: "Co-signer", icon: Shield, tint: "bg-violet-50 text-violet-600" },
  member: { label: "Member", icon: UserIcon, tint: "bg-slate-100 text-slate-600" },
};

const roleOptions: Role[] = ["member", "cosigner", "treasurer"];

function MembersInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => listMembers(gid);

  useEffect(() => {
    setLoading(true);
    load()
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load members."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const changeRole = async (userId: string, role: Role) => {
    setError(""); setNotice(""); setSavingId(userId);
    try {
      await updateMemberRole(gid, userId, role);
      setMembers(await load());
      setNotice(`Role updated to ${role}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that role.");
      setMembers(await load());
    } finally {
      setSavingId("");
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(activeGroup!.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${members.length} in this pot · roles decide who can approve payouts.`}
      />

      {notice && <p className="mb-4 text-sm text-emerald-600">{notice}</p>}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Member list */}
        <div className="lg:col-span-2 space-y-3">
          {members.map((m) => {
            const meta = roleMeta[m.role];
            const isMe = m.userId === myId;
            return (
              <motion.div
                key={m.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-100 bg-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold shrink-0">
                    {(m.user?.name ?? "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {m.user?.name ?? m.userId}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{m.user?.email ?? "—"}</p>
                  </div>
                </div>

                {canManage ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label={`Role for ${m.user?.name ?? m.userId}`}
                      value={m.role}
                      disabled={savingId === m.userId}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>{roleMeta[r].label}</option>
                      ))}
                    </select>
                    {savingId === m.userId && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                  </div>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.tint}`}>
                    <meta.icon className="w-3 h-3" />
                    {meta.label}
                  </span>
                )}
              </motion.div>
            );
          })}

          {canManage && (
            <p className="flex items-start gap-1.5 pt-1 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Anyone who joins with the code becomes a member. Promote at least two people to
              Co-signer so payouts can reach the {activeGroup!.approvalThreshold}-of-{activeGroup!.approvalTotal} approval.
            </p>
          )}
        </div>

        {/* Join + pot account */}
        <div className="space-y-6">
          <JoinCard code={activeGroup!.joinCode} />

          {activeGroup!.virtualAccountNumber && (
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-brand-600" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pot account
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-600 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>
              <p className="font-sora text-lg font-bold text-slate-900">{activeGroup!.virtualAccountNumber}</p>
              <p className="text-xs text-slate-400 mt-0.5">{activeGroup!.virtualAccountBank} · {activeGroup!.virtualAccountName}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Members() {
  return (
    <AppShell>
      <GroupGate>
        <MembersInner />
      </GroupGate>
    </AppShell>
  );
}
