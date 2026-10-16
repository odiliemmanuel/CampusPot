import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, HandCoins, LayoutDashboard, PiggyBank, Receipt, ScrollText,
  Send, Settings, Sparkles, Users, X,
} from "lucide-react";
import { useGroup } from "../providers/GroupProvider";

// Top-level navigation is just the list of pots. Everything that belongs to a
// single pot (its dashboard, contributions, levies, payouts, members, ledger
// and AI treasurer) only appears once a pot is open, nested under its name.
const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
    isActive
      ? "bg-brand-500 text-white shadow-lg shadow-brand-900/30"
      : "text-brand-100/90 hover:bg-white/10 hover:text-white",
  ].join(" ");

function PromoCard({ to, onNavigate }: { to: string; onNavigate?: () => void }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 text-white backdrop-blur-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
        <Sparkles className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold">Late on dues?</p>
      <p className="mt-1 text-[11px] leading-relaxed text-brand-100">
        Let the AI Treasurer draft a friendly reminder in seconds.
      </p>
      <Link
        to={to}
        onClick={onNavigate}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Remind now <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { activeGroup } = useGroup();
  const { pathname } = useLocation();

  // A pot is "open" when the URL is /pots/<id> (not the list or the new-pot page).
  const potOpen =
    activeGroup !== null &&
    /^\/pots\/[^/]+/.test(pathname) &&
    !pathname.startsWith("/pots/new");

  const potNav = activeGroup
    ? [
        { to: `/pots/${activeGroup.id}`, icon: LayoutDashboard, label: "Dashboard", end: true },
        { to: `/pots/${activeGroup.id}/contributions`, icon: HandCoins, label: "Contributions" },
        { to: `/pots/${activeGroup.id}/levies`, icon: Receipt, label: "Levies" },
        { to: `/pots/${activeGroup.id}/payouts`, icon: Send, label: "Payouts" },
        { to: `/pots/${activeGroup.id}/members`, icon: Users, label: "Members" },
        { to: `/pots/${activeGroup.id}/ledger`, icon: ScrollText, label: "Ledger" },
        { to: `/pots/${activeGroup.id}/assistant`, icon: Sparkles, label: "AI Treasurer" },
      ]
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Logo + tagline */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
          <HandCoins className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-sora text-lg font-bold leading-tight text-white">PotKeeper</p>
          <p className="truncate text-[11px] text-brand-200">One pot. Everyone can see it.</p>
        </div>
      </div>

      {/* Top level: the pots list */}
      <nav className="mt-6 flex flex-col gap-1" aria-label="Primary">
        <NavLink to="/pots" end onClick={onNavigate} className={navClass}>
          <PiggyBank className="h-4 w-4 shrink-0" />
          Pots
        </NavLink>
      </nav>

      {/* Everything under the pot that's currently open */}
      {potOpen && activeGroup && (
        <div className="mt-5">
          <p className="truncate px-3.5 text-[11px] font-semibold uppercase tracking-wide text-brand-200/80">
            {activeGroup.name}
          </p>
          <nav className="mt-2 flex flex-col gap-1" aria-label="Pot">
            {potNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={navClass}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-5 pt-6">
        {potOpen && activeGroup && (
          <PromoCard to={`/pots/${activeGroup.id}/assistant`} onNavigate={onNavigate} />
        )}
        <NavLink to="/settings" onClick={onNavigate} className={navClass}>
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </NavLink>
      </div>
    </div>
  );
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop: fixed, full-height royal-blue rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto bg-gradient-to-b from-brand-800 to-brand-700 p-5 lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile / tablet: slide-in drawer opened from the top bar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-gradient-to-b from-brand-800 to-brand-700 p-5 shadow-2xl lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-brand-200 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={onClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
