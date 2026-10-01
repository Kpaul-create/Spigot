import { NextResponse } from 'next/server';

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
        price: 0.02,
      },
      {
        path: '/api/weather',
        method: 'GET',
        description: 'Get weather data (requires payment)',
        price: 0.015,
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
        description: 'Chat with the AI agent',
        price: 0.01,
      },
      {
        path: '/api/agent/run',
        method: 'POST',
        description: 'Run an agent task',
        price: 0.035,
      },
      {
        path: '/api/agent/status',
        method: 'GET',
        description: 'Get agent status and credits',
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
