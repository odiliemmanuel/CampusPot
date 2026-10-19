import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import { login, setSession } from "../../lib/api";
import { homeRoute } from "../../lib/device";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after login — set by ProtectedRoute (e.g. a scanned join link).
  const from = (location.state as { from?: string } | null)?.from ?? homeRoute();
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
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
          <div className="mt-1 relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm sm:text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
          <div className="mt-1 relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className="w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm sm:text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
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

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-br from-primary-600 to-primary-800 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-600/30 transition disabled:opacity-60 sm:py-3.5"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <button
        onClick={useDemo}
        className="mt-4 w-full text-center text-xs font-medium text-slate-400 hover:text-primary-600 transition"
      >
        Use demo account (ada@potkeeper.ng)
      </button>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Don't have an account?{" "}
        <Link to="/signup" state={{ from }} className="font-semibold text-primary-600 hover:text-primary-700">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
