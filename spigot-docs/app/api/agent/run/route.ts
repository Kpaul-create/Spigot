import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agent-graph';
import { describeModelError } from '@/lib/llm';

export const runtime = 'nodejs';

const runSchema = z.object({
  task: z.string().min(1),
  /** Memory key: follow-up tasks in the same thread see prior messages and spend. */
  threadId: z.string().optional(),
  agentId: z.string().optional(),
});

/**
 * Runs the LangGraph agent, which pays for tools on Tempo before calling them.
 *
 * Replaces the previous implementation, which ran three hardcoded steps with
 * `setTimeout` delays and returned a canned string. A payment failure now
 * surfaces here as an error rather than a fabricated success.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = runSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const startedAt = Date.now();

  try {
    const result = await runAgent(parsed.data);
    return NextResponse.json({ ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    const described = describeModelError(error);
    if (described) {
      return NextResponse.json(
        {
          error: 'Model provider rate limit',
          message: described.message,
          durationMs: Date.now() - startedAt,
        },
        { status: described.status },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Agent run failed', message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
