import { NextResponse } from 'next/server';
import { addUsageLog } from '@/lib/store';

export async function GET(req: Request) {
  const receipt = req.headers.get('Payment-Receipt');

  if (!receipt) {
    return NextResponse.json(
      { error: 'Payment required', message: 'Missing Payment-Receipt header' },
      { status: 402 },
    );
  }

  const startTime = Date.now();
  const durationMs = Date.now() - startTime;

  addUsageLog({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    endpoint: '/api/premium-data',
    method: 'GET',
    timestamp: new Date().toISOString(),
    durationMs,
    cost: 0.02,
    receipt,
  });

  return NextResponse.json({
    data: {
      id: 'premium_001',
      title: 'Premium Data Access',
      content: 'This is exclusive premium content available only to paying users.',
      features: ['advanced_analytics', 'priority_support', 'api_access'],
      tier: 'premium',
    },
    timestamp: new Date().toISOString(),
  });
}
