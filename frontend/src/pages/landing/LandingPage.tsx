import { useEffect } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  CircleHelp, Eye, HandCoins, LockKeyhole, MessageCircle, PieChart,
  ReceiptText, ShieldCheck, Sparkles, Users, Wallet,
} from "lucide-react";

const features = [
  {
    icon: Wallet,
    title: "One pot for the whole group",
    text: "Collect membership dues, plan an event, or save toward a shared goal. Keep your group’s money activity together and easy to follow.",
  },
  {
    icon: Eye,
    title: "Everyone sees the same record",
    text: "Members can check contributions, outstanding dues, payout requests, and decisions without searching through old messages.",
  },
  {
    icon: ShieldCheck,
    title: "Clear steps before payouts",
    text: "Set approval rules for your pot and keep requests, decisions, and payout status visible to the group.",
  },
  {
    icon: Sparkles,
    title: "A treasurer that can answer back",
    text: "Ask about who has paid, upcoming deadlines, spending patterns, and the pot’s recent activity in plain language.",
  },
];

const steps = [
  { number: "01", title: "Create a pot", text: "Choose a one-time goal or a recurring contribution plan that fits your group." },
  { number: "02", title: "Bring everyone in", text: "Invite members with a join link or code, then agree on the plan together." },
  { number: "03", title: "Keep the plan moving", text: "Track contributions, discuss requests, and see what needs attention before a deadline." },
];

const questions = [
  { q: "Who is PotKeeper for?", a: "Any group that manages money together: organizations, associations, clubs, teams, communities, event planners, and more." },
  { q: "Can members see what is happening?", a: "Pot activity is organized so members can follow contributions, expenses or payout requests, and the decisions attached to them." },
  { q: "What does the AI Treasurer do?", a: "It answers questions using the selected pot’s available records and can help draft reminders. It does not make payout decisions for your group." },
  { q: "Does PotKeeper move real money?", a: "The current demo uses sandbox and synthetic data. Don’t use it to make real payments." },
];

function isInstalledPwa() {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function Brand() {
  return (
    <Link to="/" className="inline-flex shrink-0 items-center gap-2 sm:gap-2.5" aria-label="PotKeeper home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-700 text-white shadow-lg shadow-violet-900/15 sm:h-10 sm:w-10 sm:rounded-2xl"><HandCoins className="h-4 w-4 sm:h-5 sm:w-5" /></span>
      <span className="font-sora text-lg font-bold tracking-tight text-slate-950 sm:text-xl">PotKeeper</span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[570px]">
      <div className="absolute -right-5 top-8 h-40 w-40 rounded-full bg-violet-200/70 blur-3xl" />
      <div className="absolute -bottom-6 -left-7 h-44 w-44 rounded-full bg-fuchsia-100 blur-3xl" />
      <div className="relative rounded-[2rem] border border-slate-200/80 bg-white p-4 shadow-[0_35px_90px_-40px_rgba(61,36,110,.35)] sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Users className="h-5 w-5" /></span>
            <div><p className="text-[11px] font-medium text-slate-400">YOUR POT</p><p className="truncate text-sm font-bold text-slate-900">Community event fund</p></div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />On track</span>
        </div>

        <div className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#f8f7fb] p-3.5 sm:p-4"><p className="text-[11px] text-slate-500">Collected</p><p className="mt-1 font-sora text-lg font-bold text-slate-950 sm:text-xl">₦248,000</p><p className="mt-1 text-[10px] text-emerald-700">18 contributions</p></div>
          <div className="rounded-2xl bg-[#f8f7fb] p-3.5 sm:p-4"><p className="text-[11px] text-slate-500">Goal</p><p className="mt-1 font-sora text-lg font-bold text-slate-950 sm:text-xl">₦320,000</p><p className="mt-1 text-[10px] text-slate-500">Due in 12 days</p></div>
          <div className="col-span-2 rounded-2xl border border-violet-100 bg-violet-50/70 p-3.5 sm:col-span-1 sm:p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-violet-800">Progress</p><p className="text-xs font-bold text-violet-800">77%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full w-[77%] rounded-full bg-violet-600" /></div><p className="mt-2 text-[10px] text-violet-700">₦72,000 to reach the goal</p></div>
        </div>

        <div className="rounded-2xl border border-slate-100 p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><ReceiptText className="h-4 w-4" /></span><p className="text-xs font-bold text-slate-800">Recent activity</p></div><span className="text-[10px] font-semibold text-violet-700">View all</span></div>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-3.5 w-3.5" /></span><p className="min-w-0 flex-1 truncate text-[11px] text-slate-600"><b className="text-slate-800">Amara</b> contributed</p><span className="text-[11px] font-semibold text-slate-800">+₦8,000</span></div>
            <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-amber-50 text-amber-700"><LockKeyhole className="h-3.5 w-3.5" /></span><p className="min-w-0 flex-1 truncate text-[11px] text-slate-600"><b className="text-slate-800">Bus booking</b> awaits approval</p><span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">In review</span></div>
          </div>
        </div>

        <div className="absolute -left-4 top-[48%] hidden max-w-[230px] items-start gap-2.5 rounded-2xl border border-violet-100 bg-white p-3.5 shadow-xl shadow-violet-950/10 sm:flex lg:-left-16">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-700 text-white"><Sparkles className="h-4 w-4" /></span>
          <div><p className="text-[10px] font-bold text-violet-800">AI TREASURER</p><p className="mt-1 text-[11px] leading-relaxed text-slate-600">“Two contributions are due this Friday.”</p></div>
        </div>
      </div>
      <p className="relative mt-4 text-center text-[10px] text-slate-400">Illustrative product preview · demo data</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isInstalledPwa()) navigate("/login", { replace: true });
  }, [navigate]);
  if (isInstalledPwa()) return <Navigate to="/login" replace />;

  return (
    <main className="overflow-hidden bg-white text-slate-900">
      <header className="relative z-10 border-b border-slate-100/80 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-8 sm:py-4 lg:px-12" aria-label="Main navigation">
          <Brand />
          <div className="flex shrink-0 items-center gap-1 sm:gap-5">
            <a href="#how-it-works" className="hidden text-sm font-medium text-slate-600 transition hover:text-violet-700 sm:inline">How it works</a>
            <a href="#features" className="hidden text-sm font-medium text-slate-600 transition hover:text-violet-700 md:inline">Why PotKeeper</a>
            <Link to="/login" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:rounded-xl sm:px-4 sm:text-sm">Log in</Link>
            <Link to="/signup" className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 sm:gap-2 sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-sm"><span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Create a pot</span><ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate">
        <div className="pointer-events-none absolute -right-48 -top-32 -z-10 h-[520px] w-[520px] rounded-full bg-violet-50 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[.95fr_1.05fr] lg:gap-12 lg:px-12 lg:pb-28 lg:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50/70 px-3.5 py-2 text-xs font-semibold text-violet-800"><Sparkles className="h-3.5 w-3.5" /> Shared money, made clearer</span>
            <h1 className="mt-6 max-w-xl font-sora text-[2.7rem] font-bold leading-[1.08] tracking-[-.045em] text-slate-950 sm:text-6xl lg:text-[4.15rem]">Your group’s money, <span className="text-violet-700">out in the open.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">PotKeeper helps organizations and groups collect together, keep a shared record, and make group spending easier to follow—from the first contribution to the final payout.</p>
            <div className="mt-8 flex flex-col gap-3 min-[430px]:flex-row">
              <Link to="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white shadow-lg shadow-violet-900/15 transition hover:-translate-y-0.5 hover:bg-violet-800">Start a group pot <ArrowRight className="h-4 w-4" /></Link>
              <a href="#how-it-works" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50/50">See how it works <ArrowDown className="h-4 w-4" /></a>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Built for groups and organizations</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sandbox demo</span></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .1 }}><ProductPreview /></motion.div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-[#fbfafc]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:grid-cols-3 sm:px-8 sm:py-10 lg:px-12">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm ring-1 ring-slate-100"><Users className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-900">Made for groups</p><p className="mt-1 text-xs leading-5 text-slate-500">Membership dues, team plans, events, and shared goals.</p></div></div>
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm ring-1 ring-slate-100"><PieChart className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-900">Progress at a glance</p><p className="mt-1 text-xs leading-5 text-slate-500">See what came in, what’s due, and what’s next.</p></div></div>
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm ring-1 ring-slate-100"><MessageCircle className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-900">Less chasing in chat</p><p className="mt-1 text-xs leading-5 text-slate-500">Keep pot questions and activity in one place.</p></div></div>
        </div>
      </section>

      <section id="features" className="scroll-mt-10 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700">A better way to manage shared money</p><h2 className="mt-4 font-sora text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">Less uncertainty for the whole group.</h2><p className="mt-4 text-base leading-7 text-slate-600">When money is shared, everyone deserves a clear view of the plan and the progress.</p></div>
          <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {features.map((feature, index) => (
              <motion.article key={feature.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .35, delay: index * .05 }} className="border-t border-slate-200 pt-5">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700"><feature.icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-bold text-slate-900">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-10 bg-[#f8f7fb] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Simple from the start</p><h2 className="mt-4 font-sora text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">From group idea to shared progress.</h2><p className="mt-4 text-base leading-7 text-slate-600">Set up the pot around the way your group already plans.</p></div>
          <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map((step, i) => <article key={step.number} className="relative border-t border-violet-200 pt-5">
              <span className="font-sora text-sm font-bold tracking-widest text-violet-700">{step.number}</span><h3 className="mt-5 text-lg font-bold text-slate-950">{step.title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">{step.text}</p>
              {i < steps.length - 1 && <ArrowRight className="absolute right-0 top-5 hidden h-4 w-4 text-violet-300 md:block" />}
            </article>)}
          </div>
          <div className="mt-14 flex flex-wrap justify-center gap-2 text-xs font-medium text-slate-600"><span className="rounded-full border border-slate-200 bg-white px-3 py-2">One-time goals</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Recurring pots</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Group approvals</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Pot chat</span></div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:px-12">
          <div className="order-2 lg:order-1">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-45px_rgba(61,36,110,.3)] sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Sparkles className="h-5 w-5" /></span><div><p className="text-sm font-bold">AI Treasurer</p><p className="text-[11px] text-slate-500">For this pot</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Ready to help</span></div>
              <p className="mt-5 max-w-md text-sm leading-6 text-slate-700">“How much is left to reach our trip goal?”</p>
              <div className="mt-3 rounded-2xl rounded-tl-sm bg-violet-50 p-4 text-sm leading-6 text-slate-700"><p className="font-semibold text-slate-900">₦72,000 remaining</p><p className="mt-1 text-xs text-slate-600">Your pot has collected ₦248,000 toward the ₦320,000 goal. The deadline is in 12 days.</p><p className="mt-3 text-[10px] font-medium text-violet-700">Based on the current pot record</p></div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-400"><span className="flex-1">Ask about your pot…</span><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-700 text-white"><ArrowRight className="h-3.5 w-3.5" /></span></div>
            </div>
          </div>
          <div className="order-1 lg:order-2"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Clarity when you need it</p><h2 className="mt-4 font-sora text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">Ask the pot. Get a useful answer.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">The AI Treasurer can turn the pot’s activity into a quick answer—so members spend less time calculating totals and more time moving the plan forward.</p><ul className="mt-7 space-y-3 text-sm text-slate-700">{["Check who has contributed and what remains due", "Ask about deadlines, balances, or pending payouts", "Spot spending patterns and likely recurring costs", "Get a reminder draft to review before sharing"].map((item) => <li key={item} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul><p className="mt-5 text-xs leading-5 text-slate-500">Answers depend on the information recorded in the pot. AI suggestions are there to support your group—not approve payments.</p></div>
        </div>
      </section>

      <section className="border-y border-violet-100 bg-violet-50/60 py-14 sm:py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <div className="max-w-2xl"><div className="flex items-center gap-2 text-violet-800"><ShieldCheck className="h-5 w-5" /><p className="text-xs font-bold uppercase tracking-[.16em]">Designed for shared accountability</p></div><h2 className="mt-3 font-sora text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Shared plans should come with shared visibility.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Make contributions and payout decisions easier to follow. Keep the group informed with a visible activity record and clear approval steps.</p></div>
          <Link to="/signup" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-violet-700 px-5 text-sm font-bold text-white transition hover:bg-violet-800 md:self-center">See PotKeeper in action <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700"><CircleHelp className="h-5 w-5" /></span><h2 className="mt-4 font-sora text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">A few useful answers.</h2></div>
          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{questions.map((item) => <details key={item.q} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-900 marker:hidden">{item.q}<ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><p className="mt-3 max-w-2xl pr-8 text-sm leading-6 text-slate-600">{item.a}</p></details>)}</div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-12">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#24134a] px-6 py-12 text-center sm:px-12 sm:py-16">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-violet-100"><HandCoins className="h-6 w-6" /></span>
          <h2 className="mx-auto mt-5 max-w-2xl font-sora text-3xl font-bold tracking-tight text-white sm:text-4xl">Make your next group plan easier to manage.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-violet-100/75">Start a pot, bring your group together, and keep the money side clear.</p>
          <Link to="/signup" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-violet-800 transition hover:bg-violet-50">Create your first pot <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <Brand />
          <p className="text-xs leading-5 text-slate-500">© 2026 PotKeeper · Groups and organizations, sharing money with clarity.</p>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600"><Link to="/login" className="hover:text-violet-700">Log in</Link><Link to="/signup" className="hover:text-violet-700">Sign up</Link></div>
        </div>
        <p className="mx-auto max-w-7xl px-5 pb-5 text-[10px] leading-5 text-slate-400 sm:px-8 lg:px-12">PotKeeper is currently a sandbox demo using synthetic data. No real money is held or transferred through this demo.</p>
      </footer>
    </main>
  );
}
