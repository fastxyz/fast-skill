import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { formatUnits, parseUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { issueUnlockToken, verifyUnlockToken, hashToken } from './unlock-token';
import {
  mutatePaywallStore,
  readPaywallStore,
  resolvePaywallStoreDir,
} from './store';
import {
  assertAllowedPaymentConfig,
  getCurrentBlockNumber,
  scanIncomingTransfers,
} from './verifier';
import type {
  PaywallAssetRecord,
  PaywallIntentRecord,
  PaywallIntentView,
  PaywallPaymentEventRecord,
  PaywallProductRecord,
  PaywallProductView,
} from './types';

export const PAYWALL_BUYER_COOKIE = 'money_paywall_buyer_id';

export type PaywallWebhookStatus = 'pending' | 'settled' | 'failed' | 'expired';

const DEFAULT_INTENT_EXPIRY_MINUTES = 15;
const DEFAULT_UNLOCK_TTL_SECONDS = (() => {
  const parsed = Number(process.env.PAYWALL_UNLOCK_TTL_SECONDS ?? '600');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
})();
const MAX_VERIFIER_FAILURES = (() => {
  const parsed = Number(process.env.PAYWALL_MAX_VERIFIER_FAILURES ?? '3');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
})();

const MVP_CHAIN = 'base';
const MVP_NETWORK: 'mainnet' = 'mainnet';
const MVP_TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MVP_TOKEN_SYMBOL = 'USDC';
const MVP_DECIMALS = 6;
const DEFAULT_RECEIVER_KEYS_DIR = path.join(resolvePaywallStoreDir(), 'receiver-keys');
const RECEIVER_KEYS_DIR =
  process.env.PAYWALL_RECEIVER_KEYS_DIR?.trim() || DEFAULT_RECEIVER_KEYS_DIR;

export class PaywallError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PaywallError';
    this.status = status;
    this.code = code;
  }
}

function paywallErrorFromUnknown(
  err: unknown,
  code: string,
  fallbackMessage: string,
  status = 400,
): PaywallError {
  if (err instanceof PaywallError) return err;
  const message = err instanceof Error ? err.message : fallbackMessage;
  return new PaywallError(code, message || fallbackMessage, status);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .slice(0, 80);
}

export function normalizePaywallSlug(input: string): string {
  return normalizeSlug(input);
}

function parsePositiveAmount(value: string | number, decimals: number): {
  amount: string;
  amountRaw: string;
} {
  let raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!raw) {
    throw new PaywallError('INVALID_AMOUNT', 'Amount is required.');
  }
  if (/[eE]/.test(raw)) {
    throw new PaywallError('INVALID_AMOUNT', 'Amount must use decimal notation.');
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
    throw new PaywallError('INVALID_AMOUNT', 'Amount must be a positive number.');
  }
  if (raw.startsWith('.')) raw = `0${raw}`;

  const [wholePart, fractionPart = ''] = raw.split('.');
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, '');
  const normalizedFraction = fractionPart.replace(/0+$/g, '');
  const normalized = normalizedFraction
    ? `${normalizedWhole || '0'}.${normalizedFraction}`
    : (normalizedWhole || '0');

  let amountRaw: bigint;
  try {
    amountRaw = parseUnits(normalized, decimals);
  } catch {
    throw new PaywallError(
      'INVALID_AMOUNT',
      `Amount must have at most ${decimals} decimals.`,
    );
  }
  if (amountRaw <= BigInt(0)) {
    throw new PaywallError('INVALID_AMOUNT', 'Amount must be greater than zero.');
  }
  return { amount: normalized, amountRaw: amountRaw.toString() };
}

function toProductView(product: PaywallProductRecord): PaywallProductView {
  return {
    productId: product.product_id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    assetId: product.asset_id,
    chain: product.chain,
    network: product.network,
    tokenAddress: product.token_address,
    tokenSymbol: product.token_symbol,
    decimals: product.decimals,
    amountRaw: product.amount_raw,
    amount: formatUnits(BigInt(product.amount_raw), product.decimals),
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

function toIntentView(intent: PaywallIntentRecord): PaywallIntentView {
  return {
    intentId: intent.intent_id,
    productId: intent.product_id,
    buyerId: intent.buyer_id,
    status: intent.status,
    receiverAddress: intent.receiver_address,
    chain: intent.chain,
    network: intent.network,
    tokenAddress: intent.token_address,
    tokenSymbol: intent.token_symbol,
    decimals: intent.decimals,
    requestedAmountRaw: intent.requested_amount_raw,
    requestedAmount: formatUnits(BigInt(intent.requested_amount_raw), intent.decimals),
    paidAmountRaw: intent.paid_amount_raw,
    paidAmount: formatUnits(BigInt(intent.paid_amount_raw), intent.decimals),
    createdAt: intent.created_at,
    expiresAt: intent.expires_at,
    settledAt: intent.settled_at,
    deliveredAt: intent.delivered_at,
    failedReason: intent.failed_reason,
    startBlock: intent.start_block,
    lastScannedBlock: intent.last_scanned_block,
  };
}

function pushEvent(
  events: Record<string, PaywallPaymentEventRecord>,
  input: Omit<PaywallPaymentEventRecord, 'event_id' | 'created_at'>,
): void {
  const eventId = makeId('pevt');
  events[eventId] = {
    event_id: eventId,
    created_at: nowIso(),
    ...input,
  };
}

function markIntentFailed(params: {
  events: Record<string, PaywallPaymentEventRecord>;
  intent: PaywallIntentRecord;
  reason: string;
  code: string;
}): void {
  const { events, intent, reason, code } = params;
  if (
    intent.status === 'failed'
    || intent.status === 'expired'
    || intent.status === 'settled'
    || intent.status === 'delivered'
  ) {
    return;
  }

  intent.status = 'failed';
  intent.failed_reason = reason;
  pushEvent(events, {
    intent_id: intent.intent_id,
    kind: 'failed',
    details_json: JSON.stringify({ code, reason }),
  });
}

function parseRawAmountOrThrow(value: string): bigint {
  const normalized = value.trim();
  if (!normalized) {
    throw new PaywallError('INVALID_PARAMS', 'amountRaw must be a non-empty integer string.');
  }
  if (!/^\d+$/.test(normalized)) {
    throw new PaywallError('INVALID_PARAMS', 'amountRaw must be an integer raw amount.');
  }
  return BigInt(normalized);
}

function buildApiUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl).toString();
}

function buildAgentPaymentUrl(params: {
  baseUrl: string;
  receiverAddress: string;
  amount: string;
  chain: string;
  tokenAddress: string;
  network: string;
  memo: string;
}): string {
  const url = new URL('/api/pay', params.baseUrl);
  url.searchParams.set('receiver', params.receiverAddress);
  url.searchParams.set('amount', params.amount);
  url.searchParams.set('chain', params.chain);
  url.searchParams.set('token', params.tokenAddress);
  url.searchParams.set('network', params.network);
  url.searchParams.set('memo', params.memo);
  return url.toString();
}

function receiverKeyFilePath(receiverAccountId: string): string {
  return path.join(RECEIVER_KEYS_DIR, `${receiverAccountId}.key`);
}

async function persistReceiverPrivateKey(
  receiverAccountId: string,
  privateKey: string,
): Promise<string> {
  await fs.mkdir(RECEIVER_KEYS_DIR, { recursive: true, mode: 0o700 });
  const filePath = receiverKeyFilePath(receiverAccountId);
  await fs.writeFile(filePath, privateKey, {
    encoding: 'utf-8',
    mode: 0o600,
    flag: 'wx',
  });
  return path.basename(filePath);
}

async function deletePersistedReceiverPrivateKey(receiverAccountId: string): Promise<void> {
  const filePath = receiverKeyFilePath(receiverAccountId);
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

export interface CreatePaywallProductInput {
  slug?: string;
  title: string;
  description?: string;
  amount: string | number;
  chain?: string;
  network?: 'testnet' | 'mainnet';
  tokenAddress?: string;
  tokenSymbol?: string;
  decimals?: number;
  assetId?: string;
  assetData?: unknown;
  assetContentType?: string;
}

export async function createPaywallProduct(
  input: CreatePaywallProductInput,
): Promise<PaywallProductView> {
  const title = input.title?.trim();
  if (!title) {
    throw new PaywallError('INVALID_PARAMS', 'title is required.');
  }

  const slugInput = input.slug?.trim() || title;
  const slug = normalizeSlug(slugInput);
  if (!slug) {
    throw new PaywallError('INVALID_PARAMS', 'Unable to derive a valid slug.');
  }

  const requestedChain = input.chain ?? MVP_CHAIN;
  const requestedNetwork = input.network ?? MVP_NETWORK;
  const requestedTokenAddress = input.tokenAddress ?? MVP_TOKEN_ADDRESS;

  try {
    assertAllowedPaymentConfig({
      chain: requestedChain,
      network: requestedNetwork,
      tokenAddress: requestedTokenAddress,
    });
  } catch (err: unknown) {
    throw paywallErrorFromUnknown(
      err,
      'UNSUPPORTED_PAYMENT_CONFIG',
      'Unsupported chain/network/token configuration.',
    );
  }

  if (
    input.tokenSymbol !== undefined
    && input.tokenSymbol.trim().toUpperCase() !== MVP_TOKEN_SYMBOL
  ) {
    throw new PaywallError(
      'UNSUPPORTED_PAYMENT_CONFIG',
      `MVP supports only token symbol ${MVP_TOKEN_SYMBOL} for the allowlisted token.`,
    );
  }
  if (input.decimals !== undefined && input.decimals !== MVP_DECIMALS) {
    throw new PaywallError(
      'UNSUPPORTED_PAYMENT_CONFIG',
      `MVP supports only ${MVP_DECIMALS} decimals for the allowlisted token.`,
    );
  }

  const chain = MVP_CHAIN;
  const network = MVP_NETWORK;
  const tokenAddress = MVP_TOKEN_ADDRESS;
  const tokenSymbol = MVP_TOKEN_SYMBOL;
  const decimals = MVP_DECIMALS;
  const { amountRaw } = parsePositiveAmount(input.amount, decimals);

  const assetId = input.assetId?.trim() || makeId('asset');
  const assetData = input.assetData ?? { message: `Unlocked payload for ${title}` };
  const contentType =
    input.assetContentType?.trim()
    || (typeof assetData === 'string'
      ? 'text/plain; charset=utf-8'
      : 'application/json; charset=utf-8');
  const payload = typeof assetData === 'string'
    ? assetData
    : JSON.stringify(assetData);

  return mutatePaywallStore((store) => {
    if (store.products_by_slug[slug]) {
      throw new PaywallError('CONFLICT', `Product slug "${slug}" already exists.`, 409);
    }
    const id = makeId('prod');
    const ts = nowIso();
    const product: PaywallProductRecord = {
      product_id: id,
      slug,
      title,
      description: input.description?.trim() || '',
      asset_id: assetId,
      chain,
      network,
      token_address: tokenAddress,
      token_symbol: tokenSymbol,
      decimals,
      amount_raw: amountRaw,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    };
    const asset: PaywallAssetRecord = {
      asset_id: assetId,
      content_type: contentType,
      payload,
      created_at: ts,
      updated_at: ts,
    };
    store.products[id] = product;
    store.products_by_slug[slug] = id;
    store.assets[assetId] = asset;
    return toProductView(product);
  });
}

export async function listPaywallProducts(): Promise<PaywallProductView[]> {
  const store = await readPaywallStore();
  return Object.values(store.products)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(toProductView);
}

export async function getPaywallProductBySlug(
  slug: string,
): Promise<PaywallProductView | null> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  const store = await readPaywallStore();
  const id = store.products_by_slug[normalizedSlug];
  if (!id) return null;
  const product = store.products[id];
  if (!product) return null;
  return toProductView(product);
}

export interface CreatePaywallIntentResult {
  intent: PaywallIntentView;
  product: PaywallProductView;
  paymentRequestUrl: string;
  agentPaymentUrl: string;
  statusUrl: string;
  unlockUrl: string;
}

export async function createPaywallIntent(params: {
  productSlug: string;
  buyerId: string;
  baseUrl: string;
  expiryMinutes?: number;
}): Promise<CreatePaywallIntentResult> {
  const buyerId = params.buyerId?.trim();
  if (!buyerId) {
    throw new PaywallError('INVALID_PARAMS', 'buyerId is required.');
  }

  const productSlug = normalizeSlug(params.productSlug);
  if (!productSlug) {
    throw new PaywallError('INVALID_PARAMS', 'productSlug is required.');
  }

  const productView = await getPaywallProductBySlug(productSlug);
  if (!productView) {
    throw new PaywallError('NOT_FOUND', 'Product not found.', 404);
  }
  if (!productView.isActive) {
    throw new PaywallError('PRODUCT_INACTIVE', 'Product is not active.', 409);
  }

  const expiryMinutes = params.expiryMinutes ?? DEFAULT_INTENT_EXPIRY_MINUTES;
  if (!Number.isFinite(expiryMinutes) || expiryMinutes <= 0) {
    throw new PaywallError('INVALID_PARAMS', 'expiryMinutes must be a positive number.');
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const nowMs = Date.now();
  let startBlock: bigint;
  try {
    startBlock = await getCurrentBlockNumber(productView.chain, productView.network);
  } catch (err: unknown) {
    throw paywallErrorFromUnknown(
      err,
      'VERIFIER_UNAVAILABLE',
      'Unable to initialize chain verifier for this intent.',
      502,
    );
  }
  const intentId = makeId('intent');
  const receiverAccountId = makeId('recv');
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + expiryMinutes * 60_000).toISOString();
  let receiverKeyRef: string;
  try {
    receiverKeyRef = await persistReceiverPrivateKey(receiverAccountId, privateKey);
  } catch (err: unknown) {
    throw paywallErrorFromUnknown(
      err,
      'KEY_STORAGE_FAILED',
      'Unable to persist receiver key material for this intent.',
      500,
    );
  }

  let intentView: PaywallIntentView;
  try {
    intentView = await mutatePaywallStore((store) => {
      const productId = store.products_by_slug[productSlug];
      if (!productId || !store.products[productId]) {
        throw new PaywallError('NOT_FOUND', 'Product not found.', 404);
      }
      const product = store.products[productId]!;
      if (!product.is_active) {
        throw new PaywallError('PRODUCT_INACTIVE', 'Product is not active.', 409);
      }

      store.receiver_accounts[receiverAccountId] = {
        receiver_account_id: receiverAccountId,
        address: account.address,
        private_key_ref: receiverKeyRef,
        created_at: createdAt,
      };

      const intent: PaywallIntentRecord = {
        intent_id: intentId,
        product_id: product.product_id,
        buyer_id: buyerId,
        status: 'pending_payment',
        receiver_address: account.address,
        receiver_account_id: receiverAccountId,
        chain: product.chain,
        network: product.network,
        token_address: product.token_address,
        token_symbol: product.token_symbol,
        decimals: product.decimals,
        requested_amount_raw: product.amount_raw,
        paid_amount_raw: '0',
        created_at: createdAt,
        expires_at: expiresAt,
        start_block: startBlock.toString(),
        last_scanned_block: startBlock.toString(),
      };
      store.intents[intent.intent_id] = intent;
      pushEvent(store.payment_events, {
        intent_id: intent.intent_id,
        kind: 'intent_created',
        details_json: JSON.stringify({
          product_id: intent.product_id,
          receiver_address: intent.receiver_address,
        }),
      });
      return toIntentView(intent);
    });
  } catch (err: unknown) {
    try {
      await deletePersistedReceiverPrivateKey(receiverAccountId);
    } catch {
      // best-effort cleanup for orphaned key files
    }
    throw err;
  }

  const paymentAmountHuman = intentView.requestedAmount;
  const paymentRequestUrl = buildAgentPaymentUrl({
    baseUrl: params.baseUrl,
    receiverAddress: intentView.receiverAddress,
    amount: paymentAmountHuman,
    chain: intentView.chain,
    tokenAddress: intentView.tokenAddress,
    network: intentView.network,
    memo: `intent:${intentView.intentId}`,
  });

  return {
    intent: intentView,
    product: productView,
    paymentRequestUrl,
    agentPaymentUrl: paymentRequestUrl,
    statusUrl: buildApiUrl(
      params.baseUrl,
      `/api/paywall/intents/${intentView.intentId}/status`,
    ),
    unlockUrl: buildApiUrl(
      params.baseUrl,
      `/api/paywall/intents/${intentView.intentId}/unlock`,
    ),
  };
}

export async function getPaywallIntent(
  intentId: string,
): Promise<PaywallIntentView | null> {
  const store = await readPaywallStore();
  const intent = store.intents[intentId];
  return intent ? toIntentView(intent) : null;
}

export async function applyPaywallWebhookEvent(params: {
  provider: string;
  eventId: string;
  intentId: string;
  status: PaywallWebhookStatus;
  amountRaw?: string;
  txHash?: string;
  reason?: string;
  occurredAt?: string;
}): Promise<{
  matched: boolean;
  duplicate: boolean;
  intent?: PaywallIntentView;
  message: string;
}> {
  const provider = params.provider.trim().toLowerCase();
  if (!provider) {
    throw new PaywallError('INVALID_PARAMS', 'provider is required.');
  }
  const eventId = params.eventId.trim();
  if (!eventId) {
    throw new PaywallError('INVALID_PARAMS', 'eventId is required.');
  }
  const intentId = params.intentId.trim();
  if (!intentId) {
    throw new PaywallError('INVALID_PARAMS', 'intentId is required.');
  }

  let occurredAt: string | undefined;
  if (params.occurredAt?.trim()) {
    const parsed = Date.parse(params.occurredAt.trim());
    if (!Number.isFinite(parsed)) {
      throw new PaywallError('INVALID_PARAMS', 'occurredAt must be an ISO datetime string.');
    }
    occurredAt = new Date(parsed).toISOString();
  }

  return mutatePaywallStore((store) => {
    const dedupeKey = `${provider}:${eventId}`;
    const existingIntent = store.intents[intentId];

    if (store.seen_webhook_events[dedupeKey]) {
      return {
        matched: Boolean(existingIntent),
        duplicate: true,
        intent: existingIntent ? toIntentView(existingIntent) : undefined,
        message: `Duplicate webhook event "${dedupeKey}" ignored.`,
      };
    }

    const intent = store.intents[intentId];
    if (!intent) {
      return {
        matched: false,
        duplicate: false,
        message: `No paywall intent found for ${intentId}.`,
      };
    }
    store.seen_webhook_events[dedupeKey] = true;

    const eventDetailsJson = JSON.stringify({
      source: 'webhook',
      provider,
      event_id: eventId,
      status: params.status,
      ...(params.txHash?.trim() ? { tx_hash: params.txHash.trim() } : {}),
      ...(params.reason?.trim() ? { reason: params.reason.trim() } : {}),
      ...(occurredAt ? { occurred_at: occurredAt } : {}),
    });

    if (
      intent.status === 'settled'
      || intent.status === 'failed'
      || intent.status === 'expired'
      || intent.status === 'delivered'
    ) {
      return {
        matched: true,
        duplicate: false,
        intent: toIntentView(intent),
        message: `Intent ${intent.intent_id} already ${intent.status}; webhook recorded with no state change.`,
      };
    }

    if (params.status === 'pending') {
      return {
        matched: true,
        duplicate: false,
        intent: toIntentView(intent),
        message: `Webhook event acknowledged for pending intent ${intent.intent_id}.`,
      };
    }

    if (params.status === 'expired') {
      if (intent.status === 'pending_payment') {
        intent.status = 'expired';
        pushEvent(store.payment_events, {
          intent_id: intent.intent_id,
          kind: 'expired',
          details_json: eventDetailsJson,
        });
      }
      return {
        matched: true,
        duplicate: false,
        intent: toIntentView(intent),
        message: `Applied expired webhook status to intent ${intent.intent_id}.`,
      };
    }

    if (params.status === 'failed') {
      const reason = params.reason?.trim()
        || `Provider ${provider} reported failed for webhook event ${eventId}.`;
      markIntentFailed({
        events: store.payment_events,
        intent,
        reason,
        code: 'WEBHOOK_FAILED',
      });
      return {
        matched: true,
        duplicate: false,
        intent: toIntentView(intent),
        message: `Applied failed webhook status to intent ${intent.intent_id}.`,
      };
    }

    if (intent.status !== 'pending_payment') {
      return {
        matched: true,
        duplicate: false,
        intent: toIntentView(intent),
        message: `Intent ${intent.intent_id} is ${intent.status}; settlement webhook did not change status.`,
      };
    }

    const requestedRaw = BigInt(intent.requested_amount_raw);
    let paidRaw = BigInt(intent.paid_amount_raw);
    if (params.amountRaw !== undefined) {
      const webhookRaw = parseRawAmountOrThrow(params.amountRaw);
      if (webhookRaw > paidRaw) {
        paidRaw = webhookRaw;
      }
    }
    if (paidRaw < requestedRaw) {
      paidRaw = requestedRaw;
    }
    intent.paid_amount_raw = paidRaw.toString();
    intent.status = 'settled';
    intent.settled_at = nowIso();
    intent.verifier_error_count = 0;
    intent.last_verifier_error_at = undefined;
    pushEvent(store.payment_events, {
      intent_id: intent.intent_id,
      kind: 'settled',
      amount_raw: intent.paid_amount_raw,
      details_json: eventDetailsJson,
    });

    return {
      matched: true,
      duplicate: false,
      intent: toIntentView(intent),
      message: `Applied settled webhook status to intent ${intent.intent_id}.`,
    };
  });
}

export async function refreshPaywallIntentStatus(
  intentId: string,
): Promise<PaywallIntentView> {
  const existing = await getPaywallIntent(intentId);
  if (!existing) {
    throw new PaywallError('NOT_FOUND', 'Intent not found.', 404);
  }

  const nowMs = Date.now();
  if (
    existing.status === 'settled'
    || existing.status === 'failed'
    || existing.status === 'expired'
    || existing.status === 'delivered'
  ) {
    return existing;
  }

  const expiresAtMs = Date.parse(existing.expiresAt);
  if (Number.isFinite(expiresAtMs) && nowMs > expiresAtMs) {
    return mutatePaywallStore((store) => {
      const intent = store.intents[intentId];
      if (!intent) {
        throw new PaywallError('NOT_FOUND', 'Intent not found.', 404);
      }
      if (intent.status === 'pending_payment') {
        intent.status = 'expired';
        pushEvent(store.payment_events, {
          intent_id: intent.intent_id,
          kind: 'expired',
        });
      }
      return toIntentView(intent);
    });
  }

  const fromBlock = BigInt(existing.lastScannedBlock) + BigInt(1);
  let scan: Awaited<ReturnType<typeof scanIncomingTransfers>>;
  try {
    scan = await scanIncomingTransfers({
      chain: existing.chain,
      network: existing.network,
      tokenAddress: existing.tokenAddress,
      receiverAddress: existing.receiverAddress,
      fromBlockInclusive: fromBlock,
    });
  } catch (err: unknown) {
    const message = err instanceof Error && err.message
      ? err.message
      : 'Unable to verify incoming payment events right now.';
    const maybeFailed = await mutatePaywallStore((store) => {
      const intent = store.intents[intentId];
      if (!intent) {
        throw new PaywallError('NOT_FOUND', 'Intent not found.', 404);
      }
      if (
        intent.status === 'settled'
        || intent.status === 'failed'
        || intent.status === 'expired'
        || intent.status === 'delivered'
      ) {
        return toIntentView(intent);
      }
      if (intent.status !== 'pending_payment') {
        return toIntentView(intent);
      }

      const failureCount = (intent.verifier_error_count ?? 0) + 1;
      intent.verifier_error_count = failureCount;
      intent.last_verifier_error_at = nowIso();

      if (failureCount >= MAX_VERIFIER_FAILURES) {
        const reason = `Verifier failed ${failureCount} consecutive checks: ${message}`;
        markIntentFailed({
          events: store.payment_events,
          intent,
          reason,
          code: 'VERIFIER_UNAVAILABLE',
        });
      }

      return toIntentView(intent);
    });

    if (maybeFailed.status === 'failed') {
      return maybeFailed;
    }

    throw paywallErrorFromUnknown(
      err,
      'VERIFIER_UNAVAILABLE',
      'Unable to verify incoming payment events right now.',
      502,
    );
  }

  return mutatePaywallStore((store) => {
    const intent = store.intents[intentId];
    if (!intent) {
      throw new PaywallError('NOT_FOUND', 'Intent not found.', 404);
    }
    if (intent.status !== 'pending_payment') return toIntentView(intent);

    const currentLast = BigInt(intent.last_scanned_block);
    if (scan.safeToBlock > currentLast) {
      intent.last_scanned_block = scan.safeToBlock.toString();
    }
    if (intent.verifier_error_count !== undefined) {
      intent.verifier_error_count = 0;
    }
    if (intent.last_verifier_error_at !== undefined) {
      intent.last_verifier_error_at = undefined;
    }

    let paidRaw = BigInt(intent.paid_amount_raw);
    for (const transfer of scan.transfers) {
      if (store.seen_transfers[transfer.dedupeKey]) continue;
      store.seen_transfers[transfer.dedupeKey] = true;
      paidRaw += BigInt(transfer.amountRaw);
      pushEvent(store.payment_events, {
        intent_id: intent.intent_id,
        kind: 'transfer_seen',
        tx_hash: transfer.txHash,
        log_index: transfer.logIndex,
        block_number: transfer.blockNumber,
        amount_raw: transfer.amountRaw,
      });
    }
    intent.paid_amount_raw = paidRaw.toString();

    if (paidRaw >= BigInt(intent.requested_amount_raw)) {
      intent.status = 'settled';
      intent.settled_at = nowIso();
      pushEvent(store.payment_events, {
        intent_id: intent.intent_id,
        kind: 'settled',
        amount_raw: intent.paid_amount_raw,
      });
    }

    return toIntentView(intent);
  });
}

export async function issuePaywallUnlockGrant(params: {
  intentId: string;
  buyerId: string;
  baseUrl: string;
}): Promise<{
  intent: PaywallIntentView;
  unlockToken: string;
  expiresAt: string;
  assetId: string;
  dataUrl: string;
}> {
  const refreshed = await refreshPaywallIntentStatus(params.intentId);
  if (refreshed.status !== 'settled') {
    throw new PaywallError(
      'INTENT_NOT_SETTLED',
      `Intent is ${refreshed.status}. Payment must be settled before unlock.`,
      409,
    );
  }
  if (refreshed.buyerId !== params.buyerId) {
    throw new PaywallError('FORBIDDEN', 'Intent does not belong to this buyer.', 403);
  }

  return mutatePaywallStore((store) => {
    const intent = store.intents[params.intentId];
    if (!intent) {
      throw new PaywallError('NOT_FOUND', 'Intent not found.', 404);
    }
    const product = store.products[intent.product_id];
    if (!product) {
      throw new PaywallError('NOT_FOUND', 'Product for intent not found.', 404);
    }
    const asset = store.assets[product.asset_id];
    if (!asset) {
      throw new PaywallError('NOT_FOUND', 'Protected asset not found.', 404);
    }

    const grantId = makeId('grant');
    let issued: ReturnType<typeof issueUnlockToken>;
    try {
      issued = issueUnlockToken({
        grantId,
        intentId: intent.intent_id,
        assetId: asset.asset_id,
        subject: params.buyerId,
        ttlSeconds: DEFAULT_UNLOCK_TTL_SECONDS,
      });
    } catch (err: unknown) {
      throw paywallErrorFromUnknown(
        err,
        'UNLOCK_CONFIG_ERROR',
        'Unlock token signer is not configured.',
        500,
      );
    }
    const expiresAt = new Date(issued.payload.exp * 1000).toISOString();

    store.unlock_grants[grantId] = {
      grant_id: grantId,
      intent_id: intent.intent_id,
      asset_id: asset.asset_id,
      token_hash: hashToken(issued.token),
      expires_at: expiresAt,
      created_at: nowIso(),
    };

    pushEvent(store.payment_events, {
      intent_id: intent.intent_id,
      kind: 'unlock_issued',
      details_json: JSON.stringify({ grant_id: grantId, asset_id: asset.asset_id }),
    });

    return {
      intent: toIntentView(intent),
      unlockToken: issued.token,
      expiresAt,
      assetId: asset.asset_id,
      dataUrl: buildApiUrl(params.baseUrl, `/api/paywall/data/${asset.asset_id}`),
    };
  });
}

export async function consumePaywallUnlockToken(params: {
  assetId: string;
  token: string;
}): Promise<{
  asset: PaywallAssetRecord;
  intent: PaywallIntentView;
}> {
  let payload: ReturnType<typeof verifyUnlockToken>;
  try {
    payload = verifyUnlockToken(params.token);
  } catch (err: unknown) {
    throw paywallErrorFromUnknown(err, 'FORBIDDEN', 'Invalid unlock token.', 403);
  }
  if (payload.asset_id !== params.assetId) {
    throw new PaywallError('FORBIDDEN', 'Unlock token does not match requested asset.', 403);
  }

  return mutatePaywallStore((store) => {
    const grant = store.unlock_grants[payload.grant_id];
    if (!grant) {
      throw new PaywallError('FORBIDDEN', 'Unlock grant not found.', 403);
    }
    if (grant.asset_id !== params.assetId) {
      throw new PaywallError('FORBIDDEN', 'Unlock grant asset mismatch.', 403);
    }
    if (grant.intent_id !== payload.intent_id) {
      throw new PaywallError('FORBIDDEN', 'Unlock grant intent mismatch.', 403);
    }

    const hashed = hashToken(params.token);
    if (hashed !== grant.token_hash) {
      throw new PaywallError('FORBIDDEN', 'Unlock token hash mismatch.', 403);
    }
    if (grant.used_at) {
      throw new PaywallError('FORBIDDEN', 'Unlock token already used.', 403);
    }

    const now = Date.now();
    const expiresAtMs = Date.parse(grant.expires_at);
    if (Number.isFinite(expiresAtMs) && now > expiresAtMs) {
      throw new PaywallError('FORBIDDEN', 'Unlock grant has expired.', 403);
    }

    const asset = store.assets[grant.asset_id];
    if (!asset) {
      throw new PaywallError('NOT_FOUND', 'Protected asset not found.', 404);
    }
    const intent = store.intents[grant.intent_id];
    if (!intent) {
      throw new PaywallError('NOT_FOUND', 'Intent for unlock grant not found.', 404);
    }
    if (payload.sub !== intent.buyer_id) {
      throw new PaywallError('FORBIDDEN', 'Unlock token subject mismatch.', 403);
    }

    const usedAt = nowIso();
    grant.used_at = usedAt;
    if (intent.status !== 'delivered') {
      intent.status = 'delivered';
      intent.delivered_at = usedAt;
    }
    pushEvent(store.payment_events, {
      intent_id: intent.intent_id,
      kind: 'unlock_used',
      details_json: JSON.stringify({ grant_id: grant.grant_id, asset_id: asset.asset_id }),
    });

    return {
      asset,
      intent: toIntentView(intent),
    };
  });
}

export async function createPaywallBuyerId(): Promise<string> {
  return `buyer_${randomBytes(8).toString('hex')}`;
}
