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
  initialized: boolean;
  state: 'idle' | 'running' | 'error';
  credits: number;
  totalCalls: number;
  totalCost: number;
  tools: AgentTool[];
}

/** `POST /api/agent/chat` */
export interface ChatResponse {
  text: string;
  toolsUsed: string[];
  cost: number;
  durationMs: number;
}

/** `POST /api/agent/run` */
export interface AgentStep {
  tool: string;
  detail: string;
  cost: number;
  durationMs: number;
}

export interface RunResponse {
  result: string;
  steps: AgentStep[];
  cost: number;
  durationMs: number;
}

/** `POST /api/agent/fund` */
export interface FundResponse {
  success: boolean;
  added: number;
  balance: number;
  paymentId: string;
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
