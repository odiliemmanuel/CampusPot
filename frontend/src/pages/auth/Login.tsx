import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import { login, setSession } from "../../lib/api";
import { homeRoute } from "../../lib/device";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after login — set by ProtectedRoute (e.g. a scanned join link).
  const from = (location.state as { from?: string } | null)?.from ?? homeRoute();
  // A fresh password reset lands here with a confirmation notice.
  const reset = (location.state as { reset?: boolean } | null)?.reset === true;
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      setSession(res.token, res.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const useDemo = () => {
    setForm({ email: "ada@potkeeper.ng", password: "password123" });
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your group's pot.">
      <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">Email</label>
          <div className="relative mt-0.5 sm:mt-1">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:py-3 sm:text-base"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">Password</label>
          <div className="relative mt-0.5 sm:mt-1">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-sm text-slate-900 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:py-3 sm:text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {reset && (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Password updated — log in with your new one.
          </p>
        )}
        {error && <p className="text-sm text-violet-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-primary-600/30 disabled:opacity-60 sm:py-3.5 sm:text-base"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        <p className="text-right text-sm">
          <Link to="/forgot-password" className="font-semibold text-primary-600 hover:text-primary-700">
            Forgot password?
          </Link>
        </p>
      </form>

      <button
        onClick={useDemo}
        className="mt-3 w-full text-center text-[11px] font-medium text-slate-400 transition hover:text-primary-600 sm:mt-4 sm:text-xs"
      >
        Use demo account (ada@potkeeper.ng)
      </button>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:mt-6 sm:text-sm">
        Don't have an account?{" "}
        <Link to="/signup" state={{ from }} className="font-semibold text-primary-600 hover:text-primary-700">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
