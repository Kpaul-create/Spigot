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

function randomAddress() {
  const hex = () =>
    Array.from({ length: 4 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return `0x${hex()}…${hex()}`;
}

interface FeedItem {
  id: string;
  endpoint: string;
  amount: number;
}

export default function HomePage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [newsletterMsg, setNewsletterMsg] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  // Live ledger feed
  useEffect(() => {
    const addItem = () => {
      const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      const item: FeedItem = {
        id: `${Date.now()}-${Math.random()}`,
        endpoint: ep.name,
        amount: ep.price,
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
    <div>
      {/* Hero */}
      <section className="relative h-screen min-h-[620px] flex items-center overflow-hidden">
        <HeroScene />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_45%_58%_at_50%_50%,var(--color-glow-center),transparent_72%)]" />
        <div className="relative z-10 max-w-xl px-6 pl-[max(20px,6vw)]">
          <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
            Built on Tempo
          </div>
          <h1 className="text-[clamp(38px,6vw,68px)] font-extrabold leading-[1.05] tracking-tight mb-4">
            The metered stablecoin tap for AI agents.
          </h1>
          <p className="text-[var(--color-text-secondary)] text-lg mb-6 max-w-md">
            Turn any API into a pay-per-call service. Agents pay instantly, in any stablecoin, with zero
            human in the loop.
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
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-6">
            <span className="block text-3xl font-extrabold text-[var(--color-text-accent)]">100M+</span>
            <span className="text-[var(--color-text-secondary)] text-sm">x402 machine payments, industry-wide</span>
          </div>
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-6">
            <span className="block text-3xl font-extrabold text-[var(--color-text-accent)]">&lt;1s</span>
            <span className="text-[var(--color-text-secondary)] text-sm">settlement on Tempo</span>
          </div>
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-6">
            <span className="block text-3xl font-extrabold text-[var(--color-text-accent)]">0</span>
            <span className="text-[var(--color-text-secondary)] text-sm">accounts or API keys required</span>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          The problem
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-4">
          Autonomy stops at the checkout page.
        </h2>
        <p className="text-[var(--color-text-secondary)] max-w-2xl text-lg">
          Agents can plan, browse and call tools on their own — but the moment they need to buy something,
          they hit credit cards, API keys and human approval loops built for people, not machines.
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          How it works
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-8">Four steps. No humans.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { step: 1, title: 'Request', desc: 'Agent calls a paid endpoint.' },
            { step: 2, title: '402', desc: 'Server replies Payment Required with a price.' },
            { step: 3, title: 'Pay', desc: 'Agent settles on Tempo in any stablecoin.' },
            { step: 4, title: 'Retry', desc: 'Proof attached, real response returned.' },
          ].map((s) => (
            <div
              key={s.step}
              className="relative bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-6"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-extrabold grid place-items-center mb-3">
                {s.step}
              </div>
              <h3 className="font-bold text-lg mb-1">{s.title}</h3>
              <p className="text-[var(--color-text-secondary)] text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Tempo */}
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Why Tempo
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-8">
          A chain built for machine payments.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'Any-stablecoin gas',
              desc: "Pay with whatever you hold — Tempo's enshrined AMM handles conversion.",
            },
            {
              title: 'Sub-second finality',
              desc: 'Pay-then-retry feels synchronous to the calling agent.',
            },
            {
              title: 'Payment lanes & memos',
              desc: 'Each settlement carries endpoint and agent metadata for analytics.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-6"
            >
              <h3 className="font-bold text-lg mb-2">{card.title}</h3>
              <p className="text-[var(--color-text-secondary)] text-sm">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quickstart */}
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Quickstart
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-6">One line of middleware.</h2>
        <pre className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-5 overflow-x-auto text-sm font-mono">
          <code>{`app.get("/api/premium-data",
  spigot.charge({ amount: "0.01" }),
  (req, res) => res.json({ data: "the good stuff" }));`}</code>
        </pre>
      </section>

      {/* Live Ledger */}
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal ref={liveRef}>
        <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
          Live ledger
        </div>
        <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-6">Every call, settled.</h2>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl overflow-hidden">
          <div ref={feedRef} className="divide-y divide-[var(--color-border-subtle)]">
            {feedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm animate-[feedSlideIn_0.4s_ease-out]"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)] flex-none" />
                <code className="text-xs text-[var(--color-text-secondary)]">{randomAddress()}</code>
                <span className="text-[var(--color-text-primary)] truncate">{item.endpoint}</span>
                <span className="ml-auto font-semibold text-[var(--color-text-accent)]">
                  ${item.amount.toFixed(3)}
                </span>
                <span className="text-[var(--color-text-accent)] text-xs">Settled on Tempo</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-16 text-center" data-reveal>
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
      <section className="max-w-6xl mx-auto px-5 py-16" data-reveal>
        <div className="max-w-xl mx-auto bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl p-8">
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
            <p className="text-sm text-[var(--color-text-secondary)] min-h-[1.6em] m-0" role="status" aria-live="polite">
              {newsletterMsg}
            </p>
          </form>
          <p className="text-xs text-[var(--color-text-secondary)] mt-4 mb-0">
            We collect your email address only, to send these updates. We never sell it or share it for
            advertising. Details in the{' '}
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
