/**
 * Client-side types mirroring the Next.js route handlers.
 *
 * Kept in one place so pages never hand-roll response shapes.
 */

/** One entry from `GET /api/directory`. */
export interface Endpoint {
  path: string;
  method: 'GET' | 'POST';
  description: string;
  price: number;
}

/** `GET /api/directory` */
export interface DirectoryResponse {
  endpoints: Endpoint[];
}

/** `GET /api/dashboard/stats` */
export interface DashboardStats {
  totalRevenue: number;
  totalCalls: number;
  activeEndpoints: number;
  avgSettlement: number;
  revenueHistory: RevenuePoint[];
}

export interface RevenuePoint {
  date: string;
  amount: number;
}

/** `GET /api/dashboard/transactions` */
export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  endpoint: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  /** On-chain hash, when the payment settled. Absent on failures. */
  txHash?: string;
  /** Block the transfer confirmed in. */
  blockNumber?: string;
  /** Address the funds came from. */
  payer?: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
}

/** `GET /api/agent/status` */
export interface AgentTool {
  name: string;
  description: string;
  cost: number;
}

export interface AgentStatus {
  /** Wallet the agent pays from, and whether it can sign at all. */
  wallet: {
    configured: boolean;
    address?: string;
    /**
     * Spendable TIP-20 balance — the currency payments settle in. Null when the
     * chain read failed.
     */
    balance?: number | null;
    /** Symbol `balance` is denominated in, e.g. `PathUSD`. */
    balanceToken?: string;
    /**
     * Decimals `balance` is denominated in (PathUSD: 6). The UI needs this to
     * avoid formatting a balance that hides every payment it makes.
     */
    balanceDecimals?: number;
    /** Address settled payments are sent to, null until configured. */
    settlementAddress?: string | null;
    /** Whether a valid merchant destination was explicitly configured. */
    merchantConfigured: boolean;
    /** True when `settlementAddress` destroys the funds sent to it. */
    settlesToBurnAddress?: boolean;
    /** Whether the current signer can broadcast app payments. */
    settlementSupported: boolean;
    /** True only when signer, merchant destination, and broadcaster are ready. */
    paymentsReady: boolean;
    /** Why the balance could not be read, when it could not. */
    balanceError?: string;
    error?: string;
  };
  model: {
    provider: string;
    model: string;
    /** Resolved OpenAI-compatible host, absent when the SDK default is used. */
    baseUrl?: string;
    configured: boolean;
  };
  tools: AgentTool[];
  /** Symbol of the TIP-20 the agent spends by default. */
  defaultToken: string;
  network: { chainId: number; name: string; rpcUrl: string };
}

/** `POST /api/agent/chat` */
export interface ChatResponse {
  text: string;
  toolsUsed: string[];
  cost: number;
  durationMs: number;
}

/**
 * `POST /api/agent/run`
 *
 * This used to declare `result`, `steps: AgentStep[]` and `cost`. The route has
 * never sent any of them — `runAgent` returns `answer`, a numeric `steps` count,
 * `totalSpent` and `network` — so any consumer typed against this shape read
 * `undefined` for all three.
 */
export interface RunResponse {
  threadId: string;
  agentId: string;
  /** The model's summary of the paid call, or the error if the run failed. */
  answer: string;
  /** Which paid endpoint was settled for, or null if none was needed. */
  toolUsed: string | null;
  /** Receipt for the settlement, for on-chain inspection. */
  receipt: string | null;
  /** USD actually broadcast, not a budget. */
  totalSpent: number;
  /** Set on failure; `totalSpent` still reflects what was spent before it. */
  error: string | null;
  /** Graph iterations. */
  steps: number;
  network: string;
  durationMs: number;
}

/** `POST /api/agent/fund` */
export interface FundResponse {
  success: boolean;
  /** Amount credited, read from on-chain calldata rather than the request. */
  credited: number;
  token: string;
  txHash: string;
  blockNumber?: string;
  from?: string;
  explorerUrl: string;
}

/** A chat bubble in the agent UI. */
export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  cost?: number;
}
