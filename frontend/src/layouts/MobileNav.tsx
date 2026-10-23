import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Compass, LayoutGrid, Plus, Settings, Wallet } from "lucide-react";
import { useI18n } from "../lib/i18n";

// A wallet-style bottom bar shown only on phones/tablets. The centre "+" is the
// always-reachable create-pot action; the rest mirror the desktop sidebar.
function itemClass(active: boolean) {
  return [
    "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
    active ? "text-violet-700 dark:text-violet-200" : "text-slate-400",
  ].join(" ");
}

export default function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useI18n();

  const potsActive = pathname === "/pots" || pathname.startsWith("/pots/");
  const balanceActive = pathname.startsWith("/account");
  const settingsActive = pathname.startsWith("/settings");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 backdrop-blur lg:hidden dark:border-white/10 dark:bg-panel-dark/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-2 py-1.5">
        <NavLink to="/account" className={itemClass(balanceActive)}>
          <Wallet className="h-5 w-5" />
          Home
        </NavLink>

        <NavLink to="/pots" className={itemClass(potsActive)}>
          <LayoutGrid className="h-5 w-5" />
          {t("nav.pots")}
        </NavLink>

        <button
          type="button"
          onClick={() => navigate("/pots/new")}
          aria-label="Create a pot"
          className="mx-auto -mt-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 text-white shadow-lg shadow-violet-900/25 transition active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>

        <NavLink to="/pots#discover-public-pots" className={itemClass(false)}>
          <Compass className="h-5 w-5" />
          Discover
        </NavLink>

        <NavLink to="/settings" className={itemClass(settingsActive)}>
          <Settings className="h-5 w-5" />
          {t("nav.settings")}
        </NavLink>
      </div>
    </nav>
  );
}
