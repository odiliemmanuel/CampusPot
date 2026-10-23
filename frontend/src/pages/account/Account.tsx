import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, CalendarClock, Compass,
  CheckCircle2, ChevronDown, Check, Copy, Landmark, Loader2, PiggyBank,
  Plus, QrCode, Send, ShieldCheck, Trash2, Wallet, X,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import AlertError from "../../components/AlertError";
import PinField from "../../components/PinField";
import {
  cancelSchedule, createSchedule, getAccountOverview, getStoredUser, getWallet,
  listBanks, listSchedules, lookupPotAccount, lookupUser, setWalletPin,
  verifyBankAccount, walletDeposit, walletTransfer,
  walletPayPot, type AccountOverview, type BankOption, type LookedUpUser, type PotAccount,
  type PotMembership, type ScheduleView, type VerifiedAccount,
  type WalletOverview, type WalletTransaction,
} from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

// One violet palette across wallet surfaces.
const WALLET_GRADIENT = "bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800";
const WALLET_SOFT = "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200";

const stateMeta: Record<PotMembership["state"], { label: string; tint: string }> = {
  paid: { label: "Paid up", tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15" },
  partial: { label: "Part-paid", tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15" },
  unpaid: { label: "Due", tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15" },
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
      {copied ? <Check className="h-3.5 w-3.5 text-violet-400" /> : <Copy className="h-3.5 w-3.5" />}
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

function SubmitButton({ busy, label, disabled = false }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
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
        {error && <AlertError message={error} />}
        <SubmitButton busy={busy} label="Add to wallet" />
      </form>
    </Sheet>
  );
}

const FALLBACK_BANKS: BankOption[] = [
  { name: "GTBank", code: "058" }, { name: "Zenith Bank", code: "057" },
  { name: "Access Bank", code: "044" }, { name: "First Bank of Nigeria", code: "011" },
  { name: "United Bank for Africa", code: "033" },
];

/** Amber warning: low balance, so the sender knows before they commit. */
function LowBalanceAlert({ needed, available }: { needed: number; available: number }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Low balance — this send is {formatNaira(needed)} but your wallet only holds {formatNaira(available)}.
      </span>
    </p>
  );
}

/** Green confirmation of WHO receives the money, shown before any send. */
function RecipientConfirm({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          You&apos;re sending to
        </p>
        <p className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-200">{label}</p>
        <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-300/80">{detail}</p>
      </div>
    </div>
  );
}

/** Amber warning: the destination is a pot the sender doesn't belong to. */
function NotAMemberAlert({ potName }: { potName: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Only members of <span className="font-bold">{potName}</span> can pay into it. Join the pot first, then send.
      </span>
    </p>
  );
}


function SendSheet({ balanceKobo, pinSet, onClose, onDone }: { balanceKobo: number; pinSet: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"member" | "pot" | "bank">("member");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  // Transaction PIN authorises the debit; first-time users create it inline.
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [banks, setBanks] = useState<BankOption[]>(FALLBACK_BANKS);
  const [bank, setBank] = useState(FALLBACK_BANKS[0].name);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Scheduling: send now, or once/recurring at a future date.
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [cadence, setCadence] = useState<"once" | "weekly" | "monthly">("once");

  // Name enquiry results — the recipient is confirmed before money moves.
  const [verified, setVerified] = useState<VerifiedAccount | null>(null);
  const [lookedUp, setLookedUp] = useState<LookedUpUser | null>(null);
  const [potAccount, setPotAccount] = useState<PotAccount | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const verifySeq = useRef(0);

  // Load the real bank list once; the fallback keeps the demo working offline.
  useEffect(() => {
    listBanks()
      .then((list) => { if (list.length > 0) { setBanks(list); setBank((b) => b || list[0].name); } })
      .catch(() => { /* keep fallbacks */ });
  }, []);

  // Look the recipient up whenever it changes, debounced. A stale response is
  // dropped by comparing sequence numbers.
  const refreshLookup = useCallback((value: string, currentMode: "member" | "pot" | "bank", currentBank: string) => {
    const seq = ++verifySeq.current;
    const target = value.trim();
    setVerified(null); setLookedUp(null); setPotAccount(null); setCheckError("");
    if (currentMode === "pot") {
      if (!/^\d{10}$/.test(target)) return;
      setChecking(true);
      lookupPotAccount(target)
        .then((p) => { if (seq === verifySeq.current) setPotAccount(p); })
        .catch((err) => {
          if (seq !== verifySeq.current) return;
          setCheckError(err instanceof Error ? err.message : "No pot owns that account number.");
        })
        .finally(() => { if (seq === verifySeq.current) setChecking(false); });
      return;
    }
    if (currentMode === "bank") {
      if (!/^\d{10}$/.test(target)) return;
      setChecking(true);
      verifyBankAccount(target, currentBank)
        .then((v) => { if (seq === verifySeq.current) setVerified(v); })
        .catch((err) => {
          if (seq !== verifySeq.current) return;
          setCheckError(err instanceof Error ? err.message : "We couldn't confirm that account.");
        })
        .finally(() => { if (seq === verifySeq.current) setChecking(false); });
      return;
    }
    if (target.length < 3) return;
    setChecking(true);
    lookupUser(target)
      .then((u) => { if (seq === verifySeq.current) setLookedUp(u); })
      .catch((err) => {
        if (seq !== verifySeq.current) return;
        setCheckError(err instanceof Error ? err.message : "No PotKeeper account matches that.");
      })
      .finally(() => { if (seq === verifySeq.current) setChecking(false); });
  }, []);

  useEffect(() => { refreshLookup(recipient, mode, bank); }, [recipient, mode, bank, refreshLookup]);

  const amountKobo = nairaToKobo(amount);
  const overBalance = amountKobo > balanceKobo;
  const confirmed = mode === "member" ? !!lookedUp : mode === "pot" ? !!potAccount : !!verified;
  // Paying into a pot is member-only: refuse to arm the send otherwise.
  const memberBlocked = mode === "pot" && !!potAccount && !potAccount.isMember;
  // The PIN authorises the debit; first-time senders also type their password
  // once so the PIN can be created as part of this same send.
  const pinOk = pinSet ? pin.length >= 4 : pin.length >= 4 && password.length > 0;
  const scheduleOk = when === "now" || !!scheduleAt;
  const canSend = confirmed && !checking && !memberBlocked && amountKobo > 0 && !overBalance && pinOk && scheduleOk;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) { setError("Enter an amount to send."); return; }
    if (overBalance) { setError("Top up your wallet before sending this amount."); return; }
    if (!recipient.trim()) {
      setError(mode === "member" ? "Enter the recipient's email or phone." : "Enter the account number.");
      return;
    }
    if (!confirmed) {
      setError(mode === "member" ? "Confirm the recipient's PotKeeper account first." : "Confirm the destination first.");
      return;
    }
    if (memberBlocked) {
      setError(`Only members of ${potAccount!.groupName} can pay into it.`);
      return;
    }
    if (pin.length < 4) { setError("Enter your 4–6 digit transaction PIN."); return; }
    setError(""); setBusy(true);
    try {
      // First-time senders create the PIN here, then spend with it.
      if (!pinSet) await setWalletPin(pin, "", password);

      // Scheduled sends are stored instead of moving money now; the sweeper
      // runs them at the chosen time (weekly/monthly repeat until cancelled).
      if (when === "later") {
        const chosen = banks.find((b) => b.name === bank);
        await createSchedule({
          amountKobo: kobo,
          recipient: recipient.trim(),
          bankName: mode === "bank" ? (chosen?.name ?? bank) : undefined,
          bankCode: mode === "bank" ? (chosen?.code ?? verified?.bankCode) : undefined,
          note: note || undefined,
          executeAt: scheduleAt,
          cadence,
          pin,
        });
        onDone();
        return;
      }

      if (mode === "member") {
        await walletTransfer(kobo, recipient.trim(), note || `Sent to ${lookedUp!.name}`, "", "", pin);
      } else if (mode === "pot") {
        // Sending to a pot's own account pays INTO that pot as a contribution.
        await walletTransfer(kobo, recipient.trim(), note || `Contribution to ${potAccount!.groupName}`, "", "", pin);
      } else {
        const chosen = banks.find((b) => b.name === bank);
        await walletTransfer(kobo, recipient.trim(), note || `Sent to ${verified!.accountHolderName}`, verified!.bankName, chosen?.code ?? verified!.bankCode, pin);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send money.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet title="Send money" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {([["member", "PotKeeper user"], ["pot", "A pot"], ["bank", "Bank account"]] as const).map(([key, label]) => (
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

        {mode === "member" && (
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To (email or phone)</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="chidi@potkeeper.ng"
              className="cp-input mt-1"
            />
          </label>
        )}

        {mode === "pot" && (
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pot account number</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder="Pot's collection account"
              inputMode="numeric"
              className="cp-input mt-1"
            />
            <span className="mt-1 block text-[11px] text-slate-400">Every pot has its own account. Sending to it pays into that pot.</span>
          </label>
        )}

        {mode === "bank" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank</span>
              <select value={bank} onChange={(e) => setBank(e.target.value)} className="cp-input mt-1">
                {banks.map((b) => <option key={b.code} value={b.name}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account number</span>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="0123456789"
                inputMode="numeric"
                className="cp-input mt-1"
              />
            </label>
          </div>
        )}

        {/* Name enquiry — confirm who receives the money before sending. */}
        {checking && (
          <p className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking recipient…
          </p>
        )}
        {!checking && verified && (
          <RecipientConfirm
            label={verified.accountHolderName}
            detail={`${verified.bankName} · ${verified.accountNumber}`}
          />
        )}
        {!checking && lookedUp && (
          <RecipientConfirm
            label={lookedUp.name}
            detail={`PotKeeper · ${lookedUp.email || lookedUp.phone || ""}`}
          />
        )}
        {!checking && potAccount && (
          <div className="space-y-2">
            <RecipientConfirm
              label={potAccount.groupName}
              detail={`Pot · ${potAccount.bankName || ""} · ${potAccount.accountNumber}`}
            />
            {potAccount.isMember && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                You&apos;re a member — this counts as your contribution.
                {potAccount.outstandingKobo > 0 ? ` You owe ${formatNaira(potAccount.outstandingKobo)}.` : " You're all paid up."}
              </p>
            )}
            {!potAccount.isMember && <NotAMemberAlert potName={potAccount.groupName} />}
          </div>
        )}
        {!checking && checkError && <AlertError message={checkError} />}

        <AmountInput amount={amount} setAmount={setAmount} />
        {overBalance && <LowBalanceAlert needed={amountKobo} available={balanceKobo} />}
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for?" className="cp-input mt-1" />
        </label>

        {/* Send now, or schedule once / weekly / monthly. */}
        <div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">When</span>
          <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            {([["now", "Send now"], ["later", "Schedule"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setWhen(key)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  when === key ? "bg-white text-brand-700 shadow-sm dark:bg-white/15 dark:text-white" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {when === "later" && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Run on</span>
                <input
                  type="date"
                  required
                  min={new Date().toLocaleDateString("en-CA")}
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="cp-input mt-1"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Repeat</span>
                <select value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} className="cp-input mt-1">
                  <option value="once">Just once</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
              <p className="text-[11px] text-slate-400 sm:col-span-2">
                You authorise it once with your PIN. Cancel any time before it runs — recurring sends can be stopped after each run too.
              </p>
            </div>
          )}
        </div>

        {/* Transaction PIN — every send is authorised by the wallet owner. */}
        <PinField
          value={pin}
          onChange={setPin}
          label={pinSet ? "Transaction PIN" : "Create a transaction PIN"}
          hint={pinSet ? "Enter your PIN to authorise this send." : "New 4–6 digit PIN — you'll use it for every send. Confirmed with your password once."}
        />
        {!pinSet && (
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirm with your password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your account password"
              className="cp-input mt-1"
            />
          </label>
        )}

        <p className="text-[11px] text-slate-400">
          Wallet balance: {money(balanceKobo)}. We check the recipient's name before any money leaves your wallet.
        </p>
        {error && <AlertError message={error} />}
        <SubmitButton busy={busy} disabled={!canSend} label={
          canSend
            ? when === "later" ? "Schedule transfer" : "Send money"
            : checking ? "Checking…" : memberBlocked ? "Not a member" : confirmed && !pinOk ? "Enter PIN to send" : "Confirm recipient to send"
        } />
      </form>
    </Sheet>
  );
}

function PayPotSheet({ pots, balanceKobo, pinSet, onClose, onDone }: { pots: PotMembership[]; balanceKobo: number; pinSet: boolean; onClose: () => void; onDone: () => void }) {
  const owing = pots.filter((p) => p.outstandingKobo > 0);
  const [groupId, setGroupId] = useState(owing[0]?.groupId ?? pots[0]?.groupId ?? "");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = pots.find((p) => p.groupId === groupId);
  const pinOk = pinSet ? pin.length >= 4 : pin.length >= 4 && password.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo <= 0) { setError("Enter an amount to pay."); return; }
    if (pin.length < 4) { setError("Enter your 4–6 digit transaction PIN."); return; }
    setError(""); setBusy(true);
    try {
      // First-time payers create the PIN here, then spend with it.
      if (!pinSet) await setWalletPin(pin, "", password);
      await walletPayPot(groupId, kobo, pin);
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
        <PinField
          value={pin}
          onChange={setPin}
          label={pinSet ? "Transaction PIN" : "Create a transaction PIN"}
          hint={pinSet ? "Enter your PIN to authorise this payment." : "New 4–6 digit PIN — confirmed with your password once."}
        />
        {!pinSet && (
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirm with your password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your account password"
              className="cp-input mt-1"
            />
          </label>
        )}
        <p className="text-[11px] text-slate-400">Wallet balance: {money(balanceKobo)}. This credits the pot and marks your contribution paid.</p>
        {error && <AlertError message={error} />}
        <SubmitButton busy={busy} disabled={!pinOk} label={pinOk ? "Pay from wallet" : "Enter PIN to pay"} />
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
              <p className="text-sm font-semibold text-violet-600">{money(pot.paidKobo)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</p>
              <p className="text-sm font-semibold text-violet-600">
                {pot.outstandingKobo > 0 ? money(pot.outstandingKobo) : "₦0"}
              </p>
            </div>
          </div>

          {pot.levyAmountKobo > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className={`h-full rounded-full ${pot.outstandingKobo > 0 ? "bg-violet-400" : "bg-violet-500"}`}
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
    case "refund":
      return { icon: <ArrowDownLeft className="h-4 w-4" />, tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15", sign: "+", color: "text-violet-600" };
    case "transfer_out":
      return { icon: <ArrowUpRight className="h-4 w-4" />, tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15", sign: "-", color: "text-violet-600" };
    default:
      return { icon: <PiggyBank className="h-4 w-4" />, tint: WALLET_SOFT, sign: "-", color: "text-slate-600 dark:text-slate-300" };
  }
}

/** Compact email verification prompt shown only while the address is unverified. */
function VerificationCard() {
  const me = getStoredUser();
  if (me?.emailVerified) return null;

  const startEmail = () => window.location.assign(`/verify-email?email=${encodeURIComponent(me?.email ?? "")}`);
  return (
    <section className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-400/20 dark:bg-amber-500/10">
      <div className="flex min-w-0 items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
        <p className="text-xs font-medium leading-snug text-amber-800 dark:text-amber-200">Verify your email to send money</p>
      </div>
      <button type="button" onClick={startEmail} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
        Verify
      </button>
    </section>
  );
}

/** Scheduled & recurring transfers, with cancel. */
function SchedulesCard() {
  const [rows, setRows] = useState<ScheduleView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    listSchedules().then(setRows).catch((err) => setError(err instanceof Error ? err.message : "Couldn't load scheduled transfers."));
  };
  useEffect(load, []);

  const cancel = async (id: string) => {
    setBusy(true); setError("");
    try {
      await cancelSchedule(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel it.");
    } finally {
      setBusy(false);
    }
  };

  const active = (rows ?? []).filter((r) => r.status === "scheduled");
  if (rows !== null && active.length === 0 && !error) return null;

  return (
    <section className="cp-card mt-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-violet-600" />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scheduled transfers</p>
      </div>

      {error && <div className="mt-2"><AlertError message={error} /></div>}
      {rows === null && !error && <p className="mt-2 text-xs text-slate-400">Loading…</p>}

      {active.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
          {active.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/15">
                <CalendarClock className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {formatNaira(r.amountKobo)} → {r.groupName || r.recipient || "bank"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {r.cadence === "once" ? "Once" : r.cadence === "weekly" ? "Weekly" : "Monthly"}
                  {" · "}runs {new Date(r.executeAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  {r.lastError ? ` · retrying (${r.lastError})` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void cancel(r.id)}
                disabled={busy}
                aria-label="Cancel scheduled transfer"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows !== null && active.length === 0 && !error && (
        <p className="mt-2 text-xs text-slate-400">Nothing scheduled. Use “Schedule” when sending to plan a future or recurring transfer.</p>
      )}
    </section>
  );
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
  if (error) return <p className="text-sm text-violet-600">{error}</p>;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-sora text-lg font-bold text-slate-900 sm:text-2xl dark:text-white">
          Hi{(me?.name ?? "").trim() ? `, ${me!.name.split(" ")[0]}` : ""} 👋
        </h1>
        <Link to="/notifications" aria-label="Open notifications" className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 dark:border-white/10 dark:bg-panel-dark dark:text-slate-300">
          <Bell className="h-4 w-4" />
        </Link>
      </div>

      {/* Compact balance card: amount and funding action share the top row. */}
      <div className="overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-violet-700 via-violet-700 to-purple-800 px-4 py-3.5 text-white shadow-md shadow-violet-950/10 sm:rounded-[1.5rem] sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-violet-100/80">Available balance</p>
            <p className="mt-0.5 truncate font-sora text-xl font-extrabold tracking-tight text-white sm:text-3xl">{money(balance)}</p>
          </div>
          <button type="button" onClick={() => setSheet("add")} className="shrink-0 rounded-full border border-white/25 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4 sm:text-sm"><Plus className="mr-1 inline h-4 w-4" />Add money</button>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-white/15 pt-2 text-[11px]">
          <span className="shrink-0 text-violet-100/70">Wallet number</span>
          <span className="truncate font-semibold tracking-wide text-white">{me?.phone || "Add your phone in settings"}</span>
          {me?.phone && <button type="button" onClick={() => void navigator.clipboard?.writeText(me.phone!)} aria-label="Copy wallet number" className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/10"><Copy className="h-3 w-3" /></button>}
        </div>
      </div>

      {/* Secondary actions — consistent tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <QuickAction icon={<Send className="h-4 w-4" />} label="Send" onClick={() => setSheet("send")} />
        <QuickAction icon={<QrCode className="h-4 w-4" />} label="Join pot" to="/join" />
        <QuickAction icon={<Compass className="h-4 w-4" />} label="Find public pots" to="/pots#discover-public-pots" />
        <QuickAction icon={<Landmark className="h-4 w-4" />} label="Connect bank" to="/banks" />
      </div>

      <div className="mt-3"><VerificationCard /></div>
      <SchedulesCard />

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
        <SendSheet balanceKobo={balance} pinSet={wallet?.pinSet ?? false} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setReloadKey((k) => k + 1); }} />
      )}
      {sheet === "pay" && (
        <PayPotSheet
          pots={pots}
          balanceKobo={balance}
          pinSet={wallet?.pinSet ?? false}
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
