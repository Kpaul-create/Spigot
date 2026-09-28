/**
 * Dynamic server-wallet helpers (steps 1 and 2).
 *
 * 1. `createDynamicWalletClient()` builds a `DynamicEvmWalletClient` for an
 *    environment and authenticates it with an API token.
 * 2. `loadOrCreateWallet()` runs MPC keygen (`TWO_OF_TWO`) and backs the client
 *    key share up to Dynamic's client share service.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Threshold signature schemes accepted by `createWalletAccount`.
 *
 * Mirrors `ThresholdSignatureScheme` from `@dynamic-labs-wallet/node`. The values
 * are duplicated because that package loads the MPC native binaries (Neon) at
 * import time, so a static import would break the whole module graph on
 * platforms those binaries do not support (e.g. Windows).
 */
export const THRESHOLD_SIGNATURE_SCHEMES = Object.freeze({
  TWO_OF_TWO: 'TWO_OF_TWO',
  TWO_OF_THREE: 'TWO_OF_THREE',
  THREE_OF_FIVE: 'THREE_OF_FIVE',
});

/**
 * Imports `@dynamic-labs-wallet/node-evm`.
 *
 * The import is dynamic on purpose: the package loads Neon-backed MPC binaries
 * at import time and only ships builds for Linux and macOS. Loading it lazily
 * keeps every other module (config, faucet, the Tempo signer adapter) usable
 * everywhere, and turns the platform limitation into an actionable message.
 */
export async function loadDynamicEvmWalletSdk() {
  try {
    return await import('@dynamic-labs-wallet/node-evm');
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes('unsupported system'))
      throw new Error(
        `The Dynamic MPC wallet SDK cannot run on this platform (${message}). ` +
          'Steps 1, 2 and the MPC signing calls in steps 4-5 require Linux or macOS. ' +
          'Run these scripts in that environment, or use a remote signer.',
        { cause: error },
      );
    throw error;
  }
}

/**
 * Creates and authenticates a Dynamic server-wallet client for EVM (step 1).
 *
 * @example
 * ```js
 * const client = await createDynamicWalletClient({ environmentId, apiToken })
 * ```
 */
export async function createDynamicWalletClient(parameters) {
  const { environmentId, apiToken, baseApiUrl, baseMPCRelayApiUrl, debug = false, logger } = parameters;
  if (!environmentId)
    throw new Error('createDynamicWalletClient: `environmentId` is required.');
  if (!apiToken)
    throw new Error('createDynamicWalletClient: `apiToken` is required.');
  // The SDK is imported lazily (see `loadDynamicEvmWalletSdk`).
  const { DynamicEvmWalletClient } = await loadDynamicEvmWalletSdk();
  if (typeof DynamicEvmWalletClient !== 'function')
    throw new Error('createDynamicWalletClient: `DynamicEvmWalletClient` is missing from the SDK.');
  const client = new DynamicEvmWalletClient({
    environmentId,
    ...(baseApiUrl ? { baseApiUrl } : {}),
    ...(baseMPCRelayApiUrl ? { baseMPCRelayApiUrl } : {}),
    debug,
    ...(logger ? { logger } : {}),
  });
  // Exchanges the API token for a JWT (with a session key) used by every later call.
  await client.authenticateApiToken(apiToken);
  return client;
}

/**
 * Runs MPC keygen for a new EVM wallet account (step 2).
 *
 * The returned `externalServerKeyShares` are the client's key shares for the
 * session; with `backUpToClientShareService: true` they are also encrypted with
 * `password` and stored by Dynamic so they can be recovered later without the
 * original process.
 *
 * @example
 * ```js
 * const { accountAddress, walletMetadata, externalServerKeyShares } = await createWalletAccount({
 *   client,
 *   password,
 *   thresholdSignatureScheme: 'TWO_OF_TWO',
 *   backUpToClientShareService: true,
 * })
 * ```
 */
export async function createWalletAccount(parameters) {
  const {
    client,
    password,
    thresholdSignatureScheme = THRESHOLD_SIGNATURE_SCHEMES.TWO_OF_TWO,
    backUpToClientShareService = true,
    onError,
  } = parameters;
  const result = await client.createWalletAccount({
    thresholdSignatureScheme,
    password,
    // `@dynamic-labs-wallet/node-evm@1.1.x` calls this flag `backUpToDynamic`;
    // Dynamic's docs call the destination the "client share service".
    backUpToDynamic: backUpToClientShareService,
    onError,
  });
  return {
    /** Checksummed EVM address of the new wallet. */
    accountAddress: result.walletMetadata.accountAddress,
    /** Everything needed to sign later (walletId, shareSetId, derivation path, backup info). */
    walletMetadata: result.walletMetadata,
    /** Client-side MPC key shares (keep private; recoverable from the backup). */
    externalServerKeyShares: result.externalServerKeyShares,
    externalKeySharesWithBackupStatus: result.externalKeySharesWithBackupStatus,
    publicKeyHex: result.publicKeyHex,
  };
}

/** Reads a wallet record previously written by `writeWalletRecord`. */
export function readWalletRecord(storePath) {
  if (!existsSync(storePath))
    return undefined;
  const record = JSON.parse(readFileSync(storePath, 'utf8'));
  if (!record?.walletMetadata?.accountAddress)
    throw new Error(`Wallet store ${storePath} is missing walletMetadata.accountAddress.`);
  return record;
}

/**
 * Persists the wallet metadata locally.
 *
 * Only non-secret metadata is written: key shares stay in Dynamic's client share
 * service and are recovered on demand via the wallet password.
 */
export function writeWalletRecord(storePath, record) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(
    storePath,
    `${JSON.stringify(
      {
        accountAddress: record.walletMetadata.accountAddress,
        createdAt: new Date().toISOString(),
        thresholdSignatureScheme: record.walletMetadata.thresholdSignatureScheme,
        walletMetadata: record.walletMetadata,
      },
      null,
      2,
    )}\n`,
  );
  return storePath;
}

/** Deletes the local wallet record so the next run creates a fresh wallet. */
export function removeWalletRecord(storePath) {
  if (existsSync(storePath))
    rmSync(storePath);
}

/**
 * Loads the wallet for this environment, creating one when needed (step 2).
 *
 * When a wallet record exists, the client key shares are omitted on purpose:
 * `client.sign()` recovers them from Dynamic's client share service using
 * `password`. Shares created in this process are returned for immediate reuse.
 */
export async function loadOrCreateWallet(parameters) {
  const {
    client,
    password,
    storePath,
    reset = false,
    thresholdSignatureScheme = THRESHOLD_SIGNATURE_SCHEMES.TWO_OF_TWO,
    backUpToClientShareService = true,
    onError,
  } = parameters;

  if (reset)
    removeWalletRecord(storePath);

  const existing = readWalletRecord(storePath);
  if (existing) {
    return {
      accountAddress: existing.walletMetadata.accountAddress,
      walletMetadata: existing.walletMetadata,
      externalServerKeyShares: undefined,
      created: false,
      storePath,
    };
  }

  const created = await createWalletAccount({
    client,
    password,
    thresholdSignatureScheme,
    backUpToClientShareService,
    onError,
  });
  writeWalletRecord(storePath, created);
  return { ...created, created: true, storePath };
}