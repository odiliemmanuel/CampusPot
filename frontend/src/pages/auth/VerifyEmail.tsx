import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MailCheck, RefreshCw } from "lucide-react";

import AuthLayout from "../../layouts/AuthLayout";
import { getStoredUser, getToken, sendOtp, setSession, verifyOtp } from "../../lib/api";

// Email verification: after signing up, the user types the 6-digit code we
// mailed them. Once verified they can move money; until then the pot engine
// refuses sends, so this screen is the gate in front of every wallet action.
export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const stored = getStoredUser();

  // The address to verify: query param (fresh sign-up redirect), else the
  // signed-in account's email.
  const email = (params.get("email") || stored?.email || "").trim();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Demo deployments have no SMTP: the API returns the code so the flow can
  // still be completed. We surface it as a hint.
  const [devCode, setDevCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendLeft, setResendLeft] = useState(0);
  const autoSent = useRef(false);

  const request = async (silent = false) => {
    if (!email) return;
    setSending(true);
    setError("");
    if (!silent) setNotice("");
    try {
      const res = await sendOtp(email, "signup");
      setDevCode(res.devCode ?? "");
      const expiresAt = res.expiresAt ? Date.parse(res.expiresAt) : Date.now() + 300_000;
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setResendLeft(60);
      if (!silent) setNotice("Code sent — check your inbox.");
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (secondsLeft === 0 && resendLeft === 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
      setResendLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft, resendLeft]);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  // Send the first code automatically when we know the address.
  useEffect(() => {
    if (email && !autoSent.current) {
      autoSent.current = true;
      void request(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await verifyOtp(email, code.trim(), "signup");
      // Refresh the cached session so emailVerified flips immediately.
      const token = getToken();
      if (token && res.user) setSession(token, res.user);
      navigate("/pots", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        email
          ? `Enter the 6-digit code we sent to ${email}. It expires in 5 minutes.`
          : "Enter the 6-digit code we emailed you."
      }
    >
      <form onSubmit={submit} className="space-y-3 sm:space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            readOnly={!!email}
            onChange={() => {}}
            placeholder="you@example.com"
            className="cp-input mt-1 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <p aria-live="polite" className="text-center text-xs text-slate-500 dark:text-slate-400">
          {secondsLeft > 0 ? `Code expires in ${clock(secondsLeft)}` : "Code expired — request a new one."}
        </p>

        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Verification code</label>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="cp-input mt-1 text-center font-sora text-2xl font-bold tracking-[0.4em]"
          />
        </div>

        {devCode && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Demo mode: your code is <span className="font-mono">{devCode}</span>
          </p>
        )}
        {notice && (
          <p className="flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-300">
            <MailCheck className="h-4 w-4" /> {notice}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !email}
          className="w-full rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 py-3 font-semibold text-white transition disabled:opacity-60"
        >
          {busy ? "Verifying…" : "Verify my email"}
        </button>

        <button
          type="button"
          onClick={() => void request()}
          disabled={sending || !email || resendLeft > 0}
          className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-primary-600 disabled:opacity-60 dark:text-slate-400"
        >
          <RefreshCw className={`h-4 w-4 ${sending ? "animate-spin" : ""}`} /> {resendLeft > 0 ? `Resend code in ${clock(resendLeft)}` : "Resend code"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Wrong address?{" "}
        <Link to="/settings" className="font-semibold text-primary-600 hover:text-primary-700">
          Fix it in Settings
        </Link>
      </p>
    </AuthLayout>
  );
}
