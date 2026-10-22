import {
  getSummary, listDisputes, listExpenses, listPayments,
  type Dispute, type ExpenseRequest, type Payment, type GroupSummary,
} from "./api";
import { formatNaira } from "./format";

export interface PotActivityNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  href: string;
  kind: "payment" | "payout" | "dispute" | "deadline";
}

export const notificationReadKey = (userId: string, groupId: string) =>
  `campuspot_notification_read:${userId}:${groupId}`;

export function readNotificationIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

export function saveReadNotificationIds(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent("campuspot-notifications-read", { detail: { key, ids } }));
}

function isRecent(value: string) {
  const time = new Date(value).getTime();
  const age = Date.now() - time;
  return Number.isFinite(time) && age >= 0 && age < 30 * 24 * 60 * 60 * 1000;
}

export function activityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function buildNotifications(groupId: string, payments: Payment[], expenses: ExpenseRequest[], disputes: Dispute[], summary?: GroupSummary) {
  const items: PotActivityNotification[] = [
    ...payments.filter((payment) => isRecent(payment.createdAt)).map((payment) => ({
      id: `payment:${payment.id}`,
      title: payment.status === "unmatched" ? "Contribution needs matching" : "Contribution received",
      body: `${payment.payerName || payment.quotedReference || "A member"} · ${formatNaira(payment.amountKobo)}`,
      createdAt: payment.createdAt,
      href: `/pots/${groupId}?tab=contributions`,
      kind: "payment" as const,
    })),
    ...expenses.filter((expense) => isRecent(expense.createdAt) &&
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
    ...disputes.filter((dispute) => isRecent(dispute.createdAt)).map((dispute) => ({
      id: `dispute:${dispute.id}:${dispute.status}`,
      title: dispute.status === "open" ? "Dispute raised" : "Dispute resolved",
      body: `${dispute.name || "A member"}${dispute.reason ? ` · ${dispute.reason}` : ""}`,
      createdAt: dispute.createdAt,
      href: `/pots/${groupId}`,
      kind: "dispute" as const,
    })),
  ];
  const levy = summary?.levy;
  if (summary && levy?.dueDate && levy.status === "open" && summary.outstandingKobo > 0) {
    const due = new Date(levy.dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const days = Math.ceil((dueDay - todayDay) / (24 * 60 * 60 * 1000));
    if (days <= 7) {
      items.push({
        id: `deadline:${levy.id}:${levy.dueDate}`,
        title: days < 0 ? "Contribution deadline passed" : days === 0 ? "Contribution deadline is today" : "Contribution deadline approaching",
        body: days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue · ${formatNaira(summary.outstandingKobo)} outstanding` : `${days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`} · ${formatNaira(summary.outstandingKobo)} outstanding`,
        createdAt: new Date().toISOString(),
        href: `/pots/${groupId}?tab=contributions`,
        kind: "deadline",
      });
    }
  }
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
}

export async function loadPotNotifications(groupId: string) {
  const results = await Promise.allSettled([
    listPayments(groupId), listExpenses(groupId), listDisputes(groupId), getSummary(groupId),
  ] as const);
  if (results.every((result) => result.status === "rejected")) throw new Error("Pot activity is unavailable.");
  const payments = results[0].status === "fulfilled" ? results[0].value : [];
  const expenses = results[1].status === "fulfilled" ? results[1].value : [];
  const disputes = results[2].status === "fulfilled" ? results[2].value : [];
  const summary = results[3].status === "fulfilled" ? results[3].value : undefined;
  return {
    notifications: buildNotifications(groupId, payments, expenses, disputes, summary),
    partial: results.some((result) => result.status === "rejected"),
  };
}
