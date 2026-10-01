/**
 * `createDynamicTempoAccount` — a chain-compatible viem `LocalAccount` backed by
 * a Dynamic MPC wallet (step 4).
 *
 * Dynamic's own viem account adapter signs transactions with viem's
 * `serializeTransaction`, which only understands legacy/EIP-2930/1559/4844/7702
 * type bytes. Tempo transactions are a custom type (`0x76`, fee-payer `0x78`),
 * so this adapter instead:
 *
 * 1. serializes the transaction with Tempo's serializer (`TxEnvelopeTempo`
 *    re-exported by `viem/tempo`) to obtain the signing pre-image,
 * 2. asks Dynamic to sign those raw bytes over MPC (Dynamic hashes them with
 *    keccak256 — the same digest `TxEnvelopeTempo.getSignPayload` computes), and
 * 3. re-serializes the transaction with the returned ECDSA signature
 *    (`r`, `s`, `yParity`).
 *
 * `signMessage` and `signTypedData` are forwarded to the Dynamic client, so
 * SIWE/EIP-712 flows keep working with the same MPC account.
 *
 * The module itself only depends on `viem`/`viem/tempo`; the Dynamic client is
 * injected, and the two Dynamic formatting helpers this adapter needs are
 * inlined as byte-identical mirrors (see `serializeECDSASignature`) because
 * `@dynamic-labs-wallet/node-evm` bundles macOS/Linux-only MPC native binaries
 * and cannot be imported on Windows at all.
 */

import { bytesToHex, keccak256, parseSignature, serializeSignature, stringToHex } from 'viem';
import { toAccount } from 'viem/accounts';
import { Transaction as TempoTransaction } from 'viem/tempo';

/** Chain name Dynamic uses for EVM wallets. */
const EVM_CHAIN_NAME = 'EVM';

/** Dynamic wallet operation used for transaction signing (string value of `WalletOperation`). */
const SIGN_TRANSACTION = 'SIGN_TRANSACTION';

/**
 * Turns the `{ r, s, v }` signature Dynamic returns into the 65-byte
 * `r‖s‖yParity+27` signature viem accepts.
 *
 * `v` is the Ethereum-style recovery id `27 | 28` (29/30 are accepted by the
 * SDK's `EcdsaSignature` but are not secp256k1-EVM values) — it is never the
 * bare `0 | 1` yParity, because `EcdsaSignature`'s constructor throws a
 * `RangeError` for anything outside `27..30`.
 *
 * Byte-identical mirror of `serializeECDSASignature` from
 * `@dynamic-labs-wallet/node-evm`. It is inlined rather than imported because
 * that package loads Linux/macOS-only MPC native binaries at import time, so
 * importing it breaks on Windows (and in any environment without them).
 */
export function serializeECDSASignature(signature) {
  return serializeSignature({
    r: `0x${Buffer.from(signature.r).toString('hex')}`,
    s: `0x${Buffer.from(signature.s).toString('hex')}`,
    v: BigInt(signature.v),
  });
}

/**
 * Describes a transaction to Dynamic as an EVM transaction (`context.evmTransaction`).
 *
 * Dynamic uses this for policy evaluation and for the confirmation screen a user
 * approves, so it must match what the SDK would send.
 *
 * Byte-identical mirror of `mapTransactionToEvmTransaction` from
 * `@dynamic-labs-wallet/node-evm` (see `serializeECDSASignature` for why it is
 * inlined) — including its `value ? … : undefined` truthiness semantics.
 */
export function mapTransactionToEvmTransaction(transaction) {
  return {
    to: transaction.to ?? '',
    data: transaction.data,
    gas: transaction.gas ? `0x${transaction.gas.toString(16)}` : undefined,
    gasPrice: transaction.gasPrice ? `0x${transaction.gasPrice.toString(16)}` : undefined,
    maxFeePerGas: transaction.maxFeePerGas ? `0x${transaction.maxFeePerGas.toString(16)}` : undefined,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
      ? `0x${transaction.maxPriorityFeePerGas.toString(16)}`
      : undefined,
    nonce: transaction.nonce,
    value: transaction.value ? `0x${transaction.value.toString(16)}` : undefined,
    chainId: transaction.chainId ?? 0,
  };
}

/**
 * Tempo transaction serializer (`viem/tempo` → `ox/tempo#TxEnvelopeTempo`).
 *
 * Supports Tempo envelopes and falls back to viem's serializer for standard
 * transaction types, so the same adapter works on any EVM chain.
 *
 * `viem/tempo` now returns a `Promise` from `Transaction.serialize`, so this
 * wrapper is async and always awaits it.
 */
export async function tempoTransactionSerializer(transaction, signature) {
  return await TempoTransaction.serialize(transaction, signature);
}

/**
 * Clears the sender signature from a transaction.
 *
 * viem's Tempo serializer prefers `transaction.signature` over the signature
 * passed as its second argument (`serializeTempo` checks `transaction.signature`
 * first). Every value consumed here must therefore have it cleared, otherwise a
 * caller-supplied signature would be signed over and broadcast in place of the
 * one this account just produced.
 */
function withoutSenderSignature(transaction) {
  return { ...transaction, signature: undefined };
}

/**
 * Produces exactly the envelope Tempo hashes for the sender signature
 * (`TxEnvelopeTempo.encodeForSigning`): no sender signature, and a fee-payer
 * signature (if present) normalized to the `null` pre-sign marker.
 */
function toPresignTransaction(transaction) {
  const unsigned = withoutSenderSignature(transaction);
  return transaction.feePayerSignature !== undefined ? { ...unsigned, feePayerSignature: null } : unsigned;
}

/**
 * Computes the keccak256 sign payload Tempo expects for a transaction
 * (equivalent to `TxEnvelopeTempo.getSignPayload`).
 *
 * Async because the underlying serializer now returns a Promise.
 */
export async function getTempoSignPayload(transaction, options = {}) {
  const serializer = options.serializer ?? tempoTransactionSerializer;
  return keccak256(await serializer(toPresignTransaction(transaction)));
}

/**
 * Normalizes a viem `SignableMessage` into the `{ raw }` shape Dynamic expects.
 *
 * viem signs plain strings as UTF-8 text (never as hex), and wraps `{ raw }`
 * bytes with the EIP-191 prefix; Dynamic's `signMessage` applies the same prefix,
 * so forwarding the message verbatim keeps the produced signature identical to
 * `privateKeyToAccount(...).signMessage(...)`.
 */
function normalizeMessage(message) {
  if (typeof message === 'string')
    return { raw: stringToHex(message) };
  const raw = message && typeof message === 'object' && 'raw' in message ? message.raw : message;
  if (typeof raw === 'string')
    return { raw };
  return { raw: bytesToHex(new Uint8Array(raw)) };
}

/** Describes a Tempo transaction to Dynamic's policy engine as an EVM transaction. */
function toEvmTransactionContext(transaction) {
  const primaryCall = transaction.calls?.[0];
  return mapTransactionToEvmTransaction({
    ...transaction,
    to: transaction.to ?? primaryCall?.to,
    data: transaction.data ?? primaryCall?.data,
    value: transaction.value ?? primaryCall?.value,
  });
}

/**
 * Creates a Tempo-compatible viem local account driven by a Dynamic MPC wallet.
 *
 * @param parameters.client - Authenticated `DynamicEvmWalletClient`.
 * @param parameters.walletMetadata - Wallet metadata returned by `createWalletAccount`.
 * @param parameters.externalServerKeyShares - Optional in-memory client key shares.
 *   When omitted, Dynamic recovers them from the client share service using `password`.
 * @param parameters.password - Wallet password protecting the client share backup.
 * @param parameters.accountAddress - Optional address override (defaults to `walletMetadata.accountAddress`).
 * @param parameters.context - Optional Dynamic signing context merged into every request.
 * @param parameters.onError - Optional Dynamic error callback.
 * @param parameters.signMode - `'raw'` (default) signs the serialized transaction bytes;
 *   `'prehashed'` signs `keccak256(serialized)` as an already-hashed digest.
 */
export function createDynamicTempoAccount(parameters) {
  const { client, walletMetadata, externalServerKeyShares, password, onError, signMode = 'raw' } = parameters;
  if (!client || typeof client.sign !== 'function')
    throw new Error('createDynamicTempoAccount: an authenticated Dynamic wallet client is required.');
  const address = parameters.accountAddress ?? walletMetadata?.accountAddress;
  if (!address)
    throw new Error('createDynamicTempoAccount: `walletMetadata.accountAddress` (or `accountAddress`) is required.');
  if (signMode !== 'raw' && signMode !== 'prehashed')
    throw new Error(`createDynamicTempoAccount: unsupported signMode "${signMode}".`);

  /** Dynamic signing parameters shared by every operation. */
  const baseParameters = () => ({
    accountAddress: address,
    chainName: EVM_CHAIN_NAME,
    walletMetadata,
    ...(password ? { password } : {}),
    ...(externalServerKeyShares?.length ? { externalServerKeyShares } : {}),
    ...(onError ? { onError } : {}),
  });

  const signContext = (transaction) => ({
    ...(parameters.context ?? {}),
    evmTransaction: toEvmTransactionContext(transaction),
  });

  /** Signs an already-hashed 32-byte digest; returns a 65-byte `r‖s‖v` signature. */
  async function signHash(hash, transaction) {
    const signatureEcdsa = await client.sign({
      ...baseParameters(),
      // `signPrehashedMessage` passes the digest as bare hex with `isFormatted: true`.
      message: hash.startsWith('0x') ? hash.slice(2) : hash,
      isFormatted: true,
      walletOperation: SIGN_TRANSACTION,
      context: transaction ? signContext(transaction) : parameters.context,
    });
    return serializeECDSASignature(signatureEcdsa);
  }

  /** Signs serialized transaction bytes with the MPC wallet. */
  async function signSerializedTransaction(serializedTransaction, transaction) {
    const signatureEcdsa = await client.sign({
      ...baseParameters(),
      message: Uint8Array.from(Buffer.from(serializedTransaction.slice(2), 'hex')),
      walletOperation: SIGN_TRANSACTION,
      context: signContext(transaction),
    });
    return serializeECDSASignature(signatureEcdsa);
  }

  const account = toAccount({
    address,
    /** Raw digest signing (`LocalAccount.sign`). */
    async sign({ hash }) {
      return await signHash(hash);
    },
    async signMessage({ message }) {
      return await client.signMessage({
        ...baseParameters(),
        message: normalizeMessage(message),
      });
    },
    async signTypedData(typedData) {
      return await client.signTypedData({
        ...baseParameters(),
        typedData,
      });
    },
    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? tempoTransactionSerializer;
      const unsignedTransaction = await serializer(toPresignTransaction(transaction));
      const serializedSignature = signMode === 'prehashed'
        ? await signHash(keccak256(unsignedTransaction), transaction)
        : await signSerializedTransaction(unsignedTransaction, transaction);
      const { r, s, yParity } = parseSignature(serializedSignature);
      return await serializer(withoutSenderSignature(transaction), { r, s, yParity });
    },
  });

  return Object.assign(account, {
    /** Wallet metadata used for signing (walletId, shareSetId, backup info). */
    walletMetadata,
    /** Signing mode used by `signTransaction`. */
    signMode,
    /** Tempo serializer this account uses when the client does not provide one. */
    tempoSerializer: tempoTransactionSerializer,
  });
}
