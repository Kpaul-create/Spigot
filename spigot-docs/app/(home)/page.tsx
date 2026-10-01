'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { HeroScene } from '@/components/hero-scene';

const ENDPOINTS = [
  { name: 'Flux Image Gen', provider: 'Pixelworks', category: 'Media', price: 0.04 },
  { name: 'News Summarizer', provider: 'Digestly', category: 'AI', price: 0.01 },
  { name: 'Sentiment API', provider: 'Pulse Labs', category: 'Data', price: 0.002 },
  { name: 'GPU Burst Compute', provider: 'Nimbus', category: 'Compute', price: 0.15 },
  { name: 'FX Rates Feed', provider: 'Ledgerly', category: 'Finance', price: 0.001 },
  { name: 'Web Search Tool', provider: 'Query Co', category: 'AI', price: 0.005 },
];

const AGENT_IDS = ['agt-7f3a', 'agt-2b91', 'agt-9c04', 'agt-41de', 'agt-b6a8', 'agt-05f2'];

interface FeedItem {
  id: string;
  agent: string;
  address: string;
  endpoint: string;
  amount: number;
  block: number;
}

/**
 * Generated once, when the row is created, and then stored on the item.
 *
 * This deliberately does *not* run during render: `Math.random()` in the render
 * body produces a different value on the server than on the client, which is a
 * hydration mismatch. Building the value at insertion time keeps the markup
 * deterministic across that boundary.
 */
function randomAddress(): string {
  const hex = () =>
    Array.from({ length: 4 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return `0x${hex()}…${hex()}`;
}

export default function HomePage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [newsletterMsg, setNewsletterMsg] = useState('');
  const liveRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef(4871204);

  // Live ledger feed
  useEffect(() => {
    const addItem = () => {
      const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      blockRef.current += 1 + Math.floor(Math.random() * 3);
      const item: FeedItem = {
        id: `${Date.now()}-${Math.random()}`,
        agent: AGENT_IDS[Math.floor(Math.random() * AGENT_IDS.length)],
        address: randomAddress(),
        endpoint: ep.name,
        amount: ep.price,
        block: blockRef.current,
      };
      setFeedItems((prev) => [item, ...prev].slice(0, 7));
    };

    // Seed initial items
    for (let i = 0; i < 6; i++) addItem();

    const interval = setInterval(() => {
      if (document.hidden) return;
      if (liveRef.current) {
        const rect = liveRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) addItem();
      }
    }, 1600);

    return () => clearInterval(interval);
  }, []);

  // Scroll reveal
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

  const handleNewsletter = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setNewsletterMsg('Enter a valid email address.');
      return;
    }
    if (!consent) {
      setNewsletterMsg('Please accept the privacy policy to subscribe.');
      return;
    }
    setNewsletterMsg('Thanks, you are subscribed.');
    setEmail('');
    setConsent(false);
  };

  return (
    <div className="relative z-10">
      {/* Hero — no local backdrop; the ambient gradient runs behind the whole page. */}
      <section className="relative h-screen min-h-[620px] flex items-center overflow-hidden">
        <HeroScene />
        <div className="relative z-10 max-w-xl px-6 pl-[max(20px,6vw)]">
          <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
            Built on Tempo
          </div>
          <h1 className="text-[clamp(38px,6vw,68px)] font-extrabold leading-[1.05] tracking-tight mb-4">
            AI agents for pay-per-call transactions.
          </h1>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto mb-5">
            Spigot provisions the micro-liquidity rails an agent needs, then settles sub-cent
            payments autonomously on every LLM inference or tool call — no accounts, no API keys, no
            human approving the tap.
          </p>
          <p className="text-[var(--color-text-secondary)] text-lg mb-6 max-w-md">
            Turn any API into a pay-per-call service. Agents pay instantly, in any stablecoin, with
            zero human in the loop.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-semibold px-6 py-3 hover:opacity-90 transition-opacity"
            >
              Try the live demo
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-control)] text-[var(--color-text-primary)] font-semibold px-6 py-3 hover:bg-[var(--color-bg-surface)] transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-5xl mx-auto px-5 py-16" data-reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { stat: '100M+', label: 'x402 machine payments, industry-wide' },
            { stat: '<1s', label: 'settlement on Tempo' },
            { stat: '0', label: 'accounts or API keys required' },
          ].map((s) => (
            <div key={s.stat} className="glass p-7">
              <span className="block text-4xl font-extrabold text-[var(--color-text-accent)]">
                {s.stat}
              </span>
              <span className="text-[var(--color-text-secondary)] text-sm mt-1 block">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          The problem
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-4">
          Autonomy stops at the checkout page.
        </h2>
        <p className="text-[var(--color-text-secondary)] max-w-2xl text-lg">
          Agents can plan, browse and call tools on their own — but the moment they need to buy
          something, they hit credit cards, API keys and human approval loops built for people, not
          machines.
        </p>
      </section>

      {/* 1. How It Works */}
      <section className="max-w-4xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          How it works
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-8">
          Three steps. No humans.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: 1,
              title: 'Wallet authorization',
              desc: 'The agent connects a Tempo MPC wallet. Spigot scopes the micro-liquidity rail to exactly the endpoints it is allowed to call.',
            },
            {
              step: 2,
              title: 'Stream metering',
              desc: 'Each request is metered as it runs, so a call is priced by the work it actually consumed rather than a flat monthly key.',
            },
            {
              step: 3,
              title: 'Automated tap',
              desc: 'When the metered balance crosses its threshold the wallet signs and settles sub-cent transfers with nobody in the loop.',
            },
          ].map((s) => (
            <div key={s.step} className="glass p-7">
              <div className="w-9 h-9 rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-extrabold grid place-items-center mb-4">
                {s.step}
              </div>
              <h3 className="font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Live Ledger */}
      <section className="max-w-4xl mx-auto px-5 py-16" data-reveal ref={liveRef}>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Live ledger
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-2">Every call, settled.</h2>
        <p className="text-[var(--color-text-secondary)] max-w-2xl mb-8">
          A running slice of agent traffic: who called, what they hit, what it settled for, and the
          block it confirmed in.
        </p>

        <div className="glass overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-2.5 text-[0.7rem] uppercase tracking-widest text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] sm:grid-cols-[auto_1fr_auto_auto]">
            <span>Agent</span>
            <span className="hidden sm:block">Endpoint</span>
            <span className="text-right">Settled</span>
            <span className="hidden sm:block text-right">Block</span>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)]">
            {feedItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 text-sm items-center animate-[feedSlideIn_0.4s_ease-out] sm:grid-cols-[auto_1fr_auto_auto]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)] flex-none" />
                  <code className="text-xs text-[var(--color-text-secondary)]">{item.agent}</code>
                </span>
                <span className="hidden sm:block truncate text-[var(--color-text-primary)]">
                  {item.endpoint}
                  <span className="text-[var(--color-text-secondary)] text-xs ml-2 font-mono">
                    {item.address}
                  </span>
                </span>
                <span className="font-semibold text-[var(--color-text-accent)] text-right tabular-nums">
                  ${item.amount.toFixed(3)}
                </span>
                <span className="hidden sm:block text-right text-xs text-[var(--color-text-secondary)] tabular-nums">
                  #{item.block.toLocaleString()} <span className="text-[var(--color-text-accent)]">✓</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Why on Tempo */}
      <section className="max-w-4xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Why on Tempo
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-8">
          A chain built for machine payments.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'Sub-second finality',
              desc: 'Pay-then-retry reads as synchronous to the calling agent — no polling loop, no orphaned payments.',
            },
            {
              title: 'Zero gas spikes',
              desc: "Native account abstraction and gas sponsorship keep a micro-transfer as cheap as a full block.",
            },
            {
              title: 'Optimized throughput',
              desc: 'Payment lanes and memos ride along with every settlement, tuned for autonomous machine-to-machine micro-transfers.',
            },
          ].map((card) => (
            <div key={card.title} className="glass p-7">
              <h3 className="font-bold text-lg mb-2">{card.title}</h3>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quickstart */}
      <section className="max-w-4xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Quickstart
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-6">One line of middleware.</h2>
        <pre className="glass p-6 overflow-x-auto text-sm font-mono">
          <code>{`app.get("/api/premium-data",
  spigot.charge({ amount: "0.01" }),
  (req, res) => res.json({ data: "the good stuff" }));`}</code>
        </pre>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center" data-reveal>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-6">Open the tap.</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-semibold px-6 py-3 hover:opacity-90 transition-opacity"
          >
            Open dashboard
          </Link>
          <Link
            href="/directory"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-control)] text-[var(--color-text-primary)] font-semibold px-6 py-3 hover:bg-[var(--color-bg-surface)] transition-colors"
          >
            Browse directory
          </Link>
        </div>
      </section>

      {/* Newsletter */}
      <section className="max-w-2xl mx-auto px-5 py-16" data-reveal>
        <div className="glass p-8">
          <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
            Newsletter
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Follow the build.</h2>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">
            Occasional updates on Spigot, Tempo and agent payments. No spam, unsubscribe any time.
          </p>
          <form onSubmit={handleNewsletter} noValidate>
            <div className="flex gap-3 mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                aria-label="Email address"
                className="flex-1 min-w-0 bg-[var(--color-bg-page)] text-[var(--color-text-primary)] border border-[var(--color-border-control)] rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-semibold text-sm px-5 py-2 hover:opacity-90 transition-opacity"
              >
                Subscribe
              </button>
            </div>
            <label className="flex gap-2.5 items-start text-sm text-[var(--color-text-secondary)] mb-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 flex-none"
              />
              <span>
                I agree to receive email updates and have read the{' '}
                <Link href="/privacy" className="underline">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            <p
              className="text-sm text-[var(--color-text-secondary)] min-h-[1.6em] m-0"
              role="status"
              aria-live="polite"
            >
              {newsletterMsg}
            </p>
          </form>
          <p className="text-xs text-[var(--color-text-secondary)] mt-4 mb-0">
            We collect your email address only, to send these updates. We never sell it or share it
            for advertising. Details in the{' '}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}