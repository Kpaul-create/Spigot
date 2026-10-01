/**
 * End-to-end walkthrough of the Dynamic server wallet → Tempo (MPP) integration.
 *
 * Runs the five steps in order:
 *
 * 1. build + authenticate a `DynamicEvmWalletClient` (`authenticateApiToken`),
 * 2. create (or reuse) a `TWO_OF_TWO` wallet backed up to Dynamic's client share service,
 * 3. fund it from the Tempo Moderato faucet,
 * 4. wrap the MPC signer in a Tempo-compatible viem `LocalAccount`,
 * 5. pay for a `402`-protected endpoint with MPP and print the receipt.
 *
 * Usage:
 * ```sh
 * node src/tempo/run.js                    # all five steps
 * node src/tempo/run.js --skip-faucet      # reuse an already funded wallet
 * node src/tempo/run.js --reset            # run keygen again, replacing the stored wallet
 * node src/tempo/run.js --dry-run --key 0x…  # steps 3-5 only, signing locally
 * ```
 *
 * Steps 1, 2 and the MPC signing calls require Linux or macOS (the Dynamic SDK
 * ships Neon binaries for those platforms only). Use `--dry-run` on any other
 * platform: it skips keygen and signs with a local private key instead.
 */
import { getConfig, requireDynamicCredentials, toBoolean } from './config.js';
import { DEFAULT_DRY_RUN_PRIVATE_KEY, createLocalKeyDynamicClient } from './dryRunClient.js';
import { createDynamicTempoAccount } from './dynamicTempoAccount.js';
import { createTempoPublicClient, fundTempoAccount, getTempoBalances } from './faucet.js';
import { createMppClient, payWithMpp } from './mppClient.js';

/** Parses `--flag`, `--flag=value` and `--flag value` style arguments. */
function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--'))
      continue;
    const [name, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      index += 1;
      continue;
    }
    flags[name] = true;
  }
  return flags;
}

/** Prints a titled step banner. */
function step(number, title) {
  console.log(`\n=== step ${number}: ${title} ===`);
}

/** Minimal console logger handed to the Dynamic client. */
const logger = {
  debug: () => {},
  info: (message, data) => console.log(`  [dynamic] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`  [dynamic] ${message}`, data ?? ''),
  error: (message, data) => console.error(`  [dynamic] ${message}`, data ?? ''),
};

/** Runs steps 1 and 2, returning the authenticated client and the wallet record. */
async function resolveWallet(config) {
  const { createDynamicWalletClient, loadOrCreateWallet } = await import('./dynamicWallet.js');
  const client = await createDynamicWalletClient({
    environmentId: config.environmentId,
    apiToken: config.apiToken,
    baseApiUrl: config.baseApiUrl,
    baseMPCRelayApiUrl: config.baseMPCRelayApiUrl,
    logger,
  });
  console.log('  authenticated: API token exchanged for a session JWT.');

  const wallet = await loadOrCreateWallet({
    client,
    password: config.password,
    storePath: config.walletStorePath,
    reset: config.resetWallet,
    thresholdSignatureScheme: config.thresholdSignatureScheme,
    backUpToClientShareService: config.backUpToClientShareService,
    onError: (error) => console.warn(`  [dynamic] ceremony error: ${error?.message ?? error}`),
  });

  if (wallet.created) {
    console.log(`  created ${config.thresholdSignatureScheme} wallet ${wallet.accountAddress}`);
    console.log(`  backed up to the client share service: ${config.backUpToClientShareService}`);
    console.log(
      `  externalServerKeyShares: ${
        wallet.externalServerKeyShares?.length ? `${wallet.externalServerKeyShares.length} share(s)` : 'n/a'
      }`,
    );
    console.log(`  wallet metadata saved to ${wallet.storePath}`);
  } else {
    console.log(`  reusing wallet ${wallet.accountAddress} from ${wallet.storePath}`);
    console.log('  key shares will be recovered from the client share service at signing time.');
  }

  return { client, ...wallet };
}

/** Offline stand-in for steps 1-2: a local private key signs instead of the MPC network. */
async function resolveDryRunWallet(privateKey) {
  const key = privateKey || DEFAULT_DRY_RUN_PRIVATE_KEY;
  const { privateKeyToAccount } = await import('viem/accounts');
  const localAccount = privateKeyToAccount(key);
  const client = createLocalKeyDynamicClient(localAccount);
  return {
    client,
    accountAddress: localAccount.address,
    walletMetadata: { accountAddress: localAccount.address, walletId: 'dry-run' },
    externalServerKeyShares: undefined,
  };
}

/** Runs the full five-step walkthrough. */
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const config = getConfig({
    resetWallet: flags.reset,
    skipFaucet: flags['skip-faucet'],
    thresholdSignatureScheme: flags.scheme,
    mppUrl: flags.url,
  });
  const dryRun = toBoolean(flags['dry-run']);

  // --- steps 1 + 2 ----------------------------------------------------------
  let wallet;
  if (dryRun) {
    wallet = await resolveDryRunWallet(flags.key ?? process.env.DYNAMIC_TEMPO_DRY_RUN_PRIVATE_KEY);
    step('1-2', 'skipped (--dry-run), signing locally');
    console.log(`  local account: ${wallet.accountAddress}`);
  } else {
    requireDynamicCredentials(config);
    step('1', 'create + authenticate the DynamicEvmWalletClient');
    step('2', 'create the MPC wallet (keygen)');
    wallet = await resolveWallet(config);
  }
  const address = flags.address ?? wallet.accountAddress;

  // --- step 3 ---------------------------------------------------------------
  step('3', 'fund the wallet from the Tempo Moderato faucet');
  const tempoClient = createTempoPublicClient({ rpcUrl: config.tempoRpcUrl });

  if (config.skipFaucet) {
    console.log('  skipped (TEMPO_SKIP_FAUCET / --skip-faucet).');
  } else {
    const funding = await fundTempoAccount({ address, rpcUrl: config.tempoRpcUrl, client: tempoClient });
    console.log(`  funded ${funding.address} with ${funding.hashes.length} mint transaction(s).`);
    for (const { hash, symbol } of funding.fundedTokens)
      console.log(`    ${symbol.padEnd(9)} ${hash}`);
  }

  const { balances } = await getTempoBalances({ address, rpcUrl: config.tempoRpcUrl, client: tempoClient });
  console.log('  balances:');
  for (const balance of balances)
    console.log(`    ${balance.symbol.padEnd(9)} ${balance.formatted}`);

  // --- step 4 ---------------------------------------------------------------
  step('4', 'build the chain-compatible signer');
  const account = createDynamicTempoAccount({
    client: wallet.client,
    walletMetadata: wallet.walletMetadata,
    ...(wallet.externalServerKeyShares ? { externalServerKeyShares: wallet.externalServerKeyShares } : {}),
    ...(config.password ? { password: config.password } : {}),
    context: { source: 'spigot-tempo-mpp' },
    onError: (error) => console.warn(`  [dynamic] signing error: ${error?.message ?? error}`),
  });
  console.log(`  account: ${account.address}`);
  console.log('  serializes Tempo transactions (0x76, fee-payer 0x78) and signs the pre-image over MPC.');

  // --- step 5 ---------------------------------------------------------------
  step('5', `pay for ${config.mppUrl} with MPP`);
  const mppx = createMppClient({ account, polyfill: config.polyfillFetch });
  const payment = await payWithMpp({ mppx, url: config.mppUrl });

  console.log(`  status         : ${payment.status}`);
  if (payment.receiptHeaderName) {
    console.log(`  receipt header : ${payment.receiptHeaderName}`);
    console.log(`  receipt        : ${payment.receiptHeader}`);
    console.log(`  deserialized   : ${JSON.stringify(payment.receipt, null, 2)}`);
  } else {
    console.log('  no payment receipt header on the response.');
  }
  const body = await payment.response.text().catch(() => '');
  if (body)
    console.log(`  body           : ${body.slice(0, 2000)}`);

  if (payment.status >= 400)
    throw new Error(`MPP request failed with status ${payment.status}.`);
  console.log('\nAll steps completed.');
}

main().catch((error) => {
  console.error(`\nrun failed: ${error?.message ?? error}`);
  if (error?.cause)
    console.error(`caused by: ${error.cause?.message ?? error.cause}`);
  process.exitCode = 1;
});

