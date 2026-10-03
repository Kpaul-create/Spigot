/**
 * A single signing interface over the two ways the agent wallet can sign.
 *
 * The app previously had no signer at all: `/api/pay` minted a random id and
 * `/api/premium-data` accepted any `Payment-Receipt` string, so nothing ever
 * moved value. The real Tempo signing code existed only in `cli/tempo/`, which
 * no route imported.
 *
 * Two implementations sit behind this interface:
 *
 *  - `privateKey` — a viem local account from `TEMPO_PRIVATE_KEY`. Works today.
 *  - `dynamic`    — the Dynamic MPC wallet, reusing the Tempo envelope
 *    serialization already proven in `cli/tempo/dynamicTempoAccount.js`.
 *
 * They are interchangeable so a deployment can move from a test key to MPC
 * without touching call sites.
 */
import { createPublicClient, http, parseEther, type Address, type PublicClient } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getTempoRpcUrl, TEMPO_MODERATO } from './chain';
import { DYNAMIC_REQUIRED_ENV } from './dynamic-signer';

export type SignerKind = 'privateKey' | 'dynamic';

/** The minimum an agent wallet must do to settle a payment. */
export interface TempoSigner {
  readonly kind: SignerKind;
  /** Checksummed address funds are held at. */
  readonly address: Address;
  /** Native balance in whole units, for diagnostics. */
  getNativeBalance(): Promise<number>;
}

/** Read-only client shared by both signers for chain queries. */
export function getTempoClient(): PublicClient {
  return createPublicClient({
    transport: http(getTempoRpcUrl()),
  }) as PublicClient;
}

function toNumber(value: bigint): number {
  // 18 decimals for the native coin; precision beyond that is irrelevant here.
  return Number(value) / 1e18;
}

/**
 * Reads a TIP-20 balance by calling `balanceOf(address)`.
 *
 * The agent spends stablecoins, not the native coin, so the number that decides
 * whether it can afford a call is this one. `balance` on the status endpoint was
 * reading the *native* balance and dividing by 1e18, which on Moderato produced
 * figures like `4.24e+57` — displayed next to the price list as though it were
 * spendable credit.
 */
export async function getTokenBalance(
  address: Address,
  token: { address: Address; decimals: number },
): Promise<number> {
  // `balanceOf(address)`: 32-byte address left-aligned into a 32-byte word.
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;

  // The RPC returns a bare hex word, but `call`'s return shape has varied across
  // viem versions — some return the word, some wrap it as `{ data }`. Both are
  // handled here so a dependency bump cannot silently turn the balance into
  // `null` and make a funded wallet look broke.
  const result: unknown = await getTempoClient().call({
    to: token.address,
    data: data as `0x${string}`,
  });

  const word =
    typeof result === 'string'
      ? result
      : typeof (result as { data?: unknown })?.data === 'string'
        ? (result as { data: string }).data
        : null;

  if (!word || word === '0x') {
    throw new Error(`No balance returned for ${token.address}`);
  }

  return Number(BigInt(word)) / 10 ** token.decimals;
}

/**
 * Builds a signer from the environment.
 *
 * @throws with actionable guidance rather than returning null, so a missing
 * key surfaces at the call site instead of silently degrading to a mock.
 */
export function getTempoSigner(): TempoSigner {
  const mode = (process.env.TEMPO_SIGNER ?? 'privateKey') as SignerKind;

  if (mode === 'dynamic') {
    // Imported lazily so deployments using a plain key never load the Dynamic
    // SDK (its native MPC binaries are not available on every platform).
    throw new Error(
      'TEMPO_SIGNER=dynamic requires the Dynamic MPC client. Import createDynamicTempoSigner from lib/tempo/dynamic-signer and call it with an authenticated client; see that module for the required env vars.',
    );
  }

  const key = process.env.TEMPO_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'TEMPO_PRIVATE_KEY is not set. Add a testnet key to .env.local (fund it from the Moderato faucet), or set TEMPO_SIGNER=dynamic to sign via Dynamic MPC instead.',
    );
  }

  const account: PrivateKeyAccount = privateKeyToAccount(
    (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`,
  );
  const client = getTempoClient();

  return {
    kind: 'privateKey',
    address: account.address,
    /**
     * Kept for diagnostics only. The native coin funds gas, not payments —
     * `getTokenBalance` is what reports spendable credit.
     *
     * On Moderato this returns an implausibly large figure, because the native
     * unit is not an 18-decimal ERC-20 value the way mainnet chains are. It is
     * no longer surfaced as the agent's balance for exactly that reason.
     */
    async getNativeBalance() {
      return toNumber(await client.getBalance({ address: account.address }));
    },
  };
}

/**
 * True when a signer can be constructed, without throwing.
 *
 * The dynamic branch checked two of the three variables `DYNAMIC_REQUIRED_ENV`
 * demands, so a Dynamic setup missing `DYNAMIC_WALLET_PASSWORD` reported
 * `configured: true` and then threw on first use — which surfaced as a status
 * page claiming a wallet that could not sign anything. Delegate to the one
 * authoritative list instead of restating it.
 */
export function isTempoSignerConfigured(): boolean {
  if ((process.env.TEMPO_SIGNER ?? 'privateKey') === 'dynamic') {
    return DYNAMIC_REQUIRED_ENV.every((key) => Boolean(process.env[key]));
  }
  return Boolean(process.env.TEMPO_PRIVATE_KEY);
}

/** Re-exported so callers do not need a second viem import for units. */
export { parseEther, TEMPO_MODERATO };
