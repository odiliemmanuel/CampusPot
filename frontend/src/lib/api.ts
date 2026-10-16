// Resolve the API base at runtime. Prefer VITE_API_URL when it was set at build
// time; otherwise local dev talks to the local API and everywhere else falls
// back to the deployed API. This makes a deploy work even when the Vercel env
// var is missing, which previously showed "cannot connect to server".
const PROD_API_URL = "https://campuspot-api.onrender.com/api/v1";

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return "http://localhost:8080/api/v1";
    }
  }
  return PROD_API_URL;
}

const API_URL = resolveApiUrl();

const TOKEN_KEY = "campuspot_token";
const USER_KEY = "campuspot_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: unknown) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser<T = AuthUser>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Every PotKeeper response is wrapped in { success, data, error, meta }.
interface Envelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
  meta?: Record<string, unknown>;
}

async function requestEnvelope<T>(
  path: string,
  options: RequestInit = {}
): Promise<Envelope<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "Can't reach the PotKeeper server. It may be waking up — please try again in a moment.",
      0,
      "NETWORK"
    );
  }

  const body = (await res.json().catch(() => ({}))) as Partial<Envelope<T>>;

  if (!res.ok || body.success === false) {
    const message = body.error?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body.error?.code || "");
  }
  return { success: true, data: body.data as T, meta: body.meta };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const env = await requestEnvelope<T>(path, options);
  return env.data;
}

// ---------- Types ----------

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  bmoniUserId?: string;
  createdAt?: string;
}

export type Role = "treasurer" | "cosigner" | "member";

export interface Group {
  id: string;
  name: string;
  joinCode: string;
  currency: string;
  createdBy: string;
  bmoniUserId?: string;
  bmoniWalletId?: string;
  bmoniWalletAddress?: string;
  virtualAccountNumber?: string;
  virtualAccountBank?: string;
  virtualAccountName?: string;
  approvalThreshold: number;
  approvalTotal: number;
  largeExpenseKobo: number;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  groupId: string;
  userId: string;
  role: Role;
  status: "invited" | "active" | "removed";
  reference: string;
  joinedAt?: string;
  user?: AuthUser;
}

export interface Levy {
  id: string;
  groupId: string;
  title: string;
  amountKobo: number;
  dueDate?: string;
  status: "open" | "closed";
  createdBy: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  groupId: string;
  userId?: string;
  levyId?: string;
  payerName?: string;
  payerAccount?: string;
  amountKobo: number;
  status: string;
  quotedReference?: string;
  matchedBy?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  groupId: string;
  kind: string;
  amountKobo: number;
  balanceAfterKobo: number;
  description: string;
  refType?: string;
  refId?: string;
  createdAt: string;
}

export interface ExpenseRequest {
  id: string;
  groupId: string;
  requestedBy: string;
  amountKobo: number;
  destination: string;
  category?: string;
  note?: string;
  status: "pending_approval" | "approved" | "rejected" | "executing" | "completed" | "failed";
  riskLevel: "low" | "medium" | "high";
  riskReasons?: string;
  createdAt: string;
}

export interface Approval {
  expenseRequestId: string;
  approverUserId: string;
  decision: "approve" | "reject";
  comment?: string;
  createdAt: string;
}

export interface OutstandingMember {
  userId: string;
  name: string;
  reference: string;
  paidKobo: number;
  amountKobo: number;
  outstandingKobo: number;
  state: "paid" | "partial" | "unpaid";
}

export interface GroupSummary {
  groupId: string;
  groupName: string;
  currency: string;
  balanceKobo: number;
  collectedKobo: number;
  spentKobo: number;
  levy?: Levy;
  members: number;
  expectedKobo: number;
  paidCount: number;
  partialCount: number;
  outstandingCount: number;
  outstandingKobo: number;
  pendingExpenses: number;
}

export interface Reminder {
  id: string;
  groupId: string;
  levyId?: string;
  userId?: string;
  channel: string;
  message: string;
  status: "draft" | "sent";
  sentAt?: string;
  createdAt: string;
}

export interface PotMembership {
  groupId: string;
  groupName: string;
  currency: string;
  role: Role;
  joinedAt?: string;
  reference: string;
  balanceKobo: number;
  levyTitle?: string;
  levyAmountKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  state: "paid" | "partial" | "unpaid" | "none";
  /** The pot's dedicated collection account — shown on the Balance page. */
  virtualAccountNumber?: string;
  virtualAccountBank?: string;
  virtualAccountName?: string;
  bmoniWalletAddress?: string;
}

export interface MyTransaction {
  id: string;
  groupId: string;
  groupName: string;
  amountKobo: number;
  status: string;
  payerName?: string;
  createdAt: string;
}

export interface AccountOverview {
  totalContributedKobo: number;
  totalOutstandingKobo: number;
  pots: PotMembership[];
  transactions: MyTransaction[];
}

export type WalletTxKind = "deposit" | "transfer_in" | "transfer_out" | "pot_payment";

export interface WalletTransaction {
  id: string;
  userId: string;
  kind: WalletTxKind;
  amountKobo: number;
  counterparty?: string;
  counterpartyUserId?: string;
  groupId?: string;
  levyId?: string;
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface WalletOverview {
  balanceKobo: number;
  bmoniUserId?: string;
  transactions: WalletTransaction[];
  /** False when this deployment predates the wallet endpoints (404 fallback). */
  ready?: boolean;
}

export interface AnswerResponse {
  answer: string;
  intent: "outstanding" | "remind" | "summary";
  data?: unknown;
}

// ---------- Auth ----------

export const register = (name: string, email: string, password: string, phone?: string) =>
  request<{ token: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, phone }),
  });

export const login = (email: string, password: string) =>
  request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => request<AuthUser>("/auth/me");

export const updateProfile = (patch: { name?: string; phone?: string }) =>
  request<AuthUser>("/auth/me", { method: "PATCH", body: JSON.stringify(patch) });

// ---------- Groups ----------

export const listGroups = () => request<Group[] | null>("/groups").then((g) => g ?? []);
export const createGroup = (
  name: string,
  approvalThreshold = 2,
  approvalTotal = 3,
  largeExpenseKobo = 0,
  perMemberKobo = 0,
) =>
  request<Group>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, approvalThreshold, approvalTotal, largeExpenseKobo, perMemberKobo }),
  });
export const getGroup = (id: string) => request<Group>(`/groups/${id}`);
export const updateGroup = (
  id: string,
  patch: Partial<Pick<Group, "name" | "approvalThreshold" | "approvalTotal" | "largeExpenseKobo">>
) => request<Group>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const regenerateJoinCode = (id: string) =>
  request<Group>(`/groups/${id}/join-code`, { method: "POST" });
export const joinGroup = (joinCode: string) =>
  request<Group>("/groups/join", { method: "POST", body: JSON.stringify({ joinCode }) });
export const listMembers = (groupId: string) => request<Membership[] | null>(`/groups/${groupId}/members`).then((m) => m ?? []);
export const inviteMember = (groupId: string, email: string, role: Role) =>
  request<Membership>(`/groups/${groupId}/invite`, { method: "POST", body: JSON.stringify({ email, role }) });
export const updateMemberRole = (groupId: string, userId: string, role: Role) =>
  request<Membership>(`/groups/${groupId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

// ---------- Levies ----------

export const listLevies = (groupId: string) => request<Levy[] | null>(`/groups/${groupId}/levies`).then((l) => l ?? []);
export const createLevy = (groupId: string, title: string, amountKobo: number, dueDate?: string) =>
  request<Levy>(`/groups/${groupId}/levies`, {
    method: "POST",
    body: JSON.stringify({ title, amountKobo, dueDate }),
  });
export const closeLevy = (groupId: string, levyId: string) =>
  request<{ status: string }>(`/groups/${groupId}/levies/${levyId}/close`, { method: "POST" });
export const deleteLevy = (groupId: string, levyId: string) =>
  request<{ status: string }>(`/groups/${groupId}/levies/${levyId}`, { method: "DELETE" });

// ---------- Payments & ledger ----------

export const listPayments = (groupId: string) => request<Payment[] | null>(`/groups/${groupId}/payments`).then((p) => p ?? []);
export const recordManualPayment = (groupId: string, userId: string, amountKobo: number, levyId?: string, note = "") =>
  request<Payment>(`/groups/${groupId}/payments/manual`, {
    method: "POST",
    body: JSON.stringify({ userId, amountKobo, levyId, note }),
  });
export const simulateDeposit = (groupId: string, amountKobo: number, reference = "", payerName = "") =>
  request<Payment>(`/groups/${groupId}/deposits`, {
    method: "POST",
    body: JSON.stringify({
      amountKobo,
      reference,
      payerName,
      providerEventId: `sim-${Date.now()}`,
    }),
  });
export const listLedger = (groupId: string) => request<LedgerEntry[] | null>(`/groups/${groupId}/ledger`).then((l) => l ?? []);

export const getSummary = (groupId: string) => request<GroupSummary>(`/groups/${groupId}/summary`);
export const getOutstanding = (groupId: string) =>
  requestEnvelope<OutstandingMember[]>(`/groups/${groupId}/outstanding`).then((env) => ({
    members: env.data ?? [],
    levy: (env.meta?.levy as Levy | null) ?? null,
  }));

// ---------- Expenses ----------

export const listExpenses = (groupId: string) => request<ExpenseRequest[] | null>(`/groups/${groupId}/expenses`).then((e) => e ?? []);
export const createExpense = (groupId: string, amountKobo: number, destination: string, category = "", note = "") =>
  request<ExpenseRequest>(`/groups/${groupId}/expenses`, {
    method: "POST",
    body: JSON.stringify({ amountKobo, destination, category, note }),
  });
export const decideExpense = (groupId: string, expenseId: string, decision: "approve" | "reject", comment = "") =>
  request<ExpenseRequest>(`/groups/${groupId}/expenses/${expenseId}/decisions`, {
    method: "POST",
    body: JSON.stringify({ decision, comment }),
  });
export const listApprovals = (groupId: string, expenseId: string) =>
  request<Approval[] | null>(`/groups/${groupId}/expenses/${expenseId}/approvals`).then((a) => a ?? []);
export const executeExpense = (groupId: string, expenseId: string) =>
  request<ExpenseRequest>(`/groups/${groupId}/expenses/${expenseId}/execute`, { method: "POST" });

// ---------- AI treasurer ----------

export const askAssistant = (groupId: string, question: string) =>
  request<AnswerResponse>(`/groups/${groupId}/assistant`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
export const draftReminder = (groupId: string, userId: string, tone = "friendly") =>
  request<Reminder>(`/groups/${groupId}/reminders`, {
    method: "POST",
    body: JSON.stringify({ userId, tone }),
  });
export const listReminders = (groupId: string) => request<Reminder[] | null>(`/groups/${groupId}/reminders`).then((r) => r ?? []);
export const sendReminder = (groupId: string, reminderId: string) =>
  request<Reminder>(`/groups/${groupId}/reminders/${reminderId}/send`, { method: "POST" });

// ---------- Wallet ----------

export const getWallet = async (): Promise<WalletOverview> => {
  try {
    return await request<WalletOverview>("/wallet");
  } catch (err) {
    // A 404 means this deployment is older than the wallet endpoints. Don't
    // hard-fail the Balance page — show an empty wallet and let the rest of
    // the page work until the backend is redeployed.
    if (err instanceof ApiError && err.status === 404) {
      return { balanceKobo: 0, transactions: [], ready: false };
    }
    throw err;
  }
};

export const walletDeposit = (amountKobo: number, reference = "", note = "") =>
  request<WalletOverview>("/wallet/deposit", {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference, note }),
  });

export const walletTransfer = (amountKobo: number, recipient: string, note = "", bankName = "") =>
  request<WalletOverview>("/wallet/transfer", {
    method: "POST",
    body: JSON.stringify({ amountKobo, recipient, note, bankName }),
  });

export const walletPayPot = (groupId: string, amountKobo: number, levyId?: string) =>
  request<Payment>("/wallet/pay", {
    method: "POST",
    body: JSON.stringify({ groupId, amountKobo, levyId }),
  });

// ---------- Account ----------

// Build the account overview from endpoints that have existed for longer, so
// the Balance page still works on a backend that predates /account/overview.
async function localAccountOverview(): Promise<AccountOverview> {
  const me = getStoredUser();
  const groups = await listGroups();
  const pots: PotMembership[] = [];
  const transactions: MyTransaction[] = [];
  let totalContributedKobo = 0;
  let totalOutstandingKobo = 0;

  const perPot = await Promise.all(
    groups.map(async (g) => {
      const [summary, outstanding, members, payments] = await Promise.all([
        getSummary(g.id).catch(() => null),
        getOutstanding(g.id).catch(() => ({ members: [] as OutstandingMember[], levy: null })),
        listMembers(g.id).catch(() => [] as Membership[]),
        listPayments(g.id).catch(() => [] as Payment[]),
      ]);
      return { g, summary, outstanding, members, payments };
    })
  );

  for (const { g, summary, outstanding, members, payments } of perPot) {
    const membership = members.find((m) => m.userId === me?.id);
    const mine = outstanding.members.find((m) => m.userId === me?.id);
    const myPayments = payments.filter((p) => p.userId === me?.id);

    const paidKobo = mine?.paidKobo ?? myPayments.reduce((sum, p) => sum + p.amountKobo, 0);
    const outstandingKobo = mine?.outstandingKobo ?? 0;
    const levyAmountKobo = mine?.amountKobo ?? outstanding.levy?.amountKobo ?? 0;

    pots.push({
      groupId: g.id,
      groupName: g.name,
      currency: g.currency,
      role: membership?.role ?? "member",
      joinedAt: membership?.joinedAt,
      reference: membership?.reference ?? "",
      balanceKobo: summary?.balanceKobo ?? 0,
      levyTitle: outstanding.levy?.title,
      levyAmountKobo,
      paidKobo,
      outstandingKobo,
      state: mine?.state ?? "none",
      virtualAccountNumber: g.virtualAccountNumber,
      virtualAccountBank: g.virtualAccountBank,
      virtualAccountName: g.virtualAccountName,
      bmoniWalletAddress: g.bmoniWalletAddress,
    });

    totalContributedKobo += paidKobo;
    totalOutstandingKobo += outstandingKobo;

    for (const p of myPayments) {
      transactions.push({
        id: p.id,
        groupId: g.id,
        groupName: g.name,
        amountKobo: p.amountKobo,
        status: p.status,
        payerName: p.payerName,
        createdAt: p.createdAt ?? new Date().toISOString(),
      });
    }
  }

  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    totalContributedKobo,
    totalOutstandingKobo,
    pots,
    transactions: transactions.slice(0, 200),
  };
}

export const getAccountOverview = async (): Promise<AccountOverview> => {
  try {
    return await request<AccountOverview>("/account/overview");
  } catch (err) {
    // A 404 means this deployment is older than the endpoint — aggregate the
    // data from the endpoints it does have instead of failing the page.
    if (err instanceof ApiError && err.status === 404) {
      try {
        return await localAccountOverview();
      } catch {
        /* fall through and surface the original error */
      }
    }
    throw err;
  }
};

// ---------- Meta ----------

export interface AppMeta {
  appEnv: string;
  aiMode: "llm" | "rule-based";
  bmoniMode: "sandbox" | "mock";
  webhookConfigured: boolean;
}
export const getMeta = () => request<AppMeta>(`/meta`);
