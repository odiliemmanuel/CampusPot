// Typed mock data for the dashboard, kept in one place so it can be swapped
// for real API calls later. Each shape mirrors the eventual API response, so
// replacing `dashboardStats` / `recentContributions` with a `fetch` is a
// drop-in change (see lib/api.ts for the existing helpers).

import type { StatColor } from "../../components/StatCard";

export type StatIcon = "wallet" | "users" | "clock" | "trending";

// ---------- Summary stat cards ----------

export interface DashboardStat {
  id: string;
  label: string;
  icon: StatIcon;
  color: StatColor;
  /** Money values are in kobo (1 naira = 100 kobo), matching the backend. */
  valueKobo?: number;
  /** Non-money values (counts) use a plain string. */
  valueText?: string;
  /** Percent change vs the previous period; negative renders red/down. */
  trend: number;
  spark: number[];
}

export const dashboardStats: DashboardStat[] = [
  {
    id: "collected",
    label: "Total Collected",
    icon: "trending",
    color: "blue",
    valueKobo: 1_845_000_00,
    trend: 12.5,
    spark: [8, 10, 9, 12, 11, 14, 13, 16],
  },
  {
    id: "members",
    label: "Active Members",
    icon: "users",
    color: "green",
    valueText: "38",
    trend: 4.2,
    spark: [20, 22, 21, 25, 27, 26, 30, 38],
  },
  {
    id: "outstanding",
    label: "Outstanding",
    icon: "clock",
    color: "orange",
    valueKobo: 280_000_00,
    trend: -6.1,
    spark: [30, 28, 29, 26, 24, 25, 22, 20],
  },
  {
    id: "payouts",
    label: "Pending Payouts",
    icon: "wallet",
    color: "purple",
    valueText: "3",
    trend: 8.0,
    spark: [1, 2, 1, 3, 2, 3, 4, 3],
  },
];

// ---------- Recent contributions table ----------

export type ContributionStatus = "paid" | "processing" | "pending" | "overdue";

export interface ContributionRow {
  id: string;
  reference: string;
  member: string;
  levy: string;
  channel: string;
  status: ContributionStatus;
  /** ISO timestamp; the table shows the date and time on two lines. */
  date: string;
}

const members = [
  "Ada Obi", "Tunde Bello", "Ngozi Eze", "Chidi Okonkwo",
  "Fatima Bello", "Emeka Nwosu", "Blessing Adeyemi", "Halima Yusuf",
];
const levies = ["200L Dues", "Excursion fund", "Hall rep levy", "Textbook pool", "Project contribution"];
const channels = ["B Moni transfer", "Cash (manual)", "Bank transfer", "B Moni transfer"];
const statusPool: ContributionStatus[] = [
  "paid", "paid", "processing", "pending", "paid", "overdue", "paid", "pending",
];

// 30 rows so pagination has something to chew on.
export const recentContributions: ContributionRow[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 9, 15 - i, 8 + (i % 8), (i * 11) % 60));
  return {
    id: `con_${1001 + i}`,
    reference: `CP-${20260 - i}`,
    member: members[i % members.length],
    levy: levies[i % levies.length],
    channel: channels[i % channels.length],
    status: statusPool[i % statusPool.length],
    date: date.toISOString(),
  };
});

// Period selector options (visual only for now).
export const periodOptions = ["Today", "This Week", "This Month", "This Term"];
