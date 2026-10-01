import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgent } from '@/lib/agent';

const chatSchema = z.object({
  message: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const agent = getAgent();
  const response = await agent.chat(parsed.data.message);

  return NextResponse.json({
    text: response.text,
    toolsUsed: response.toolsUsed,
    cost: response.cost,
    durationMs: response.durationMs,
  });
}
