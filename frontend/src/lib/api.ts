// Resolve the API base at runtime. Prefer VITE_API_URL when it was set at build
// time; otherwise local dev talks to the local API and everywhere else falls
// back to the deployed API. This makes a deploy work even when the Vercel env
// var is missing, which previously showed "cannot connect to server".
const PROD_API_URL = "https://campusspot-kvjm.onrender.com/api/v1";

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

// The API origin without the "/api/v1" suffix. Used to hit /health for the
// warm-up ping that keeps the (free-tier) backend from scaling to zero.
export const apiOrigin = API_URL.replace(/\/api\/v1\/?$/, "");

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
  /** True once the emailed code confirmed this address. Money needs it. */
  emailVerified?: boolean;
  /** "unverified" | "verified" — identity check, raises send limits. */
  kycStatus?: string;
  /** The code to share for referral rewards. */
  referralCode?: string;
  /** Preferred language: "en" | "fr". */
  locale?: string;
}

export type Role = "treasurer" | "cosigner" | "member";

export interface Group {
  id: string;
  name: string;
  joinCode: string;
  currency: string;
  createdBy: string;
  potType: "goal" | "rotating";
  contributionFrequency: "one_time" | "daily" | "weekly" | "monthly" | "quarterly";
  contributionAmountKobo: number;
  contributionDueDate?: string;
  /** How the pot presents itself when public. */
  description?: string;
  category?: string;
  visibility: "private" | "public";
  /** Savings goal in kobo; 0 = no fixed goal. */
  targetKobo: number;
  /** Treasurer-only pot balance: ordinary members do not see it. */
  hideTreasury: boolean;
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
  /** Set once the treasurer returned this contribution to the member. */
  refundedAt?: string;
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
  /** How the payout is delivered: a pot member, a PotKeeper account, or a bank. */
  destinationType?: PayoutDestination;
  recipientUserId?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  category?: string;
  note?: string;
  status: "pending_approval" | "approved" | "rejected" | "executing" | "completed" | "failed";
  riskLevel: "low" | "medium" | "high";
  riskReasons?: string;
  createdAt: string;
  executedAt?: string;
}

export type PayoutDestination = "member" | "user" | "bank";

export interface CreateExpenseInput {
  amountKobo: number;
  destinationType: "member" | "user" | "bank";
  /** A user id (member), email/phone (user), or account number (bank). */
  recipient: string;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  category?: string;
  note?: string;
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
  openDisputes: number;
  spendingFrozen: boolean;
  /** Savings goal (0 = none) and the balance as a share of it. */
  targetKobo: number;
  goalPercent: number;
  visibility: "private" | "public";
  /** True when the treasurer hid the balance from ordinary members. */
  treasuryHidden: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  author: string;
  body: string;
  replyToId?: string;
  createdAt: string;
  readBy: string[];
  attachmentName?: string;
  attachmentType?: string;
  attachmentUrl?: string;
}

export type DisputeStatus = "open" | "resolved";

export interface Dispute {
  id: string;
  groupId: string;
  userId: string;
  name: string;
  expenseRequestId?: string;
  reason?: string;
  status: DisputeStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  /** Set when the dispute was escalated to customer support. */
  escalatedAt?: string;
  escalationNote?: string;
  createdAt: string;
}

export interface ContributionRow {
  userId: string;
  name: string;
  reference?: string;
  state: "paid" | "partial" | "unpaid" | "none";
  paidKobo: number;
  amountKobo: number;
  showAmount: boolean;
  isMe: boolean;
}

export interface ContributionsResponse {
  collectedKobo: number;
  expectedKobo: number;
  levyAmountKobo: number;
  showAmounts: boolean;
  rows: ContributionRow[];
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
  /** True when the treasurer hid this pot's balance from ordinary members. */
  treasuryHidden: boolean;
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

export type WalletTxKind = "deposit" | "transfer_in" | "transfer_out" | "pot_payment" | "refund" | "bonus";

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
  /** True once the user has set the PIN that authorises sends. */
  pinSet: boolean;
  transactions: WalletTransaction[];
  /** False when this deployment predates the wallet endpoints (404 fallback). */
  ready?: boolean;
}

export interface AnswerResponse {
  answer: string;
  intent: string;
  data?: unknown;
}

// ---------- Auth ----------

export const register = (
  name: string,
  email: string,
  phone: string,
  password: string,
  referralCode = "",
  locale = "en",
) =>
  request<{ token: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, phone, referralCode, locale }),
  });

export const login = (email: string, password: string) =>
  request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => request<AuthUser>("/auth/me");

export const updateProfile = (patch: { name?: string; phone?: string; locale?: string }) =>
  request<AuthUser>("/auth/me", { method: "PATCH", body: JSON.stringify(patch) });

export const deleteAccount = () => request<{ deleted: boolean }>("/auth/me", { method: "DELETE" });

// ---------- Groups ----------

export const listGroups = () => request<Group[] | null>("/groups").then((g) => g ?? []);
export const createGroup = (
  name: string,
  approvalThreshold = 2,
  approvalTotal = 3,
  largeExpenseKobo = 0,
  perMemberKobo = 0,
  options: {
    potType?: "goal" | "rotating";
    contributionFrequency?: "one_time" | "daily" | "weekly" | "monthly" | "quarterly";
    contributionDueDate?: string;
    description?: string;
    category?: string;
    visibility?: "private" | "public";
    targetKobo?: number;
  } = {},
) =>
  request<Group>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, approvalThreshold, approvalTotal, largeExpenseKobo, perMemberKobo, ...options }),
  });
export const getGroup = (id: string) => request<Group>(`/groups/${id}`);
export const updateGroup = (
  id: string,
  patch: Partial<
    Pick<
      Group,
      | "name"
      | "approvalThreshold"
      | "approvalTotal"
      | "largeExpenseKobo"
      | "contributionDueDate"
      | "description"
      | "category"
      | "visibility"
      | "targetKobo"
      | "hideTreasury"
    >
  >
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
export const leaveGroup = (groupId: string) =>
  request<{ status: string }>(`/groups/${groupId}/leave`, { method: "POST" });

// ---------- Pot chat ----------

// A 404 on the chat endpoints means this deployment predates them; treat the
// chat as empty rather than surfacing a "request failed" error.
const is404 = (err: unknown) => err instanceof ApiError && err.status === 404;

export const listChat = (groupId: string) =>
  request<ChatMessage[] | null>(`/groups/${groupId}/chat`)
    .then((m) => m ?? [])
    .catch((err) => {
      if (is404(err)) return [] as ChatMessage[];
      throw err;
    });
export const postChat = (groupId: string, body: string, replyToId?: string) =>
  request<ChatMessage>(`/groups/${groupId}/chat`, {
    method: "POST",
    body: JSON.stringify({ body, replyToId }),
  });
export const uploadChatAttachment = async (groupId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_URL}/groups/${groupId}/chat/attachments`, {
    method: "POST", headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: form,
  });
  const envelope = await response.json().catch(() => ({}));
  if (!response.ok || envelope.success === false) throw new ApiError(envelope.error?.message || "Upload failed.", response.status);
  return envelope.data as ChatMessage;
};
export const getChatAttachment = async (url: string) => {
  const response = await fetch(`${apiOrigin}${url}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
  if (!response.ok) throw new ApiError("Could not load this attachment.", response.status);
  return response.blob();
};
export const chatWebSocketUrl = (groupId: string) => {
  const wsOrigin = apiOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsOrigin}/api/v1/groups/${groupId}/chat/ws`;
};
export const chatWebSocketProtocols = () => ["campuspot", `auth.${getToken() ?? ""}`];
export const markChatRead = (groupId: string, messageId: string) =>
  request<{ status: string }>(`/groups/${groupId}/chat/read`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
export const listChatParticipants = (groupId: string) =>
  request<Membership[] | null>(`/groups/${groupId}/chat/participants`)
    .then((m) => m ?? [])
    .catch((err) => {
      if (is404(err)) return [] as Membership[];
      throw err;
    });
export const removeChatMember = (groupId: string, userId: string) =>
  request<{ status: string }>(`/groups/${groupId}/chat/members/${userId}`, { method: "DELETE" });

// ---------- Disputes ----------

export const listDisputes = (groupId: string) =>
  request<Dispute[] | null>(`/groups/${groupId}/disputes`).then((d) => d ?? []);
export const raiseDispute = (groupId: string, reason = "", expenseRequestId?: string) =>
  request<Dispute>(`/groups/${groupId}/disputes`, {
    method: "POST",
    body: JSON.stringify({ reason, expenseRequestId }),
  });
export const resolveDispute = (groupId: string, disputeId: string) =>
  request<Dispute>(`/groups/${groupId}/disputes/${disputeId}/resolve`, { method: "POST" });

// ---------- Contributions ----------

export const getContributions = (groupId: string) =>
  request<ContributionsResponse>(`/groups/${groupId}/contributions`);

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
export const createExpense = (groupId: string, input: CreateExpenseInput) =>
  request<ExpenseRequest>(`/groups/${groupId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
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

export const askAssistant = async (groupId: string, question: string) => {
  // Assistant questions are read-only, so a single retry after a transient
  // transport/server failure cannot duplicate a payment or other action.
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<AnswerResponse>(`/groups/${groupId}/assistant`, {
        method: "POST",
        body: JSON.stringify({ question }),
      });
    } catch (error) {
      const retryable = error instanceof ApiError &&
        (error.status === 0 || error.status === 429 || error.status >= 500);
      if (attempt >= 1 || !retryable) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
  }
};
export const draftReminder = async (groupId: string, userId: string, tone = "friendly", idempotencyKey = crypto.randomUUID()) => {
  // Reuse the same key for the retry so a lost response cannot create a second draft.
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<Reminder>(`/groups/${groupId}/reminders`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ userId, tone }),
      });
    } catch (error) {
      const retryable = error instanceof ApiError &&
        (error.status === 0 || error.status === 429 || error.status >= 500);
      if (attempt >= 1 || !retryable) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
  }
};
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
      return { balanceKobo: 0, pinSet: false, transactions: [], ready: false };
    }
    throw err;
  }
};

export const walletDeposit = (amountKobo: number, reference = "", note = "") =>
  request<WalletOverview>("/wallet/deposit", {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference, note }),
  });

export const walletTransfer = (amountKobo: number, recipient: string, note = "", bankName = "", bankCode = "", pin = "") =>
  request<WalletOverview>("/wallet/transfer", {
    method: "POST",
    body: JSON.stringify({ amountKobo, recipient, note, bankName, bankCode, pin }),
  });

// ---------- Name enquiry (confirm who you're paying) ----------

export interface BankOption {
  name: string;
  code: string;
}

export interface VerifiedAccount {
  accountNumber: string;
  bankName: string;
  bankCode: string;
  accountHolderName: string;
}

export interface LookedUpUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export const listBanks = () =>
  request<BankOption[] | null>("/banks").then((b) => b ?? []);

/**
 * Resolve an account number to its holder's name so the sender can confirm the
 * destination before money moves. Throws ACCOUNT_NOT_FOUND when the account
 * does not exist at that bank.
 */
export const verifyBankAccount = (accountNumber: string, bankName = "", bankCode = "") =>
  request<VerifiedAccount>("/banks/verify", {
    method: "POST",
    body: JSON.stringify({ accountNumber, bankName, bankCode }),
  });

/** Resolve a PotKeeper email/phone to the account holder's name. */
export const lookupUser = (recipient: string) =>
  request<LookedUpUser>(`/users/lookup?recipient=${encodeURIComponent(recipient)}`);

/** A pot's dedicated collection account, resolved by account number. */
export interface PotAccount {
  groupId: string;
  groupName: string;
  accountNumber: string;
  bankName?: string;
  accountName?: string;
  /** True when the caller is an active member of the pot. */
  isMember: boolean;
  /** What the caller still owes the pot's open levy, if any. */
  outstandingKobo: number;
}

/**
 * Resolve a 10-digit account number to the pot that owns it (each pot has its
 * own collection account). Throws ACCOUNT_NOT_FOUND when no pot owns it.
 */
export const lookupPotAccount = (accountNumber: string) =>
  request<PotAccount>(`/pots/lookup?accountNumber=${encodeURIComponent(accountNumber)}`);

export const walletPayPot = (groupId: string, amountKobo: number, pin = "", levyId?: string) =>
  request<Payment>("/wallet/pay", {
    method: "POST",
    body: JSON.stringify({ groupId, amountKobo, levyId, pin }),
  });

/**
 * Set (or change) the transaction PIN that authorises sends. First-time setup
 * is confirmed with `password`; a change is confirmed with `currentPin`.
 */
export const setWalletPin = (pin: string, currentPin = "", password = "") =>
  request<{ pinSet: boolean }>("/wallet/pin", {
    method: "POST",
    body: JSON.stringify({ pin, currentPin, password }),
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
      treasuryHidden: false,
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

// ---------- Email verification, password reset, KYC, referrals ----------

export interface OtpResponse {
  sent: boolean;
  expiresAt?: string;
  /** Present only on demo deployments with no SMTP — lets the flow complete. */
  devCode?: string;
}

/** Ask for a sign-up verification code (or a password-reset one). */
export const sendOtp = (email: string, purpose: "signup" | "reset" = "signup") =>
  request<OtpResponse>("/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ email, purpose }),
  });

/** Consume the emailed code; marks the address verified and pays rewards. */
export const verifyOtp = (email: string, code: string, purpose: "signup" | "reset" = "signup") =>
  request<{ verified: boolean; user?: AuthUser }>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ email, code, purpose }),
  });

export const forgotPassword = (email: string) =>
  request<OtpResponse>("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const resetPassword = (email: string, code: string, password: string) =>
  request<{ reset: boolean }>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ email, code, password }),
  });

/** Submit an 11-digit BVN for identity verification (sandbox only). */
export const submitKyc = (bvn: string) =>
  request<AuthUser>("/auth/kyc", { method: "POST", body: JSON.stringify({ bvn }) });

export interface ReferralOverview {
  code: string;
  link: string;
  invited: number;
  verified: number;
  earnedKobo: number;
  rewardEachKobo: number;
  welcomeEachKobo: number;
}

export const getReferral = () => request<ReferralOverview>("/auth/referral");

// ---------- Discover public pots ----------

export interface DiscoverablePot {
  id: string;
  name: string;
  description?: string;
  category?: string;
  currency: string;
  potType: "goal" | "rotating";
  contributionAmountKobo: number;
  targetKobo: number;
  balanceKobo: number;
  members: number;
  open: boolean;
  joined: boolean;
  createdAt: string;
}

export const discoverPots = (q = "", category = "") =>
  request<DiscoverablePot[] | null>(
    `/pots/discover?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`
  ).then((p) => p ?? []);

/** Join a public pot directly — no invite code needed. */
export const joinPublicPot = (groupId: string) =>
  request<Group>(`/pots/${groupId}/join`, { method: "POST" });

// ---------- Scheduled & recurring transfers ----------

export interface ScheduleView {
  id: string;
  amountKobo: number;
  recipient?: string;
  bankName?: string;
  note?: string;
  groupId?: string;
  groupName?: string;
  executeAt: string;
  cadence: "once" | "weekly" | "monthly";
  status: "scheduled" | "completed" | "failed" | "cancelled";
  attempts: number;
  lastError?: string;
  createdAt: string;
}

export interface ScheduleInput {
  amountKobo: number;
  recipient?: string;
  bankName?: string;
  bankCode?: string;
  note?: string;
  /** Set instead of recipient to contribute into a pot. */
  groupId?: string;
  executeAt: string;
  cadence: "once" | "weekly" | "monthly";
  pin: string;
}

export const listSchedules = () =>
  request<ScheduleView[] | null>("/wallet/schedules").then((s) => s ?? []);

export const createSchedule = (input: ScheduleInput) =>
  request<ScheduleView>("/wallet/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const cancelSchedule = (id: string) =>
  request<ScheduleView>(`/wallet/schedules/${id}`, { method: "DELETE" });

// ---------- Notifications (server feed) ----------

export interface ServerNotification {
  id: string;
  groupId?: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export const listNotifications = (unreadOnly = false) =>
  request<ServerNotification[] | null>(`/notifications${unreadOnly ? "?unread=1" : ""}`).then(
    (n) => n ?? []
  );

export const markNotificationRead = (id: string) =>
  request<{ status: string }>(`/notifications/${id}/read`, { method: "POST" });

export const markAllNotificationsRead = () =>
  request<{ status: string }>("/notifications/read-all", { method: "POST" });

// ---------- Contribution journals (one per paid cycle) ----------

export interface JournalPayment {
  id: string;
  userId?: string;
  payerName?: string;
  amountKobo: number;
  status: string;
  method?: string;
  refunded: boolean;
  createdAt: string;
}

export interface JournalRow {
  userId: string;
  name: string;
  reference: string;
  state: "paid" | "partial" | "unpaid";
  paidKobo: number;
  amountKobo: number;
  payments: JournalPayment[];
}

export interface ContributionJournal {
  levyId: string;
  title: string;
  status: "open" | "closed";
  cadence: string;
  periodLabel: string;
  dueDate?: string;
  amountKobo: number;
  collectedKobo: number;
  expectedKobo: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  closingBalanceKobo: number;
  createdAt: string;
  rows: JournalRow[];
  payments: JournalPayment[];
}

export const listJournals = (groupId: string) =>
  request<ContributionJournal[] | null>(`/groups/${groupId}/journals`).then((j) => j ?? []);

export const getJournal = (groupId: string, levyId: string) =>
  request<ContributionJournal>(`/groups/${groupId}/journals/${levyId}`);

// ---------- Refunds & support ----------

/** Treasurer: return a member's contribution to their wallet. */
export const refundPayment = (groupId: string, paymentId: string) =>
  request<Payment>(`/groups/${groupId}/payments/${paymentId}/refund`, { method: "POST" });

export interface SupportCase {
  id: string;
  groupId: string;
  disputeId?: string;
  expenseRequestId?: string;
  raisedBy: string;
  subject: string;
  detail?: string;
  status: "open" | "resolved";
  resolvedAt?: string;
  createdAt: string;
}

/** Send a dispute to customer support (raiser or treasurer only). */
export const escalateDispute = (groupId: string, disputeId: string, note = "") =>
  request<SupportCase>(`/groups/${groupId}/disputes/${disputeId}/escalate`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

export const listSupportCases = (groupId: string) =>
  request<SupportCase[] | null>(`/groups/${groupId}/support-cases`).then((c) => c ?? []);

// ---------- Meta ----------

export interface AppMeta {
  appEnv: string;
  aiMode: "llm" | "rule-based";
  bmoniMode: "sandbox" | "mock";
  webhookConfigured: boolean;
}
export const getMeta = () => request<AppMeta>(`/meta`);
