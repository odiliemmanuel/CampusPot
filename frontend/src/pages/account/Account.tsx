import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, Banknote, ChevronDown, Check, Copy, Landmark, Loader2, PiggyBank,
  Plus, QrCode, Settings, Wallet, X,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import {
  getAccountOverview, getStoredUser, simulateDeposit, type AccountOverview,
  type PotMembership,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

const stateMeta: Record<PotMembership["state"], { label: string; tint: string }> = {
  paid: { label: "Paid up", tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15" },
  partial: { label: "Part-paid", tint: "bg-amber-100 text-amber-700 dark:bg-amber-500/15" },
  unpaid: { label: "Due", tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/15" },
  none: { label: "No open levy", tint: "bg-slate-100 text-slate-500 dark:bg-white/10" },
};

const money = (kobo: number) =>
  kobo.toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

// A wallet-style quick action.
function Action({
  icon,
  label,
  onClick,
  to,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  highlight?: boolean;
}) {
  const cls = [
    "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-semibold transition active:scale-95",
    highlight
      ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30"
      : "border border-slate-100 bg-white text-slate-600 shadow-sm hover:border-brand-200 dark:border-white/10 dark:bg-panel-dark dark:text-slate-300",
  ].join(" ");
  const inner = (
    <>
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${highlight ? "bg-white/20" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15"}`}>
        {icon}
      </span>
      {label}
    </>
  );
  if (to) return <Link to={to} onClick={onClick} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy"
      className={`shrink-0 rounded-lg p-1.5 transition ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// One pot, collapsed to a single line until tapped.
function PotRow({ pot }: { pot: PotMembership }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-panel-dark">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <PiggyBank className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{pot.groupName}</p>
          <p className="truncate text-xs text-slate-400 capitalize">
            {pot.role}
            {pot.levyTitle ? ` · ${pot.levyTitle}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${stateMeta[pot.state].tint}`}>
          {stateMeta[pot.state].label}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3 dark:border-white/10">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Expected</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {pot.levyAmountKobo > 0 ? money(pot.levyAmountKobo) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Contributed</p>
              <p className="text-sm font-semibold text-emerald-600">{money(pot.paidKobo)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</p>
              <p className="text-sm font-semibold text-amber-600">
                {pot.outstandingKobo > 0 ? money(pot.outstandingKobo) : "₦0"}
              </p>
            </div>
          </div>

          {pot.levyAmountKobo > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className={`h-full rounded-full ${pot.outstandingKobo > 0 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, Math.round((pot.paidKobo / pot.levyAmountKobo) * 100))}%` }}
              />
            </div>
          )}

          {(pot.virtualAccountNumber || pot.bmoniWalletAddress) && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                <Wallet className="h-3 w-3" /> Deposit account
              </p>
              {pot.virtualAccountNumber && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
                    {pot.virtualAccountNumber}
                  </span>
                </div>
              )}
              {(pot.virtualAccountBank || pot.virtualAccountName) && (
                <p className="text-[11px] text-slate-400">
                  {[pot.virtualAccountBank, pot.virtualAccountName].filter(Boolean).join(" · ")}
                </p>
              )}
              {pot.bmoniWalletAddress && (
                <p className="mt-1 truncate text-[10px] text-slate-400">
                  Wallet address: <span className="font-mono">{pot.bmoniWalletAddress}</span>
                </p>
              )}
            </div>
          )}

          <Link
            to={`/pots/${pot.groupId}`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Open pot
          </Link>
        </div>
      )}
    </div>
  );
}

function DepositSheet({
  pots,
  onClose,
  onDone,
}: {
  pots: PotMembership[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [groupId, setGroupId] = useState(pots[0]?.groupId ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const me = getStoredUser();

  const selected = pots.find((p) => p.groupId === groupId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) {
      setError("Enter an amount to deposit.");
      return;
    }
    setBusy(true);
    try {
      await simulateDeposit(groupId, kobo, selected?.reference ?? "", me?.name ?? "");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl dark:bg-panel-dark"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sora text-lg font-bold text-slate-900 dark:text-white">Add money</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {pots.length > 1 && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Deposit into</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="cp-input mt-1">
                {pots.map((p) => (
                  <option key={p.groupId} value={p.groupId}>{p.groupName}</option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount (₦)</span>
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5,000"
              inputMode="numeric"
              className="cp-input mt-1 font-sora text-2xl font-bold"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {[1000, 2000, 5000, 10000, 20000].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-slate-300"
                >
                  ₦{n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {selected?.virtualAccountNumber && (
            <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
              <Landmark className="h-4 w-4 shrink-0" />
              Paying into {selected.groupName} · {selected.virtualAccountNumber}
              {selected.virtualAccountBank ? ` (${selected.virtualAccountBank})` : ""}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Money moves from your linked bank account via B Moni. Sandbox transfers settle instantly.
          </p>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button type="submit" disabled={busy} className="cp-btn-primary w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Fund pot"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function WalletHome() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const me = getStoredUser();

  useEffect(() => {
    setLoading(true);
    getAccountOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your wallet."))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const pots = data?.pots ?? [];
  const owed = pots.filter((p) => p.outstandingKobo > 0);
  const primaryAccount = pots.find((p) => p.virtualAccountNumber);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }
  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  return (
    <>
      <h1 className="mb-3 font-sora text-lg font-bold text-slate-900 sm:text-2xl dark:text-white">
        Hi{(me?.name ?? "").trim() ? `, ${me!.name.split(" ")[0]}` : ""} 👋
      </h1>

      {/* Wallet hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-white shadow-lg shadow-brand-900/20 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-xs font-medium text-brand-100">
            <Wallet className="h-3.5 w-3.5" /> Your wallet
          </p>
          <p className="mt-1 text-[11px] text-brand-100/80">Total you've contributed</p>
          <p className="font-sora text-3xl font-extrabold tracking-tight sm:text-4xl">
            {money(data?.totalContributedKobo ?? 0)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium text-white">
              {pots.length} {pots.length === 1 ? "pot" : "pots"}
            </span>
            {owed.length > 0 && (
              <span className="rounded-full bg-amber-400/90 px-2.5 py-1 font-semibold text-amber-950">
                {money(data?.totalOutstandingKobo ?? 0)} due
              </span>
            )}
          </div>

          {primaryAccount?.virtualAccountNumber && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <Landmark className="h-4 w-4 shrink-0 text-brand-100" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-brand-100/80">Deposit account</p>
                <p className="truncate font-mono text-sm font-bold tracking-wide">
                  {primaryAccount.virtualAccountNumber}
                </p>
                <p className="truncate text-[10px] text-brand-100/80">
                  {[primaryAccount.virtualAccountBank, primaryAccount.virtualAccountName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <CopyButton value={primaryAccount.virtualAccountNumber} className="bg-white/15 text-white hover:bg-white/25" />
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
        <Action highlight icon={<Plus className="h-4 w-4" />} label="Add money" onClick={() => setDepositOpen(true)} />
        <Action icon={<PiggyBank className="h-4 w-4" />} label="New pot" to="/pots/new" />
        <Action icon={<QrCode className="h-4 w-4" />} label="Join" to="/join" />
        <Action icon={<Settings className="h-4 w-4" />} label="Settings" to="/settings" />
      </div>

      {/* Pots — compact, expand for detail */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Your pots</h2>
        <Link to="/pots" className="text-xs font-semibold text-brand-600">See all</Link>
      </div>
      {pots.length === 0 ? (
        <div className="mt-3 rounded-3xl border border-slate-100 bg-white p-8 text-center dark:border-white/10 dark:bg-panel-dark">
          <PiggyBank className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">You haven't joined a pot yet.</p>
          <Link to="/pots/new" className="cp-btn-primary mt-4 inline-flex text-sm">
            <Plus className="h-4 w-4" /> Create a pot
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {pots.map((p) => <PotRow key={p.groupId} pot={p} />)}
        </div>
      )}

      {/* Transactions */}
      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Activity</h2>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-panel-dark">
        {(data?.transactions ?? []).length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No payments yet. Add money to get started.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {(data?.transactions ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{t.groupName}</p>
                  <p className="text-xs text-slate-400 capitalize">
                    {new Date(t.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{t.status}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-emerald-600">+{money(t.amountKobo)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {depositOpen && pots.length > 0 && (
        <DepositSheet
          pots={pots}
          onClose={() => setDepositOpen(false)}
          onDone={() => {
            setDepositOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
      {depositOpen && pots.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center dark:bg-panel-dark">
            <Banknote className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Join or create a pot first, then you can add money to it.
            </p>
            <button type="button" onClick={() => setDepositOpen(false)} className="cp-btn-primary mt-4 w-full text-sm">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Account() {
  return (
    <AppShell>
      <WalletHome />
    </AppShell>
  );
}
