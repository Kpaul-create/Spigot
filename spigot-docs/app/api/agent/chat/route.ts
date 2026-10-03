import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agent-graph';
import { describeModelError } from '@/lib/llm';

export const runtime = 'nodejs';

const chatSchema = z.object({
  message: z.string().min(1),
  /** Reuse a thread to continue a conversation with its memory intact. */
  threadId: z.string().optional(),
  agentId: z.string().optional(),
});

/**
 * Chat with the agent. Delegates to the LangGraph graph, so a message can
 * trigger a real paid tool call.
 *
 * The previous implementation keyword-matched the message, slept for a random
 * 100-500ms, and replied with a template. This calls a model and can move
 * value.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const startedAt = Date.now();

  try {
    const result = await runAgent({
      task: parsed.data.message,
      threadId: parsed.data.threadId,
      agentId: parsed.data.agentId,
    });

    return NextResponse.json({
      text: result.answer,
      toolsUsed: result.toolUsed ? [result.toolUsed] : [],
      cost: result.totalSpent,
      receipt: result.receipt,
      threadId: result.threadId,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    // A provider rate limit is not a server fault, so it is reported as 429
    // with the actionable message rather than 500 and a raw provider dump.
    const described = describeModelError(error);
    if (described) {
      return NextResponse.json(
        { error: 'Model provider rate limit', message: described.message },
        { status: described.status },
      );
    }

    return NextResponse.json(
      { error: 'Chat failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
