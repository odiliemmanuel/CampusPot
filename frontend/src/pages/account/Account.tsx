import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowUpRight, Banknote, ChevronDown, Check, Copy, Landmark,
  Loader2, PiggyBank, Plus, QrCode, Send, Wallet, X,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import {
  getAccountOverview, getStoredUser, getWallet, walletDeposit, walletTransfer,
  walletPayPot, type AccountOverview, type PotMembership, type WalletOverview,
  type WalletTransaction,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

// One violet palette across wallet surfaces.
const WALLET_GRADIENT = "bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800";
const WALLET_SOFT = "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200";

const stateMeta: Record<PotMembership["state"], { label: string; tint: string }> = {
  paid: { label: "Paid up", tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15" },
  partial: { label: "Part-paid", tint: "bg-amber-100 text-amber-700 dark:bg-amber-500/15" },
  unpaid: { label: "Due", tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/15" },
  none: { label: "No open levy", tint: "bg-slate-100 text-slate-500 dark:bg-white/10" },
};

// Amounts are stored in kobo (1 naira = 100 kobo), so convert to naira first —
// otherwise ₦5,000 (500000 kobo) would render as ₦500,000.
const money = (kobo: number) =>
  (kobo / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

const BANKS = ["B Moni", "GTBank", "Opay", "Access Bank", "Zenith Bank", "UBA", "Kuda", "Moniepoint"];

function QuickAction({
  icon, label, onClick, to, tint = WALLET_SOFT,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  tint?: string;
}) {
  const inner = (
    <>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      <span className="px-1 text-center text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200">{label}</span>
    </>
  );
  const cls =
    "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-1 py-2.5 transition active:scale-95 dark:border-white/10 dark:bg-panel-dark";
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
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
    <button type="button" onClick={copy} aria-label="Copy" className={`shrink-0 rounded-lg p-1.5 transition ${className}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl dark:bg-panel-dark"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sora text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function AmountInput({ amount, setAmount }: { amount: string; setAmount: (v: string) => void }) {
  return (
    <div>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount (₦)</span>
      <input
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
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-white/10 dark:text-slate-300"
          >
            ₦{n.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white transition disabled:opacity-60 ${WALLET_GRADIENT}`}
    >
      {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : label}
    </button>
  );
}

function AddMoneySheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState(BANKS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) { setError("Enter an amount to add."); return; }
    setError(""); setBusy(true);
    try {
      await walletDeposit(kobo, `BANK-${Date.now()}`, `Added from ${bank}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add money.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet title="Add money" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">From bank</span>
          <select value={bank} onChange={(e) => setBank(e.target.value)} className="cp-input mt-1">
            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <AmountInput amount={amount} setAmount={setAmount} />
        <p className="text-[11px] text-slate-400">
          Money lands in <span className="font-semibold text-brand-600 dark:text-brand-300">your wallet</span>, not a pot.
          You can then send it to anyone or pay your contribution.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <SubmitButton busy={busy} label="Add to wallet" />
      </form>
    </Sheet>
  );
}

function SendSheet({ balanceKobo, onClose, onDone }: { balanceKobo: number; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"member" | "bank">("member");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [bank, setBank] = useState(BANKS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) { setError("Enter an amount to send."); return; }
    if (!recipient.trim()) {
      setError(mode === "member" ? "Enter the recipient's email or phone." : "Enter the account number.");
      return;
    }
    setError(""); setBusy(true);
    try {
      if (mode === "member") {
        await walletTransfer(kobo, recipient.trim(), note || `Sent to ${recipient.trim()}`);
      } else {
        await walletTransfer(kobo, recipient.trim(), note || `Sent to ${bank}`, bank);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send money.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet title="Send money" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {([["member", "PotKeeper user"], ["bank", "Bank account"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setRecipient(""); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                mode === key ? "bg-white text-brand-700 shadow-sm dark:bg-white/15 dark:text-white" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "member" ? (
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To (email or phone)</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="chidi@potkeeper.ng"
              className="cp-input mt-1"
            />
          </label>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank</span>
              <select value={bank} onChange={(e) => setBank(e.target.value)} className="cp-input mt-1">
                {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account number</span>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0123456789"
                inputMode="numeric"
                className="cp-input mt-1"
              />
            </label>
          </div>
        )}

        <AmountInput amount={amount} setAmount={setAmount} />
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for?" className="cp-input mt-1" />
        </label>
        <p className="text-[11px] text-slate-400">
          Wallet balance: {money(balanceKobo)}. Sending to a registered PotKeeper user credits their wallet instantly; a bank send is an external payout.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <SubmitButton busy={busy} label="Send money" />
      </form>
    </Sheet>
  );
}

function PayPotSheet({ pots, balanceKobo, onClose, onDone }: { pots: PotMembership[]; balanceKobo: number; onClose: () => void; onDone: () => void }) {
  const owing = pots.filter((p) => p.outstandingKobo > 0);
  const [groupId, setGroupId] = useState(owing[0]?.groupId ?? pots[0]?.groupId ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = pots.find((p) => p.groupId === groupId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) { setError("Enter an amount to pay."); return; }
    setError(""); setBusy(true);
    try {
      await walletPayPot(groupId, kobo);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pay the pot.");
    } finally { setBusy(false); }
  };

  if (pots.length === 0) {
    return (
      <Sheet title="Pay a pot" onClose={onClose}>
        <p className="text-sm text-slate-500">You haven't joined a pot yet.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Pay a pot" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pot</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="cp-input mt-1">
            {pots.map((p) => (
              <option key={p.groupId} value={p.groupId}>
                {p.groupName}{p.outstandingKobo > 0 ? ` · ${money(p.outstandingKobo)} due` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {selected && selected.outstandingKobo > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(Math.round(selected.outstandingKobo / 100)))}
              className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300"
            >
              Pay full {money(selected.outstandingKobo)}
            </button>
          )}
        </div>
        <AmountInput amount={amount} setAmount={setAmount} />
        <p className="text-[11px] text-slate-400">Wallet balance: {money(balanceKobo)}. This credits the pot and marks your contribution paid.</p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <SubmitButton busy={busy} label="Pay from wallet" />
      </form>
    </Sheet>
  );
}

// One pot, collapsed to a single line until tapped.
function PotRow({ pot, onPay }: { pot: PotMembership; onPay: (pot: PotMembership) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-panel-dark">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${WALLET_GRADIENT}`}>
          <PiggyBank className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{pot.groupName}</p>
          <p className="truncate text-xs capitalize text-slate-400">
            {pot.role}{pot.levyTitle ? ` · ${pot.levyTitle}` : ""}
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
              <p className="text-[10px] uppercase tracking-wide text-slate-400">You paid</p>
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

          {pot.outstandingKobo > 0 && (
            <button
              type="button"
              onClick={() => onPay(pot)}
              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white ${WALLET_GRADIENT}`}
            >
              <Wallet className="h-4 w-4" /> Pay {money(pot.outstandingKobo)} from wallet
            </button>
          )}

          {(pot.virtualAccountNumber || pot.bmoniWalletAddress) && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                <Landmark className="h-3 w-3" /> Pot deposit account
              </p>
              {pot.virtualAccountNumber && (
                <p className="font-mono text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
                  {pot.virtualAccountNumber}
                </p>
              )}
              {(pot.virtualAccountBank || pot.virtualAccountName) && (
                <p className="text-[11px] text-slate-400">
                  {[pot.virtualAccountBank, pot.virtualAccountName].filter(Boolean).join(" · ")}
                </p>
              )}
              {pot.bmoniWalletAddress && (
                <p className="mt-1 truncate text-[10px] text-slate-400">
                  Wallet: <span className="font-mono">{pot.bmoniWalletAddress}</span>
                </p>
              )}
            </div>
          )}

          <Link
            to={`/pots/${pot.groupId}`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200"
          >
            Open pot
          </Link>
        </div>
      )}
    </div>
  );
}

function txMeta(kind: WalletTransaction["kind"], amount: number) {
  switch (kind) {
    case "deposit":
    case "transfer_in":
      return { icon: <ArrowDownLeft className="h-4 w-4" />, tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15", sign: "+", color: "text-emerald-600" };
    case "transfer_out":
      return { icon: <ArrowUpRight className="h-4 w-4" />, tint: "bg-rose-100 text-rose-600 dark:bg-rose-500/15", sign: "-", color: "text-rose-600" };
    default:
      return { icon: <PiggyBank className="h-4 w-4" />, tint: WALLET_SOFT, sign: "-", color: "text-slate-600 dark:text-slate-300" };
  }
}

function WalletHome() {
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<null | "add" | "send" | "pay">(null);
  const [reloadKey, setReloadKey] = useState(0);
  const me = getStoredUser();

  useEffect(() => {
    setLoading(true);
    Promise.all([getWallet(), getAccountOverview()])
      .then(([w, o]) => { setWallet(w); setOverview(o); })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your wallet."))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const pots = overview?.pots ?? [];
  const balance = wallet?.balanceKobo ?? 0;
  const txs = wallet?.transactions ?? [];
  const funded = txs.some((t) => t.kind === "deposit" || t.kind === "transfer_in");

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }
  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  return (
    <>
      <h1 className="mb-3 font-sora text-lg font-bold text-slate-900 sm:text-2xl dark:text-white">
        Hi{(me?.name ?? "").trim() ? `, ${me!.name.split(" ")[0]}` : ""} 👋
      </h1>

      {/* Compact balance strip keeps the wallet actions and pots in view. */}
      <div className="flex items-center gap-3 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-white to-violet-50/80 px-3 py-3 shadow-sm dark:border-violet-300/10 dark:from-[#171626] dark:to-[#211a35] sm:px-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 text-white shadow-sm shadow-violet-900/20"><Wallet className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-violet-700 dark:text-violet-200">Wallet balance</p><span className="text-[10px] font-semibold text-slate-400">NGN</span></div>
          <p className="mt-0.5 truncate font-sora text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{money(balance)}</p>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="shrink-0 text-slate-400">Wallet number</span>
            <span className="truncate font-semibold tracking-wide text-slate-700 dark:text-slate-200">{me?.phone || "Add your phone in settings"}</span>
            {me?.phone && <button type="button" onClick={() => void navigator.clipboard?.writeText(me.phone!)} aria-label="Copy wallet number" className="shrink-0 rounded-md p-1 text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-white/10"><Copy className="h-3 w-3" /></button>}
          </div>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-800 dark:bg-violet-400/10 dark:text-violet-200 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Available</span>
      </div>

      {/* Secondary actions — consistent tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <QuickAction icon={<Banknote className="h-5 w-5" />} label="Add money" onClick={() => setSheet("add")} />
        <QuickAction icon={<Send className="h-4 w-4" />} label="Send" onClick={() => setSheet("send")} />
        <QuickAction icon={<QrCode className="h-4 w-4" />} label="Join pot" to="/join" />
        <QuickAction icon={<Landmark className="h-4 w-4" />} label="Connect bank" to="/banks" />
      </div>

      {/* Pots — compact, expand for detail */}
        <div className="mt-8 flex items-end justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-violet-700 dark:text-violet-300">Together</p><h2 className="mt-1 font-sora text-lg font-bold text-slate-900 dark:text-white">Your pots</h2></div>
        <Link to="/pots" className="rounded-full border border-violet-700/15 px-3 py-1.5 text-xs font-bold text-violet-800 transition hover:bg-violet-50 dark:border-violet-200/15 dark:text-violet-200 dark:hover:bg-white/5">See all</Link>
      </div>
      {pots.length === 0 ? (
        <div className="mt-3 rounded-3xl border border-slate-100 bg-white p-8 text-center dark:border-white/10 dark:bg-panel-dark">
          <PiggyBank className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">You haven't joined a pot yet.</p>
          <Link to="/pots/new" className={`mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white ${WALLET_GRADIENT}`}>
            <Plus className="h-4 w-4" /> Create a pot
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {pots.map((p) => (
            <PotRow key={p.groupId} pot={p} onPay={() => setSheet("pay")} />
          ))}
        </div>
      )}

      {/* Wallet activity */}
      <div className="mb-3 mt-8 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Ledger</p><h2 className="mt-1 font-sora text-lg font-bold text-slate-900 dark:text-white">Recent activity</h2></div></div>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-panel-dark">
        {txs.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">
            {funded ? "No wallet activity yet." : "Add money to fund your wallet and get started."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {txs.map((t) => {
              const meta = txMeta(t.kind, t.amountKobo);
              return (
                <li key={t.id} className="flex items-center gap-3 p-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${txMeta(t.kind, t.amountKobo).tint}`}>
                    {txMeta(t.kind, t.amountKobo).icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t.counterparty || (t.kind === "pot_payment" ? "Pot contribution" : "Wallet")}
                    </p>
                    <p className="text-xs capitalize text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      {" · "}{t.kind.replace("_", " ")}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${txMeta(t.kind, t.amountKobo).color}`}>
                    {txMeta(t.kind, t.amountKobo).sign}{money(t.amountKobo)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!funded && (
          <button
            type="button"
            onClick={() => setSheet("add")}
            className="flex w-full items-center justify-center gap-2 border-t border-slate-100 py-3 text-sm font-semibold text-brand-600 dark:border-white/10 dark:text-brand-300"
          >
            <Plus className="h-4 w-4" /> Add money to your wallet
          </button>
        )}
      </section>

      {sheet === "add" && (
        <AddMoneySheet onClose={() => setSheet(null)} onDone={() => { setSheet(null); setReloadKey((k) => k + 1); }} />
      )}
      {sheet === "send" && (
        <SendSheet balanceKobo={balance} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setReloadKey((k) => k + 1); }} />
      )}
      {sheet === "pay" && (
        <PayPotSheet
          pots={pots}
          balanceKobo={balance}
          onClose={() => { setSheet(null); }}
          onDone={() => { setSheet(null); setReloadKey((k) => k + 1); }}
        />
      )}
    </>
  );
}

export default function WalletPage() {
  return (
    <AppShell>
      <WalletHome />
    </AppShell>
  );
}
