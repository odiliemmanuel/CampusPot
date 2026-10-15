import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HandCoins, Check } from "lucide-react";
import { useState } from "react";
import { useGroup } from "../providers/GroupProvider";

// Switch between every pot the signed-in user belongs to. Shown in the sidebar
// on both desktop and mobile so the active pot is always obvious.
export default function GroupSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { groups, activeGroup, setActiveGroup } = useGroup();
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-primary-600/80 flex items-center justify-center shrink-0">
          <HandCoins className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            {activeGroup?.name ?? "Select a pot"}
          </p>
          <p className="text-xs text-slate-400 truncate">{groups.length} pot{groups.length > 1 ? "s" : ""}</p>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 mt-2 z-30 bg-ink-light border border-white/10 rounded-xl p-1.5 shadow-2xl"
          >
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setActiveGroup(g);
                  setOpen(false);
                  onNavigate?.();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 hover:text-white transition text-left"
              >
                <span className="truncate flex-1">{g.name}</span>
                {activeGroup?.id === g.id && <Check className="w-3.5 h-3.5 text-primary-400 shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
