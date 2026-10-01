import { NextResponse } from 'next/server';
import { getTransactions } from '@/lib/store';

export async function GET() {
  const transactions = getTransactions(50);

  return NextResponse.json({
    transactions,
  });
}
