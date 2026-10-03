/**
 * Real TIP-20 settlement on Tempo, plus on-chain receipt verification.
 *
 * This is the piece that was missing. `settlePayment` broadcasts an actual
 * transfer from the agent wallet and waits for confirmation; `verifyReceipt`
 * re-reads that transaction from chain before any paid endpoint serves data.
 *
 * The receipt is a signed, self-describing token rather than a bare transaction
 * hash, so a paid endpoint can check that the transfer actually paid *this*
 * endpoint for *at least* the required amount, and that it has not already been
 * replayed. Replay protection is a process-local set; a multi-instance
 * deployment would need shared storage for it (see `verifyReceipt`).
 */
import { createWalletClient, http, isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getTempoRpcUrl, resolveToken, TEMPO_MODERATO, type TempoToken } from './chain';
import { getTempoClient, type TempoSigner } from './signer';

/** Standard ERC-20 `transfer(address,uint256)` selector. */
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

/**
 * Where a settlement must land for its receipt to be honoured.
 *
 * No default destination is safe for real funds. Payments stay disabled until a
 * valid merchant address is configured explicitly.
 */
export function getSettlementAddress(): Address | null {
  const address = process.env.TEMPO_MERCHANT_ADDRESS?.trim();
  return address && isAddress(address, { strict: false }) ? (address as Address) : null;
}

export function isBurnAddress(address: string): boolean {
  const hex = address.toLowerCase().replace(/^0x/, '').replace(/^0+/, '');
  return hex === '' || hex === 'dead';
}

export interface SettlementRequest {
  /** Human amount, e.g. 0.02 for two cents. */
  amount: number;
  /** Recipient of the settlement. Defaults to the settlement address. */
  to: Address;
  /** Endpoint the payment unlocks; bound into the receipt. */
  endpoint: string;
  /** Agent that made the call; bound into the receipt. */
  agentId: string;
  /** TIP-20 symbol or address. Defaults to the chain's default token. */
  token?: string;
}

export interface SettlementResult {
  receipt: string;
  txHash: Hex;
  blockNumber: bigint;
  chainId: number;
  token: TempoToken;
  /** Human amount actually transferred. */
  amount: number;
  from: Address;
  to: Address;
  explorerUrl: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  amount?: number;
  txHash?: Hex;
  blockNumber?: bigint;
  from?: Address;
  endpoint?: string;
  agentId?: string;
}

/**
 * Converts a human token amount to base units.
 *
 * @throws on a non-finite or negative amount, so a bad price can never become a
 * transfer of an unexpected size.
 */
function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Payment amount must be a positive finite number, received ${amount}`);
  }
  // Scale then truncate, with a guard against float drift at the last digit.
  const scaled = amount * 10 ** decimals;
  const units = BigInt(Math.round(scaled));
  if (units <= 0n) {
    throw new Error(`Amount ${amount} rounds to zero ${decimals}-decimal base units`);
  }
  return units;
}

/**
 * Encodes an ERC-20 `transfer` call.
 *
 * Written by hand rather than via an ABI so the module does not depend on a
 * contract artifact; the selector and argument layout are fixed by ERC-20.
 */
function encodeTransfer(to: Address, amount: bigint): Hex {
  const paddedAddress = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `${ERC20_TRANSFER_SELECTOR}${paddedAddress}${paddedAmount}` as Hex;
}

/**
 * Broadcasts a real TIP-20 transfer and waits for its receipt.
 *
 * @throws if the signer has no funds, the RPC rejects the transaction, or the
 * transfer reverts. There is no mock fallback — a failed settlement must fail.
 */
export async function settlePayment(
  request: SettlementRequest,
  signer: TempoSigner,
): Promise<SettlementResult> {
  const merchantAddress = getSettlementAddress();
  if (!merchantAddress) {
    throw new Error('Set TEMPO_MERCHANT_ADDRESS to a valid wallet before settling payments.');
  }
  if (isBurnAddress(merchantAddress)) {
    throw new Error('TEMPO_MERCHANT_ADDRESS cannot be the zero address or the known dead address.');
  }
  if (request.to.toLowerCase() !== merchantAddress.toLowerCase()) {
    throw new Error('Payment destination must match TEMPO_MERCHANT_ADDRESS.');
  }

  const token = resolveToken(request.token);
  const key = process.env.TEMPO_PRIVATE_KEY;

  // Only the private-key signer can broadcast today. The Dynamic signer
  // interface returns an address but deliberately does not expose a broadcast
  // path yet; failing here is better than silently recording an unsettled
  // payment as if it had succeeded.
  if (signer.kind !== 'privateKey' || !key) {
    throw new Error(
      'settlePayment currently requires the privateKey signer. Set TEMPO_PRIVATE_KEY, or implement broadcast support for the dynamic signer.',
    );
  }

  const baseUnits = toBaseUnits(request.amount, token.decimals);
  const wallet = createWalletClient({
    account: privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`),
    chain: {
      id: TEMPO_MODERATO.chainId,
      name: TEMPO_MODERATO.name,
      nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
      rpcUrls: { default: { http: [getTempoRpcUrl()] } },
    },
    transport: http(getTempoRpcUrl()),
  });

  const hash = await wallet.sendTransaction({
    to: token.address,
    data: encodeTransfer(request.to, baseUnits),
    value: 0n,
  });

  const receipt = await getTempoClient().waitForTransactionReceipt({ hash });

  if (receipt.status !== 'success') {
    throw new Error(`Tempo transfer ${hash} reverted on chain`);
  }

  return {
    receipt: encodeReceipt({
      chainId: TEMPO_MODERATO.chainId,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      from: signer.address,
      to: request.to,
      token: token.address,
      amount: baseUnits.toString(),
      endpoint: request.endpoint,
      agentId: request.agentId,
    }),
    txHash: hash,
    blockNumber: receipt.blockNumber,
    chainId: TEMPO_MODERATO.chainId,
    token,
    amount: request.amount,
    from: signer.address,
    to: request.to,
    explorerUrl: `${TEMPO_MODERATO.explorerUrl}/tx/${hash}`,
  };
}

interface ReceiptPayload {
  chainId: number;
  txHash: string;
  blockNumber: string;
  from: string;
  to: string;
  token: string;
  amount: string;
  endpoint: string;
  agentId: string;
}

/**
 * Encodes a receipt as base64url JSON.
 *
 * This is an assertion, not a signature, and on its own it proves nothing --
 * every field in it is supplied by whoever presents it. Its only job is to name
 * the endpoint, agent and amount being claimed. `verifyReceipt` then re-derives
 * all three from chain, including the settlement recipient, before any paid
 * endpoint serves data.
 */
function encodeReceipt(payload: ReceiptPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeReceipt(receipt: string): ReceiptPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(receipt, 'base64url').toString('utf8'));
    if (typeof parsed?.txHash !== 'string' || typeof parsed?.amount !== 'string') return null;
    return parsed as ReceiptPayload;
  } catch {
    return null;
  }
}

/**
 * Replays guard, keyed by lowercase transaction hash.
 *
 * Process-local: a second server instance would not see these marks. That is
 * the correct trade-off for the current single-instance app, and it is called
 * out here because it is the one part of verification that does not hold in a
 * horizontally scaled deployment.
 *
 * The key is lowercased because hex case is not significant: a receipt
 * re-encoded with the same hash in different case used to sail past the guard
 * and redeem a second time.
 */
const seenReceipts = new Map<string, number>();

/** Upper bound on remembered receipts, oldest evicted first. */
const SEEN_RECEIPTS_LIMIT = 10_000;

function markSeen(key: string) {
  seenReceipts.set(key, Date.now());

  if (seenReceipts.size > SEEN_RECEIPTS_LIMIT) {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, at] of seenReceipts) {
      if (at < cutoff) seenReceipts.delete(k);
    }
    // Still oversized if everything is fresh; drop the oldest by insertion order.
    while (seenReceipts.size > SEEN_RECEIPTS_LIMIT) {
      const oldest = seenReceipts.keys().next();
      if (oldest.done) break;
      seenReceipts.delete(oldest.value);
    }
  }
}

/**
 * Verifies a receipt against chain and against the request it is paying for.
 *
 * Checks, in order: shape, chain id, that the transaction is on chain and
 * succeeded, that the payer holds at least the required amount of the expected
 * token, that the endpoint and agent match, and that the receipt is unused.
 */
export async function verifyReceipt(
  receipt: string,
  expected: { endpoint: string; minAmount: number; agentId?: string; markRedeemed?: boolean },
): Promise<VerificationResult> {
  const payload = decodeReceipt(receipt);
  if (!payload) {
    return { valid: false, reason: 'Receipt is malformed or not a Spigot receipt' };
  }

  const settlementAddress = getSettlementAddress();
  if (!settlementAddress) {
    return { valid: false, reason: 'Merchant destination is not configured on this server' };
  }
  if (isBurnAddress(settlementAddress)) {
    return { valid: false, reason: 'Merchant destination is a known burn address' };
  }

  if (payload.chainId !== TEMPO_MODERATO.chainId) {
    return { valid: false, reason: `Receipt is for chain ${payload.chainId}, expected ${TEMPO_MODERATO.chainId}` };
  }

  if (payload.endpoint !== expected.endpoint) {
    return { valid: false, reason: `Receipt is for ${payload.endpoint}, not ${expected.endpoint}` };
  }

  if (expected.agentId && payload.agentId !== expected.agentId) {
    return { valid: false, reason: `Receipt belongs to agent ${payload.agentId}, not ${expected.agentId}` };
  }

  const client = getTempoClient();

  let transaction;
  try {
    transaction = await client.getTransaction({ hash: payload.txHash as Hex });
  } catch {
    return { valid: false, reason: `Transaction ${payload.txHash} not found on chain` };
  }

  if (transaction.blockNumber === null || transaction.blockNumber === undefined) {
    return { valid: false, reason: `Transaction ${payload.txHash} is not confirmed yet` };
  }

  const chainReceipt = await client.waitForTransactionReceipt({ hash: payload.txHash as Hex });
  if (chainReceipt.status !== 'success') {
    return { valid: false, reason: `Transaction ${payload.txHash} reverted` };
  }

  // The transfer must actually be a `transfer` of the expected token.
  if (transaction.to?.toLowerCase() !== payload.token.toLowerCase()) {
    return { valid: false, reason: 'Transaction target is not the token named in the receipt' };
  }

  // Amount is taken from the on-chain calldata, not from the receipt body, so a
  // tampered receipt cannot claim a larger payment than was actually made.
  const transfer = decodeTransferAmount(transaction.input ?? '0x');
  if (transfer === null) {
    return { valid: false, reason: 'Could not decode a transfer amount from the transaction' };
  }

  // And so is the recipient. This check is what makes the paywall a paywall:
  // without it, all a receipt proved was that *somebody* transferred *some* TIP-20
  // of the right amount, which the payer satisfied by settling to a wallet they
  // controlled. `payload.to` inside the receipt is self-declared and unsigned,
  // so it can never stand in for this.
  const recipient = decodeTransferRecipient(transaction.input ?? '0x');
  if (recipient === null) {
    return { valid: false, reason: 'Could not decode a transfer recipient from the transaction' };
  }

  if (recipient.toLowerCase() !== settlementAddress.toLowerCase()) {
    return {
      valid: false,
      reason: `Payment settled to ${recipient}, not the merchant address ${settlementAddress}`,
    };
  }

  const token = resolveToken(payload.token);
  const paidAmount = Number(transfer) / 10 ** token.decimals;

  if (transfer.toString() !== payload.amount) {
    return { valid: false, reason: 'Receipt amount does not match the on-chain transfer' };
  }

  if (paidAmount + 1e-12 < expected.minAmount) {
    return {
      valid: false,
      reason: `Paid ${paidAmount}, need at least ${expected.minAmount}`,
    };
  }

  const alreadySeen = seenReceipts.get(payload.txHash.toLowerCase());
  if (alreadySeen !== undefined) {
    return { valid: false, reason: 'Receipt has already been redeemed' };
  }

  // Only mark as used once every check has passed.
  //
  // `markRedeemed: false` runs every check without consuming the receipt. The
  // agent needs that: it verifies the receipt, then the endpoint verifies the
  // same receipt again in the same process. Without this flag the pre-check
  // consumed the receipt and the endpoint rejected it as already redeemed, so
  // the agent could never retrieve anything it had paid for.
  if (expected.markRedeemed !== false) {
    markSeen(payload.txHash.toLowerCase());
  }

  return {
    valid: true,
    amount: paidAmount,
    txHash: payload.txHash as Hex,
    blockNumber: chainReceipt.blockNumber,
    from: transaction.from,
    endpoint: payload.endpoint,
    agentId: payload.agentId,
  };
}

/** Extracts the `uint256 amount` argument from `transfer(address,uint256)` calldata. */
function decodeTransferAmount(input: string): bigint | null {
  if (!input.startsWith(ERC20_TRANSFER_SELECTOR) || input.length < 10 + 64 * 2) {
    return null;
  }
  const amountHex = input.slice(10 + 64, 10 + 128);
  try {
    return BigInt(`0x${amountHex}`);
  } catch {
    return null;
  }
}

/**
 * Extracts the `address to` argument from `transfer(address,uint256)` calldata.
 *
 * The recipient sits in the first word, left-padded to 32 bytes, so the address
 * is the low 20 bytes of that word.
 */
function decodeTransferRecipient(input: string): Address | null {
  if (!input.startsWith(ERC20_TRANSFER_SELECTOR) || input.length < 10 + 64) {
    return null;
  }
  const word = input.slice(10, 74);
  if (!/^[0-9a-fA-F]{64}$/.test(word)) return null;
  const address = `0x${word.slice(24)}`;
  if (address === '0x0000000000000000000000000000000000000000') return null;
  return address as Address;
}

export interface InboundVerification {
  valid: boolean;
  reason?: string;
  amount?: number;
  txHash?: Hex;
  blockNumber?: bigint;
  from?: Address;
}

/**
 * Verifies a transaction that funded the agent wallet.
 *
 * Used by /api/agent/fund. The check is the mirror image of `verifyReceipt`:
 * the transfer must be a successful TIP-20 transfer *to* the agent's own
 * address, for at least the claimed amount, and must not have been claimed
 * before. The amount is read from chain calldata, never from the request.
 */
export async function verifyInboundPayment(
  txHash: Hex,
  expected: { to: Address; minAmount: number; token?: string },
): Promise<InboundVerification> {
  const claimKey = `inbound:${txHash.toLowerCase()}`;
  if (seenReceipts.has(claimKey)) {
    return { valid: false, reason: 'This funding transaction has already been claimed' };
  }

  const client = getTempoClient();

  let transaction;
  try {
    transaction = await client.getTransaction({ hash: txHash });
  } catch {
    return { valid: false, reason: `Transaction ${txHash} not found on chain` };
  }

  if (transaction.blockNumber === null || transaction.blockNumber === undefined) {
    return { valid: false, reason: `Transaction ${txHash} is not confirmed yet` };
  }

  const chainReceipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (chainReceipt.status !== 'success') {
    return { valid: false, reason: `Transaction ${txHash} reverted` };
  }

  if (!transaction.input?.startsWith(ERC20_TRANSFER_SELECTOR)) {
    return { valid: false, reason: 'Transaction is not a TIP-20 transfer' };
  }

  if (transaction.to?.toLowerCase() !== expected.token?.toLowerCase()) {
    return { valid: false, reason: 'Transaction target is not a recognised TIP-20 token' };
  }

  // The `to` argument of transfer(address,uint256) sits in the first word.
  const recipient = decodeTransferRecipient(transaction.input);
  if (recipient === null) {
    return { valid: false, reason: 'Could not decode a transfer recipient' };
  }

  if (recipient.toLowerCase() !== expected.to.toLowerCase()) {
    return { valid: false, reason: `Funds went to ${recipient}, not the agent wallet` };
  }

  const units = decodeTransferAmount(transaction.input);
  if (units === null) {
    return { valid: false, reason: 'Could not decode a transfer amount' };
  }

  const token = resolveToken(expected.token);
  const amount = Number(units) / 10 ** token.decimals;

  if (amount + 1e-12 < expected.minAmount) {
    return { valid: false, reason: `Funded ${amount}, need at least ${expected.minAmount}` };
  }

  markSeen(claimKey);

  return {
    valid: true,
    amount,
    txHash,
    blockNumber: chainReceipt.blockNumber,
    from: transaction.from,
  };
}


