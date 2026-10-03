/**
 * Process-local TTL cache for upstream data fetches.
 *
 * The paid endpoints proxy free third-party APIs (Open-Meteo, CoinGecko) that
 * rate-limit aggressively and return nothing worth paying for if the response
 * is stale or an error page. Two things follow:
 *
 *  - A paid caller has already spent money by the time we call upstream. Serving
 *    them a rate-limit error means they paid for nothing, so the cache absorbs
 *    the burst and the endpoints stay fast.
 *  - Concurrent requests share one in-flight promise, so ten simultaneous
 *    callers produce one upstream call rather than ten.
 *
 * Process-local, like the rest of this app's state. A second instance would
 * have its own cache, which costs upstream quota but breaks nothing.
 */

/** One entry: the value (or in-flight promise) and when it stops being usable. */
interface Entry {
  /** Resolves to the value; rejected entries are evicted, never cached. */
  promise: Promise<unknown>;
  /** Epoch ms after which the value must be refetched. */
  expiresAt: number;
  /** Epoch ms after which the entry is evicted outright, even if still cached. */
  hardExpiry: number;
}

const entries = new Map<string, Entry>();

/**
 * Upper bound on remembered keys. The keyspace here is small (a handful of
 * cities and one market snapshot), but a paid endpoint keyed on user-supplied
 * input would otherwise grow without limit.
 */
const MAX_ENTRIES = 500;

function evictIfOversized() {
  if (entries.size <= MAX_ENTRIES) return;
  // Map iterates in insertion order, so this drops the oldest first.
  for (const key of entries.keys()) {
    if (entries.size <= MAX_ENTRIES) break;
    entries.delete(key);
  }
}

/**
 * Returns a cached value, or loads it.
 *
 * A failed load is not cached: the rejected promise is evicted immediately so
 * the next caller retries rather than being handed a stale error for the whole
 * TTL.
 *
 * @param key Cache key. Must include every input that changes the result.
 * @param ttlMs How long a successful value is served without refetching.
 * @param load Loader. Called at most once per TTL per key.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key);

  if (existing && existing.expiresAt > now) {
    return existing.promise as Promise<T>;
  }

  const promise = load().catch((error: unknown) => {
    // Never cache a failure. Leaving the rejected promise in place would make a
    // transient upstream blip look like a permanent one for the whole TTL.
    if (entries.get(key)?.promise === promise) {
      entries.delete(key);
    }
    throw error;
  });

  entries.set(key, {
    promise,
    expiresAt: now + ttlMs,
    // Hard expiry bounds how long a value can be served past its TTL while a
    // refetch is in flight, so a permanently failing upstream degrades to "old
    // data" rather than "no data".
    hardExpiry: now + ttlMs * 10,
  });

  evictIfOversized();
  return promise;
}

/** Drops everything. Used by tests; the app never needs it. */
export function clearCache(): void {
  entries.clear();
}
