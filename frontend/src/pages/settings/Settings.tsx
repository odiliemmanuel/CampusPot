import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, LogOut, PiggyBank, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import PinField from "../../components/PinField";
import { useGroup } from "../../providers/GroupProvider";
import {
  clearSession, deleteAccount, getMe, getStoredUser, getWallet, getToken, setSession, setWalletPin, updateProfile,
  type AuthUser,
} from "../../lib/api";

export default function Settings() {
  const { activeGroup } = useGroup();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Transaction PIN — whether one exists, and the fields to set or change it.
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [newPin, setNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinPassword, setPinPassword] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNotice, setPinNotice] = useState("");
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    getWallet()
      .then((w) => setPinSet(w.pinSet))
      .catch(() => setPinSet(false));
  }, []);

  useEffect(() => {
    getMe()
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
        setPhone(u.phone ?? "");
      })
      .catch(() => {
        const cached = getStoredUser<AuthUser>();
        if (cached) {
          setUser(cached);
          setName(cached.name ?? "");
          setPhone(cached.phone ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = user !== null && (name !== (user.name ?? "") || phone !== (user.phone ?? ""));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const updated = await updateProfile({ name, phone });
      setUser(updated);
      setName(updated.name ?? "");
      setPhone(updated.phone ?? "");
      const token = getToken();
      if (token) setSession(token, updated);
      setNotice("Your profile has been updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearSession();
    window.location.href = "/login";
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) { setPinError("Your PIN must be 4 to 6 digits."); return; }
    setPinError("");
    setPinNotice("");
    setPinBusy(true);
    try {
      // First-time setup is confirmed with the password; a change with the
      // current PIN — so a hijacked session can't silently swap the PIN.
      await setWalletPin(newPin, pinSet ? currentPin : "", pinSet ? "" : pinPassword);
      setPinSet(true);
      setNewPin("");
      setCurrentPin("");
      setPinPassword("");
      setPinNotice(pinSet ? "Your transaction PIN has been changed." : "Transaction PIN created — you'll use it for every send.");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Couldn't save your PIN.");
    } finally {
      setPinBusy(false);
    }
  };

  const removeAccount = async () => {
    setError("");
    setNotice("");
    setDeleting(true);
    try {
      await deleteAccount();
      clearSession();
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Your account, and the rules of the pot you're in." />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Profile — editable */}
        <section className="cp-card rounded-3xl p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15">
              <UserRound className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Your profile</p>
          </div>

          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-xl font-bold text-white">
                  {(name || user?.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-sora font-bold text-slate-900 dark:text-white">
                    {user?.name ?? "—"}
                  </p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {user?.email ?? "—"}
                  </p>
                </div>
              </div>

              <form onSubmit={save} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Display name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="cp-input"
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Phone
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="cp-input mt-1"
                    placeholder="0801 234 5678"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</span>
                  <input
                    value={user?.email ?? ""}
                    readOnly
                    disabled
                    className="cp-input mt-1 cursor-not-allowed opacity-60"
                  />
                </label>

                {notice && (
                  <p className="flex items-center gap-1.5 text-sm text-violet-600">
                    <CheckCircle2 className="h-4 w-4" /> {notice}
                  </p>
                )}
                {error && <p className="text-sm text-violet-600">{error}</p>}

                <button type="submit" disabled={!dirty || saving} className="cp-btn-primary w-full text-sm sm:w-auto">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </button>
              </form>
            </div>
          )}
        </section>

        <div className="space-y-4 sm:space-y-6">
          {/* Pot rules */}
          {activeGroup && (
            <section className="cp-card rounded-3xl p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15">
                  <PiggyBank className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {activeGroup.name} · rules
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <Row label="Approvals" value={`${activeGroup.approvalThreshold} of ${activeGroup.approvalTotal} signers`} />
                <Row
                  label="Large spend"
                  value={activeGroup.largeExpenseKobo > 0
                    ? `${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(activeGroup.largeExpenseKobo / 100)}+`
                    : "Not set"}
                />
                <Row label="Join code" value={activeGroup.joinCode} />
                {activeGroup.virtualAccountNumber && (
                  <Row
                    label="Pot account"
                    value={[activeGroup.virtualAccountBank, activeGroup.virtualAccountNumber].filter(Boolean).join(" · ")}
                  />
                )}
              </div>

              <Link
                to={`/pots/${activeGroup.id}?tab=settings`}
                className="cp-btn-ghost mt-4 w-full justify-center text-sm sm:w-auto"
              >
                <ShieldCheck className="h-4 w-4" /> Open pot settings
              </Link>
            </section>
          )}

          {/* Transaction PIN — authorises every send out of the wallet */}
          <section className="cp-card rounded-3xl p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Transaction PIN</p>
            </div>

            {pinSet === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
            ) : (
              <form onSubmit={savePin} className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {pinSet
                    ? "Every send from your wallet is authorised with your 4–6 digit PIN. Change it below."
                    : "Create a 4–6 digit PIN — no money can leave your wallet until you do."}
                </p>
                <PinField
                  value={newPin}
                  onChange={setNewPin}
                  label={pinSet ? "New PIN" : "Create a transaction PIN"}
                  autoFocus={false}
                />
                {pinSet ? (
                  <PinField
                    value={currentPin}
                    onChange={setCurrentPin}
                    label="Current PIN"
                    placeholder="••••"
                  />
                ) : (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Confirm with your password
                    </span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={pinPassword}
                      onChange={(e) => setPinPassword(e.target.value)}
                      placeholder="Your account password"
                      className="cp-input mt-1"
                    />
                  </label>
                )}

                {pinNotice && (
                  <p className="flex items-center gap-1.5 text-sm text-violet-600">
                    <CheckCircle2 className="h-4 w-4" /> {pinNotice}
                  </p>
                )}
                {pinError && <p className="text-sm text-violet-600">{pinError}</p>}

                <button type="submit" disabled={pinBusy} className="cp-btn-primary w-full text-sm sm:w-auto">
                  {pinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {pinSet ? "Change PIN" : "Create PIN"}
                </button>
              </form>
            )}
          </section>

          {/* Session */}
          <section className="cp-card rounded-3xl p-4 sm:p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Session
            </p>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-600 transition hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </section>

          {/* Danger zone */}
          <section className="cp-card rounded-3xl border border-violet-200 p-4 sm:p-6 dark:border-violet-500/30">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15">
                <Trash2 className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Delete account</p>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              This removes your PotKeeper account, wallet history and membership of every pot. You
              can't undo it. Pots where you're the only treasurer must be handed over first.
            </p>
            {confirmDelete ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={removeAccount}
                  disabled={deleting}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:shadow-lg disabled:opacity-60"
                >
                  {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Yes, delete my account
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 rounded-xl border border-violet-200 px-4 py-3 text-sm font-semibold text-violet-600 transition hover:bg-violet-50 dark:border-violet-500/30 dark:hover:bg-violet-500/10"
              >
                <Trash2 className="h-4 w-4" /> Delete account
              </button>
            )}
          </section>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        PotKeeper · sandbox build · synthetic data only
      </p>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="truncate text-right font-medium text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}
