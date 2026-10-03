'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { HeroScene } from '@/components/hero-scene';
import { fetchTransactions, truncate } from '@/lib/api';
import type { Transaction } from '@/lib/types';

export default function HomePage() {
  const [ledger, setLedger] = useState<Transaction[]>([]);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.hidden) return;
      if (liveRef.current) {
        const rect = liveRef.current.getBoundingClientRect();
        if (rect.top >= window.innerHeight || rect.bottom <= 0) return;
      }

      try {
        const res = await fetchTransactions();
        if (!cancelled) setLedger(res.transactions.slice(0, 7));
      } catch {
        // Keep the last successful list in place.
      }
    };

    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const valueProps = [
    {
      title: 'Instant, auditable payments',
      desc: 'Spend real stablecoin with a signed transfer and a receipt that is checked on-chain before data is served.',
    },
    {
      title: 'Built for autonomous APIs',
      desc: 'Give agents a clear call price, an HTTP 402 handshake, and a receipt to present when redeeming a request.',
    },
    {
      title: 'Auditable settlement records',
      desc: 'Clear call prices and transaction receipts make payments easier to inspect while you build your production controls.',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Ask for the price',
      desc: 'The client calls the endpoint with no receipt and receives a 402 response telling it the exact price and route.',
    },
    {
      step: '02',
      title: 'Settle on Tempo',
      desc: 'The agent sends the on-chain payment and receives a signed receipt proving exactly what was paid for.',
    },
    {
      step: '03',
      title: 'Redeem the call',
      desc: 'The same endpoint re-verifies the receipt against the chain and only then serves the data payload.',
    },
  ];

  return (
    <div className="relative z-10 overflow-hidden">
      <section className="hero-glow relative overflow-hidden">
        <HeroScene />
        <div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-20 lg:pb-28 lg:pt-24">
          <div className="hero-grid grid items-center gap-10">
            <div className="max-w-2xl lg:pl-[max(20px,6vw)]">
              <div className="mb-4 inline-flex items-center rounded-full border border-[var(--color-border-control)] bg-[var(--color-bg-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-accent)] backdrop-blur-sm">
                Payments for autonomous software
              </div>
              <h1 className="text-[clamp(44px,6vw,88px)] font-black leading-[0.92] tracking-[-0.06em] text-[var(--color-text-primary)]">
                Pay-per-call infrastructure for AI that works.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--color-text-secondary)] md:text-xl">
                Spigot turns any API into a clear, machine-readable product. Agents pay for what they need,
                in real time, with receipts you can audit and a commerce layer that feels native to software.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/agent"
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] shadow-[0_12px_32px_-18px_rgba(29,138,104,0.9)] transition-opacity hover:opacity-90"
                >
                  Launch the agent
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-control)] bg-[var(--color-bg-surface)] px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/30"
                >
                  Try the live demo
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-5 text-sm text-[var(--color-text-secondary)]">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />Receipts verified on-chain</span>
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />Real stablecoin settlement</span>
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />Simple API integration</span>
              </div>
            </div>

            <div className="hidden lg:flex lg:justify-end">
              <div className="w-full max-w-md rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/70 p-6 shadow-[0_35px_80px_-40px_rgba(12,26,18,0.55)] backdrop-blur-sm">
                <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-secondary)]">
                  Example request
                </div>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">weather endpoint</div>
                    <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--color-text-accent)]">$0.005</div>
                    <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Price returned before payment</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-4">
                      <div className="text-[var(--color-text-secondary)]">Handshake</div>
                      <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">402 → pay</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-4">
                      <div className="text-[var(--color-text-secondary)]">Then</div>
                      <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">Redeem</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:py-20" data-reveal>
        <div className="mb-8 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-accent)]">
          Why teams use it
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {valueProps.map((item) => (
            <div key={item.title} className="card card-hover p-7">
              <h3 className="text-xl font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:py-20" data-reveal>
        <div className="mb-8 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-accent)]">
          Simple integration
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((item) => (
            <div key={item.step} className="card card-hover p-7">
              <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-accent)]">{item.step}</div>
              <h3 className="text-2xl font-bold tracking-[-0.05em] text-[var(--color-text-primary)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 md:py-20" data-reveal>
        <div className="card p-6 md:p-8">
          <div className="mb-5 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-accent)]">
            Ready to ship
          </div>
          <h2 className="text-[clamp(28px,4vw,44px)] font-black leading-[1.02] tracking-[-0.05em] text-[var(--color-text-primary)]">
            Put a price on every tool call and give your agent a clean checkout.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            Spigot is designed for real products: clear prices, auditable settlement, easy tool registration,
            and a way to let autonomous software pay without fragile approval workflows.
          </p>
          <pre className="mt-8 overflow-x-auto rounded-2xl border border-[var(--color-border-subtle)] bg-[#0d120e] p-4 text-sm leading-7 text-[#d9f9e8]">
            <code>{`curl -i http://localhost:3000/api/weather?city=Oslo
# 402 Payment Required {"price":0.005,"currency":"USD"}

curl -X POST http://localhost:3000/api/pay \
  -H 'content-type: application/json' \
  -d '{"amount":0.005,"endpoint":"/api/weather"}'

curl -H 'Payment-Receipt: <receipt>' http://localhost:3000/api/weather?city=Oslo`}</code>
          </pre>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-5 py-12 md:py-20" data-reveal ref={liveRef}>
        <div className="mb-5 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-accent)]">
          Settlement ledger
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-black leading-[1.05] tracking-[-0.05em] text-[var(--color-text-primary)]">
          Every call, settled and visible.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
          A live, process-local stream of the payments this instance is actually handling. The data is real,
          auditable, and designed to make agent spending feel transparent rather than magical.
        </p>

        <div className="mt-8 card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--color-border-subtle)] px-5 py-3 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-text-secondary)] sm:grid-cols-[auto_1fr_auto_auto]">
            <span>Payer</span>
            <span className="hidden sm:block">Endpoint</span>
            <span className="text-right">Settled</span>
            <span className="hidden sm:block text-right">Block</span>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)]">
            {ledger.length === 0 ? (
              <div className="px-5 py-8 text-sm text-[var(--color-text-secondary)]">
                No settlements yet on this instance. Trigger the live demo to populate the ledger.
              </div>
            ) : (
              ledger.map((item) => (
                <div
                  key={`${item.id}-${item.timestamp}`}
                  className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 text-sm sm:grid-cols-[auto_1fr_auto_auto]"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.status === 'completed' ? 'bg-[var(--color-accent)]' : 'bg-red-500'
                      }`}
                    />
                    <code className="text-xs text-[var(--color-text-secondary)]">
                      {item.payer ? truncate(item.payer, 8, 6) : '—'}
                    </code>
                  </span>
                  <span className="hidden sm:block truncate text-[var(--color-text-primary)]">
                    {item.endpoint}
                    {item.txHash && (
                      <span className="ml-2 text-xs text-[var(--color-text-secondary)] font-mono">
                        {truncate(item.txHash, 8, 6)}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-[var(--color-text-accent)] text-right tabular-nums">
                    {item.status === 'completed' ? '' : `${item.status} · `}{item.amount.toFixed(3)} {item.currency}
                  </span>
                  <span className="hidden sm:block text-right text-xs text-[var(--color-text-secondary)] tabular-nums">
                    {item.blockNumber ? `#${Number(item.blockNumber).toLocaleString()}` : '—'}
                    {item.status === 'completed' && <span className="text-[var(--color-text-accent)]"> ✓</span>}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-20 pt-8 text-center" data-reveal>
        <h2 className="text-[clamp(30px,4vw,52px)] font-black leading-[1.04] tracking-[-0.05em] text-[var(--color-text-primary)]">
          Make your APIs worth paying for.
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-control)] bg-[var(--color-bg-surface)] px-6 py-3 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-white/30"
          >
            Read the docs
          </Link>
        </div>
      </section>
    </div>
  );
}
