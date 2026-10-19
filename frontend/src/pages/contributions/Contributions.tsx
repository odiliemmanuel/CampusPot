import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, CheckCircle2, RefreshCw,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import {
  walletPayPot, getContributions,
  type ContributionsResponse,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

export function ContributionsInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [contrib, setContrib] = useState<ContributionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const load = async () => {
    setContrib(await getContributions(gid).catch(() => null));
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

  const rows = contrib?.rows ?? [];
  const mine = rows.find((r) => r.isMe);
  const myOwed = mine && mine.state !== "paid" && mine.state !== "none"
    ? Math.max(0, mine.amountKobo - mine.paidKobo)
    : 0;

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
      <PageHeader title="Contributions" subtitle="Your payment progress and what remains due." />

      {notice && (
        <div className="mb-4 flex items-center gap-2 text-sm text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-violet-600">{error}</p>}

      {activeGroup?.potType === "rotating" && (
        <section className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-300/10 dark:bg-violet-500/10">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">{activeGroup.contributionFrequency === "daily" ? "Daily contribution" : `${activeGroup.contributionFrequency} contribution cycle`}</p><p className="truncate text-xs text-slate-600 dark:text-slate-300">{formatNaira(activeGroup.contributionAmountKobo)} per member{activeGroup.contributionFrequency === "daily" ? " each day" : " per cycle"} · next cycle opens when everyone pays</p></div>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold capitalize text-violet-700 dark:bg-white/10 dark:text-violet-200">{activeGroup.contributionFrequency}</span>
        </section>
      )}

      <section className="cp-card rounded-2xl p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your contribution</h2><Link to={`/pots/${gid}/members`} className="text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300">Members</Link></div>
        {mine && mine.state !== "none" ? <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-violet-50 px-2.5 py-2 dark:bg-violet-500/10"><p className="text-[10px] text-slate-500 dark:text-slate-400">Paid</p><p className="truncate text-sm font-bold text-violet-800 dark:text-violet-200">{formatNaira(mine.paidKobo)}</p></div>
            <div className="rounded-xl bg-violet-50 px-2.5 py-2 dark:bg-violet-500/10"><p className="text-[10px] text-slate-500 dark:text-slate-400">Outstanding</p><p className="truncate text-sm font-bold text-violet-800 dark:text-violet-200">{formatNaira(myOwed)}</p></div>
            <div className="rounded-xl bg-violet-50 px-2.5 py-2 dark:bg-violet-500/10"><p className="text-[10px] text-slate-500 dark:text-slate-400">Due</p><p className="truncate text-sm font-bold text-violet-800 dark:text-violet-200">{formatNaira(mine.amountKobo)}</p></div>
          </div>
          {myOwed > 0 && <div className="mt-2 flex gap-2"><input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount ₦" inputMode="numeric" className="cp-input h-10 min-w-0 flex-1" /><button onClick={() => handlePayFromWallet(false)} disabled={payBusy} className="cp-btn-primary h-10 shrink-0 px-3">{payBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Pay"}</button><button onClick={() => handlePayFromWallet(true)} disabled={payBusy} className="cp-btn-ghost h-10 shrink-0 px-3 text-xs">Pay full</button></div>}
          {myOwed === 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300"><CheckCircle2 className="h-3.5 w-3.5" /> You are paid in full</p>}
        </> : <p className="py-1 text-sm text-slate-500 dark:text-slate-400">There is no open contribution for you right now.</p>}
      </section>
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
