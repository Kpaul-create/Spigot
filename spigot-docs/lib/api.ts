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

/**
 * Credits the agent against an already-settled inbound transfer.
 *
 * The body key is `txHash`, not `receipt`: the route reads the amount out of the
 * transaction's calldata and checks the funds arrived at the agent's own
 * address, so it needs a real 32-byte hash. It used to send `receipt` holding a
 * locally minted `demo_...` string, which the route rejected as a malformed
 * body on every single call.
 */
export function postAgentFund(amount: number, txHash: string): Promise<FundResponse> {
  return fetchAPI<FundResponse>('/api/agent/fund', {
    method: 'POST',
    body: JSON.stringify({ amount, txHash }),
  });
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** PathUSD has 6 decimals, so 6 is the most any display here can ever mean. */
export const TOKEN_DECIMALS = 6;

/**
 * How many fraction digits a number actually carries.
 *
 * Derived from the shortest representation that round-trips back to the same
 * double, so it reflects the value itself rather than a magnitude threshold.
 * `0.005` is written `5e-3`, which needs 3 decimals; `123.45` is `1.2345e+2`,
 * which needs 2. `1234.5` is `1.2345e+3`, so only 1 — but currency never shows
 * fewer than 2, hence the floor at the call site.
 */
function carriedDecimals(value: number, maxDecimals: number): number {
  // Snap to the token's precision first. Every real amount here is integer base
  // units over 10^6, so this is lossless for real data, and it stops binary
  // float artefacts from demanding seventeen fraction digits: without it,
  // `0.1 + 0.2` renders as `$0.300000` rather than `$0.30`.
  const rounded = Number(Math.abs(value).toFixed(maxDecimals));
  if (rounded === 0) return 0;

  const [mantissa, exponent] = rounded.toExponential().split('e');
  const fracLength = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fracLength - Number(exponent));
}

/**
 * Currency, with enough decimals that the amount survives the round trip.
 *
 * This previously chose 3dp below $1 and 2dp above it. That is the wrong rule
 * here: the settlement token has 6 decimals and the cheapest tool costs 5000
 * base units — $0.005, a twentieth of a cent — so 2dp cannot represent the
 * smallest payment the system is able to make. Rendering a wallet that spends
 * $0.005 per call at 2dp made the balance look frozen: paying twice, or fifty
 * times, printed the identical string, and it read as a fake payment.
 *
 * So the fraction digits now follow the value — enough to reach the digits it
 * genuinely has, never more than the token's 6, and never fewer than 2 so
 * ordinary amounts still look like ordinary amounts.
 */
export function formatCurrency(value: number, maxDecimals = TOKEN_DECIMALS): string {
  if (!Number.isFinite(value)) return '$0.00';
  if (value === 0) return '$0.00';

  const decimals = Math.min(maxDecimals, Math.max(2, carriedDecimals(value, maxDecimals)));

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * A wallet balance, shown exactly at the token's precision.
 *
 * A balance is the one figure where hiding the fraction is actively misleading.
 * PathUSD resolves to 6 decimals, and the agent spends hundredths of a cent per
 * call, so truncating the tail produces a number that provably does not move
 * when money leaves — which is exactly what makes the payment look like a trick.
 * The odd-looking trailing digits on a large balance are the honest reading of
 * a 6-decimal token, and they are what changes when the agent pays.
 *
 * Nullish and non-finite values render as an em dash: an unreadable chain call
 * is reported as missing, never as $0.00.
 */
export function formatBalance(
  value: number | null | undefined,
  decimals = TOKEN_DECIMALS,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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
