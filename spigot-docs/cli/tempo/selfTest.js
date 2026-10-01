/**
 * Offline self-test for the Dynamic → Tempo signer adapter (steps 1–5).
 *
 * Validates without Dynamic credentials by driving the adapter with a local
 * private key that produces signatures in exactly the shape the Dynamic client
 * returns (`{ r: Uint8Array, s: Uint8Array, v: 27 | 28 }`).
 *
 * Checks:
 * - Tempo transactions serialize with type `0x76` and recover to the account address
 * - the bytes signed equal `TxEnvelopeTempo.getSignPayload`
 * - fee-payer (sponsored) transactions use the `0x78` envelope
 * - a pre-existing `signature` on the input is never signed over
 * - standard EIP-1559 transactions fall back through the same adapter
 * - `signMessage` / `signTypedData` / `sign` recover to the account address
 * - the inlined Dynamic helpers match the SDK output byte for byte
 * - `Mppx.create({ methods: [tempo({ account })] })` accepts the account
 *
 * Run with: `node src/tempo/selfTest.js`
 */
import assert from 'node:assert/strict';
import {
  hashTypedData,
  hexToBytes,
  keccak256,
  recoverTransactionAddress,
  verifyMessage,
  verifyTypedData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Transaction } from 'viem/tempo';
import { tempoModerato } from 'viem/tempo/chains';
import { createLocalKeyDynamicClient, DEFAULT_DRY_RUN_PRIVATE_KEY } from './dryRunClient.js';
import {
  createDynamicTempoAccount,
  getTempoSignPayload,
  mapTransactionToEvmTransaction,
  serializeECDSASignature,
  tempoTransactionSerializer,
} from './dynamicTempoAccount.js';
import { createMppClient } from './mppClient.js';

const signer = privateKeyToAccount(DEFAULT_DRY_RUN_PRIVATE_KEY);
const walletMetadata = { accountAddress: signer.address, walletId: 'wallet-self-test' };

const dynamicClient = createLocalKeyDynamicClient(signer);
const account = createDynamicTempoAccount({ client: dynamicClient, walletMetadata });

// --- account shape -----------------------------------------------------------
assert.equal(account.address, signer.address, 'address mismatch');
assert.equal(account.type, 'local', 'account.type must be `local`');
assert.equal(account.source, 'custom', 'account.source must be `custom`');

// --- Tempo transaction signing -----------------------------------------------
const tempoTransaction = {
  chainId: tempoModerato.id,
  calls: [{ to: '0x20c0000000000000000000000000000000000000', data: '0xdeadbeef', value: 0n }],
  feeToken: '0x20c0000000000000000000000000000000000000',
  gas: 50000n,
  maxFeePerGas: 1000000000n,
  maxPriorityFeePerGas: 1000000n,
  nonce: 0,
  nonceKey: 0n,
  validBefore: Math.floor(Date.now() / 1000) + 25,
};

const signedTempoTx = await account.signTransaction(tempoTransaction, {
  serializer: tempoTransactionSerializer,
});
assert.ok(signedTempoTx.startsWith('0x76'), `expected Tempo envelope, got ${signedTempoTx.slice(0, 4)}`);

const payload = getTempoSignPayload(tempoTransaction);
assert.equal(payload, Transaction.z_TxEnvelopeTempo.getSignPayload(tempoTransaction), 'sign payload mismatch');

const recoveredTempo = Transaction.z_SignatureEnvelope.extractAddress({
  payload,
  root: true,
  signature: Transaction.deserialize(signedTempoTx).signature,
});
assert.equal(
  String(recoveredTempo).toLowerCase(),
  signer.address.toLowerCase(),
  'Tempo signature does not recover to the wallet address',
);

// --- bytes handed to the MPC network must be Tempo's signing pre-image -------
const lastRequest = dynamicClient.requests.at(-1);
assert.equal(lastRequest.accountAddress, signer.address, 'accountAddress not forwarded');
assert.equal(lastRequest.chainName, 'EVM', 'chainName not forwarded');
assert.equal(lastRequest.walletOperation, 'SIGN_TRANSACTION', 'walletOperation not forwarded');
assert.equal(lastRequest.isFormatted, undefined, 'raw mode must not mark the message as pre-hashed');
assert.ok(lastRequest.message instanceof Uint8Array, 'raw mode must send serialized transaction bytes');
assert.equal(
  `0x${Buffer.from(lastRequest.message).toString('hex')}`,
  Transaction.z_TxEnvelopeTempo.encodeForSigning(tempoTransaction),
  'bytes sent to Dynamic must equal TxEnvelopeTempo.encodeForSigning',
);
assert.equal(keccak256(lastRequest.message), payload, 'Dynamic would hash different bytes than Tempo');
assert.equal(lastRequest.context.evmTransaction.to, tempoTransaction.calls[0].to, 'evmTransaction.to not set');
assert.equal(lastRequest.context.evmTransaction.data, '0xdeadbeef', 'evmTransaction.data not set');
assert.equal(lastRequest.context.evmTransaction.chainId, tempoModerato.id, 'evmTransaction.chainId not set');
assert.equal(lastRequest.context.evmTransaction.gas, '0xc350', 'evmTransaction.gas not set');

// --- a caller-supplied signature must never be signed over -------------------
const staleSignature = Transaction.deserialize(signedTempoTx).signature;
const resignedWithStale = await account.signTransaction(
  { ...tempoTransaction, nonce: 3, signature: staleSignature },
  { serializer: tempoModerato.serializers.transaction },
);
const resignedFresh = await account.signTransaction(
  { ...tempoTransaction, nonce: 3 },
  { serializer: tempoModerato.serializers.transaction },
);
assert.equal(resignedWithStale, resignedFresh, 'stale signature leaked into the signing pre-image');

// --- fee-payer (sponsored) envelopes use the 0x78 format ---------------------
const sponsoredTx = { ...tempoTransaction, nonce: 4, feePayer: true };
const signedSponsored = await account.signTransaction(sponsoredTx, {
  serializer: tempoModerato.serializers.transaction,
});
assert.ok(signedSponsored.startsWith('0x78'), `expected fee-payer envelope, got ${signedSponsored.slice(0, 4)}`);
assert.equal(
  keccak256(dynamicClient.requests.at(-1).message),
  Transaction.z_TxEnvelopeTempo.getSignPayload({ ...sponsoredTx, feePayerSignature: null }),
  'sponsored transactions must sign the null fee-payer marker envelope',
);

// --- chain serializer from viem/tempo/chains works too -----------------------
const signedViaChain = await account.signTransaction(tempoTransaction, {
  serializer: tempoModerato.serializers.transaction,
});
assert.ok(signedViaChain.startsWith('0x76'), 'chain serializer path failed');

// --- standard EIP-1559 transactions fall back to viem's serializer -----------
const eip1559Tx = {
  chainId: 1,
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1n,
  gas: 21000n,
  maxFeePerGas: 1000000000n,
  maxPriorityFeePerGas: 1000000n,
  nonce: 1,
  type: 'eip1559',
};
const signedEip1559 = await account.signTransaction(eip1559Tx, { serializer: tempoTransactionSerializer });
assert.ok(signedEip1559.startsWith('0x02'), `expected EIP-1559 envelope, got ${signedEip1559.slice(0, 4)}`);
assert.equal(
  (await recoverTransactionAddress({ serializedTransaction: signedEip1559 })).toLowerCase(),
  signer.address.toLowerCase(),
  'EIP-1559 recovery failed',
);

// --- inlined Dynamic helpers match the SDK byte for byte ---------------------
assert.equal(
  serializeECDSASignature({ r: hexToBytes(`0x${'11'.repeat(32)}`), s: hexToBytes(`0x${'22'.repeat(32)}`), v: 28 }),
  `0x${'11'.repeat(32)}${'22'.repeat(32)}1c`,
  'serializeECDSASignature no longer matches the Dynamic SDK output',
);
assert.deepEqual(
  mapTransactionToEvmTransaction({ to: '0xabc', gas: 21000n, value: 0n, chainId: undefined }),
  {
    to: '0xabc',
    data: undefined,
    gas: '0x5208',
    gasPrice: undefined,
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
    nonce: undefined,
    value: undefined,
    chainId: 0,
  },
  'mapTransactionToEvmTransaction no longer matches the Dynamic SDK output',
);

// --- signMessage / signTypedData / sign --------------------------------------
const message = 'hello from a Dynamic MPC wallet';
const messageSig = await account.signMessage({ message });
assert.equal(
  await verifyMessage({ address: signer.address, message, signature: messageSig }),
  true,
  'signMessage signature did not verify',
);

const hexishMessage = '0x1234';
assert.equal(
  await verifyMessage({
    address: signer.address,
    message: hexishMessage,
    signature: await account.signMessage({ message: hexishMessage }),
  }),
  true,
  'hex-looking strings must be signed as UTF-8 text, not as bytes',
);

const rawMessage = '0x68656c6c6f';
assert.equal(
  await verifyMessage({
    address: signer.address,
    message: { raw: rawMessage },
    signature: await account.signMessage({ message: { raw: rawMessage } }),
  }),
  true,
  'raw byte messages did not verify',
);

const typedData = {
  domain: { name: 'Spigot', version: '1', chainId: tempoModerato.id },
  types: { Meter: [{ name: 'units', type: 'uint256' }, { name: 'memo', type: 'string' }] },
  primaryType: 'Meter',
  message: { units: 42n, memo: 'tempo-mpp' },
};
const typedDataSig = await account.signTypedData(typedData);
assert.equal(
  await verifyTypedData({ address: signer.address, ...typedData, signature: typedDataSig }),
  true,
  'signTypedData signature did not verify',
);
assert.equal(typedDataSig.length, 132, 'expected a 65-byte signature');

assert.equal(
  await account.sign({ hash: hashTypedData(typedData) }),
  typedDataSig,
  'raw digest signing diverged from signTypedData',
);

// --- MPP client accepts the account ------------------------------------------
const mppx = createMppClient({ account });
assert.equal(typeof mppx.fetch, 'function', 'mppx.fetch is missing');
assert.equal(typeof mppx.rawFetch, 'function', 'mppx.rawFetch is missing');

console.log('selfTest: all checks passed');
console.log(`  wallet address  : ${account.address}`);
console.log(`  tempo tx (0x76) : ${signedTempoTx.slice(0, 34)}… (${signedTempoTx.length} chars)`);
console.log(`  eip-1559 tx     : ${signedEip1559.slice(0, 34)}… (${signedEip1559.length} chars)`);
console.log(`  signMessage sig : ${messageSig}`);
console.log(`  signTypedData   : ${typedDataSig}`);
