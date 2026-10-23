import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, CheckCircle2, ArrowDownLeft, BookOpen, ChevronDown, RefreshCw, Undo2,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import AlertError from "../../components/AlertError";
import PinField from "../../components/PinField";
import { useGroup } from "../../providers/GroupProvider";
import {
  listPayments, listMembers, listJournals, refundPayment,
  walletPayPot, getStoredUser, getContributions, getWallet, setWalletPin,
  type Payment, type Membership, type ContributionsResponse, type ContributionRow,
  type ContributionJournal,
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
  const [refundBusy, setRefundBusy] = useState("");
  // Transaction PIN authorises the wallet debit; first-time payers set it here.
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pinPassword, setPinPassword] = useState("");

  const load = async () => {
    const [p, c, m, w] = await Promise.all([
      listPayments(gid).catch(() => [] as Payment[]),
      getContributions(gid).catch(() => null),
      listMembers(gid),
      getWallet().catch(() => null),
    ]);
    setPayments(p);
    setContrib(c);
    setMembers(m);
    if (w) setPinSet(w.pinSet);
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

  const handleRefund = async (paymentId: string) => {
    if (!window.confirm("Return this contribution to the member's wallet? Their outstanding will go back up.")) return;
    setError(""); setNotice(""); setRefundBusy(paymentId);
    try {
      await refundPayment(gid, paymentId);
      setNotice("Contribution refunded to the member's wallet.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refund that contribution.");
    } finally {
      setRefundBusy("");
    }
  };

  const handlePayFromWallet = async (full: boolean) => {
    setError(""); setNotice("");
    const target = full ? myOwed : nairaToKobo(payAmount);
    if (target <= 0) { setError("Enter an amount to pay."); return; }
    if (pin.length < 4) { setError("Enter your 4–6 digit transaction PIN."); return; }
    setPayBusy(true);
    try {
      // First-time payers create the PIN here, then spend with it.
      if (pinSet === false) await setWalletPin(pin, "", pinPassword);
      await walletPayPot(gid, target, pin);
      setNotice("Paid from your wallet — your contribution is updated.");
      setPayAmount("");
      setPin("");
      setPinPassword("");
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
      {error && <AlertError message={error} className="mb-4" />}

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
                  {/* Every wallet debit is authorised by the transaction PIN. */}
                  <PinField
                    value={pin}
                    onChange={setPin}
                    label={pinSet === false ? "Create a transaction PIN" : "Transaction PIN"}
                    hint={pinSet === false ? "New 4–6 digit PIN — confirmed with your password once." : undefined}
                  />
                  {pinSet === false && (
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={pinPassword}
                      onChange={(e) => setPinPassword(e.target.value)}
                      placeholder="Confirm with your password"
                      className="cp-input px-2.5 py-2 text-xs"
                    />
                  )}
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
                  {payments.slice(0, 8).map((p) => {
                    const refundable = !!p.userId && !p.refundedAt && ["matched", "partial"].includes(p.status);
                    return (
                      <div key={p.id} className="flex items-center gap-2 py-1.5 first:pt-0">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-500/15">
                          <ArrowDownLeft className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-slate-700 dark:text-slate-200">{p.payerName || p.quotedReference || "Deposit"}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                            {p.refundedAt && " · refunded"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-violet-700 dark:text-violet-300">{formatNaira(p.amountKobo)}</span>
                        {refundable && (
                          <button
                            type="button"
                            onClick={() => void handleRefund(p.id)}
                            disabled={refundBusy === p.id}
                            title="Refund this contribution"
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:hover:bg-rose-500/10"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
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

      <JournalsCard gid={gid} />
    </>
  );
}

// One book per contribution period: a rotating pot opens a new journal every
// day/week/month, and each closed cycle stays readable forever.
function JournalsCard({ gid }: { gid: string }) {
  const [journals, setJournals] = useState<ContributionJournal[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listJournals(gid)
      .then(setJournals)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the journals."));
  }, [gid]);

  if (error) return <div className="mt-4"><AlertError message={error} /></div>;
  if (journals === null) return null;
  if (journals.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        No cycles yet — the first journal opens when a contribution period starts.
      </p>
    );
  }

  // Newest cycle first; the pot reads as one book per period.
  const ordered = [...journals].reverse();

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Journals</h2>
        <span className="text-[11px] text-slate-400">one book per contribution period</span>
      </div>

      <div className="space-y-2">
        {ordered.map((j) => {
          const open = openId === j.levyId;
          return (
            <div key={j.levyId} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-panel-dark">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : j.levyId)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {j.periodLabel}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{j.cadence.replace("_", " ")}</span>
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {j.paidCount}/{j.rows.length} paid · {formatNaira(j.collectedKobo)} of {formatNaira(j.expectedKobo)} expected
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  j.status === "open"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-white/10"
                }`}>
                  {j.status === "open" ? "Open" : "Closed"}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3 dark:border-white/10">
                  <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Per member</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatNaira(j.amountKobo)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Collected</p>
                      <p className="text-sm font-semibold text-violet-600">{formatNaira(j.collectedKobo)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Closing bal.</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatNaira(j.closingBalanceKobo)}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {j.rows.map((row) => (
                      <div key={row.userId} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{row.name || "Member"}</p>
                          <p className="text-[10px] text-slate-400">
                            {row.payments.length > 0
                              ? `${row.payments.length} payment${row.payments.length === 1 ? "" : "s"} · ${row.payments.map((p) => new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })).join(", ")}`
                              : "no payment this cycle"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {formatNaira(row.paidKobo)} / {formatNaira(row.amountKobo)}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.state === "paid"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : row.state === "partial"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"
                        }`}>
                          {row.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
