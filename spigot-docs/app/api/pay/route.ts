import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addTransaction } from '@/lib/store';

const paymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  receipt: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = paymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { amount, currency, receipt } = parsed.data;
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  addTransaction({
    id: transactionId,
    amount,
    currency,
    receipt,
    endpoint: '/api/pay',
    timestamp: new Date().toISOString(),
    status: 'completed',
  });

  return NextResponse.json({
    success: true,
    transactionId,
  });
}
