import { NextResponse } from 'next/server';
import { getStats } from '@/lib/store';

export async function GET() {
  const stats = getStats();

  return NextResponse.json({
    totalRevenue: stats.totalRevenue,
    totalCalls: stats.totalCalls,
    activeEndpoints: stats.activeEndpoints,
    avgSettlement: stats.avgSettlement,
    revenueHistory: stats.revenueHistory,
  });
}
