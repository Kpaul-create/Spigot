import { NextResponse } from 'next/server';
import { addUsageLog } from '@/lib/store';
import { priceOf } from '@/lib/pricing';
import { getMarketSnapshot } from '@/lib/data/market';
import { verifyReceipt } from '@/lib/tempo/payment';

export const runtime = 'nodejs';

/**
 * Price of this endpoint. Must match the agent's price list.
 *
 * Read from `lib/pricing` so the enforced price and the advertised one cannot
 * drift apart.
 */
const PRICE = priceOf('/api/premium-data')!;

/**
 * Paid endpoint. Serves data only against a verified on-chain payment.
 *
 * Previously any non-empty `Payment-Receipt` string was accepted, so
 * `demo_deadbeef` unlocked the data. The receipt is now decoded and its
 * transaction re-read from Tempo: it must exist, have succeeded, be a TIP-20
 * transfer of at least PRICE to this endpoint, and not have been redeemed
 * before.
 */
export async function GET(req: Request) {
  const receipt = req.headers.get('Payment-Receipt');

  if (!receipt) {
    return NextResponse.json(
      {
        error: 'Payment required',
        message: 'Missing Payment-Receipt header',
        price: PRICE,
        howToPay: 'POST /api/pay with { amount, endpoint: "/api/premium-data", agentId }',
      },
      { status: 402 },
    );
  }

  // The agent id was read but never passed to `verifyReceipt`, so the
  // agent-binding check was skipped and any valid receipt for this endpoint
  // could be redeemed by a different agent.
  const agentId = req.headers.get('X-Agent-Id') ?? undefined;
  const startedAt = Date.now();

  const verification = await verifyReceipt(receipt, {
    endpoint: '/api/premium-data',
    minAmount: PRICE,
    ...(agentId ? { agentId } : {}),
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: 'Payment rejected', message: verification.reason, price: PRICE },
      { status: 402 },
    );
  }

  addUsageLog({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    endpoint: '/api/premium-data',
    method: 'GET',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    cost: verification.amount ?? PRICE,
    receipt,
  });

  // Fetched after verification, so an unpaid caller never costs upstream
  // anything. If it fails the caller has already paid, so the outage is stated
  // plainly rather than replaced with the placeholder content this endpoint
  // used to serve as its payload.
  let snapshot;
  try {
    snapshot = await getMarketSnapshot();
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Market data upstream unavailable',
        message:
          error instanceof Error
            ? error.message
            : 'Could not reach the market data provider. Your payment settled; retry shortly.',
        payment: {
          amount: verification.amount,
          txHash: verification.txHash,
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: snapshot,
    payment: {
      amount: verification.amount,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber?.toString(),
      payer: verification.from,
    },
    timestamp: new Date().toISOString(),
  });
}
