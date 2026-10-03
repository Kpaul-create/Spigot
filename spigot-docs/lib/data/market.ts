/**
 * Real market data for the paid `/api/premium-data` endpoint.
 *
 * This endpoint used to return the literal string
 * `'This is exclusive premium content available only to paying users.'` — the
 * placeholder text was the payload. It now returns a live crypto market
 * snapshot, which is what makes a $0.02 charge defensible.
 *
 * CoinGecko's public endpoints need no key for this volume. If you need a higher
 * rate limit, set `COINGECKO_API_KEY` and it is sent as a bearer token; without
 * it the free tier applies.
 */
import { cached } from './cache';

const SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';

/**
 * Market snapshots are quoted continuously, so a short TTL is right. 60s is
 * well inside the free tier's allowance for this request volume and keeps the
 * data close to live.
 */
const SNAPSHOT_TTL_MS = 60 * 1000;

/** Tracked assets. Deliberately short: every extra id is upstream quota. */
const TRACKED = ['bitcoin', 'ethereum', 'solana'] as const;

export interface TrackedAsset {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  marketCapUsd: number;
  volume24hUsd: number;
}

export interface MarketSnapshot {
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  btcDominancePct: number;
  ethDominancePct: number;
  activeCryptocurrencies: number;
  /** Global market change over 24h, percent. Null when upstream omits it. */
  marketChange24hPct: number | null;
  assets: TrackedAsset[];
  observedAt: string;
}

/**
 * Fetches JSON with a timeout.
 *
 * The caller has already paid, so an upstream hang must not hold the request
 * open indefinitely.
 */
async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const key = process.env.COINGECKO_API_KEY;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

interface RawPrice {
  usd?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  usd_24h_change?: number;
  usd_market_cap_change_24h?: number;
}

/** Display names, which `/simple/price` does not return. */
const DISPLAY_NAMES: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  solana: { symbol: 'SOL', name: 'Solana' },
};

/**
 * A live market snapshot.
 *
 * @throws when upstream fails or omits the fields that make the payload
 * meaningful. Callers must let this propagate: a paid endpoint that reports a
 * stale or invented market is a liability, not a fallback.
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const ids = TRACKED.join(',');

  return cached('market:snapshot', SNAPSHOT_TTL_MS, async () => {
    const [prices, global] = (await Promise.all([
      fetchJson(
        `${SIMPLE_PRICE_URL}?ids=${ids}` +
          '&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true' +
          '&include_24hr_change=true',
      ) as Promise<Record<string, RawPrice>>,
      fetchJson(GLOBAL_URL) as Promise<{
        data?: {
          total_market_cap?: { usd?: number };
          total_volume?: { usd?: number };
          market_cap_percentage?: { btc?: number; eth?: number };
          active_cryptocurrencies?: number;
          market_cap_change_percentage_24h_usd?: number;
        };
      }>,
    ])) as [Record<string, RawPrice>, { data?: Record<string, unknown> }];

    const assets: TrackedAsset[] = TRACKED.flatMap((id) => {
      const quote = prices[id];
      if (!quote || typeof quote.usd !== 'number') return [];

      const display = DISPLAY_NAMES[id];
      return [
        {
          id,
          symbol: display?.symbol ?? id.toUpperCase(),
          name: display?.name ?? id,
          priceUsd: quote.usd,
          change24hPct: quote.usd_24h_change ?? 0,
          marketCapUsd: quote.usd_market_cap ?? 0,
          volume24hUsd: quote.usd_24h_vol ?? 0,
        },
      ];
    });

    // No usable quotes means the snapshot is not worth billing for.
    if (assets.length === 0) {
      throw new Error('Upstream returned no usable price data');
    }

    const dominance = global.data?.market_cap_percentage as
      | { btc?: number; eth?: number }
      | undefined;

    return {
      totalMarketCapUsd: (global.data?.total_market_cap as { usd?: number })?.usd ?? 0,
      totalVolume24hUsd: (global.data?.total_volume as { usd?: number })?.usd ?? 0,
      btcDominancePct: dominance?.btc ?? 0,
      ethDominancePct: dominance?.eth ?? 0,
      activeCryptocurrencies: (global.data?.active_cryptocurrencies as number) ?? 0,
      marketChange24hPct:
        typeof global.data?.market_cap_change_percentage_24h_usd === 'number'
          ? global.data.market_cap_change_percentage_24h_usd
          : null,
      assets,
      observedAt: new Date().toISOString(),
    };
  });
}
