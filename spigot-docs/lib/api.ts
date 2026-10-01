import type {
  AgentStatus,
  ChatResponse,
  DashboardStats,
  DirectoryResponse,
  FundResponse,
  RunResponse,
  TransactionsResponse,
} from './types';

/**
 * Thin fetch wrapper for the app's own route handlers.
 *
 * Everything is same-origin, so relative paths only. `APIError` carries the
 * HTTP status so callers can branch on `402` specifically.
 */
export class APIError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.body = body;
  }
}

async function fetchAPI<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (networkError) {
    throw new APIError(
      `Network error: ${networkError instanceof Error ? networkError.message : 'unknown'}`,
      0,
      null,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new APIError(message, response.status, body);
  }

  return body as T;
}

export function fetchDirectory(): Promise<DirectoryResponse> {
  return fetchAPI<DirectoryResponse>('/api/directory');
}

export function fetchDashboardStats(): Promise<DashboardStats> {
  return fetchAPI<DashboardStats>('/api/dashboard/stats');
}

export function fetchTransactions(): Promise<TransactionsResponse> {
  return fetchAPI<TransactionsResponse>('/api/dashboard/transactions');
}

export function fetchAgentStatus(): Promise<AgentStatus> {
  return fetchAPI<AgentStatus>('/api/agent/status');
}

export function postAgentChat(message: string): Promise<ChatResponse> {
  return fetchAPI<ChatResponse>('/api/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function postAgentRun(task: string): Promise<RunResponse> {
  return fetchAPI<RunResponse>('/api/agent/run', {
    method: 'POST',
    body: JSON.stringify({ task }),
  });
}

export function postAgentFund(amount: number, receipt: string): Promise<FundResponse> {
  return fetchAPI<FundResponse>('/api/agent/fund', {
    method: 'POST',
    body: JSON.stringify({ amount, receipt }),
  });
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

export function truncate(value: string, head = 8, tail = 4): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
