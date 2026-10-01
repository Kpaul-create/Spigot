/**
 * Tempo testnet faucet (step 3).
 *
 * Moderato's faucet is the `tempo_fundAddress` JSON-RPC method on the public RPC
 * endpoint: it mints PathUSD, AlphaUSD, BetaUSD and ThetaUSD to the address.
 * The symbols/addresses below are the ones the faucet actually mints (verified
 * against `Actions.token.getMetadata`).
 */
import { createClient, getAddress, http, publicActions } from 'viem';
import { Actions } from 'viem/tempo';
import { tempoModerato } from 'viem/tempo/chains';
import { TEMPO_MODERATO } from './config.js';

/** Lowercased token address → symbol, for describing faucet mints. */
const SYMBOL_BY_TOKEN = new Map(
  Object.entries(TEMPO_MODERATO.tokens).map(([symbol, token]) => [token.toLowerCase(), symbol]),
);

/**
 * Creates a Tempo Moderato client with public actions attached.
 *
 * `publicActions` is what provides `readContract`/`getBalance`; without it a
 * plain `createClient` silently lacks those methods.
 */
export function createTempoPublicClient({ rpcUrl = TEMPO_MODERATO.rpcUrl } = {}) {
  return createClient({ chain: tempoModerato, transport: http(rpcUrl) }).extend(publicActions);
}

/**
 * Funds an address through the raw `tempo_fundAddress` JSON-RPC call.
 *
 * @returns The mint transaction hashes (one per funded token).
 */
export async function fundAddressViaJsonRpc({ address, rpcUrl = TEMPO_MODERATO.rpcUrl }) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tempo_fundAddress',
      params: [getAddress(address)],
    }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || payload?.error)
    throw new Error(
      `tempo_fundAddress failed (${response.status}): ${payload?.error?.message ?? response.statusText}`,
    );
  return (payload?.result ?? []).map((hash) => hash);
}

/**
 * Maps a faucet receipt to the token it minted by intersecting its log
 * addresses with the known Moderato test stablecoins.
 *
 * The faucet routes mints through an intermediate ledger contract, so the
 * symbol is resolved from whichever known token emitted a log in the receipt.
 */
function symbolForReceipt(receipt, fallbackSymbol) {
  for (const log of receipt.logs ?? []) {
    const symbol = SYMBOL_BY_TOKEN.get(String(log.address).toLowerCase());
    if (symbol)
      return symbol;
  }
  return fallbackSymbol;
}

/**
 * Requests test stablecoins for an address (step 3).
 *
 * Uses `Actions.faucet.fundSync`, which waits for the mints to be included in a
 * block — `Actions.faucet.fund` (and the raw JSON-RPC call) return as soon as the
 * transactions are broadcast, so balances read immediately afterwards are still
 * zero. Falls back to the raw JSON-RPC POST when the faucet is rate-limited.
 */
export async function fundTempoAccount(parameters) {
  const { rpcUrl = TEMPO_MODERATO.rpcUrl } = parameters;
  const address = getAddress(parameters.address ?? parameters.account?.address);
  const client = parameters.client ?? createTempoPublicClient({ rpcUrl });
  const symbols = Object.keys(TEMPO_MODERATO.tokens);

  let hashes;
  let receipts;
  try {
    receipts = await Actions.faucet.fundSync(client, { account: address });
    hashes = receipts.map((receipt) => receipt.transactionHash);
  } catch {
    // Fall through to the explicit JSON-RPC call below.
    hashes = await fundAddressViaJsonRpc({ address, rpcUrl });
  }

  if (hashes.length === 0)
    throw new Error(`Tempo faucet returned no mint transactions for ${address}.`);

  return {
    address,
    hashes,
    /** Mint transactions paired with the token each one funded. */
    fundedTokens: hashes.map((hash, index) => ({
      hash,
      symbol: receipts
        ? symbolForReceipt(receipts[index], symbols[index] ?? `token#${index + 1}`)
        : (symbols[index] ?? `token#${index + 1}`),
    })),
  };
}

/**
 * Reads TIP-20 balances for the known Moderato test stablecoins.
 *
 * Uses `Actions.token.getBalance`, which resolves the TIP-20 address/decimals
 * itself and is the same path `mppx` uses to pick a fee token.
 */
export async function getTempoBalances(parameters) {
  const { rpcUrl = TEMPO_MODERATO.rpcUrl } = parameters;
  const address = getAddress(parameters.address ?? parameters.account?.address);
  const client = parameters.client ?? createTempoPublicClient({ rpcUrl });
  const entries = await Promise.all(
    Object.entries(TEMPO_MODERATO.tokens).map(async ([symbol, token]) => {
      try {
        const balance = await Actions.token.getBalance(client, { account: address, token });
        return {
          symbol,
          token,
          raw: balance.amount,
          formatted: balance.formatted,
          decimals: balance.decimals,
        };
      } catch (error) {
        // Surface the failure instead of reporting a misleading zero balance.
        return { symbol, token, raw: undefined, formatted: undefined, error: error.message };
      }
    }),
  );
  return { address, balances: entries };
}
