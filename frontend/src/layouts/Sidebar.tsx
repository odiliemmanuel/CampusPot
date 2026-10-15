import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles, LayoutDashboard, HandCoins, Receipt, Send, Users,
  ScrollText, Settings, LogOut, Menu, X,
} from "lucide-react";
import { clearSession, getStoredUser, type AuthUser } from "../lib/api";
import { useGroup } from "../providers/GroupProvider";
import GroupSwitcher from "./GroupSwitcher";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/contributions", icon: HandCoins, label: "Contributions" },
  { to: "/levies", icon: Receipt, label: "Levies" },
  { to: "/expenses", icon: Send, label: "Expenses" },
  { to: "/members", icon: Users, label: "Members" },
  { to: "/ledger", icon: ScrollText, label: "Ledger" },
  { to: "/assistant", icon: Sparkles, label: "AI Treasurer" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition bg-primary-600 text-white shadow-lg shadow-primary-600/30"
    : "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition text-slate-400 hover:bg-white/5 hover:text-white";

const Brand = () => (
  <div className="flex items-center gap-2">
    <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
      <HandCoins className="w-5 h-5 text-white" />
    </div>
    <span className="font-sora font-bold text-lg text-white">CampusPot</span>
  </div>
);

export default function Sidebar() {
  const navigate = useNavigate();
  const user = getStoredUser<AuthUser>();
  const { groups } = useGroup();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearSession();
    setMobileOpen(false);
    navigate("/login");
  };

  const UserBlock = () => (
    <div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 mb-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {user?.name?.charAt(0) ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate text-white">{user?.name ?? "Guest"}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email ?? ""}</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-4">
        <Brand />
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-slate-300"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-ink z-50 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <Brand />
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white/5"
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {groups.length > 0 && <GroupSwitcher onNavigate={() => setMobileOpen(false)} />}
                <nav className="flex flex-col gap-1 mt-4">
                  {navItems.map((item) => (
                    <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={navLinkClass}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
              <div className="mt-6">
                <UserBlock />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 shrink-0 flex-col justify-between p-6 h-full">
        <div>
          <div className="mb-6">
            <Brand />
          </div>
          {groups.length > 0 && <GroupSwitcher />}
          <nav className="flex flex-col gap-1 mt-4">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="mt-6">
          <UserBlock />
        </div>
      </aside>
    </>
  );
}
