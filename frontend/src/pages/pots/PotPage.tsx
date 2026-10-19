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
    brand: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200",
    green: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200",
    amber: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200",
    rose: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200",
  } as const;
  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-2.5 shadow-[0_8px_24px_-18px_rgba(76,29,149,.25)] sm:rounded-[1.35rem] sm:p-4 dark:border-violet-200/10 dark:bg-[#171626]">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${tones[tone]}`}>
          {icon}
        </span>
        <span className="text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">{label}</span>
      </div>
      <p className="mt-1 truncate font-sora text-sm font-bold text-slate-900 sm:mt-2 sm:text-xl dark:text-white">
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
    setParams(next);
  };

  return (
    <>
      <section className="mb-3 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-700 via-violet-700 to-purple-800 px-4 py-3.5 text-white shadow-md shadow-violet-950/10 sm:mb-4 sm:rounded-[1.5rem] sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-violet-100/75 sm:text-[10px]">Pot balance</p><h1 className="mt-0.5 truncate font-sora text-xl font-extrabold leading-tight sm:text-2xl">{formatNaira(summary?.balanceKobo ?? 0)}</h1><p className="mt-1 truncate text-xs text-violet-100/80">{activeGroup?.name ?? "Your group pot"}</p></div>
          <div className="flex shrink-0 flex-col items-end gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-bold text-violet-50 sm:text-[10px]">Shared ledger</span><span className="hidden rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-right sm:block"><span className="block text-[8px] font-bold uppercase tracking-wider text-violet-100/70">Join code</span><span className="font-mono text-xs font-bold tracking-[.16em]">{activeGroup?.joinCode}</span></span></div>
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
      <div className="mb-4 mt-3 -mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-5 sm:mt-4">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => select(t.key)}
              className={[
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm",
                active
                  ? "text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="pot-tab-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-700 to-purple-600 shadow-sm shadow-violet-900/15"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <t.icon className="relative z-10 h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 text-white shadow-xl shadow-violet-900/25 transition hover:-translate-y-0.5 hover:shadow-2xl sm:h-14 sm:w-14 lg:bottom-8 lg:right-8"
        >
          <MessageSquare className="h-6 w-6" />
        </Link>
      )}
    </>
  );
}
