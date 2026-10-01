/**
 * A stand-in for `DynamicEvmWalletClient` backed by a local private key.
 *
 * The Dynamic MPC SDK loads Neon native binaries that only ship for Linux and
 * macOS, so neither the wallet steps (1–2) nor real MPC signing can run on
 * Windows. This client produces signatures in exactly the shape the SDK returns
 * and reproduces the SDK's hashing rules, making the Tempo signer adapter and
 * the whole MPP payment flow testable on any platform without Dynamic credentials.
 *
 * NOT a substitute for the MPC wallet in production: the private key is in
 * process memory with no threshold signature or policy enforcement.
 */
import { bytesToHex, hashTypedData, hexToBytes, keccak256, parseSignature, size, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/** Default local key for dry runs (a well-known Anvil test key — never fund it). */
export const DEFAULT_DRY_RUN_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const EVM_SIGN_MESSAGE_PREFIX = '\x19Ethereum Signed Message:\n';

/** Mirrors `formatEVMMessage` from `@dynamic-labs-wallet/node-evm`. */
function formatEVMMessage(message) {
  const hex = typeof message === 'string'
    ? stringToHex(message)
    : typeof message.raw === 'string'
      ? message.raw
      : bytesToHex(message.raw);
  return `${stringToHex(`${EVM_SIGN_MESSAGE_PREFIX}${size(hex)}`)}${hex.slice(2)}`;
}

/** Mirrors `formatEvmMessage` from `@dynamic-labs-wallet/node`. */
function hashDynamicMessage(message) {
  const bytes = typeof message === 'string' && message.startsWith('0x')
    ? Uint8Array.from(Buffer.from(message.slice(2), 'hex'))
    : message;
  return keccak256(bytes);
}

/** Converts a 65-byte serialized signature into the `{ r, s, v }` shape Dynamic returns. */
function toDynamicSignature(serializedSignature) {
  const { r, s, yParity } = parseSignature(serializedSignature);
  return { r: hexToBytes(r), s: hexToBytes(s), v: 27 + yParity };
}

/**
 * Builds a `DynamicEvmWalletClient`-compatible client from a viem account.
 *
 * The returned object has a `requests` array that records every `sign()` call,
 * useful for assertions in tests.
 *
 * @param account - Optional pre-built viem account; defaults to the dry-run key.
 */
export function createLocalKeyDynamicClient(account) {
  const signer = account ?? privateKeyToAccount(
    process.env.DYNAMIC_TEMPO_DRY_RUN_PRIVATE_KEY || DEFAULT_DRY_RUN_PRIVATE_KEY,
  );
  const requests = [];
  return {
    requests,
    async sign(parameters) {
      requests.push(parameters);
      const { message, isFormatted } = parameters;
      const hash = isFormatted
        ? (message.startsWith?.('0x') ? message : `0x${message}`)
        : hashDynamicMessage(message);
      return toDynamicSignature(await signer.sign({ hash }));
    },
    async signMessage({ message }) {
      return await signer.sign({ hash: hashDynamicMessage(formatEVMMessage(message)) });
    },
    async signTypedData({ typedData }) {
      return await signer.sign({ hash: hashTypedData(typedData) });
    },
  };
}
