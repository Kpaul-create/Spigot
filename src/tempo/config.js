/**
 * Configuration for the Dynamic server wallet → Tempo (MPP) integration.
 *
 * Values come from the process environment and, when present, from the
 * project-root `.env` file (see `.env.example`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root. */
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Tempo Moderato (testnet) chain metadata — mirrors `viem/tempo/chains#tempoModerato`. */
export const TEMPO_MODERATO = {
  chainId: 42431,
  name: 'Tempo Testnet (Moderato)',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
  explorerUrl: 'https://explore.testnet.tempo.xyz',
  /** Test stablecoins minted by the Moderato faucet (`tempo_fundAddress`). */
  tokens: {
    pathUSD: '0x20c0000000000000000000000000000000000000',
    alphaUSD: '0x20c0000000000000000000000000000000000001',
    betaUSD: '0x20c0000000000000000000000000000000000002',
    thetaUSD: '0x20c0000000000000000000000000000000000003',
  },
  /** On-chain symbol per token address (verified via `Actions.token.getMetadata`). */
  tokenSymbols: {
    '0x20c0000000000000000000000000000000000000': 'PathUSD',
    '0x20c0000000000000000000000000000000000001': 'AlphaUSD',
    '0x20c0000000000000000000000000000000000002': 'BetaUSD',
    '0x20c0000000000000000000000000000000000003': 'ThetaUSD',
  },
};

/** MPP demo endpoint that answers with `402 Payment Required`. */
export const MPP_PAID_PING_URL = 'https://mpp.dev/api/ping/paid';

/** Default local store for the wallet metadata returned by `createWalletAccount`. */
export const DEFAULT_WALLET_STORE_PATH = resolve(projectRoot, '.dynamic-wallet.json');

/** Parses a dotenv-style file into key/value pairs. */
function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#'))
      continue;
    const separator = line.indexOf('=');
    if (separator === -1)
      continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
      value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

/**
 * Loads `.env` values into `process.env` without overriding already-set variables.
 *
 * @returns The parsed, unmerged values.
 */
export function loadEnv(path = resolve(projectRoot, '.env')) {
  if (!existsSync(path))
    return {};
  const values = parseEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(values))
    if (process.env[key] === undefined)
      process.env[key] = value;
  return values;
}

/** Coerces a string/boolean env value into a boolean. */
export function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '')
    return fallback;
  if (typeof value === 'boolean')
    return value;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

/**
 * Resolves the runtime configuration for the integration.
 *
 * @param overrides - Optional overrides (e.g. from CLI flags).
 */
export function getConfig(overrides = {}) {
  loadEnv();
  const walletStore = overrides.walletStorePath ?? process.env.DYNAMIC_WALLET_STORE ?? DEFAULT_WALLET_STORE_PATH;
  return {
    /** Dynamic environment ID used to build the server-wallet client (step 1). */
    environmentId: overrides.environmentId ?? process.env.DYNAMIC_ENVIRONMENT_ID,
    /** Dynamic API token exchanged for a short-lived JWT (step 1). */
    apiToken: overrides.apiToken ?? process.env.DYNAMIC_API_TOKEN,
    /** Password protecting the wallet's client (external server) key share backup. */
    password: overrides.password ?? process.env.DYNAMIC_WALLET_PASSWORD,
    /** Optional overrides for self-hosted/staging Dynamic deployments. */
    baseApiUrl: overrides.baseApiUrl ?? process.env.DYNAMIC_BASE_API_URL,
    baseMPCRelayApiUrl: overrides.baseMPCRelayApiUrl ?? process.env.DYNAMIC_BASE_MPC_RELAY_API_URL,
    /** Local JSON file holding the wallet metadata (key shares stay in Dynamic). */
    walletStorePath: isAbsolute(walletStore) ? walletStore : resolve(projectRoot, walletStore),
    /** Refresh the wallet record by running keygen again. */
    resetWallet: toBoolean(overrides.resetWallet ?? process.env.DYNAMIC_RESET_WALLET),
    /** Threshold signature scheme for `createWalletAccount` (step 2). */
    thresholdSignatureScheme: overrides.thresholdSignatureScheme ?? process.env.DYNAMIC_THRESHOLD_SIGNATURE_SCHEME ?? 'TWO_OF_TWO',
    /**
     * Back the client share up to Dynamic's client share service (step 2).
     *
     * `@dynamic-labs-wallet/node-evm@1.1.x` exposes this flag as `backUpToDynamic`.
     */
    backUpToClientShareService: toBoolean(
      overrides.backUpToClientShareService ?? process.env.DYNAMIC_BACKUP_TO_CLIENT_SHARE_SERVICE,
      true,
    ),
    /** Tempo Moderato RPC endpoint (faucet + balances + chain reads). */
    tempoRpcUrl: overrides.tempoRpcUrl ?? process.env.TEMPO_RPC_URL ?? TEMPO_MODERATO.rpcUrl,
    /** Skip faucet funding (the wallet may already hold test stablecoins). */
    skipFaucet: toBoolean(overrides.skipFaucet ?? process.env.TEMPO_SKIP_FAUCET),
    /** 402-protected endpoint paid through MPP (step 5). */
    mppUrl: overrides.mppUrl ?? process.env.MPP_URL ?? MPP_PAID_PING_URL,
    /** Whether `Mppx.create` should wrap `globalThis.fetch` globally. */
    polyfillFetch: toBoolean(overrides.polyfillFetch ?? process.env.MPP_POLYFILL_FETCH, false),
  };
}

/** Throws a descriptive error when the Dynamic credentials required by step 1 are missing. */
export function requireDynamicCredentials(config) {
  const missing = [];
  if (!config.environmentId)
    missing.push('DYNAMIC_ENVIRONMENT_ID');
  if (!config.apiToken)
    missing.push('DYNAMIC_API_TOKEN');
  if (config.backUpToClientShareService && !config.password)
    missing.push('DYNAMIC_WALLET_PASSWORD (required when backing up the client share to Dynamic)');
  if (missing.length > 0)
    throw new Error(
      `Missing configuration: ${missing.join(', ')}. Copy .env.example to .env and fill in your Dynamic values.`,
    );
  return config;
}