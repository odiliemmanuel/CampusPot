import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HandCoins, ShieldCheck, Eye, Sparkles, ArrowRight, Users,
  Receipt, TrendingUp, CheckCircle2,
} from "lucide-react";

const problems = [
  { icon: Users, title: "Money in one person's account", text: "Contributions land in the treasurer's personal bank account — no separation, no visibility." },
  { icon: Receipt, title: "\"Who has paid?\" by scrolling chat", text: "Reconciling WhatsApp screenshots against bank alerts is manual, slow, and error-prone." },
  { icon: ShieldCheck, title: "Spending on trust alone", text: "One person decides how the pot is spent, with no record of who approved what." },
];

const steps = [
  { icon: HandCoins, title: "Members pay into one pot", text: "A dedicated Naira account for the group. Money is never mixed with anyone's personal account." },
  { icon: Sparkles, title: "Payments reconcile themselves", text: "Each member gets a unique reference. Incoming transfers are matched and the ledger updates." },
  { icon: ShieldCheck, title: "2-of-3 approves every payout", text: "Money can only leave when a quorum of co-signers approves. The requester can't sign off alone." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas dark:bg-[#0b0c1a] transition-colors duration-300">
      {/* Nav */}
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
            <HandCoins className="w-5 h-5 text-white" />
          </div>
          <span className="font-sora font-bold text-lg text-slate-900 dark:text-white">PotKeeper</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-600 px-4 py-2">
            Log in
          </Link>
          <Link to="/signup" className="text-sm font-semibold text-white bg-primary-600 hover:shadow-lg hover:shadow-primary-600/30 px-5 py-2.5 rounded-xl transition">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-10 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <Eye className="w-3.5 h-3.5" /> From Access to Agency
          </span>
          <h1 className="font-sora text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight">
            One pot. Everyone can see it. No one can run with it.
          </h1>
          <p className="mt-5 text-lg text-slate-500 dark:text-slate-400">
            PotKeeper gives Nigerian campus groups a shared wallet, an AI treasurer
            that answers "who hasn't paid?", and a 2-of-3 approval rule on every payout.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/signup" className="inline-flex items-center gap-2 bg-gradient-to-br from-primary-600 to-primary-800 text-white px-6 py-3.5 rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-600/30 transition">
              Start your pot <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-6 py-3.5 rounded-xl font-semibold hover:bg-white dark:hover:bg-slate-800 transition">
              I already have one
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 mt-8 text-sm text-slate-500 dark:text-slate-400">
            {["Sandbox & synthetic data", "No real money", "Built on B Moni"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-violet-500" /> {t}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Hero mock */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 2 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="rounded-3xl bg-white dark:bg-panel-dark shadow-2xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-400">200L Mass Comm Dues</p>
                <p className="font-sora text-2xl font-bold text-slate-900 dark:text-white mt-1">₦67,500.00</p>
              </div>
              <span className="text-xs font-semibold text-violet-600 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 rounded-full">
                +₦20,000 today
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl bg-violet-50 dark:bg-slate-800 p-3">
                <p className="text-[11px] text-slate-400">Collected</p>
                <p className="font-bold text-slate-900 dark:text-white text-sm">₦47,000</p>
              </div>
              <div className="rounded-2xl bg-violet-50 dark:bg-slate-800 p-3">
                <p className="text-[11px] text-slate-400">Outstanding</p>
                <p className="font-bold text-slate-900 dark:text-white text-sm">₦13,000</p>
              </div>
              <div className="rounded-2xl bg-violet-50 dark:bg-slate-800 p-3">
                <p className="text-[11px] text-slate-400">Paid</p>
                <p className="font-bold text-slate-900 dark:text-white text-sm">5/8</p>
              </div>
            </div>
            <div className="rounded-2xl bg-primary-50 dark:bg-primary-500/10 p-4 flex gap-2.5">
              <Sparkles className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white">AI Treasurer: </span>
                3 members still owing — Chidi (₦5,000), Fatima (₦3,000 partial), Emeka (₦5,000).
              </p>
            </div>
            <div className="mt-3 rounded-2xl border-2 border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10 p-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                ₦15,000 bus payout — needs 2 of 3 co-signers. <span className="font-semibold">1/2 done.</span>
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Problem */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-sora text-3xl font-bold text-slate-900 dark:text-white text-center mb-2">
          Treasurer shouldn't mean banker, auditor, and debt collector
        </h2>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
          Every semester, a student you trust ends up managing other people's money
          with no tools and no record.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-3xl cp-card p-6"
            >
              <div className="w-11 h-11 rounded-2xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5 text-violet-600" />
              </div>
              <h3 className="font-sora font-bold text-slate-900 dark:text-white mb-1.5">{p.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{p.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-sora text-3xl font-bold text-slate-900 dark:text-white text-center mb-12">
          How PotKeeper works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-3xl cp-card p-6 relative"
            >
              <span className="absolute top-6 right-6 font-sora text-3xl font-extrabold text-primary-100 dark:text-primary-500/20">
                {i + 1}
              </span>
              <div className="w-11 h-11 rounded-2xl bg-primary-100 dark:bg-primary-500/15 flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5 text-primary-600" />
              </div>
              <h3 className="font-sora font-bold text-slate-900 dark:text-white mb-1.5">{s.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="rounded-[32px] bg-gradient-to-br from-primary-600 to-primary-900 p-10 sm:p-14 text-center relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <TrendingUp className="w-10 h-10 text-primary-200 mx-auto mb-4" />
            <h2 className="font-sora text-3xl font-bold text-white mb-3">Put your group's money where everyone can see it.</h2>
            <p className="text-primary-100 max-w-xl mx-auto mb-8">
              Set up a pot in under a minute, invite your members, and let the AI treasurer
              handle the awkward asking.
            </p>
            <Link to="/signup" className="inline-flex items-center gap-2 bg-white text-primary-700 px-6 py-3.5 rounded-xl font-bold hover:shadow-2xl transition">
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <p className="text-center text-sm text-slate-400 mt-8">
          © 2026 PotKeeper · B Moni x TINC26 · Sandbox & synthetic data only
        </p>
      </section>
    </div>
  );
}
