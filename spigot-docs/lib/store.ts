export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  endpoint: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
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

function generateInitialRevenueHistory(): RevenuePoint[] {
  const history: RevenuePoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    history.push({
      date: date.toISOString().split('T')[0],
      amount: Math.round((Math.random() * 500 + 100) * 100) / 100,
    });
  }
  return history;
}

export function addTransaction(transaction: Transaction): void {
  getStore().transactions.unshift(transaction);
}

export function getTransactions(limit = 50): Transaction[] {
  return getStore().transactions.slice(0, limit);
}

export function addUsageLog(log: UsageLog): void {
  getStore().usageLogs.unshift(log);
}

export function getUsageLogs(limit = 100): UsageLog[] {
  return getStore().usageLogs.slice(0, limit);
}

export function getStats(): DashboardStats {
  const store = getStore();
  const totalRevenue = store.transactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCalls = store.usageLogs.length;
  const activeEndpoints = new Set(store.usageLogs.map((l) => l.endpoint)).size;

  const completedTransactions = store.transactions.filter(
    (t) => t.status === 'completed',
  );
  const avgSettlement =
    completedTransactions.length > 0
      ? completedTransactions.reduce((sum, t) => sum + t.amount, 0) /
        completedTransactions.length
      : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCalls,
    activeEndpoints,
    avgSettlement: Math.round(avgSettlement * 100) / 100,
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
