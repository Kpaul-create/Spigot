import { NextResponse } from 'next/server';
import { getAgentStatus } from '@/lib/agent-graph';
import { getTempoSigner, getTokenBalance, isTempoSignerConfigured } from '@/lib/tempo/signer';
import { resolveToken } from '@/lib/tempo/chain';
import { getSettlementAddress, isBurnAddress } from '@/lib/tempo/payment';

export const runtime = 'nodejs';

/**
 * Reports what is actually configured: the wallet, its spendable balance, the
 * model, and the paid tool list.
 *
 * The previous version reported `credits` from an in-memory counter that a
 * restart wiped, which said nothing about whether a payment could happen.
 *
 * The balance it reports now is the TIP-20 balance — the thing the agent actually
 * spends. It previously reported the *native* coin balance divided by 1e18, which
 * on Moderato is not an 18-decimal value and came back as `4.24e+57`, displayed
 * beside the price list as if it were credit.
 */
export async function GET() {
  const status = getAgentStatus();
  const token = resolveToken();

  // Balance is a chain read, so it is fetched separately and allowed to fail
  // without taking the rest of the status down with it.
  let balance: number | null = null;
  let balanceError: string | undefined;

  if (status.wallet.configured && isTempoSignerConfigured()) {
    try {
      balance = await getTokenBalance(getTempoSigner().address, token);
    } catch (error) {
      balance = null;
      balanceError = error instanceof Error ? error.message : String(error);
    }
  }

  const settlementAddress = getSettlementAddress();

  return NextResponse.json({
    ...status,
    wallet: {
      ...status.wallet,
      balance,
      ...(balanceError ? { balanceError } : {}),
      /** What `balance` is denominated in, so the UI can label it. */
      balanceToken: token.symbol,
      /**
       * Decimals of `balance`, so the UI can show a precision the token can
       * actually represent. PathUSD has 6, and the cheapest tool costs 5000 base
       * units — one twentieth of a cent — so a 2dp currency format rounds every
       * payment away to nothing and the balance looks static while the agent
       * spends.
       */
      balanceDecimals: token.decimals,
      /** A valid merchant destination is required before any transfer is sent. */
      settlementAddress,
      merchantConfigured: Boolean(settlementAddress),
      settlesToBurnAddress: settlementAddress ? isBurnAddress(settlementAddress) : false,
      settlementSupported: (process.env.TEMPO_SIGNER ?? 'privateKey') === 'privateKey',
      paymentsReady:
        status.wallet.configured &&
        Boolean(settlementAddress) &&
        !isBurnAddress(settlementAddress ?? '') &&
        (process.env.TEMPO_SIGNER ?? 'privateKey') === 'privateKey',
    },
  });
}
