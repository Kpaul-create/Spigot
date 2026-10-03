export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  endpoint: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  /**
   * On-chain hash, when the payment actually settled.
   *
   * Present so a settlement can be looked up independently instead of being
   * taken on the app's word. Absent on failed attempts.
   */
  txHash?: string;
  /** Block the transfer confirmed in, as a string so it survives JSON. */
  blockNumber?: string;
  /** Address the funds came from. */
  payer?: string;
}

export interface UsageLog {
  id: string;
  endpoint: string;
  method: string;
  timestamp: string;
  durationMs: number;
  cost: number;
  receipt?: string;
}

export interface RevenuePoint {
  date: string;
  amount: number;
}

export interface DashboardStats {
  totalRevenue: number;
  totalCalls: number;
  activeEndpoints: number;
  avgSettlement: number;
  revenueHistory: RevenuePoint[];
}

// In-memory store (singleton across hot reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var __spigotStore: {
    transactions: Transaction[];
    usageLogs: UsageLog[];
    revenueHistory: RevenuePoint[];
  } | undefined;
}

function getStore() {
  if (!globalThis.__spigotStore) {
    globalThis.__spigotStore = {
      transactions: [],
      usageLogs: [],
      revenueHistory: generateInitialRevenueHistory(),
    };
  }
  return globalThis.__spigotStore;
}

/**
 * Seeds a 30-day window of zeroed buckets, oldest first.
 *
 * These used to be filled with `Math.random() * 500 + 100` on first request and
 * never updated, so the dashboard showed a healthy-looking revenue curve that
 * was fabricated and stayed frozen no matter how much was actually settled.
 * Real settlements now accumulate into these buckets via `recordRevenue`, so an
 * empty store renders as an empty chart rather than a lie.
 */
function generateInitialRevenueHistory(): RevenuePoint[] {
  const history: RevenuePoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    history.push({ date: date.toISOString().slice(0, 10), amount: 0 });
  }
  return history;
}

/**
 * Caps on the in-memory arrays.
 *
 * Both lists were `unshift`ed with no bound, so every paid call grew the
 * process heap forever in a long-lived server. Only the newest entries are ever
 * read back (`getTransactions` defaults to 50, `getUsageLogs` to 100), so
 * trimming the tail loses nothing any caller can observe.
 */
const MAX_TRANSACTIONS = 1000;
const MAX_USAGE_LOGS = 2000;

/** How many days of revenue history the dashboard chart shows. */
const REVENUE_HISTORY_DAYS = 30;

export function addTransaction(transaction: Transaction): void {
  const store = getStore();
  store.transactions.unshift(transaction);
  if (store.transactions.length > MAX_TRANSACTIONS) {
    store.transactions.length = MAX_TRANSACTIONS;
  }

  // Fold real settlements into the revenue history. `addRevenuePoint` existed but
  // was never called from anywhere, so the dashboard's 30-day sparkline was
  // permanently the random seed from `generateInitialRevenueHistory()`.
  if (isMerchantRevenue(transaction)) {
    recordRevenue(transaction);
  }
}

/** YYYY-MM-DD in UTC, matching the shape `generateInitialRevenueHistory` seeds. */
function revenueDate(iso: string): string {
  return iso.slice(0, 10);
}

function recordRevenue(transaction: Transaction): void {
  const store = getStore();
  const date = revenueDate(transaction.timestamp);
  const existing = store.revenueHistory.findIndex((p) => p.date === date);

  if (existing >= 0) {
    // Accumulate rather than overwrite: several settlements land on one day,
    // and replacing the point lost all but the last.
    store.revenueHistory[existing] = {
      date,
      amount: store.revenueHistory[existing].amount + transaction.amount,
    };
    return;
  }

  store.revenueHistory.push({ date, amount: transaction.amount });

  // Keep the window bounded and sorted oldest-first, which is the order the
  // dashboard chart expects.
  if (store.revenueHistory.length > REVENUE_HISTORY_DAYS) {
    store.revenueHistory.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    store.revenueHistory.splice(0, store.revenueHistory.length - REVENUE_HISTORY_DAYS);
  }
}

export function getTransactions(limit = 50): Transaction[] {
  return getStore().transactions.slice(0, limit);
}

export function addUsageLog(log: UsageLog): void {
  const store = getStore();
  store.usageLogs.unshift(log);
  if (store.usageLogs.length > MAX_USAGE_LOGS) {
    store.usageLogs.length = MAX_USAGE_LOGS;
  }
}

export function getUsageLogs(limit = 100): UsageLog[] {
  return getStore().usageLogs.slice(0, limit);
}

/**
 * Transactions that represent money the merchant earned from serving a paid
 * endpoint.
 *
 * `/api/agent/fund` is deliberately excluded: those rows are transfers *into*
 * the agent's own wallet to top up its balance, so counting them as revenue
 * double-counted every dollar as both spend and income.
 */
function isMerchantRevenue(t: Transaction): boolean {
  return t.status === 'completed' && t.endpoint !== '/api/agent/fund';
}

export function getStats(): DashboardStats {
  const store = getStore();

  const revenue = store.transactions.filter(isMerchantRevenue);
  const totalRevenue = revenue.reduce((sum, t) => sum + t.amount, 0);

  const totalCalls = store.usageLogs.length;
  const activeEndpoints = new Set(store.usageLogs.map((l) => l.endpoint)).size;

  const avgSettlement =
    revenue.length > 0 ? totalRevenue / revenue.length : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 1_000_000) / 1_000_000,
    totalCalls,
    activeEndpoints,
    avgSettlement: Math.round(avgSettlement * 1_000_000) / 1_000_000,
    revenueHistory: store.revenueHistory,
  };
}

export function addRevenuePoint(point: RevenuePoint): void {
  const store = getStore();
  const existing = store.revenueHistory.findIndex((p) => p.date === point.date);
  if (existing >= 0) {
    store.revenueHistory[existing] = point;
  } else {
    store.revenueHistory.push(point);
  }
}
