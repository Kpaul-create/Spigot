import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addTransaction } from '@/lib/store';
import { verifyInboundPayment } from '@/lib/tempo/payment';
import { getTempoSigner, isTempoSignerConfigured } from '@/lib/tempo/signer';
import { resolveToken } from '@/lib/tempo/chain';

export const runtime = 'nodejs';

const fundSchema = z.object({
  /** Amount the caller claims to have sent, in USD. Verified against chain. */
  amount: z.number().positive(),
  /** On-chain transaction hash of the funding transfer. */
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  /** TIP-20 symbol or address that was transferred. */
  token: z.string().optional(),
});

/**
 * Credits the agent after verifying a real inbound transfer.
 *
 * The previous version accepted any `receipt` string and just incremented an
 * in-memory number, so "funding" was a self-declared amount. The amount is now
 * read from the transaction's calldata on chain, the funds must have arrived at
 * the agent's own address, and a given transaction can only be claimed once.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = fundSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!isTempoSignerConfigured()) {
    return NextResponse.json(
      {
        error: 'No wallet configured',
        message: 'Set TEMPO_PRIVATE_KEY (or TEMPO_SIGNER=dynamic) before funding.',
      },
      { status: 503 },
    );
  }

  const { amount, txHash, token } = parsed.data;

  // `resolveToken` throws on an unknown symbol, so it has to be inside the try.
  // Outside it, a bad `token` produced an uncaught exception and a bare 500
  // instead of the 400 the caller needs to see.
  let tokenInfo;
  try {
    tokenInfo = resolveToken(token);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unknown token', message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const signer = getTempoSigner();

    const verification = await verifyInboundPayment(txHash as `0x${string}`, {
      to: signer.address,
      minAmount: amount,
      token: tokenInfo.address,
    });

    if (!verification.valid) {
      return NextResponse.json(
        { error: 'Funding rejected', message: verification.reason },
        { status: 402 },
      );
    }

    addTransaction({
      id: verification.txHash ?? txHash,
      amount: verification.amount ?? amount,
      currency: tokenInfo.symbol,
      receipt: txHash,
      endpoint: '/api/agent/fund',
      timestamp: new Date().toISOString(),
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      credited: verification.amount ?? amount,
      token: tokenInfo.symbol,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber?.toString(),
      from: verification.from,
      explorerUrl: `https://explore.testnet.tempo.xyz/tx/${verification.txHash ?? txHash}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Funding verification failed', message: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
