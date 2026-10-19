import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, HandCoins, LayoutDashboard, MessageSquare, QrCode, Send,
  Settings as SettingsIcon, Sparkles, TrendingUp, Users, Wallet,
} from "lucide-react";

import PotDashboard from "./PotDashboard";
import PotSettings from "./PotSettings";
import { ContributionsInner } from "../contributions/Contributions";
import { ExpensesInner } from "../expenses/Expenses";
import { MembersInner, InviteInner } from "../members/Members";
import { AssistantInner } from "../assistant/Assistant";
import { useGroup } from "../../providers/GroupProvider";
import { getSummary, type GroupSummary } from "../../lib/api";
import { formatNaira } from "../../lib/format";

// Everything that belongs to one pot lives on this page. The money cards stay
// put at the top; clicking a tab swaps only the section underneath them.
const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "contributions", label: "Contributions", icon: HandCoins },
  { key: "payouts", label: "Payouts", icon: Send },
  { key: "members", label: "Members", icon: Users },
  { key: "invite", label: "Invite", icon: QrCode },
  { key: "assistant", label: "AI Treasurer", icon: Sparkles },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// A compact money tile that reads well down to a 320px phone.
function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "brand" | "green" | "amber" | "rose";
}) {
  const tones = {
    brand: "bg-teal-50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200",
  } as const;
  return (
    <div className="rounded-[1.35rem] border border-slate-200/70 bg-white p-3 shadow-[0_8px_24px_-18px_rgba(15,45,69,.4)] sm:p-4 dark:border-white/10 dark:bg-[#111f30]">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${tones[tone]}`}>
          {icon}
        </span>
        <span className="text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">{label}</span>
      </div>
      <p className="mt-1.5 truncate font-sora text-base font-bold text-slate-900 sm:mt-2 sm:text-xl dark:text-white">
        {value}
      </p>
    </div>
  );
}

export default function PotPage() {
  const { id } = useParams<{ id: string }>();
  const { activeGroup } = useGroup();
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const chatActive = activeGroup?.id === id;

  const requested = params.get("tab");
  const tab: TabKey = (TABS.find((t) => t.key === requested)?.key ?? "dashboard") as TabKey;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getSummary(id)
      .then((s) => alive && setSummary(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const select = (key: TabKey) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <section className="relative isolate mb-4 overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-[#10283b] via-[#145366] to-[#087f73] p-5 text-white shadow-xl shadow-teal-950/10 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-56 w-56 rounded-full border-[30px] border-white/5" />
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-teal-100/70">Your group pot</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="break-words font-sora text-2xl font-extrabold leading-tight sm:text-3xl">{activeGroup?.name ?? "Pot"}</h1><p className="mt-2 text-xs text-teal-50/70">A shared space for money, plans, and trust.</p></div>
          <span className="hidden shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-center sm:block"><span className="block text-[9px] font-bold uppercase tracking-wider text-teal-100/60">Join code</span><span className="font-mono text-sm font-bold tracking-[.2em]">{activeGroup?.joinCode}</span></span>
        </div>
        <div className="mt-5 flex items-end justify-between border-t border-white/15 pt-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-100/65">Collected so far</p><p className="mt-1 font-sora text-2xl font-extrabold tracking-tight sm:text-3xl">{formatNaira(summary?.collectedKobo ?? 0)}</p></div>
          <span className="flex items-center gap-1.5 rounded-full bg-lime-300/15 px-3 py-1.5 text-[10px] font-bold text-lime-100"><span className="h-1.5 w-1.5 rounded-full bg-lime-300" /> Shared ledger</span>
        </div>
      </section>

      {/* Money cards — always visible while sections swap underneath. "Expected"
          is what the pot should hold (members × per-person), not a fixed sum. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Wallet className="h-4 w-4" />} label="Expected" value={formatNaira(summary?.expectedKobo ?? 0)} tone="brand" />
        <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Collected" value={formatNaira(summary?.collectedKobo ?? 0)} tone="green" />
        <StatTile icon={<Users className="h-4 w-4" />} label="Outstanding" value={formatNaira(summary?.outstandingKobo ?? 0)} tone="amber" />
        <StatTile icon={<ArrowUpRight className="h-4 w-4" />} label="Spent" value={formatNaira(summary?.spentKobo ?? 0)} tone="rose" />
      </div>

      <p className="mb-3 mt-6 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Pot overview</p>

      {/* Inline tab bar — only the section below changes. Chat opens as its
          own full-screen page from the header button. */}
      <div className="mb-5 mt-4 -mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => select(t.key)}
              className={[
                "relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors sm:px-3.5 sm:text-sm",
                active
                  ? "text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="pot-tab-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-500 shadow-sm shadow-teal-900/15"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <t.icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {tab === "dashboard" && <PotDashboard />}
        {tab === "contributions" && <ContributionsInner />}
        {tab === "payouts" && <ExpensesInner />}
        {tab === "members" && <MembersInner />}
        {tab === "invite" && <InviteInner />}
        {tab === "assistant" && <AssistantInner />}
        {tab === "settings" && <PotSettings />}
      </motion.div>

      {/* Floating button that opens the full-screen pot chat. */}
      {chatActive && (
        <Link
          to={`/pots/${id}/chat`}
          aria-label="Open pot chat"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-teal-500 to-lime-300 text-[#10283b] shadow-xl shadow-teal-900/25 transition hover:-translate-y-0.5 hover:shadow-2xl lg:bottom-8 lg:right-8"
        >
          <MessageSquare className="h-6 w-6" />
        </Link>
      )}
    </>
  );
}
