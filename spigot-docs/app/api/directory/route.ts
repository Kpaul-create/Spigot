import { NextResponse } from 'next/server';
import { priceOf } from '@/lib/pricing';

export async function GET() {
  return NextResponse.json({
    endpoints: [
      {
        path: '/api/health',
        method: 'GET',
        description: 'Health check endpoint',
        price: 0,
      },
      {
        path: '/api/pay',
        method: 'POST',
        description: 'Process a payment',
        price: 0,
      },
      {
        path: '/api/premium-data',
        method: 'GET',
        description: 'Access premium data (requires payment)',
        // From `lib/pricing`, the same constant the paywall enforces. This used
        // to be a hand-copied number that had already drifted from the route.
        price: priceOf('/api/premium-data') ?? 0,
      },
      {
        path: '/api/weather',
        method: 'GET',
        description: 'Get weather data (requires payment)',
        // Was 0.015 here against 0.005 actually charged.
        price: priceOf('/api/weather') ?? 0,
      },
      {
        path: '/api/directory',
        method: 'GET',
        description: 'List all available endpoints',
        price: 0,
      },
      {
        path: '/api/dashboard/stats',
        method: 'GET',
        description: 'Get dashboard statistics',
        price: 0,
      },
      {
        path: '/api/dashboard/transactions',
        method: 'GET',
        description: 'Get recent transactions',
        price: 0,
      },
      {
        path: '/api/agent/chat',
        method: 'POST',
        description:
          'Chat with the AI agent. Free to call: the agent pays for each tool out of its own wallet',
        // Was advertised at $0.01 and /api/agent/run at $0.035, but neither route
        // verifies a receipt. This directory is the machine-readable price list
        // an agent budgets from, so a price here that is not enforced makes it
        // either reserve budget it will never spend or refuse a free call.
        price: 0,
      },
      {
        path: '/api/agent/run',
        method: 'POST',
        description:
          'Run an agent task. Free to call: the agent pays for each tool out of its own wallet',
        price: 0,
      },
      {
        path: '/api/agent/status',
        method: 'GET',
        description: 'Agent wallet balance, model config and paid tool list',
        price: 0,
      },
      {
        path: '/api/agent/fund',
        method: 'POST',
        description: 'Fund the agent account',
        price: 0,
      },
    ],
  });
}
