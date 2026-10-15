import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  Loader2, UserPlus, Copy, Check, ShieldCheck, Shield, User as UserIcon,
  Landmark, Users,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { listMembers, inviteMember, type Membership, type Role } from "../../lib/api";

const roleMeta: Record<Role, { label: string; icon: typeof Shield; tint: string }> = {
  treasurer: { label: "Treasurer", icon: ShieldCheck, tint: "bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300" },
  cosigner: { label: "Co-signer", icon: Shield, tint: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  member: { label: "Member", icon: UserIcon, tint: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
};

function MembersInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const load = () => listMembers(gid);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load members."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await inviteMember(gid, email, role);
      setNotice(`${email} invited as ${role}.`);
      setEmail("");
      setMembers(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invite.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(activeGroup!.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${members.length} in this pot · roles decide who can approve payouts.`}
      />

      {notice && <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {members.map((m) => {
            const meta = roleMeta[m.role];
            return (
              <motion.div
                key={m.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="cp-card rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold shrink-0">
                    {(m.user?.name ?? "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{m.user?.name ?? m.userId}</p>
                    <p className="text-xs text-slate-400 truncate">{m.user?.email ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.tint}`}>
                    <meta.icon className="w-3 h-3" /> {meta.label}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase ${m.status === "active" ? "text-emerald-500" : "text-amber-500"}`}>
                    {m.status}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="space-y-6">
          {/* Join code */}
          <div className="rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <p className="text-primary-100 text-xs font-semibold uppercase tracking-wide">Join code</p>
              <p className="font-sora text-3xl font-extrabold tracking-widest mt-2">{activeGroup!.joinCode}</p>
              <button
                onClick={copyCode}
                className="mt-4 inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          </div>

          {/* Virtual account */}
          {activeGroup!.virtualAccountNumber && (
            <div className="cp-card rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="w-4 h-4 text-primary-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pot account</p>
              </div>
              <p className="font-sora text-lg font-bold text-slate-900 dark:text-white tracking-wider">
                {activeGroup!.virtualAccountNumber}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {activeGroup!.virtualAccountBank} · {activeGroup!.virtualAccountName}
              </p>
            </div>
          )}

          {/* Invite */}
          <div className="cp-card rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-4 h-4 text-primary-600" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invite a member</p>
            </div>
            <form onSubmit={handleInvite} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@email.com"
                className="cp-input"
              />
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="cp-input">
                <option value="member">Member</option>
                <option value="cosigner">Co-signer</option>
                <option value="treasurer">Treasurer</option>
              </select>
              <button type="submit" disabled={busy} className="cp-btn-primary w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send invite
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> New members can also self-join with the code.
            </p>
          </div>
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
