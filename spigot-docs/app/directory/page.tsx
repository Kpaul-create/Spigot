'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchDirectory, formatCurrency } from '@/lib/api';
import type { Endpoint } from '@/lib/types';

const CATEGORIES = ['All', 'AI', 'Data', 'Compute', 'Media', 'Finance'] as const;

/** Derive a display category from the path since the API does not label one. */
function categoryOf(ep: Endpoint): string {
  if (/agent/.test(ep.path)) return 'AI';
  if (/premium|weather/.test(ep.path)) return 'Data';
  if (/pay/.test(ep.path)) return 'Finance';
  return 'Compute';
}

export default function DirectoryPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');

  useEffect(() => {
    fetchDirectory()
      .then((res) => setEndpoints(res.endpoints))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const visible = useMemo(
    () =>
      (endpoints ?? [])
        .filter((ep) => category === 'All' || categoryOf(ep) === category)
        .sort((a, b) => b.price - a.price),
    [endpoints, category],
  );

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
        Directory
      </div>
      <h1 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-tight mb-4">
        Endpoints you can call right now.
      </h1>
      <p className="text-[var(--color-text-secondary)] text-lg max-w-2xl mb-8">
        Protected routes answer <code className="text-sm">402 Payment Required</code> until the request
        carries a settled receipt. No accounts, no API keys.
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              category === c
                ? 'bg-[var(--color-accent)] text-[var(--color-text-on-accent)] border-transparent font-medium'
                : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-control)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-6">Could not load the directory: {error}</p>}
      {!endpoints && !error && <p className="mu text-sm">Loading endpoints…</p>}

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)] text-left">
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Endpoint</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Method</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Category</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)] text-right">
                Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {visible.map((ep) => (
              <tr key={ep.path} className="hover:bg-[var(--color-bg-page)]">
                <td className="px-4 py-3">
                  <code className="text-[var(--color-text-primary)]">{ep.path}</code>
                  <p className="text-xs text-[var(--color-text-secondary)]">{ep.description}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs font-mono border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]">
                    {ep.method}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">{categoryOf(ep)}</td>
                <td className="px-4 py-3 text-right">
                  {ep.price > 0 ? (
                    <span className="font-semibold text-[var(--color-text-accent)]">
                      {formatCurrency(ep.price)}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-secondary)]">free</span>
                  )}
                </td>
              </tr>
            ))}
            {endpoints && visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center mu text-sm">
                  No endpoints in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mu text-sm mt-6">
        Want to sell your own endpoint?{' '}
        <Link href="/docs" className="underline">
          Read the quickstart
        </Link>{' '}
        or{' '}
        <Link href="/demo" className="underline">
          watch a live settlement
        </Link>
        .
      </p>
    </div>
  );
}
