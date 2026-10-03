'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  APIError,
  fetchAgentStatus,
  formatBalance,
  formatCurrency,
  postAgentChat,
  postAgentFund,
  TOKEN_DECIMALS,
  truncate,
} from '@/lib/api';
import type { AgentMessage, AgentStatus, AgentTool } from '@/lib/types';

let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

/** Cheapest tool price, used to explain a failed payment in plain terms. */
function lowestToolCost(tools: AgentTool[]): number {
  const costs = tools.map((t) => t.cost).filter((c) => c > 0);
  return costs.length > 0 ? Math.min(...costs) : 0;
}

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'I am the Spigot agent. I can choose from the paid data tools and make on-chain calls when the payment setup is ready. Check the status panel for current readiness.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [thinking, setThinking] = useState(false);
  const [fundAmount, setFundAmount] = useState('1.00');
  /** Hash of the transfer the user already sent to the agent wallet. */
  const [fundTx, setFundTx] = useState('');
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
              ? // No credits system exists. The agent holds a real wallet, and a
                // 402 from a paid endpoint means the transfer could not be
                // funded — most often the balance is below the tool price.
                `Could not pay for the tool: the agent wallet is short of funds (it needs at least ${formatCurrency(
                  lowestToolCost(status?.tools ?? []),
                )} for its cheapest tool). Send PathUSD to the wallet address above, then try again.`
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
    const txHash = fundTx.trim();
    const amount = Number(fundAmount);
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      setFundMsg('Paste the 0x… transaction hash of the transfer you sent.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundMsg('Enter a positive amount.');
      return;
    }
    // A browser form cannot sign a Tempo transfer, so this does not move money:
    // you send tokens to the agent wallet, then paste the resulting hash. The
    // route reads the amount from the transaction itself, so the number here is
    // only a floor to check the transfer against.
    try {
      const res = await postAgentFund(amount, txHash);
      // Plain text: this string is rendered as a text node, so an anchor tag
      // would show up literally.
      // The hash is truncated because a full 0x + 64 hex string is one
      // unbreakable token 66 characters wide, and this line is rendered into a
      // narrow panel — at full length it drove the text out through the edge.
      setFundMsg(
        `Verified ${formatCurrency(res.credited)} ${res.token}. Tx ${truncate(res.txHash ?? '')}`,
      );
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
        Every tool call settles on Tempo before the result comes back. The payment flow stays clear,
        verifiable, and built for software rather than paperwork.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* ── Chat ── */}
        <div className="panel flex flex-col h-[min(420px,48vh)] min-h-[320px] lg:h-[560px]">
          {status && !status.wallet.paymentsReady && (
            <div className="m-5 mb-0 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="status">
              <div className="font-semibold">Paid tools are disabled</div>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                {!status.wallet.merchantConfigured
                  ? 'Set TEMPO_MERCHANT_ADDRESS to a valid wallet you control.'
                  : status.wallet.settlesToBurnAddress
                    ? 'The configured merchant address is a known burn address. Replace it before enabling payments.'
                    : !status.wallet.settlementSupported
                      ? 'App payments currently require TEMPO_SIGNER=privateKey; Dynamic broadcasting is not supported yet.'
                      : 'Configure a supported Tempo signer before enabling payments.'}{' '}
                <Link href="/docs/setup" className="font-medium text-[var(--color-text-primary)] underline">
                  Setup steps
                </Link>
              </p>
            </div>
          )}
          {/*
            Shown once status has loaded and reports no model. Without it the page
            looks fully functional and the first message is the thing that
            discovers the missing key, as a red error after the fact.
          */}
          {status && !status.model.configured && (
            <div className="m-5 mb-0 p-4 rounded-lg border border-amber-500/40 bg-amber-500/5 text-sm">
              <div className="font-semibold mb-1">No model key configured</div>
              <p className="text-[var(--color-text-secondary)] mb-2">
                Choosing which tool to pay for needs a model key. Paid calls also require a
                configured signer and a valid merchant destination.
              </p>
              <p className="text-[var(--color-text-secondary)]">
                Set <code className="text-xs">LLM_GATEWAY_API_KEY</code> in{' '}
                <code className="text-xs">.env.local</code>, or{' '}
                <code className="text-xs">LLM_PROVIDER=openai</code> with{' '}
                <code className="text-xs">OPENAI_API_KEY</code>, then restart the server.
              </p>
              <p className="text-[var(--color-text-secondary)] mt-2">
                To see a real pay-per-call handshake without a key, use the{' '}
                <Link href="/demo" className="underline">
                  live demo
                </Link>
                .
              </p>
            </div>
          )}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex flex-col items-end' : ''}>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
                  {m.role === 'user' ? 'You' : m.role === 'agent' ? 'Agent' : 'System'}
                </div>
                <div className="min-w-0 max-w-[80%]">
                  <div
                    /* `wrap-anywhere` (overflow-wrap: anywhere) is load-bearing,
                       not decoration. Without it the bubble kept `whitespace-pre-wrap`
                       but no break rule, so any unbreakable run of characters —
                       a 0x transaction hash, a URL, or the provider error text — ran
                       straight out through the rounded border and overlapped the
                       sidebar. `break-words` would not have been enough: it breaks
                       the glyphs but still reports the full string as min-content
                       width, so inside a flex row the box refuses to shrink.
                       `anywhere` does shrink it. */
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere ${
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
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
                  Agent
                </div>
                <div className="rounded-2xl px-4 py-3 bg-[var(--color-bg-page)] text-sm wrap-anywhere mu">
                  Paying and calling tools…
                </div>
              </div>
            )}
          </div>

          <form onSubmit={send} className="flex gap-2 p-4 border-t border-[var(--color-border-subtle)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to look up a live data source…"
              aria-label="Message the agent"
              className="flex-1 min-w-0 bg-[var(--color-bg-page)] border border-[var(--color-border-control)] rounded-full px-4 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={
                thinking ||
                !input.trim() ||
                Boolean(status && (!status.model.configured || !status.wallet.paymentsReady))
              }
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
              {/* These used to read `status.state`, `status.credits`,
                  `status.totalCalls` and `status.totalCost`. The endpoint has
                  never returned any of them, so every row rendered its `??`
                  fallback forever — a dead panel even with a funded wallet.
                  The fields below are what `/api/agent/status` actually sends. */}
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Wallet</dt>
                <dd className="font-medium capitalize flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status?.wallet.configured
                        ? 'bg-[var(--color-text-accent)] state-pulse'
                        : 'bg-[var(--color-border-control)]'
                    }`}
                  />
                  {status ? (status.wallet.configured ? 'Ready' : 'Not configured') : '…'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">
                  Balance
                  {/* Labelled with its currency, because it is a TIP-20 figure —
                      the stablecoin the agent spends — and not the native coin
                      balance it was previously (wrongly) reporting. */}
                  {status?.wallet.balanceToken
                    ? ` (${status.wallet.balanceToken})`
                    : ''}
                </dt>
                <dd className="font-semibold text-[var(--color-text-accent)] tabular-nums">
                  {status?.wallet.balance == null
                    ? status?.wallet.balanceError
                      ? 'unreadable'
                      : '—'
                    : /* Exact token precision, not 2dp. At 2dp a $0.005 payment is
                         below the last displayed digit, so the figure never moved
                         and a real settlement read as a fake one. */
                      formatBalance(
                        status.wallet.balance,
                        status.wallet.balanceDecimals ?? TOKEN_DECIMALS,
                      )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Address</dt>
                <dd className="tabular-nums font-mono text-xs">
                  {status?.wallet.address
                    ? `${status.wallet.address.slice(0, 6)}…${status.wallet.address.slice(-4)}`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Model</dt>
                <dd className="tabular-nums truncate max-w-[60%] text-right">
                  {status?.model.configured ? status.model.model : 'No API key set'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Pays out to</dt>
                <dd className="tabular-nums font-mono text-xs">
                  {status?.wallet.settlementAddress
                    ? `${status.wallet.settlementAddress.slice(0, 6)}…${status.wallet.settlementAddress.slice(-4)}`
                    : '—'}
                </dd>
              </div>
            </dl>
            {/* Stated plainly because the alternative is the worst kind of
                broken: the transfer really is signed, broadcast, confirmed and
                receipted, and the money really is gone. Every number on this
                page stays true while the payout silently does nothing. */}
            {status?.wallet.settlesToBurnAddress && (
              <p
                className="mt-3 border-l-2 border-[var(--color-text-accent)] pl-3 text-xs text-[var(--color-text-secondary)]"
                role="status"
              >
                  <strong className="text-[var(--color-text-accent)]">
                  Payments are disabled: the merchant destination is a burn address.
                </strong>{' '}
                <span className="font-mono">
                  {status.wallet.settlementAddress}
                </span>{' '}
                cannot receive payments. Set TEMPO_MERCHANT_ADDRESS to a valid
                wallet you control before enabling settlement.
              </p>
            )}
            {status && !status.wallet.merchantConfigured && (
              <p
                className="mt-3 border-l-2 border-amber-500 pl-3 text-xs text-[var(--color-text-secondary)]"
                role="status"
              >
                <strong className="text-[var(--color-text-primary)]">Payments are disabled.</strong>{' '}
                Set TEMPO_MERCHANT_ADDRESS to a valid wallet you control.
              </p>
            )}
            {status && !status.wallet.settlementSupported && (
              <p
                className="mt-3 border-l-2 border-amber-500 pl-3 text-xs text-[var(--color-text-secondary)]"
                role="status"
              >
                Dynamic signing is not yet supported by the app payment broadcaster. Use
                TEMPO_SIGNER=privateKey for app settlements.
              </p>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="font-bold mb-1">Record a deposit</h2>
            {/* This box credits nothing. The balance above is read straight from
                chain, so a deposit raises it the moment the transfer settles —
                submitting here neither moves money nor adds a cent. What it does
                is verify a transfer really arrived at this wallet, amount
                decoded from the transaction's own calldata, and log it to the
                ledger. Saying "fund the account" implied otherwise. */}
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Your balance is read from chain and updates on its own when a
              transfer settles — nothing to claim here. Send tokens to{' '}
              <span className="font-mono">
                {status?.wallet.address ?? 'the agent wallet shown above'}
              </span>{' '}
              on {status?.network.name ?? 'Tempo'}, then paste the hash to have
              the deposit verified and logged. The amount is read from the
              transfer itself, and the same hash can only be recorded once.
            </p>
            <form onSubmit={fund} className="space-y-2">
              <input
                type="text"
                value={fundTx}
                onChange={(e) => setFundTx(e.target.value.trim())}
                placeholder="0x… transaction hash"
                aria-label="Transaction hash of the funding transfer"
                spellCheck={false}
                autoComplete="off"
                className="w-full min-w-0 bg-[var(--color-bg-page)] border border-[var(--color-border-control)] rounded-lg px-3 py-2 text-sm font-mono"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  aria-label="Minimum funding amount in dollars"
                  className="w-full min-w-0 bg-[var(--color-bg-page)] border border-[var(--color-border-control)] rounded-lg px-3 py-2 text-sm tabular-nums"
                />
                <button
                  type="submit"
                  className="flex-none rounded-lg px-4 py-2 text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                >
                  Verify
                </button>
              </div>
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
