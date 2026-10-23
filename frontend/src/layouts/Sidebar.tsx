import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, HandCoins, PiggyBank, Settings, Sparkles, Wallet, X,
} from "lucide-react";
import { useGroup } from "../providers/GroupProvider";
import { useI18n } from "../lib/i18n";

// Top-level navigation is the pots list, the personal Balance & History screen,
// and app settings. A pot's sections (dashboard, contributions, levies, payouts,
// members, AI treasurer, settings) are inline tabs on the pot page, so there is
// nothing extra to list here.
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
  const { t } = useI18n();

  // A pot is "open" when the URL is /pots/<id> (not the list or the new-pot page).
  const potOpen =
    activeGroup !== null &&
    /^\/pots\/[^/]+/.test(pathname) &&
    !pathname.startsWith("/pots/new");

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

      {/* Top level: the pots list, personal history, and settings */}
      <nav className="mt-6 flex flex-col gap-1" aria-label="Primary">
        <NavLink to="/pots" end onClick={onNavigate} className={navClass}>
          <PiggyBank className="h-4 w-4 shrink-0" />
          {t("nav.pots")}
        </NavLink>
        <NavLink to="/account" onClick={onNavigate} className={navClass}>
          <Wallet className="h-4 w-4 shrink-0" />
          {t("nav.balance")}
        </NavLink>
      </nav>

      {/* When a pot is open, name it so the section tabs on the page make sense. */}
      {potOpen && activeGroup && (
        <div className="mt-6 rounded-2xl bg-white/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-200">
            Open pot
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{activeGroup.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-100">
            Its sections are tabs on the pot page.
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-5 pt-6">
        {potOpen && activeGroup && (
          <PromoCard to={`/pots/${activeGroup.id}?tab=assistant`} onNavigate={onNavigate} />
        )}
        <NavLink to="/settings" onClick={onNavigate} className={navClass}>
          <Settings className="h-4 w-4 shrink-0" />
          {t("nav.settings")}
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
