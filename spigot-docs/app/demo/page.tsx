'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency, truncate } from '@/lib/api';
import { priceOf } from '@/lib/pricing';

/**
 * Endpoints the demo can actually perform the handshake against.
 *
 * Only real paid endpoints. The previous list included `/api/agent/run` at
 * "$0.035", which is not a paid endpoint at all — it is free to call and needs
 * an LLM key, so a row for it could never work.
 */
const TASKS = [
  {
    id: 'weather',
    label: 'Current weather in Oslo',
    endpoint: '/api/weather',
    price: priceOf('/api/weather')!,
    query: '?city=Oslo',
  },
  {
    id: 'premium',
    label: 'Live crypto market snapshot',
    endpoint: '/api/premium-data',
    price: priceOf('/api/premium-data')!,
    query: '',
  },
] as const;

type Phase = 'idle' | 'running' | 'done' | 'error';

interface Step {
  label: string;
  detail: string;
  tone: 'muted' | 'accent' | 'red';
}

/** Everything the demo observed during one run. */
interface Outcome {
  amount: number;
  token: string;
  txHash: string;
  explorerUrl: string;
  /** What the paid endpoint returned, for display. */
  data: unknown;
}

interface PaymentReadiness {
  ready: boolean;
  message: string;
}

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<Step[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [taskId, setTaskId] = useState<string>(TASKS[0].id);
  const [readiness, setReadiness] = useState<PaymentReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/pay')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Readiness check returned ${response.status}`);
        return (await response.json()) as {
          wallet?: { configured?: boolean };
          merchantConfigured?: boolean;
          settlesToBurnAddress?: boolean;
          settlementSupported?: boolean;
          paymentsReady?: boolean;
        };
      })
      .then((status) => {
        if (cancelled) return;
        let message = 'Payment setup is ready for a real testnet transfer.';
        if (status.settlesToBurnAddress) {
          message = 'Payments are disabled because TEMPO_MERCHANT_ADDRESS is a known burn address.';
        } else if (!status.merchantConfigured) {
          message = 'Set TEMPO_MERCHANT_ADDRESS to a valid wallet you control before settling.';
        } else if (!status.settlementSupported) {
          message = 'App payments currently require TEMPO_SIGNER=privateKey; Dynamic broadcasting is not supported yet.';
        } else if (!status.wallet?.configured) {
          message = 'Configure and fund a Tempo private-key signer before settling.';
        }
        setReadiness({ ready: status.paymentsReady === true, message });
      })
      .catch(() => {
        if (!cancelled) {
          setReadiness({ ready: false, message: 'Could not check payment setup. Refresh before running a paid call.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Performs the handshake for real.
   *
   * This used to `await wait(600)`, `await wait(900)`, then read
   * `GET /api/dashboard/transactions` and show whichever receipt happened to be
   * newest — narrating a payment it never made. Every step below is a real
   * request whose real response drives the next step and the display.
   */
  async function runTask(id: string) {
    if (!readiness?.ready) return;

    const task = TASKS.find((t) => t.id === id)!;
    const url = task.endpoint + task.query;

    setTaskId(id);
    setPhase('running');
    setOutcome(null);

    // A per-run id, so the receipt is bound to this attempt and the replay check
    // at the end is a genuine test rather than a coincidence.
    const agentId = `demo-${Date.now().toString(36)}`;

    setSteps([{ label: 'Request', detail: `GET ${url} with no receipt`, tone: 'muted' }]);

    // ── 1. Challenge ──────────────────────────────────────────────────────
    let price: number;
    try {
      const challenge = await fetch(url);

      if (challenge.status !== 402) {
        setPhase('error');
        setSteps((s) => [
          ...s,
          {
            label: 'Unexpected',
            detail: `Expected 402 Payment Required, got ${challenge.status}.`,
            tone: 'red',
          },
        ]);
        return;
      }

      const body = (await challenge.json()) as { price?: number };
      price = body.price ?? task.price;

      setSteps((s) => [
        ...s,
        {
          label: '402 Payment Required',
          detail: `Endpoint asks ${formatCurrency(price)}. No receipt attached.`,
          tone: 'muted',
        },
      ]);
    } catch (error) {
      setPhase('error');
      setSteps((s) => [
        ...s,
        {
          label: 'Error',
          detail: `Could not reach the endpoint: ${describe(error)}`,
          tone: 'red',
        },
      ]);
      return;
    }

    // ── 2. Settle ─────────────────────────────────────────────────────────
    setSteps((s) => [
      ...s,
      {
        label: 'Pay',
        detail: `POST /api/pay — signing a ${formatCurrency(price)} transfer on Tempo Moderato`,
        tone: 'accent',
      },
    ]);

    let receipt: string;
    let txHash: string;
    let explorerUrl: string;
    let token: string;

    try {
      const payment = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: price, endpoint: task.endpoint, agentId }),
      });
      const paid = (await payment.json()) as {
        receipt?: string;
        transactionId?: string;
        explorerUrl?: string;
        token?: string;
        message?: string;
      };

      if (!payment.ok || !paid.receipt) {
        setPhase('error');
        setSteps((s) => [
          ...s,
          {
            label: 'Payment failed',
            detail: paid.message ?? `POST /api/pay returned ${payment.status}`,
            tone: 'red',
          },
        ]);
        return;
      }

      receipt = paid.receipt;
      txHash = paid.transactionId ?? '';
      explorerUrl = paid.explorerUrl ?? '';
      token = paid.token ?? 'PathUSD';

      setSteps((s) => [
        ...s,
        { label: 'Settled', detail: `${truncate(txHash, 12, 8)} confirmed on chain`, tone: 'accent' },
      ]);
    } catch (error) {
      setPhase('error');
      setSteps((s) => [
        ...s,
        { label: 'Error', detail: `Payment failed: ${describe(error)}`, tone: 'red' },
      ]);
      return;
    }

    // ── 3. Redeem ─────────────────────────────────────────────────────────
    setSteps((s) => [
      ...s,
      {
        label: 'Redeem',
        detail: `GET ${url} with Payment-Receipt ${truncate(receipt, 10, 6)}`,
        tone: 'muted',
      },
    ]);

    try {
      const response = await fetch(url, {
        headers: { 'Payment-Receipt': receipt, 'X-Agent-Id': agentId },
      });
      const body = await response.json();

      if (!response.ok) {
        setPhase('error');
        setSteps((s) => [
          ...s,
          {
            label: 'Rejected',
            detail: (body as { message?: string }).message ?? `Returned ${response.status}`,
            tone: 'red',
          },
        ]);
        return;
      }

      setOutcome({
        amount: price,
        token,
        txHash,
        explorerUrl,
        data: (body as { data?: unknown }).data ?? body,
      });

      setSteps((s) => [
        ...s,
        { label: '200 OK', detail: 'Receipt verified against chain. Data served.', tone: 'accent' },
      ]);
    } catch (error) {
      setPhase('error');
      setSteps((s) => [
        ...s,
        { label: 'Error', detail: `Redeem failed: ${describe(error)}`, tone: 'red' },
      ]);
      return;
    }

    // ── 4. Prove the receipt is single-use ────────────────────────────────
    // Worth the extra request: it shows the paywall is a real guard rather than
    // a string comparison, and it costs nothing because no second payment is
    // made.
    try {
      const replay = await fetch(url, {
        headers: { 'Payment-Receipt': receipt, 'X-Agent-Id': agentId },
      });

      let reason = '';
      try {
        const body = await replay.json();
        reason = (body as { message?: string }).message ?? '';
      } catch {
        // A non-JSON body is fine; the status is what matters.
      }

      setSteps((s) => [
        ...s,
        {
          label: 'Replay blocked',
          detail:
            replay.status === 402
              ? `Same receipt again → 402 ${reason || 'already redeemed'}`
              : `Same receipt again → ${replay.status} (expected 402)`,
          tone: replay.status === 402 ? 'accent' : 'red',
        },
      ]);
    } catch {
      // A failed replay probe is not a failed demo; the payment already settled.
    }

    setPhase('done');
  }

  const busy = phase === 'running';

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
        Live demo
      </div>
      <h1 className="text-[clamp(30px,5vw,52px)] font-extrabold tracking-tight mb-4">
        Watch a call get paid for.
      </h1>
      <p className="text-[var(--color-text-secondary)] text-lg max-w-2xl mb-10">
        {readiness === null
          ? 'Checking payment setup before enabling a paid call.'
          : readiness.ready
            ? 'Pick an endpoint to run the real three-call handshake: request without a receipt, settle the listed price on Tempo, then redeem with the receipt.'
            : 'This demo uses real Tempo transfers. Paid calls stay disabled until the signer and merchant destination are safe to use.'}
      </p>
      {readiness && !readiness.ready && (
        <div className="mb-8 max-w-2xl border-l-2 border-amber-500 pl-4 text-sm" role="status">
          <p className="font-semibold">Payments are disabled</p>
          <p className="mt-1 leading-6 text-[var(--color-text-secondary)]">{readiness.message}</p>
          <Link href="/docs/setup" className="mt-2 inline-block text-sm font-medium text-[var(--color-text-primary)] underline">
            View setup steps
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-6">
          <h2 className="font-bold text-lg mb-4">Paid endpoints</h2>
          <div className="space-y-2 mb-6">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => runTask(t.id)}
                disabled={busy || readiness?.ready !== true}
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
                <code className="text-xs text-[var(--color-text-secondary)]">
                  {t.endpoint}
                  {t.query}
                </code>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                busy
                  ? 'bg-[var(--color-text-accent)] state-pulse'
                  : phase === 'done'
                    ? 'bg-[var(--color-text-accent)]'
                    : phase === 'error'
                      ? 'bg-red-500'
                      : 'bg-[var(--color-border-control)]'
              }`}
            />
            <span className="text-[var(--color-text-secondary)]" role="status">
              {busy
                ? 'settling on chain…'
                : phase === 'done'
                  ? 'settled'
                  : phase === 'error'
                    ? 'failed'
                    : readiness === null
                      ? 'checking payment setup…'
                      : readiness.ready
                        ? 'ready to settle'
                        : 'payments disabled'}
            </span>
          </div>

          {busy && (
            <p className="mu text-xs mt-4">
              A Tempo settlement takes a few seconds to confirm. This is a real transfer, not a
              timer.
            </p>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="font-bold text-lg mb-4">Handshake</h2>
          {steps.length === 0 ? (
            <p className="mu text-sm">Run a task to see the request/402/pay/redeem sequence.</p>
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
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{s.label}</div>
                    <div className="text-sm text-[var(--color-text-secondary)] break-words">
                      {s.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {outcome && (
            <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] text-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Paid</span>
                <span className="font-semibold text-[var(--color-text-accent)]">
                  {formatCurrency(outcome.amount)} {outcome.token}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-[var(--color-text-secondary)] shrink-0">Transaction</span>
                {outcome.explorerUrl ? (
                  <a
                    href={outcome.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs underline truncate"
                  >
                    {truncate(outcome.txHash, 12, 8)}
                  </a>
                ) : (
                  <code className="text-xs">{truncate(outcome.txHash, 12, 8)}</code>
                )}
              </div>
              <div>
                <div className="text-[var(--color-text-secondary)] mb-1">Received</div>
                <pre className="text-xs bg-[var(--color-bg-page)] border border-[var(--color-border-subtle)] rounded-lg p-3 overflow-x-auto max-h-64">
                  {JSON.stringify(outcome.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mu text-sm mt-8">
        Want a model choosing which tools to pay for?{' '}
        <Link href="/agent" className="underline">
          Open the agent
        </Link>
        . That path needs an <code>LLM_GATEWAY_API_KEY</code> or <code>OPENAI_API_KEY</code>. This
        demo does not need a model key, but it does need a configured signer and merchant destination.
      </p>
    </div>
  );
}

/** Turns anything thrown into a short display string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
