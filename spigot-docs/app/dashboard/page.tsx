'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchDashboardStats,
  fetchTransactions,
  formatCurrency,
  formatNumber,
  formatTime,
  truncate,
} from '@/lib/api';
import type { DashboardStats, Transaction } from '@/lib/types';

const REFRESH_MS = 15_000;

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const w = 600;
  const h = 140;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 20) - 10;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" role="img" aria-label="Revenue over time">
      <defs>
        <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#revfill)" />
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
    </svg>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([fetchDashboardStats(), fetchTransactions()]);
      setStats(s);
      setTransactions(t.transactions);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch {
      // leave the last good data on screen; the server may be restarting
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const cards = [
    { label: 'Revenue', value: formatCurrency(stats?.totalRevenue ?? 0) },
    { label: 'Calls', value: formatNumber(stats?.totalCalls ?? 0) },
    { label: 'Active endpoints', value: formatNumber(stats?.activeEndpoints ?? 0) },
    { label: 'Avg settlement', value: formatCurrency(stats?.avgSettlement ?? 0) },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
            Dashboard
          </div>
          <h1 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-tight">
            Money in, calls out.
          </h1>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Auto-refreshes every {REFRESH_MS / 1000}s
          {updatedAt ? ` · updated ${updatedAt}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <span className="block text-2xl font-extrabold tabular-nums">{c.value}</span>
            <span className="text-sm text-[var(--color-text-secondary)]">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="panel p-6 mb-10">
        <h2 className="font-bold text-lg mb-4">Revenue, last 30 days</h2>
        <Sparkline points={(stats?.revenueHistory ?? []).map((p) => p.amount)} />
      </div>

      <div className="panel overflow-hidden">
        <h2 className="font-bold text-lg px-5 py-4 border-b border-[var(--color-border-subtle)]">
          Recent settlements
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-left">
                <th className="px-5 py-3 font-medium text-[var(--color-text-secondary)]">Time</th>
                <th className="px-5 py-3 font-medium text-[var(--color-text-secondary)]">Endpoint</th>
                <th className="px-5 py-3 font-medium text-[var(--color-text-secondary)]">Receipt</th>
                <th className="px-5 py-3 font-medium text-[var(--color-text-secondary)]">Amount</th>
                <th className="px-5 py-3 font-medium text-[var(--color-text-secondary)]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--color-bg-page)]">
                  <td className="px-5 py-3 text-[var(--color-text-secondary)] tabular-nums">
                    {formatTime(t.timestamp)}
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-xs">{t.endpoint}</code>
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-xs text-[var(--color-text-secondary)]">
                      {truncate(t.receipt)}
                    </code>
                  </td>
                  <td className="px-5 py-3 font-semibold text-[var(--color-text-accent)] tabular-nums">
                    {formatCurrency(t.amount)} {t.currency}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        t.status === 'completed'
                          ? 'bg-[var(--color-accent)] text-[var(--color-text-on-accent)]'
                          : 'border border-[var(--color-border-control)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center mu text-sm">
                    No settlements yet. Run the{' '}
                    <a href="/demo" className="underline">
                      live demo
                    </a>{' '}
                    to produce one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
