import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgent } from '@/lib/agent';

const fundSchema = z.object({
  amount: z.number().positive(),
  receipt: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = fundSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const agent = getAgent();
  const result = agent.fund(parsed.data.amount, parsed.data.receipt);

  return NextResponse.json({
    success: result.success,
    added: result.added,
    balance: result.balance,
    paymentId: result.paymentId,
  });
}
