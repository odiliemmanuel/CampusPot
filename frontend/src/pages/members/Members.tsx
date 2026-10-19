import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, Check, ShieldCheck, Shield, User as UserIcon, Landmark, Info, QrCode, ArrowLeft,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import JoinCard from "../../components/JoinCard";
import { useGroup } from "../../providers/GroupProvider";
import {
  listMembers, updateMemberRole, getStoredUser, getOutstanding, getSummary,
  type Membership, type Role, type OutstandingMember, type Levy,
} from "../../lib/api";
import { formatNaira } from "../../lib/format";

const roleMeta: Record<Role, { label: string; icon: typeof Shield; tint: string }> = {
  treasurer: { label: "Treasurer", icon: ShieldCheck, tint: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" },
  cosigner: { label: "Co-signer", icon: Shield, tint: "bg-violet-50 text-violet-600" },
  member: { label: "Member", icon: UserIcon, tint: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200" },
};

const roleOptions: Role[] = ["member", "cosigner", "treasurer"];

export function MembersInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [members, setMembers] = useState<Membership[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingMember[]>([]);
  const [levy, setLevy] = useState<Levy | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const [m, o, s] = await Promise.all([
      listMembers(gid),
      getOutstanding(gid).catch(() => ({ members: [] as OutstandingMember[], levy: undefined })),
      getSummary(gid).catch(() => null),
    ]);
    setMembers(m);
    setOutstanding(o.members);
    setLevy(o.levy ?? s?.levy);
    return m;
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load members."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  // A member's payment position against the current levy, if there is one.
  const statusFor = (userId: string) => {
    if (!levy) return null;
    const o = outstanding.find((x) => x.userId === userId);
    if (o) {
      return o.state === "partial"
        ? { label: `Paid ${formatNaira(o.paidKobo)} of ${formatNaira(o.amountKobo)}`, tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" }
        : { label: `Owes ${formatNaira(o.amountKobo)}`, tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    }
    return { label: "Paid in full", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
  };

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

      {notice && <p className="mb-4 text-sm text-violet-600">{notice}</p>}
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Member list */}
        <div className="space-y-2 sm:space-y-3 lg:col-span-2">
          {members.map((m) => {
            const meta = roleMeta[m.role];
            const isMe = m.userId === myId;
            const status = statusFor(m.userId);
            return (
              <motion.div
                key={m.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white p-2.5 shadow-sm dark:border-violet-200/10 dark:bg-panel-dark sm:gap-3 sm:rounded-2xl sm:p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-800 text-sm font-bold text-white sm:h-10 sm:w-10">
                    {(m.user?.name ?? "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {m.user?.name ?? m.userId}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                    </p>
                    <p className="hidden truncate text-xs text-slate-400 sm:block">{m.user?.email ?? "—"}</p>
                    {status && (canManage || isMe) && (
                      <span className={`mt-0.5 inline-flex max-w-full truncate items-center rounded-full px-2 py-0.5 text-[10px] font-semibold sm:mt-1 sm:text-[11px] ${status.tint}`}>
                        {status.label}
                      </span>
                    )}
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

        {/* Pot account */}
        <div className="space-y-3 sm:space-y-5">
          {activeGroup!.virtualAccountNumber && (
            <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm dark:border-violet-200/10 dark:bg-panel-dark sm:rounded-3xl sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-brand-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pot account</p>
              </div>
              <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">{activeGroup!.virtualAccountNumber}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {[activeGroup!.virtualAccountBank, activeGroup!.virtualAccountName].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}

          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-white/10 dark:bg-panel-dark">
            <QrCode className="mx-auto mb-2 h-7 w-7 text-brand-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Share the QR code and join code from the invite page.
            </p>
            <Link to={`/pots/${gid}?tab=invite`} className="cp-btn-primary mt-3 inline-flex w-full justify-center text-sm">
              <QrCode className="h-4 w-4" /> Open invite page
            </Link>
          </div>
        </div>
      </div>

      {/* Floating invite action */}
      <Link
        to={`/pots/${gid}?tab=invite`}
        className="fixed bottom-24 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 transition active:scale-95 sm:px-5 sm:py-3.5 sm:text-sm lg:bottom-8"
      >
        <QrCode className="h-5 w-5" /> Invite
      </Link>
    </>
  );
}

// The Invite page — the pot's QR, join code and share link, kept off the main
// Members list so that screen stays clean.
export function InviteInner() {
  const { activeGroup } = useGroup();
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const gid = activeGroup!.id;

  const joinLink =
    typeof window !== "undefined" ? `${window.location.origin}/join/${activeGroup!.joinCode}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const goBack = () => {
    const next = new URLSearchParams(params);
    next.set("tab", "members");
    setParams(next, { replace: true });
  };

  return (
    <>
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to members
      </button>

      <div className="mx-auto max-w-md">
        <JoinCard code={activeGroup!.joinCode} />

        <div className="mt-3 rounded-2xl border border-violet-100 bg-white p-3 shadow-sm dark:border-violet-200/10 dark:bg-panel-dark sm:mt-4 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Shareable link
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={joinLink} className="cp-input flex-1 text-xs" />
            <button type="button" onClick={copyLink} className="cp-btn-ghost shrink-0">
              {copied ? <Check className="h-4 w-4 text-violet-500" /> : "Copy"}
            </button>
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
