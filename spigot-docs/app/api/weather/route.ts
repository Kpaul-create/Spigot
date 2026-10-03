import { NextResponse } from 'next/server';
import { addUsageLog } from '@/lib/store';
import { priceOf } from '@/lib/pricing';
import { getCurrentWeather } from '@/lib/data/weather';
import { verifyReceipt } from '@/lib/tempo/payment';

export const runtime = 'nodejs';

/**
 * Price of this endpoint. Must match the agent's price list.
 *
 * Read from `lib/pricing` rather than written out here: the directory and the
 * demo page both advertised $0.015 while this charged $0.005.
 */
const PRICE = priceOf('/api/weather')!;

/**
 * Paid endpoint. Verifies the receipt against chain before serving.
 *
 * Same change as /api/premium-data: the old version accepted any receipt
 * string, so it was not a paywall at all.
 */
export async function GET(req: Request) {
  const receipt = req.headers.get('Payment-Receipt');

  if (!receipt) {
    return NextResponse.json(
      {
        error: 'Payment required',
        message: 'Missing Payment-Receipt header',
        price: PRICE,
        howToPay: 'POST /api/pay with { amount, endpoint: "/api/weather", agentId }',
      },
      { status: 402 },
    );
  }

  const startedAt = Date.now();
  const city = new URL(req.url).searchParams.get('city') ?? 'London';

  const verification = await verifyReceipt(receipt, {
    endpoint: '/api/weather',
    minAmount: PRICE,
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: 'Payment rejected', message: verification.reason, price: PRICE },
      { status: 402 },
    );
  }

  addUsageLog({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    endpoint: '/api/weather',
    method: 'GET',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    cost: verification.amount ?? PRICE,
    receipt,
  });

  // Upstream is fetched only after the receipt verifies, so unpaid callers never
  // cost a third party a request. A failure here means the caller has already
  // paid, so it is reported as an upstream outage — never papered over with a
  // placeholder forecast, which is what this endpoint used to return.
  let weather;
  try {
    weather = await getCurrentWeather(city);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Weather upstream unavailable',
        message:
          error instanceof Error
            ? error.message
            : 'Could not reach the weather provider. Your payment settled; retry shortly.',
        // Surfaced because it is actionable: an unknown city is the caller's
        // mistake and worth correcting, an outage is not.
        city,
        payment: {
          amount: verification.amount,
          txHash: verification.txHash,
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: weather,
    payment: {
      amount: verification.amount,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber?.toString(),
      payer: verification.from,
    },
    timestamp: new Date().toISOString(),
  });
}
