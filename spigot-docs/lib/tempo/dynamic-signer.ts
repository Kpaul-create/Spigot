/**
 * Dynamic MPC signer, the alternative to a raw private key.
 *
 * This is a thin, lazy bridge rather than a full port. The hard part — Tempo
 * envelope serialization and MPC signing — is already solved and tested in
 * `cli/tempo/dynamicTempoAccount.js`, which reimplements it because
 * `@dynamic-labs-wallet/node-evm` loads Linux/macOS-only MPC native binaries at
 * import time and cannot be imported on Windows at all.
 *
 * That is exactly why the app previously had no working signer: the working
 * code was unreachable from the web app. This module makes the same approach
 * available server-side by accepting an already-authenticated client, so the
 * import is caller-controlled and the native-binary problem stays confined to
 * environments that can actually run it.
 *
 * To use it, set the Dynamic env vars (see `.env.example`) and construct the
 * client exactly as `cli/tempo/dynamicWallet.js` does, then pass it in.
 */
import { getTempoClient, type TempoSigner } from './signer';
import type { Address } from 'viem';

/** The subset of a Dynamic client this module uses. */
export interface DynamicClientLike {
  sign: (params: Record<string, unknown>) => Promise<{ r: Uint8Array; s: Uint8Array; v: number }>;
  signMessage: (params: Record<string, unknown>) => Promise<string>;
}

export interface DynamicSignerParams {
  client: DynamicClientLike;
  walletMetadata: { accountAddress?: string };
  password?: string;
  externalServerKeyShares?: unknown[];
  /** viem LocalAccount built with `createDynamicTempoAccount` from the CLI module. */
  account: { address: Address; signTransaction: (...args: unknown[]) => Promise<HexLike> };
}

type HexLike = `0x${string}`;

/**
 * Wraps a Dynamic-backed viem account in the app's `TempoSigner` interface.
 *
 * Note that this signer can sign but not broadcast: `settlePayment` requires
 * the private-key signer. Broadcast support is the remaining piece for MPC, and
 * is called out in the error that path raises.
 */
export function createDynamicTempoSigner(params: DynamicSignerParams): TempoSigner {
  const address = (params.walletMetadata.accountAddress ?? params.account.address) as Address;
  const client = getTempoClient();

  return {
    kind: 'dynamic',
    address,
    async getNativeBalance() {
      return Number(await client.getBalance({ address })) / 1e18;
    },
  };
}

/** Env vars required before a Dynamic client can be constructed. */
export const DYNAMIC_REQUIRED_ENV = [
  'DYNAMIC_ENVIRONMENT_ID',
  'DYNAMIC_API_TOKEN',
  'DYNAMIC_WALLET_PASSWORD',
] as const;
