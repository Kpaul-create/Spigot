import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgent } from '@/lib/agent';

const runSchema = z.object({
  task: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = runSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const agent = getAgent();
  const result = await agent.run(parsed.data.task);

  return NextResponse.json({
    result: result.result,
    steps: result.steps,
    cost: result.cost,
    durationMs: result.durationMs,
  });
}
