import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addTransaction } from '@/lib/store';
import { getSettlementAddress, isBurnAddress, settlePayment } from '@/lib/tempo/payment';
import { getTempoSigner, isTempoSignerConfigured } from '@/lib/tempo/signer';
import { resolveToken } from '@/lib/tempo/chain';

export const runtime = 'nodejs';

const paymentSchema = z.object({
  amount: z.number().positive(),
  /** TIP-20 symbol or address. Defaults to the chain's default token. */
  token: z.string().optional(),
  /**
   * Where the payment settles.
   *
   * Optional, but it may only ever name the merchant address. This used to be
   * an arbitrary address, so a caller could settle to their own wallet and be
   * handed a receipt -- which verified, because nothing compared the on-chain
   * recipient against anything. `verifyReceipt` now enforces that too; this
   * check just fails the request loudly instead of issuing a receipt that can
   * never be redeemed.
   */
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  /** Endpoint this payment unlocks; bound into the receipt. */
  endpoint: z.string().min(1).default('/api/pay'),
  agentId: z.string().min(1).default('agt-0000'),
  currency: z.string().default('USD'),
  /** Retained for backwards compatibility with the old call shape. */
  receipt: z.string().optional(),
});

/**
 * Settles a real TIP-20 transfer on Tempo.
 *
 * Previously this minted a random `txn_…` id and pushed it to an in-memory
 * array — no chain call, no signing, nothing to verify later. It now
 * broadcasts a transfer, waits for the receipt, and returns a receipt token
 * that the paid endpoints re-check against chain.
 *
 * Returns 503 when no signer is configured, rather than pretending to succeed.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = paymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { amount, token, to, endpoint, agentId, currency } = parsed.data;

  const settlementAddress = getSettlementAddress();
  if (!settlementAddress || isBurnAddress(settlementAddress)) {
    return NextResponse.json(
      {
        error: 'Merchant destination unavailable',
        message: settlementAddress
          ? 'Set TEMPO_MERCHANT_ADDRESS to a wallet you control; known burn addresses are rejected.'
          : 'Set TEMPO_MERCHANT_ADDRESS to a valid wallet before settling payments.',
      },
      { status: 503 },
    );
  }

  if (to && to.toLowerCase() !== settlementAddress.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'Invalid settlement address',
        message: `Payments must settle to ${settlementAddress} (TEMPO_MERCHANT_ADDRESS).`,
        requested: to,
      },
      { status: 400 },
    );
  }

  if (!isTempoSignerConfigured()) {
    return NextResponse.json(
      {
        error: 'No wallet configured',
        message:
          'Set TEMPO_PRIVATE_KEY in .env.local (fund it from the Moderato faucet), or set TEMPO_SIGNER=dynamic to sign via Dynamic MPC.',
      },
      { status: 503 },
    );
  }

  try {
    const signer = getTempoSigner();
    const settlement = await settlePayment(
      {
        amount,
        to: settlementAddress,
        endpoint,
        agentId,
        token,
      },
      signer,
    );

    addTransaction({
      id: settlement.txHash,
      amount: settlement.amount,
      currency,
      receipt: settlement.receipt,
      endpoint,
      timestamp: new Date().toISOString(),
      status: 'completed',
      // Recorded so the ledger can be checked against the chain rather than
      // taken on this app's word.
      txHash: settlement.txHash,
      blockNumber: settlement.blockNumber.toString(),
      payer: settlement.from,
    });

    return NextResponse.json({
      success: true,
      transactionId: settlement.txHash,
      receipt: settlement.receipt,
      chainId: settlement.chainId,
      blockNumber: settlement.blockNumber.toString(),
      amount: settlement.amount,
      token: settlement.token.symbol,
      from: settlement.from,
      to: settlement.to,
      explorerUrl: settlement.explorerUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addTransaction({
      id: `failed_${Date.now()}`,
      amount,
      currency,
      receipt: '',
      endpoint,
      timestamp: new Date().toISOString(),
      status: 'failed',
    });

    return NextResponse.json({ error: 'Settlement failed', message }, { status: 502 });
  }
}

/** Reports the settlement token and whether a signer is ready. */
export async function GET() {
  const settlementAddress = getSettlementAddress();
  const settlesToBurnAddress = settlementAddress ? isBurnAddress(settlementAddress) : false;
  const settlementSupported = (process.env.TEMPO_SIGNER ?? 'privateKey') === 'privateKey';
  let wallet: { configured: boolean; address?: string; error?: string } = {
    configured: isTempoSignerConfigured(),
  };
  if (wallet.configured) {
    try {
      wallet = { configured: true, address: getTempoSigner().address };
    } catch (error) {
      wallet = { configured: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return NextResponse.json({
    wallet,
    defaultToken: resolveToken(),
    settlementAddress,
    merchantConfigured: Boolean(settlementAddress),
    settlesToBurnAddress,
    settlementSupported,
    paymentsReady: wallet.configured && Boolean(settlementAddress) && !settlesToBurnAddress && settlementSupported,
  });
}
