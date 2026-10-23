import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, User, Phone } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import { register, setSession } from "../../lib/api";

export default function SignUp() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await register(
        form.name,
        form.email,
        form.phone,
        form.password,
      );
      setSession(res.token, res.user);
      // Verify the email next: money moves only after the emailed code.
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Set up a pot for your group in a minute.">
      <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">Full name</label>
          <div className="relative mt-0.5 sm:mt-1">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ada Okafor"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:py-3 sm:text-base"
            />
          </div>
        </div>

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
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">
            Phone <span className="text-slate-400 font-normal">(your wallet account)</span>
          </label>
          <div className="relative mt-0.5 sm:mt-1">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              required
              minLength={7}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="080..."
              autoComplete="tel"
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
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 6 characters"
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

        {error && <p className="text-sm text-violet-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-primary-600/30 disabled:opacity-60 sm:py-3.5 sm:text-base"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-xs text-slate-400">
          Next step: confirm your email with the code we send you.
        </p>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:mt-6 sm:text-sm">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
