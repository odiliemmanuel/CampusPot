import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, CalendarDays, Check, CircleDollarSign, Eye, HandCoins,
  MessageCircle, ShieldCheck, Users,
} from "lucide-react";

const features = [
  { icon: HandCoins, title: "Contributions, clearly tracked", text: "See your own paid amount and what remains due. The treasurer has a shared record of every contribution." },
  { icon: ShieldCheck, title: "Payouts stay accountable", text: "Payout requests follow the pot’s approval rules. Members can see the request and its status." },
  { icon: CalendarDays, title: "A schedule that fits the group", text: "Set a one-time goal or recurring daily, weekly, monthly, or quarterly contributions." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbf9ff] text-slate-900 dark:bg-[#100d1b] dark:text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="PotKeeper home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-700 text-white shadow-lg shadow-violet-900/20"><HandCoins className="h-5 w-5" /></span>
          <span className="font-sora text-lg font-extrabold tracking-tight">PotKeeper</span>
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-3" aria-label="Account">
          <Link to="/login" className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-800 dark:text-violet-100 dark:hover:bg-white/5 sm:px-4 sm:text-sm">Log in</Link>
          <Link to="/signup" className="rounded-xl bg-violet-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-900/20 transition hover:bg-violet-800 sm:px-5 sm:text-sm">Create a pot</Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pt-16">
        <div className="pointer-events-none absolute -left-44 top-8 h-80 w-80 rounded-full bg-violet-300/35 blur-3xl dark:bg-violet-700/20" />
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }} className="relative">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-violet-800 dark:border-violet-300/15 dark:bg-white/5 dark:text-violet-200"><Eye className="h-3.5 w-3.5" /> Shared money. Clear records.</span>
          <h1 className="max-w-2xl font-sora text-[2.55rem] font-extrabold leading-[1.06] tracking-[-.04em] sm:text-6xl">Group money works better <span className="text-violet-700 dark:text-violet-300">in the open.</span></h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:mt-5 sm:text-lg sm:leading-8">PotKeeper gives campus groups one place to collect contributions, follow a schedule, and review payout requests together.</p>
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row">
            <Link to="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/20 transition hover:-translate-y-0.5 hover:bg-violet-800">Start a group pot <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-violet-200 bg-white/70 px-5 py-3 text-sm font-bold text-violet-900 transition hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:text-violet-100 dark:hover:bg-white/10">I already have a pot</Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><Check className="h-3.5 w-3.5 text-violet-600" /> Built for student groups, societies and shared goals</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18, rotate: 1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .5, delay: .08 }} className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -right-8 -top-9 h-32 w-32 rounded-full bg-fuchsia-300/35 blur-2xl dark:bg-violet-500/20" />
          <section className="relative rounded-[1.7rem] border border-violet-100 bg-white p-4 shadow-[0_30px_80px_-35px_rgba(76,29,149,.35)] dark:border-white/10 dark:bg-[#191526] sm:rounded-[2rem] sm:p-5" aria-label="Example contribution overview">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-violet-600 dark:text-violet-300">Pot overview</p><h2 className="mt-1 font-sora text-base font-bold sm:text-lg">Class trip fund</h2><p className="mt-0.5 text-[11px] text-slate-500">12 members · weekly contributions</p></div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">Recurring</span>
            </div>
            <div className="mt-4 rounded-2xl bg-gradient-to-br from-violet-700 to-purple-900 p-4 text-white sm:p-5">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-violet-100/75">Pot balance</span><span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-semibold">Shared ledger</span></div>
              <p className="mt-1 font-sora text-2xl font-extrabold tracking-tight sm:text-3xl">₦240,000</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full w-[68%] rounded-full bg-white" /></div>
              <div className="mt-1.5 flex justify-between text-[10px] text-violet-100/80"><span>8 of 12 paid this cycle</span><span>68%</span></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-violet-100 bg-[#fcfaff] p-3 dark:border-white/5 dark:bg-white/[.03]"><p className="text-[10px] text-slate-500">Your contribution</p><p className="mt-1 text-sm font-bold">₦5,000 paid</p></div>
              <div className="rounded-xl border border-violet-100 bg-[#fcfaff] p-3 dark:border-white/5 dark:bg-white/[.03]"><p className="text-[10px] text-slate-500">Outstanding</p><p className="mt-1 text-sm font-bold text-violet-700 dark:text-violet-300">₦0</p></div>
            </div>
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-violet-50 px-3 py-2.5 dark:bg-violet-500/10"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-violet-700 dark:bg-white/10 dark:text-violet-200"><ShieldCheck className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-bold">Payout needs approval</p><p className="truncate text-[10px] text-slate-500">1 of 2 co-signers have approved</p></div><span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-violet-500" /></div>
          </section>
          <div className="relative mx-auto mt-2 flex w-[88%] items-center justify-center gap-2 rounded-b-2xl border border-t-0 border-violet-100 bg-violet-50/80 px-3 py-2 text-[10px] font-medium text-violet-800 dark:border-white/10 dark:bg-white/5 dark:text-violet-200"><MessageCircle className="h-3.5 w-3.5" /> Keep group updates and decisions together</div>
        </motion.div>
      </section>

      <section className="border-y border-violet-100 bg-white/70 dark:border-white/5 dark:bg-white/[.02]">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-8 sm:grid-cols-3 sm:px-6 sm:py-10">
          {features.map((feature, index) => <motion.article key={feature.title} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .06 }} className="rounded-2xl border border-violet-100 bg-[#fcfaff] p-4 dark:border-white/5 dark:bg-white/[.03] sm:p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><feature.icon className="h-4 w-4" /></span><h3 className="mt-3 text-sm font-bold">{feature.title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{feature.text}</p></motion.article>)}
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-14 md:flex-row md:items-center md:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-700 dark:text-violet-300">A better way to manage group funds</p><h2 className="mt-1.5 max-w-2xl font-sora text-2xl font-extrabold tracking-tight sm:text-3xl">Set the rules together. Keep every member in the loop.</h2><p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">Start with a shared pot, invite your group, and choose a contribution plan. Payouts stay visible and follow the approval rules you set.</p></div>
        <Link to="/signup" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800">Create your pot <ArrowRight className="h-4 w-4" /></Link>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-col gap-1 border-t border-violet-100 px-4 py-5 text-[10px] text-slate-400 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><span>© 2026 PotKeeper · Shared funds for groups</span><span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Payments powered by B Moni</span><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Built for campus communities</span></footer>
    </main>
  );
}
