/**
 * MPP client + payment (step 5).
 *
 * `Mppx.create({ methods: [tempo({ account })] })` returns a payment-aware
 * `fetch` that answers a `402 Payment Required` challenge by signing a Tempo
 * charge credential with the Dynamic-backed account and retrying the request.
 */
import { Constants, Receipt } from 'mppx';
import { Mppx, tempo } from 'mppx/client';
import { MPP_PAID_PING_URL } from './config.js';

/** Legacy/alternate receipt header seen in the wild; the MPP spec header is `Payment-Receipt`. */
const ALTERNATE_RECEIPT_HEADER = 'x-payment-receipt';

/**
 * Creates an MPP client bound to a Tempo account (step 5).
 *
 * @param parameters.account - viem local account (e.g. from `createDynamicTempoAccount`).
 * @param parameters.polyfill - Wrap `globalThis.fetch` too. Defaults to `false` so the
 *   process keeps a plain `fetch` unless explicitly requested.
 */
export function createMppClient(parameters = {}) {
  const { account, polyfill = false, fetch: fetchFn, ...config } = parameters;
  if (!account)
    throw new Error('createMppClient: a signing `account` is required.');
  return Mppx.create({
    // `tempo()` returns the `[charge, session]` method tuple used by MPP payments.
    methods: [tempo({ account })],
    polyfill,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...config,
  });
}

/**
 * Reads the payment receipt from a response.
 *
 * @returns `{ receipt, header, headerName }`, or `undefined` when the response
 *   did not include a receipt (e.g. unpaid or free endpoints).
 */
export function readPaymentReceipt(response) {
  const headerName =
    response.headers.has(Constants.Headers.paymentReceipt)
      ? Constants.Headers.paymentReceipt
      : response.headers.has(ALTERNATE_RECEIPT_HEADER)
        ? ALTERNATE_RECEIPT_HEADER
        : undefined;
  if (!headerName)
    return undefined;
  const header = response.headers.get(headerName);
  try {
    return { receipt: Receipt.deserialize(header), header, headerName };
  } catch (error) {
    return { receipt: undefined, header, headerName, error };
  }
}

/**
 * Fetches a URL through the payment-aware fetch, automatically settling a `402`.
 *
 * @example
 * ```js
 * const { response, receipt } = await payWithMpp({
 *   mppx,
 *   url: 'https://mpp.dev/api/ping/paid',
 * })
 * ```
 */
export async function payWithMpp(parameters) {
  const { mppx, url = MPP_PAID_PING_URL, init } = parameters;
  if (!mppx?.fetch)
    throw new Error('payWithMpp: pass the client returned by `Mppx.create()`.');
  const response = await mppx.fetch(url, init);
  const payment = readPaymentReceipt(response);
  return {
    response,
    status: response.status,
    receipt: payment?.receipt,
    receiptHeader: payment?.header,
    receiptHeaderName: payment?.headerName,
  };
}