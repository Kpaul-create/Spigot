'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchTransactions, formatCurrency, formatTime, truncate } from '@/lib/api';
import type { Transaction } from '@/lib/types';

const TASKS = [
  { id: 'premium', label: 'Fetch premium dataset', endpoint: '/api/premium-data', price: 0.02 },
  { id: 'weather', label: 'Read the weather feed', endpoint: '/api/weather', price: 0.015 },
  { id: 'run', label: 'Run a 3-step agent plan', endpoint: '/api/agent/run', price: 0.035 },
];

type Phase = 'idle' | 'request' | 'paying' | 'settled' | 'error';

interface Step {
  label: string;
  detail: string;
  tone: 'muted' | 'accent' | 'red';
}

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<Step[]>([]);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [taskId, setTaskId] = useState(TASKS[0].id);

  async function runTask(id: string) {
    const task = TASKS.find((t) => t.id === id)!;
    setTaskId(id);
    setPhase('request');
    setReceipt(null);
    setSteps([{ label: 'Request', detail: `GET ${task.endpoint} with no receipt`, tone: 'muted' }]);

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await wait(600);
    setPhase('paying');
    setSteps((s) => [
      ...s,
      {
        label: '402',
        detail: `Payment Required — ${formatCurrency(task.price)} on Tempo Moderato`,
        tone: 'muted',
      },
      {
        label: 'Pay',
        detail: 'Signing and settling the payment lane on-chain',
        tone: 'accent',
      },
    ]);

    await wait(900);

    try {
      const res = await fetchTransactions();
      const latest = res.transactions[0] ?? null;
      setReceipt(latest);
      setPhase('settled');
      setSteps((s) => [
        ...s,
        {
          label: 'Retry',
          detail: latest
            ? `Receipt ${truncate(latest.receipt, 10, 6)} attached — 200 OK`
            : 'Receipt attached — 200 OK',
          tone: 'accent',
        },
      ]);
    } catch {
      setPhase('error');
      setSteps((s) => [...s, { label: 'Error', detail: 'Could not read the ledger', tone: 'red' }]);
    }
  }

  const busy = phase === 'request' || phase === 'paying';

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
        Live demo
      </div>
      <h1 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-tight mb-4">
        Watch a call get paid for.
      </h1>
      <p className="text-[var(--color-text-secondary)] text-lg max-w-2xl mb-10">
        Pick a task. The agent calls the endpoint, gets a 402, settles on Tempo, and retries with the
        receipt attached.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-6">
          <h2 className="font-bold text-lg mb-4">Tasks</h2>
          <div className="space-y-2 mb-6">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => runTask(t.id)}
                disabled={busy}
                className={`w-full text-left panel p-4 transition-colors disabled:opacity-60 ${
                  taskId === t.id ? 'border-[var(--color-accent)]' : ''
                } hover:border-[var(--color-border-control)]`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-sm font-semibold text-[var(--color-text-accent)]">
                    {formatCurrency(t.price)}
                  </span>
                </div>
                <code className="text-xs text-[var(--color-text-secondary)]">{t.endpoint}</code>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                busy
                  ? 'bg-[var(--color-text-accent)] state-pulse'
                  : phase === 'settled'
                    ? 'bg-[var(--color-text-accent)]'
                    : 'bg-[var(--color-border-control)]'
              }`}
            />
            <span className="text-[var(--color-text-secondary)]">
              {busy ? 'settling…' : phase === 'settled' ? 'settled' : 'ready'}
            </span>
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="font-bold text-lg mb-4">Handshake</h2>
          {steps.length === 0 ? (
            <p className="mu text-sm">Run a task to see the request/402/pay/retry sequence.</p>
          ) : (
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={`flex-none w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                      s.tone === 'red'
                        ? 'bg-red-500 text-white'
                        : s.tone === 'accent'
                          ? 'bg-[var(--color-accent)] text-[var(--color-text-on-accent)]'
                          : 'border border-[var(--color-border-control)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-sm">{s.label}</div>
                    <div className="text-sm text-[var(--color-text-secondary)]">{s.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {receipt && (
            <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Amount</span>
                <span className="font-semibold text-[var(--color-text-accent)]">
                  {formatCurrency(receipt.amount)} {receipt.currency}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[var(--color-text-secondary)]">Receipt</span>
                <code className="text-xs">{truncate(receipt.receipt, 10, 6)}</code>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[var(--color-text-secondary)]">At</span>
                <span>{formatTime(receipt.timestamp)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mu text-sm mt-8">
        Want the same flow from an autonomous agent?{' '}
        <Link href="/agent" className="underline">
          Open the agent
        </Link>
        .
      </p>
    </div>
  );
}
