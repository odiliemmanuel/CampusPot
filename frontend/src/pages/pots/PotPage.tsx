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
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-panel-dark">
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
      <h1 className="mb-3 font-sora text-lg font-bold text-slate-900 sm:text-2xl dark:text-white">
        {activeGroup?.name ?? "Pot"}
      </h1>

      {/* Money cards — always visible while sections swap underneath */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Wallet className="h-4 w-4" />} label="Balance" value={formatNaira(summary?.balanceKobo ?? 0)} tone="brand" />
        <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Collected" value={formatNaira(summary?.collectedKobo ?? 0)} tone="green" />
        <StatTile icon={<ArrowUpRight className="h-4 w-4" />} label="Spent" value={formatNaira(summary?.spentKobo ?? 0)} tone="rose" />
        <StatTile icon={<Users className="h-4 w-4" />} label="Outstanding" value={formatNaira(summary?.outstandingKobo ?? 0)} tone="amber" />
      </div>

      <div className="mb-4 mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage contributions, payouts and members for this pot.
        </p>
        {chatActive && (
          <Link
            to={`/pots/${id}/chat`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </Link>
        )}
      </div>

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
                  className="absolute inset-0 rounded-xl bg-brand-600 shadow-sm"
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
    </>
  );
}
