import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, MailCheck, RefreshCw } from "lucide-react";

import AuthLayout from "../../layouts/AuthLayout";
import { forgotPassword, resetPassword } from "../../lib/api";

// Password reset: request a code by email, then set a new password with it.
// Two steps on one screen; the demo devCode hint keeps the flow completable
// on deployments without an SMTP server.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "reset">("request");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devCode, setDevCode] = useState("");

  const requestCode = async () => {
    if (!email.trim()) {
      setError("Enter the email on your account.");
      return;
    }
    setError("");
    setNotice("");
    setSending(true);
    try {
      const res = await forgotPassword(email.trim());
      setDevCode(res.devCode ?? "");
      setNotice("If that email has an account, a reset code is on its way.");
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't request a code.");
    } finally {
      setSending(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    if (password.length < 6) {
      setError("Your new password must be at least 6 characters.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      navigate("/login", { replace: true, state: { reset: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={step === "request" ? "Reset your password" : "Choose a new password"}
      subtitle={
        step === "request"
          ? "We'll email you a code to prove it's you."
          : `Enter the code we sent to ${email} and pick a new password.`
      }
    >
      {step === "request" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
          className="space-y-3 sm:space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="cp-input mt-1"
            />
          </div>

          {notice && (
            <p className="flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-300">
              <MailCheck className="h-4 w-4" /> {notice}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 py-3 font-semibold text-white transition disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Reset code</label>
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

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">New password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="cp-input mt-1"
            />
          </div>

          {devCode && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Demo mode: your code is <span className="font-mono">{devCode}</span>
            </p>
          )}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 py-3 font-semibold text-white transition disabled:opacity-60"
          >
            {busy ? "Resetting…" : <span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> Reset password</span>}
          </button>

          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-primary-600 disabled:opacity-60 dark:text-slate-400"
          >
            <RefreshCw className={`h-4 w-4 ${sending ? "animate-spin" : ""}`} /> Resend code
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
