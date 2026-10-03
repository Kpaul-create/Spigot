/**
 * Canonical prices for the paid endpoints.
 *
 * These were previously written out in four places -- the two route handlers,
 * the agent's tool list, and the directory/demo UIs -- and had already drifted:
 * the directory and the demo page advertised weather at $0.015 while the
 * paywall charged $0.005, so an agent that priced its call off the directory
 * overpaid 3x.
 *
 * Route handlers, the agent and the UIs all read from here, so a price change
 * is one edit. Import this from server routes, client components and the agent
 * alike; it has no server-only imports.
 */
export interface PricedEndpoint {
  path: string;
  /** Price per call in USD. `0` means the endpoint is free. */
  price: number;
  description: string;
  /** Whether the endpoint enforces a `Payment-Receipt`. */
  paid: boolean;
}

export const ENDPOINT_PRICES = {
  '/api/weather': 0.005,
  '/api/premium-data': 0.02,
} as const satisfies Record<string, number>;

export type PaidEndpointPath = keyof typeof ENDPOINT_PRICES;

/**
 * Reads a price, or `undefined` when the endpoint is not paid.
 *
 * Used by the paid routes so the amount they enforce and the amount they
 * advertise can never disagree.
 */
export function priceOf(path: string): number | undefined {
  return (ENDPOINT_PRICES as Record<string, number>)[path];
}