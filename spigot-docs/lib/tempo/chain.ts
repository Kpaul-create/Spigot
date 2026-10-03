/**
 * Tempo chain configuration.
 *
 * Mirrors `cli/tempo/config.js` (which is plain JS and cannot be imported from
 * the TS app), keeping the two in sync. Moderato is Tempo's testnet; its chain
 * id was confirmed live against the public RPC (0xa5bf = 42431).
 */

export interface TempoToken {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

export interface TempoChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  /** Default TIP-20 token used for settlements. */
  defaultToken: TempoToken;
  tokens: Record<string, TempoToken>;
}

export const TEMPO_MODERATO: TempoChainConfig = {
  chainId: 42431,
  name: 'Tempo Testnet (Moderato)',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
  explorerUrl: 'https://explore.testnet.tempo.xyz',
  defaultToken: {
    address: '0x20c0000000000000000000000000000000000000',
    symbol: 'PathUSD',
    decimals: 6,
  },
  tokens: {
    pathUSD: { address: '0x20c0000000000000000000000000000000000000', symbol: 'PathUSD', decimals: 6 },
    alphaUSD: { address: '0x20c0000000000000000000000000000000000001', symbol: 'AlphaUSD', decimals: 6 },
    betaUSD: { address: '0x20c0000000000000000000000000000000000002', symbol: 'BetaUSD', decimals: 6 },
    thetaUSD: { address: '0x20c0000000000000000000000000000000000003', symbol: 'ThetaUSD', decimals: 6 },
  },
};

/** Resolves the RPC URL, allowing a self-hosted node to override the default. */
export function getTempoRpcUrl(): string {
  return process.env.TEMPO_RPC_URL || TEMPO_MODERATO.rpcUrl;
}

/**
 * Resolves a token by symbol or address.
 *
 * @throws if the symbol is unknown, so a typo fails loudly instead of silently
 * settling in the wrong asset.
 */
export function resolveToken(symbolOrAddress?: string): TempoToken {
  if (!symbolOrAddress) return TEMPO_MODERATO.defaultToken;

  const bySymbol = TEMPO_MODERATO.tokens[symbolOrAddress.toLowerCase()];
  if (bySymbol) return bySymbol;

  const byAddress = Object.values(TEMPO_MODERATO.tokens).find(
    (t) => t.address.toLowerCase() === symbolOrAddress.toLowerCase(),
  );
  if (byAddress) return byAddress;

  throw new Error(
    `Unknown Tempo token "${symbolOrAddress}". Known: ${Object.values(TEMPO_MODERATO.tokens)
      .map((t) => t.symbol)
      .join(', ')}`,
  );
}
