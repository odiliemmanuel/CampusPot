import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HandCoins, LayoutDashboard, Receipt, ScrollText, Send, Settings as SettingsIcon,
  Sparkles, Users,
} from "lucide-react";

import PotDashboard from "./PotDashboard";
import PotSettings from "./PotSettings";
import { ContributionsInner } from "../contributions/Contributions";
import { LeviesInner } from "../levies/Levies";
import { ExpensesInner } from "../expenses/Expenses";
import { MembersInner } from "../members/Members";
import { LedgerInner } from "../ledger/Ledger";
import { AssistantInner } from "../assistant/Assistant";

// Everything that belongs to one pot lives right here as inline tabs, so the
// URL stays on /pots/:id and switching sections never leaves the pot.
const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "contributions", label: "Contributions", icon: HandCoins },
  { key: "levies", label: "Levies", icon: Receipt },
  { key: "payouts", label: "Payouts", icon: Send },
  { key: "members", label: "Members", icon: Users },
  { key: "ledger", label: "Ledger", icon: ScrollText },
  { key: "assistant", label: "AI Treasurer", icon: Sparkles },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PotPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: TabKey = (TABS.find((t) => t.key === requested)?.key ?? "dashboard") as TabKey;

  const select = (key: TabKey) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <>
      {/* Inline tab bar — pot sections switch without leaving the pot */}
      <div className="mb-6 -mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => select(t.key)}
              className={[
                "relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
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
        {tab === "levies" && <LeviesInner />}
        {tab === "payouts" && <ExpensesInner />}
        {tab === "members" && <MembersInner />}
        {tab === "ledger" && <LedgerInner />}
        {tab === "assistant" && <AssistantInner />}
        {tab === "settings" && <PotSettings />}
      </motion.div>
    </>
  );
}
