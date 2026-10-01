'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { APIError, fetchAgentStatus, formatCurrency, postAgentChat, postAgentFund } from '@/lib/api';
import type { AgentMessage, AgentStatus } from '@/lib/types';

let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        "I'm the pay-per-call agent. I hold a credit balance and pay for every tool I use on Tempo. Ask me something and I'll show you the receipts.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [thinking, setThinking] = useState(false);
  const [fundAmount, setFundAmount] = useState('1.00');
  const [fundMsg, setFundMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = (msg: AgentMessage) => setMessages((prev) => [...prev, msg]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchAgentStatus());
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const id = setInterval(refreshStatus, 15_000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || thinking) return;

    push({ id: nextId(), role: 'user', content: text, timestamp: new Date().toISOString() });
    setInput('');
    setThinking(true);

    try {
      const res = await postAgentChat(text);
      push({
        id: nextId(),
        role: 'agent',
        content: res.text,
        toolsUsed: res.toolsUsed,
        cost: res.cost,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      push({
        id: nextId(),
        role: 'system',
        content:
          err instanceof APIError
            ? err.status === 402
              ? 'Out of credits — fund the account and try again.'
              : err.message
            : 'Something went wrong talking to the agent.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setThinking(false);
      void refreshStatus();
    }
  }

  async function fund(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundMsg('Enter a positive amount.');
      return;
    }
    // The demo signer mints a local receipt; a real deployment forwards the
    // settled Tempo transaction hash here after MPP returns one.
    const receipt = `demo_${Date.now().toString(16)}`;
    try {
      const res = await postAgentFund(amount, receipt);
      setFundMsg(`Added ${formatCurrency(res.added)} — balance ${formatCurrency(res.balance)}.`);
      void refreshStatus();
    } catch (err) {
      setFundMsg(err instanceof Error ? err.message : 'Funding failed.');
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
        Agent
      </div>
      <h1 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-tight mb-4">
        An agent that pays its own way.
      </h1>
      <p className="text-[var(--color-text-secondary)] text-lg max-w-2xl mb-10">
        Every tool call settles on Tempo before the result comes back. Nothing here needs a human
        approval step.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* ── Chat ── */}
        <div className="panel flex flex-col h-[560px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`flex-none w-8 h-8 rounded-full grid place-items-center text-sm font-bold ${
                    m.role === 'user'
                      ? 'bg-[var(--color-bg-page)] border border-[var(--color-border-subtle)]'
                      : 'bg-[var(--color-accent)] text-[var(--color-text-on-accent)]'
                  }`}
                >
                  {m.role === 'user' ? 'You' : m.role === 'agent' ? '🤖' : '•'}
                </div>
                <div className="min-w-0 max-w-[80%]">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[var(--color-bg-page)] border border-[var(--color-border-subtle)]'
                        : m.role === 'system'
                          ? 'border border-dashed border-[var(--color-border-control)] text-[var(--color-text-secondary)]'
                          : 'bg-[var(--color-bg-page)]'
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.toolsUsed.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-full text-xs border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                        >
                          paid · {t}
                        </span>
                      ))}
                      {typeof m.cost === 'number' && m.cost > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-[var(--color-text-accent)]">
                          {formatCurrency(m.cost)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex gap-3">
                <div className="flex-none w-8 h-8 rounded-full grid place-items-center bg-[var(--color-accent)] text-[var(--color-text-on-accent)]">
                  🤖
                </div>
                <div className="rounded-2xl px-4 py-3 bg-[var(--color-bg-page)] text-sm mu">
                  Paying and calling tools…
                </div>
              </div>
            )}
          </div>

          <form onSubmit={send} className="flex gap-2 p-4 border-t border-[var(--color-border-subtle)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to do something…"
              aria-label="Message the agent"
              className="flex-1 min-w-0 bg-[var(--color-bg-page)] border border-[var(--color-border-control)] rounded-full px-4 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={thinking || !input.trim()}
              className="flex-none rounded-full px-5 py-2.5 text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-text-on-accent)] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="font-bold mb-4">Status</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">State</dt>
                <dd className="font-medium capitalize flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status?.state === 'running'
                        ? 'bg-[var(--color-text-accent)] state-pulse'
                        : 'bg-[var(--color-border-control)]'
                    }`}
                  />
                  {status?.state ?? '…'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Balance</dt>
                <dd className="font-semibold text-[var(--color-text-accent)] tabular-nums">
                  {formatCurrency(status?.credits ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Calls</dt>
                <dd className="tabular-nums">{status?.totalCalls ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Total spent</dt>
                <dd className="tabular-nums">{formatCurrency(status?.totalCost ?? 0)}</dd>
              </div>
            </dl>
          </div>

          <div className="panel p-5">
            <h2 className="font-bold mb-3">Fund account</h2>
            <form onSubmit={fund} className="flex gap-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                aria-label="Funding amount in dollars"
                className="w-full min-w-0 bg-[var(--color-bg-page)] border border-[var(--color-border-control)] rounded-lg px-3 py-2 text-sm tabular-nums"
              />
              <button
                type="submit"
                className="flex-none rounded-lg px-4 py-2 text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
              >
                Fund
              </button>
            </form>
            {fundMsg && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-2" role="status">
                {fundMsg}
              </p>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="font-bold mb-3">Tools</h2>
            {status && status.tools.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {status.tools.map((t) => (
                  <li key={t.name} className="flex justify-between gap-3">
                    <span className="truncate" title={t.description}>
                      {t.name}
                    </span>
                    <span className="flex-none text-[var(--color-text-accent)] tabular-nums">
                      {formatCurrency(t.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mu text-sm">Send a message to load the tool list.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
