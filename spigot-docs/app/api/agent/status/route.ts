import { NextResponse } from 'next/server';
import { getAgent } from '@/lib/agent';

export async function GET() {
  const agent = getAgent();
  const status = agent.getStatus();

  return NextResponse.json({
    initialized: status.initialized,
    state: status.state,
    credits: status.credits,
    totalCalls: status.totalCalls,
    totalCost: status.totalCost,
    tools: status.tools,
  });
}
