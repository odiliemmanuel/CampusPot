import { ReactNode } from "react";
import { motion } from "framer-motion";
import { HandCoins, ShieldCheck, Sparkles, Eye, Users, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const perks = [
  { icon: Eye, text: "Everyone sees the pot" },
  { icon: ShieldCheck, text: "2-of-3 approves every payout" },
  { icon: Sparkles, text: "AI answers \"who hasn't paid?\"" },
];

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] bg-canvas transition-colors duration-300 dark:bg-[#0b0c1a]">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-600 to-primary-900 p-12 flex-col justify-between">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-2" aria-label="PotKeeper home">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <HandCoins className="w-5 h-5 text-white" />
          </div>
          <span className="font-sora text-xl font-bold text-white">PotKeeper</span>
        </Link>

        <div className="relative">
          <h2 className="font-sora text-3xl font-bold text-white leading-tight mb-8">
            One pot. Everyone can see it. No one can run with it.
          </h2>

          {/* Live product mockup — the actual "who hasn't paid" moment, so
              sign-up reinforces what the product does. */}
          <motion.div
            initial={{ opacity: 0, y: 12, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400">200L Mass Comm · Excursion levy</span>
              <span className="text-xs font-semibold text-violet-600">₦13,000 left</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <p className="text-xs text-slate-500">AI Treasurer</p>
            </div>
            <p className="text-sm text-slate-700 mb-2">Who hasn't paid the excursion levy?</p>
            <div className="p-3 rounded-xl bg-primary-50 text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-900">3 members owing.</span> Chidi (₦5,000 unpaid),
              Fatima (₦3,000 partial), Emeka (₦5,000 unpaid).
            </div>
          </motion.div>

          <div className="flex flex-wrap gap-3 mt-8">
            {perks.map((p) => (
              <div key={p.text} className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-full pl-2 pr-3.5 py-1.5">
                <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <p.icon className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-medium text-primary-50">{p.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-primary-100 text-sm">© 2026 PotKeeper · B Moni x TINC26</p>
      </div>

      {/* Right form panel */}
      <div className="flex min-w-0 flex-1 items-center justify-center p-2.5 sm:p-8 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-4 shadow-lg shadow-slate-900/5 sm:max-w-md sm:rounded-3xl sm:border-white/60 sm:bg-white/80 sm:p-8 sm:shadow-xl sm:backdrop-blur-xl dark:border-slate-800 dark:bg-panel-dark/90 sm:dark:bg-panel-dark/80 lg:p-10"
        >
          <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6 sm:gap-3">
          <Link to="/" reloadDocument className="flex min-w-0 items-center gap-1.5 sm:gap-2" aria-label="PotKeeper home">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 sm:h-9 sm:w-9 sm:rounded-xl">
              <HandCoins className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            </div>
            <span className="truncate font-sora text-base font-bold text-slate-900 dark:text-white sm:text-lg">PotKeeper</span>
          </Link>
          <Link to="/" reloadDocument className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-200 dark:hover:bg-white/5 sm:px-3 sm:text-sm"><ArrowLeft className="h-3.5 w-3.5" /> Home</Link>
          </div>
          <h1 className="font-sora text-lg font-bold text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:mt-1.5 sm:text-sm">{subtitle}</p>
          <div className="mt-4 sm:mt-7">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
