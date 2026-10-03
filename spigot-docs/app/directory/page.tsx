'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
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
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyEndpoint(path: string) {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
      setCopiedEndpoint(path);
      setCopyError(null);
    } catch {
      setCopyError('Clipboard access is unavailable in this browser.');
    }
  }

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

      <div className="hidden sm:block panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)] text-left">
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Endpoint</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Method</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Category</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)] text-right">
                Price
              </th>
              <th className="px-4 py-3" aria-label="Copy endpoint" />
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
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void copyEndpoint(ep.path)}
                    aria-label={copiedEndpoint === ep.path ? `Copied ${ep.path} URL` : `Copy ${ep.path} URL`}
                    title={copiedEndpoint === ep.path ? 'Copied URL' : 'Copy full URL'}
                    className="inline-grid size-9 place-items-center rounded-lg border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-control)] hover:text-[var(--color-text-primary)]"
                  >
                    {copiedEndpoint === ep.path ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </td>
              </tr>
            ))}
            {endpoints && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center mu text-sm">
                  No endpoints in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden divide-y divide-[var(--color-border-subtle)] border-y border-[var(--color-border-subtle)]">
        {visible.map((ep) => (
          <article key={ep.path} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <code className="min-w-0 whitespace-nowrap text-xs text-[var(--color-text-primary)]">{ep.path}</code>
                  <button
                    type="button"
                    onClick={() => void copyEndpoint(ep.path)}
                    aria-label={copiedEndpoint === ep.path ? `Copied ${ep.path} URL` : `Copy ${ep.path} URL`}
                    title={copiedEndpoint === ep.path ? 'Copied URL' : 'Copy full URL'}
                    className="grid size-8 flex-none place-items-center rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                  >
                    {copiedEndpoint === ep.path ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{ep.description}</p>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--color-text-accent)]">
                {ep.price > 0 ? formatCurrency(ep.price) : 'Free'}
              </span>
            </div>
            <div className="mt-3 flex gap-2 text-xs text-[var(--color-text-secondary)]">
              <span className="rounded-md border border-[var(--color-border-subtle)] px-2 py-1 font-mono">
                {ep.method}
              </span>
              <span className="rounded-md border border-[var(--color-border-subtle)] px-2 py-1">
                {categoryOf(ep)}
              </span>
            </div>
          </article>
        ))}
        {endpoints && visible.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            No endpoints in this category.
          </p>
        )}
      </div>

      {copyError && (
        <p className="mt-3 text-xs text-red-500" role="status">
          {copyError}
        </p>
      )}

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
