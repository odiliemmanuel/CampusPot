import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Bell, CalendarClock, CheckCheck, Gavel, HandCoins, Loader2,
  Send, ShieldCheck, Undo2, Wallet,
} from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { getStoredUser, listNotifications, markAllNotificationsRead, markNotificationRead, type ServerNotification } from "../../lib/api";
import {
  activityDate, loadPotNotifications, notificationReadKey, readNotificationIds,
  saveReadNotificationIds, type PotActivityNotification,
} from "../../lib/notifications";

// Icon per server-side notification kind.
function kindIcon(kind: string) {
  switch (kind) {
    case "payment":
      return HandCoins;
    case "transfer_in":
      return Wallet;
    case "payout":
      return Send;
    case "dispute":
      return Gavel;
    case "schedule":
      return CalendarClock;
    case "refund":
      return Undo2;
    default:
      return ShieldCheck;
  }
}

// The user's own feed: money events across every pot, delivered by the server.
function ForYouFeed() {
  const [rows, setRows] = useState<ServerNotification[] | null>(null);
  const navigate = useNavigate();

  const load = () => {
    listNotifications().then(setRows).catch(() => setRows([]));
  };
  useEffect(load, []);

  const markRead = async (row: ServerNotification) => {
    if (!row.read) {
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, read: true } : r)) ?? null);
      await markNotificationRead(row.id).catch(() => {});
    }
    if (row.link) navigate(row.link);
  };

  const markAll = async () => {
    setRows((prev) => prev?.map((r) => ({ ...r, read: true })) ?? null);
    await markAllNotificationsRead().catch(() => {});
  };

  const unread = (rows ?? []).filter((r) => !r.read).length;

  return (
    <section className="cp-card mb-4 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-violet-200/70 px-3 py-2.5 dark:border-white/10 sm:px-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-violet-700 dark:text-violet-300" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">For you</h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/5 dark:text-slate-400">{rows?.length ?? 0}</span>
        </div>
        {unread > 0 && (
          <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {rows === null ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">Nothing yet.</p>
          <p className="mt-1 text-xs text-slate-400">Contributions, payouts, refunds and pot updates land here.</p>
        </div>
      ) : (
        <div className="divide-y divide-violet-100/80 dark:divide-white/5">
          {rows.map((row) => {
            const Icon = kindIcon(row.kind);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => void markRead(row)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/70 dark:hover:bg-white/5 sm:px-4 ${row.read ? "" : "bg-white/40 dark:bg-white/[.025]"}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{row.title}</span>
                    <time className="shrink-0 text-[10px] text-slate-400">{activityDate(row.createdAt)}</time>
                  </span>
                  {row.body && <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.body}</span>}
                </span>
                {!row.read && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NotificationsInner() {
  const { activeGroup } = useGroup();
  const userId = getStoredUser()?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const groupId = activeGroup!.id;
  const readKey = notificationReadKey(userId ?? "", groupId);

  const [notifications, setNotifications] = useState<PotActivityNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    loadPotNotifications(groupId)
      .then(({ notifications: items, partial: someMissing }) => {
        if (!alive) return;
        const ids = new Set(items.map((item) => item.id));
        setNotifications(items);
        setReadIds(readNotificationIds(readKey).filter((id) => ids.has(id)));
        setPartial(someMissing);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Couldn't load pot activity.");
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [groupId, readKey]);

  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;
  const markRead = (ids: string[]) => {
    const next = Array.from(new Set([...readIds, ...ids]));
    setReadIds(next);
    saveReadNotificationIds(readKey, next);
  };

  const routeState = location.state as { from?: unknown } | null;
  const previousPath = typeof routeState?.from === "string" && routeState.from.startsWith("/") && !routeState.from.startsWith("//")
    ? routeState.from
    : `/pots/${groupId}`;

  return (
    <>
      <ForYouFeed />

      <PageHeader
        title="Notification center"
        subtitle={`${activeGroup?.name ?? "Your pot"} · recent contributions, payouts, and disputes`}
        action={(
          <button type="button" onClick={() => navigate(previousPath, { replace: true })} className="cp-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
      />

      <section className="cp-card overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-violet-200/70 px-3 py-2.5 dark:border-white/10 sm:px-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</h2>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/5 dark:text-slate-400">{notifications.length}</span>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={() => markRead(notifications.map((item) => item.id))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading activity…</div>
        ) : error ? (
          <div className="px-4 py-10 text-center"><p role="alert" className="text-sm text-violet-600">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-2 text-xs font-semibold text-violet-700 hover:underline">Try again</button></div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-12 text-center"><Bell className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-sm text-slate-600 dark:text-slate-300">No recent activity in this pot.</p><p className="mt-1 text-xs text-slate-400">New contributions, payout updates, and disputes will appear here.</p></div>
        ) : (
          <div className="divide-y divide-violet-100/80 dark:divide-white/5">
            {notifications.map((item) => {
              const unread = !readIds.includes(item.id);
              const Icon = item.kind === "payment" ? HandCoins : item.kind === "payout" ? Send : item.kind === "deadline" ? CalendarClock : Gavel;
              return (
                <Link key={item.id} to={item.href} onClick={() => markRead([item.id])} className={`flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-white/5 sm:px-4 ${unread ? "bg-white/40 dark:bg-white/[.025]" : ""}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3"><span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{item.title}</span><time className="shrink-0 text-[10px] text-slate-400">{activityDate(item.createdAt)}</time></span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.body}</span>
                  </span>
                  {unread && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                </Link>
              );
            })}
          </div>
        )}

        {partial && !error && <p className="border-t border-violet-100 px-4 py-2 text-center text-[10px] text-slate-400 dark:border-white/10">Some activity types could not be refreshed.</p>}
        {!error && !loading && notifications.length > 0 && <p className="border-t border-violet-100 px-4 py-2 text-center text-[10px] text-slate-400 dark:border-white/10">Showing activity from the last 30 days · unread: {unreadCount}</p>}
      </section>
    </>
  );
}

export default function Notifications() {
  return (
    <AppShell>
      <GroupGate>
        <NotificationsInner />
      </GroupGate>
    </AppShell>
  );
}
