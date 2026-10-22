import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarDays, CheckCheck, ChevronDown, Gavel, HandCoins, Loader2, LogOut, Menu, Search, Send, Settings } from "lucide-react";
import {
  clearSession, getStoredUser, listDisputes, listExpenses, listMembers, listPayments,
  type AuthUser, type Dispute, type ExpenseRequest, type Payment, type Role,
} from "../lib/api";
import { useGroup } from "../providers/GroupProvider";
import ModeBadges from "../components/ModeBadges";
import { formatNaira } from "../lib/format";

interface ActivityNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  href: string;
  kind: "payment" | "payout" | "dispute";
}

const notificationReadKey = (userId: string, groupId: string) =>
  `campuspot_notification_read:${userId}:${groupId}`;

function activityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function isRecentActivity(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time < 30 * 24 * 60 * 60 * 1000;
}

function buildNotifications(groupId: string, payments: Payment[], expenses: ExpenseRequest[], disputes: Dispute[]): ActivityNotification[] {
  const items: ActivityNotification[] = [
    ...payments.filter((payment) => isRecentActivity(payment.createdAt)).map((payment) => ({
      id: `payment:${payment.id}`,
      title: payment.status === "unmatched" ? "Contribution needs matching" : "Contribution received",
      body: `${payment.payerName || payment.quotedReference || "A member"} · ${formatNaira(payment.amountKobo)}`,
      createdAt: payment.createdAt,
      href: `/pots/${groupId}?tab=contributions`,
      kind: "payment" as const,
    })),
    ...expenses.filter((expense) => isRecentActivity(expense.createdAt) &&
      ["pending_approval", "approved", "completed", "rejected", "failed"].includes(expense.status)).map((expense) => ({
      id: `payout:${expense.id}:${expense.status}`,
      title: expense.status === "pending_approval" ? "Payout awaiting approval" :
        expense.status === "approved" ? "Payout approved" :
        expense.status === "completed" ? "Payout completed" :
        expense.status === "failed" ? "Payout failed" : "Payout rejected",
      body: `${formatNaira(expense.amountKobo)}${expense.category ? ` · ${expense.category}` : ""}`,
      createdAt: expense.createdAt,
      href: `/pots/${groupId}?tab=payouts`,
      kind: "payout" as const,
    })),
    ...disputes.filter((dispute) => isRecentActivity(dispute.createdAt)).map((dispute) => ({
      id: `dispute:${dispute.id}:${dispute.status}`,
      title: dispute.status === "open" ? "Dispute raised" : "Dispute resolved",
      body: `${dispute.name || "A member"}${dispute.reason ? ` · ${dispute.reason}` : ""}`,
      createdAt: dispute.createdAt,
      href: `/pots/${groupId}`,
      kind: "dispute" as const,
    })),
  ];
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
}

const roleLabel = (role: Role | null) =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const user = getStoredUser<AuthUser>();
  const { activeGroup } = useGroup();

  const [role, setRole] = useState<Role | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const readKey = user && activeGroup ? notificationReadKey(user.id, activeGroup.id) : "";

  useEffect(() => {
    if (!activeGroup || !user || !readKey) {
      setNotifications([]);
      setReadNotificationIds([]);
      setNotificationsError("");
      return;
    }
    let alive = true;
    setNotifications([]);
    const load = async () => {
      setNotificationsLoading(true);
      setNotificationsError("");
      try {
        const rawRead = localStorage.getItem(readKey);
        let savedRead: string[] = [];
        try {
          const parsed = rawRead ? JSON.parse(rawRead) as unknown : [];
          if (Array.isArray(parsed)) savedRead = parsed.filter((id): id is string => typeof id === "string");
        } catch {
          localStorage.removeItem(readKey);
        }
        const results = await Promise.allSettled([
          listPayments(activeGroup.id), listExpenses(activeGroup.id), listDisputes(activeGroup.id),
        ] as const);
        if (!alive) return;
        if (results.every((result) => result.status === "rejected")) throw new Error("Pot activity is unavailable.");
        const payments = results[0].status === "fulfilled" ? results[0].value : [];
        const expenses = results[1].status === "fulfilled" ? results[1].value : [];
        const disputes = results[2].status === "fulfilled" ? results[2].value : [];
        const items = buildNotifications(activeGroup.id, payments, expenses, disputes);
        const currentIds = new Set(items.map((item) => item.id));
        setReadNotificationIds(savedRead.filter((id) => currentIds.has(id)));
        setNotifications(items);
        if (results.some((result) => result.status === "rejected")) setNotificationsError("Some pot activity couldn't be loaded.");
      } catch (err) {
        if (alive) setNotificationsError(err instanceof Error ? err.message : "Couldn't load pot activity.");
      } finally {
        if (alive) setNotificationsLoading(false);
      }
    };
    void load();
    const timer = notificationOpen ? window.setInterval(() => void load(), 60_000) : undefined;
    return () => { alive = false; if (timer) window.clearInterval(timer); };
  }, [activeGroup?.id, user?.id, readKey, notificationOpen]);

  // Ctrl/⌘+K focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The signed-in user's role in the active pot (best-effort).
  useEffect(() => {
    let alive = true;
    if (!activeGroup || !user) {
      setRole(null);
      return;
    }
    listMembers(activeGroup.id)
      .then((members) => {
        if (alive) setRole(members.find((m) => m.userId === user.id)?.role ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeGroup?.id, user?.id]);

  // Close the avatar menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!notificationOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotificationOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notificationOpen]);

  const unreadCount = notifications.filter((item) => !readNotificationIds.includes(item.id)).length;
  const markNotificationsRead = (ids: string[]) => {
    const next = Array.from(new Set([...readNotificationIds, ...ids]));
    setReadNotificationIds(next);
    if (readKey) localStorage.setItem(readKey, JSON.stringify(next));
  };

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search with keyboard hint */}
      <div className="relative hidden w-full max-w-xs sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search pots, members, levies…"
          aria-label="Search"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-16 text-sm text-slate-700 transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          Ctrl K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ModeBadges />

        {/* Date chip */}
        <button
          type="button"
          className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:inline-flex"
        >
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {today}
        </button>

        {/* Notifications */}
        <div ref={notificationRef} className="relative">
          <button
            type="button"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-haspopup="dialog"
            aria-expanded={notificationOpen}
            onClick={() => setNotificationOpen((open) => !open)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <AnimatePresence>
            {notificationOpen && (
              <motion.div
                role="dialog"
                aria-label="Notification center"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#151321]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
                  <div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">Pot activity</h2><p className="text-[11px] text-slate-400">{activeGroup?.name ?? "Select a pot to see activity"}</p></div>
                  {unreadCount > 0 && <button type="button" onClick={() => markNotificationsRead(notifications.map((item) => item.id))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
                </div>
                <div className="max-h-[min(65vh,420px)] overflow-y-auto">
                  {notificationsLoading && notifications.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading activity…</div>
                  ) : notificationsError && notifications.length === 0 ? (
                    <p role="status" className="px-4 py-6 text-center text-xs text-slate-500">Couldn’t load pot activity. Check your connection and reopen this panel.</p>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center"><Bell className="mx-auto mb-2 h-5 w-5 text-slate-300" /><p className="text-xs text-slate-500 dark:text-slate-400">No recent pot activity.</p></div>
                  ) : notifications.map((item) => {
                    const unread = !readNotificationIds.includes(item.id);
                    const Icon = item.kind === "payment" ? HandCoins : item.kind === "payout" ? Send : Gavel;
                    return (
                      <Link key={item.id} to={item.href} onClick={() => { markNotificationsRead([item.id]); setNotificationOpen(false); }} className={`flex gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${unread ? "bg-violet-50/60 dark:bg-violet-500/5" : ""}`}>
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{item.title}</span><span className="shrink-0 text-[10px] text-slate-400">{activityDate(item.createdAt)}</span></span><span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.body}</span></span>
                        {unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                      </Link>
                    );
                  })}
                </div>
                {notificationsError && notifications.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-center text-[10px] text-slate-400 dark:border-white/10">Some activity could not be refreshed.</p>}
                {notifications.length > 0 && <div className="border-t border-slate-100 px-4 py-2 text-center text-[10px] text-slate-400 dark:border-white/10">Recent payments, payouts, and disputes · last 30 days</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Avatar + menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">
              {user?.name?.charAt(0) ?? "?"}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[9rem] truncate text-sm font-semibold text-slate-800">
                {user?.name ?? "Guest"}
              </span>
              <span className="block text-xs text-slate-400">{roleLabel(role)}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg"
              >
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-violet-600 transition hover:bg-violet-50"
                >
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
