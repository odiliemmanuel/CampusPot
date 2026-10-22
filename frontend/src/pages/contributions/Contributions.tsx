import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, CheckCircle2, ArrowDownLeft, RefreshCw,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  listPayments, listMembers,
  walletPayPot, getStoredUser, getContributions,
  type Payment, type Membership, type ContributionsResponse, type ContributionRow,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

function statusBadge(row: ContributionRow) {
  switch (row.state) {
    case "paid":
      return { label: "Paid in full", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    case "partial":
      return { label: "Partial", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    case "unpaid":
      return { label: "Not paid", tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" };
    default:
      return { label: "—", tint: "bg-slate-100 text-slate-500 dark:bg-white/5" };
  }
}

export function ContributionsInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [contrib, setContrib] = useState<ContributionsResponse | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const load = async () => {
    const [p, c, m] = await Promise.all([
      listPayments(gid).catch(() => [] as Payment[]),
      getContributions(gid).catch(() => null),
      listMembers(gid),
    ]);
    setPayments(p);
    setContrib(c);
    setMembers(m);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load contributions."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  const myRole = members.find((m) => m.userId === myId)?.role ?? null;
  const canManage = myRole === "treasurer";

  const rows = contrib?.rows ?? [];
  const mine = rows.find((r) => r.isMe);
  const myOwed = mine && mine.state !== "paid" && mine.state !== "none"
    ? Math.max(0, mine.amountKobo - mine.paidKobo)
    : 0;
  const unpaid = rows.filter((r) => r.state !== "paid");

  const handlePayFromWallet = async (full: boolean) => {
    setError(""); setNotice("");
    const target = full ? myOwed : nairaToKobo(payAmount);
    if (target <= 0) { setError("Enter an amount to pay."); return; }
    setPayBusy(true);
    try {
      await walletPayPot(gid, target);
      setNotice("Paid from your wallet — your contribution is updated.");
      setPayAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pay from your wallet.");
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Contributions" subtitle="Track what each member has paid and what's still due." />

      {notice && (
        <div className="mb-4 flex items-center gap-2 text-sm text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-3">
        <div className="cp-card rounded-xl p-2.5 sm:rounded-2xl sm:p-3.5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your contribution</p>
            <Link to={`/pots/${gid}/members`} className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">See members</Link>
          </div>
          {mine && mine.state !== "none" ? (
            <div className="grid grid-cols-3 divide-x divide-violet-200/80 dark:divide-white/10">
              <div className="min-w-0 px-1.5 first:pl-0">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Paid</p>
                <p className="mt-0.5 truncate font-sora text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{formatNaira(mine.paidKobo)}</p>
              </div>
              <div className="min-w-0 px-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Left</p>
                <p className="mt-0.5 truncate font-sora text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{formatNaira(Math.max(0, mine.amountKobo - mine.paidKobo))}</p>
              </div>
              <div className="min-w-0 px-1.5 last:pr-0">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</p>
                <p className="mt-0.5 truncate font-sora text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{formatNaira(mine.amountKobo)}</p>
              </div>
            </div>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">There is no open contribution for you right now.</p>}
        </div>

        {/* Right column */}
        <div className="space-y-2.5">
          {mine && mine.state !== "none" && (
            <div className="cp-card rounded-xl p-2.5 sm:rounded-2xl sm:p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your dues</p>
                <span className="font-sora text-sm font-bold text-slate-900 dark:text-white">{formatNaira(Math.max(0, mine.amountKobo - mine.paidKobo))}<span className="ml-1 text-[10px] font-normal text-slate-400">left</span></span>
              </div>
              {myOwed > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount ₦"
                      inputMode="numeric"
                      className="cp-input flex-1 px-2.5 py-2 text-xs"
                    />
                    <button onClick={() => handlePayFromWallet(false)} disabled={payBusy} className="cp-btn-primary shrink-0 px-3 py-2 text-xs">
                      {payBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Pay"}
                    </button>
                  </div>
                  <button onClick={() => handlePayFromWallet(true)} disabled={payBusy} className="w-full text-left text-[10px] font-semibold text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-300">
                    Pay full balance · {formatNaira(myOwed)}
                  </button>
                </div>
              )}
            </div>
          )}

          {canManage ? (
            <div className="cp-card rounded-xl p-2.5 sm:rounded-2xl sm:p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recent payments
              </p>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-400">No payments yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 py-1.5 first:pt-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-500/15">
                        <ArrowDownLeft className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-700 dark:text-slate-200">{p.payerName || p.quotedReference || "Deposit"}</p>
                        <p className="text-[10px] text-slate-400">{new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">{formatNaira(p.amountKobo)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="cp-card rounded-xl p-2.5 sm:rounded-2xl sm:p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Still to pay ({unpaid.length})
              </p>
              {unpaid.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                  <CheckCircle2 className="w-4 h-4" /> Everyone is paid up.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {unpaid.map((r) => (
                    <span key={r.userId} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(r).tint}`}>
                      {r.name || r.userId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Contributions() {
  return (
    <AppShell>
      <GroupGate>
        <ContributionsInner />
      </GroupGate>
    </AppShell>
  );
}
