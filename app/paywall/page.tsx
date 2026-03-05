'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type PaywallProduct = {
  productId: string;
  slug: string;
  title: string;
  description: string;
  assetId: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  amountRaw: string;
  amount: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type PaywallIntentStatus = 'pending_payment' | 'settled' | 'expired' | 'failed' | 'delivered';

type PaywallIntent = {
  intentId: string;
  productId: string;
  buyerId: string;
  status: PaywallIntentStatus;
  receiverAddress: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  requestedAmountRaw: string;
  requestedAmount: string;
  paidAmountRaw: string;
  paidAmount: string;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  startBlock: string;
  lastScannedBlock: string;
};

type CreateProductResponse = {
  product: PaywallProduct;
  error?: string;
  code?: string;
};

type ListProductsResponse = {
  products: PaywallProduct[];
  error?: string;
  code?: string;
};

type CreateIntentResponse = {
  intent: PaywallIntent;
  product: PaywallProduct;
  paymentRequestUrl: string;
  agentPaymentUrl: string;
  statusUrl: string;
  unlockUrl: string;
  checkoutUrl: string;
  error?: string;
  code?: string;
};

type StatusResponse = {
  intent: PaywallIntent;
  canUnlock: boolean;
  error?: string;
  code?: string;
};

type UnlockResponse = {
  intent: PaywallIntent;
  unlockToken: string;
  expiresAt: string;
  assetId: string;
  dataUrl: string;
  error?: string;
  code?: string;
};

type WebhookStatus = 'pending' | 'settled' | 'failed' | 'expired';

type ApplyWebhookResponse = {
  ok: boolean;
  provider: string;
  eventId: string;
  intentId: string;
  matched: boolean;
  duplicate: boolean;
  intent?: PaywallIntent;
  message: string;
  error?: string;
  code?: string;
};

type TimelineEntry = {
  intentId: string;
  timestamp: string;
  kind: string;
  details: string;
};

type IntentRuntime = {
  intent: PaywallIntent;
  productSlug: string;
  paymentRequestUrl?: string;
  checkoutUrl?: string;
  statusUrl?: string;
  unlockUrl?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

function timeUntil(iso: string | undefined): string {
  if (!iso) return '-';
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '-';
  if (ms <= 0) return 'expired';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

function shortAddress(value: string): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function parseAssetDataInput(value: string): unknown {
  const raw = value.trim();
  if (!raw) return { report: 'alpha' };
  return JSON.parse(raw) as unknown;
}

function parseDataPayload(contentType: string | null, text: string): string {
  if (contentType?.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

async function signWebhookPayload(params: {
  secret: string;
  timestampSeconds: number;
  rawBody: string;
}): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable in this browser context.');
  }
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(params.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signedPayload = `${params.timestampSeconds}.${params.rawBody}`;
  const digest = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  return `t=${params.timestampSeconds},v1=${bytesToHex(new Uint8Array(digest))}`;
}

export default function PaywallStudioPage() {
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [products, setProducts] = useState<PaywallProduct[]>([]);
  const [selectedProductSlug, setSelectedProductSlug] = useState('');
  const [intentOrder, setIntentOrder] = useState<string[]>([]);
  const [intentMap, setIntentMap] = useState<Record<string, IntentRuntime>>({});
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');

  const [busyCreateProduct, setBusyCreateProduct] = useState(false);
  const [busyCreateIntent, setBusyCreateIntent] = useState(false);
  const [busyUnlock, setBusyUnlock] = useState(false);
  const [busyFetchData, setBusyFetchData] = useState(false);

  const [newTitle, setNewTitle] = useState('Pro Research Report');
  const [newSlug, setNewSlug] = useState('pro-research-report');
  const [newDescription, setNewDescription] = useState('Unlocks a JSON payload');
  const [newAmount, setNewAmount] = useState('5');
  const [newAssetData, setNewAssetData] = useState('{\n  "report": "alpha"\n}');

  const [unlockToken, setUnlockToken] = useState('');
  const [unlockExpiresAt, setUnlockExpiresAt] = useState('');
  const [unlockDataUrl, setUnlockDataUrl] = useState('');
  const [unlockAssetId, setUnlockAssetId] = useState('');
  const [dataContentType, setDataContentType] = useState('');
  const [dataPayload, setDataPayload] = useState('');
  const [showWebhookTools, setShowWebhookTools] = useState(false);
  const [busyWebhook, setBusyWebhook] = useState(false);
  const [webhookProvider, setWebhookProvider] = useState('mockpay');
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus>('settled');
  const [webhookEventId, setWebhookEventId] = useState(() => `evt_${Date.now()}`);
  const [webhookAmountRaw, setWebhookAmountRaw] = useState('');
  const [webhookTxHash, setWebhookTxHash] = useState('');
  const [webhookReason, setWebhookReason] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookLastResult, setWebhookLastResult] = useState<ApplyWebhookResponse | null>(null);

  const selectedProduct = useMemo(
    () => products.find((entry) => entry.slug === selectedProductSlug) ?? null,
    [products, selectedProductSlug],
  );
  const intents = useMemo(
    () => intentOrder.map((id) => intentMap[id]).filter((value): value is IntentRuntime => Boolean(value)),
    [intentMap, intentOrder],
  );
  const selectedIntentRuntime = selectedIntentId ? intentMap[selectedIntentId] : null;
  const selectedIntent = selectedIntentRuntime?.intent ?? null;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function pushTimeline(entry: TimelineEntry) {
    setTimeline((current) => [entry, ...current].slice(0, 80));
  }

  function updateIntentRuntime(next: IntentRuntime) {
    setIntentMap((current) => ({
      ...current,
      [next.intent.intentId]: next,
    }));
    setIntentOrder((current) => {
      if (current.includes(next.intent.intentId)) return current;
      return [next.intent.intentId, ...current];
    });
  }

  async function loadProducts() {
    try {
      setLoadingProducts(true);
      const response = await fetchJson<ListProductsResponse>('/api/paywall/products');
      setProducts(response.products);
      if (!selectedProductSlug && response.products.length > 0) {
        setSelectedProductSlug(response.products[0].slug);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  async function createProduct(): Promise<CreateProductResponse> {
    setBusyCreateProduct(true);
    setError('');
    try {
      const response = await fetchJson<CreateProductResponse>('/api/paywall/products', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: newSlug.trim() || undefined,
          description: newDescription.trim(),
          amount: newAmount.trim(),
          assetData: parseAssetDataInput(newAssetData),
        }),
      });

      setProducts((current) => [response.product, ...current.filter((entry) => entry.productId !== response.product.productId)]);
      setSelectedProductSlug(response.product.slug);
      pushTimeline({
        intentId: '-',
        timestamp: new Date().toISOString(),
        kind: 'product_created',
        details: `Created product "${response.product.slug}" (${response.product.amount} ${response.product.tokenSymbol}).`,
      });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setBusyCreateProduct(false);
    }
  }

  async function createIntent(productSlug?: string): Promise<CreateIntentResponse> {
    const slug = (productSlug ?? selectedProductSlug).trim();
    if (!slug) {
      throw new Error('Select a product first.');
    }

    setBusyCreateIntent(true);
    setError('');
    try {
      const response = await fetchJson<CreateIntentResponse>('/api/paywall/intents', {
        method: 'POST',
        body: JSON.stringify({
          productSlug: slug,
          expiryMinutes: 15,
        }),
      });

      updateIntentRuntime({
        intent: response.intent,
        productSlug: response.product.slug,
        paymentRequestUrl: response.paymentRequestUrl,
        checkoutUrl: response.checkoutUrl,
        statusUrl: response.statusUrl,
        unlockUrl: response.unlockUrl,
      });
      setSelectedIntentId(response.intent.intentId);
      setUnlockToken('');
      setUnlockExpiresAt('');
      setUnlockDataUrl('');
      setUnlockAssetId('');
      setDataPayload('');
      setDataContentType('');
      pushTimeline({
        intentId: response.intent.intentId,
        timestamp: new Date().toISOString(),
        kind: 'intent_created',
        details: `Created intent for product "${response.product.slug}".`,
      });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setBusyCreateIntent(false);
    }
  }

  async function refreshIntentStatus(intentId: string): Promise<StatusResponse> {
    const response = await fetchJson<StatusResponse>(`/api/paywall/intents/${encodeURIComponent(intentId)}/status`);
    const previous = intentMap[intentId]?.intent;
    const nextIntent = response.intent;

    updateIntentRuntime({
      intent: nextIntent,
      productSlug: intentMap[intentId]?.productSlug ?? selectedProductSlug,
      paymentRequestUrl: intentMap[intentId]?.paymentRequestUrl,
      checkoutUrl: intentMap[intentId]?.checkoutUrl,
      statusUrl: intentMap[intentId]?.statusUrl,
      unlockUrl: intentMap[intentId]?.unlockUrl,
    });

    if (!previous || previous.status !== nextIntent.status) {
      pushTimeline({
        intentId,
        timestamp: new Date().toISOString(),
        kind: 'status_changed',
        details: `Status changed to ${nextIntent.status}.`,
      });
    }

    return response;
  }

  useEffect(() => {
    if (intentOrder.length === 0) return;
    let cancelled = false;

    async function tick() {
      for (const intentId of intentOrder) {
        try {
          await refreshIntentStatus(intentId);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (!cancelled) {
            setError(message);
          }
        }
      }
      if (!cancelled) {
        setLastRefreshedAt(new Date().toISOString());
      }
    }

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intentOrder]);

  async function requestUnlockGrant(intentId: string): Promise<UnlockResponse> {
    setBusyUnlock(true);
    setError('');
    try {
      const buyerId = intentMap[intentId]?.intent.buyerId;
      const response = await fetchJson<UnlockResponse>(
        `/api/paywall/intents/${encodeURIComponent(intentId)}/unlock`,
        {
          method: 'POST',
          body: JSON.stringify(buyerId ? { buyerId } : {}),
        },
      );

      updateIntentRuntime({
        intent: response.intent,
        productSlug: intentMap[intentId]?.productSlug ?? selectedProductSlug,
        paymentRequestUrl: intentMap[intentId]?.paymentRequestUrl,
        checkoutUrl: intentMap[intentId]?.checkoutUrl,
        statusUrl: intentMap[intentId]?.statusUrl,
        unlockUrl: intentMap[intentId]?.unlockUrl,
      });

      setUnlockToken(response.unlockToken);
      setUnlockExpiresAt(response.expiresAt);
      setUnlockDataUrl(response.dataUrl);
      setUnlockAssetId(response.assetId);
      setSelectedIntentId(intentId);
      pushTimeline({
        intentId,
        timestamp: new Date().toISOString(),
        kind: 'unlock_issued',
        details: `Issued unlock token for asset ${response.assetId}.`,
      });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setBusyUnlock(false);
    }
  }

  async function fetchProtectedData(url?: string, token?: string): Promise<{ contentType: string; payload: string; status: number }> {
    const dataUrl = (url ?? unlockDataUrl).trim();
    const bearer = (token ?? unlockToken).trim();
    if (!dataUrl || !bearer) {
      throw new Error('Unlock token and data URL are required.');
    }

    setBusyFetchData(true);
    setError('');
    try {
      const response = await fetch(dataUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') ?? 'text/plain';
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Request failed (${response.status})`);
      }

      const parsed = parseDataPayload(contentType, text);
      setDataContentType(contentType);
      setDataPayload(parsed);

      if (selectedIntentId) {
        pushTimeline({
          intentId: selectedIntentId,
          timestamp: new Date().toISOString(),
          kind: 'unlock_used',
          details: 'Fetched protected data using unlock token.',
        });
        try {
          await refreshIntentStatus(selectedIntentId);
        } catch {
          // best effort post-fetch refresh
        }
      }

      return {
        contentType,
        payload: parsed,
        status: response.status,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setBusyFetchData(false);
    }
  }

  async function applyWebhookSimulation(intentId?: string): Promise<ApplyWebhookResponse> {
    const targetIntentId = (intentId ?? selectedIntent?.intentId ?? '').trim();
    if (!targetIntentId) {
      throw new Error('Select an intent before applying webhook events.');
    }

    const provider = webhookProvider.trim().toLowerCase();
    if (!provider) {
      throw new Error('Webhook provider is required.');
    }

    const secret = webhookSecret.trim();
    if (!secret) {
      throw new Error('Webhook secret is required to sign simulated events.');
    }

    const eventId = webhookEventId.trim() || `evt_${Date.now()}`;
    const amountRaw = webhookAmountRaw.trim();
    const txHash = webhookTxHash.trim();
    const reason = webhookReason.trim();
    const occurredAt = new Date().toISOString();

    const payload: Record<string, unknown> = {
      eventId,
      intentId: targetIntentId,
      status: webhookStatus,
      occurredAt,
      ...(amountRaw ? { amountRaw } : {}),
      ...(txHash ? { txHash } : {}),
      ...(reason ? { reason } : {}),
    };
    const rawBody = JSON.stringify(payload);
    const timestampSeconds = Math.floor(Date.now() / 1000);

    setBusyWebhook(true);
    setError('');
    try {
      const signature = await signWebhookPayload({
        secret,
        timestampSeconds,
        rawBody,
      });
      const response = await fetch(`/api/paywall/webhooks/${encodeURIComponent(provider)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paywall-signature': signature,
          'x-paywall-timestamp': String(timestampSeconds),
        },
        body: rawBody,
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as ApplyWebhookResponse;
      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      if (data.intent) {
        updateIntentRuntime({
          intent: data.intent,
          productSlug: intentMap[targetIntentId]?.productSlug ?? selectedProductSlug,
          paymentRequestUrl: intentMap[targetIntentId]?.paymentRequestUrl,
          checkoutUrl: intentMap[targetIntentId]?.checkoutUrl,
          statusUrl: intentMap[targetIntentId]?.statusUrl,
          unlockUrl: intentMap[targetIntentId]?.unlockUrl,
        });
        setSelectedIntentId(data.intent.intentId);
      }

      setWebhookLastResult(data);
      setWebhookEventId(`evt_${Date.now()}`);
      pushTimeline({
        intentId: targetIntentId,
        timestamp: new Date().toISOString(),
        kind: 'webhook_applied',
        details: `${provider}:${webhookStatus} (${eventId}) ${data.message}`,
      });

      try {
        await refreshIntentStatus(targetIntentId);
      } catch {
        // best effort post-webhook refresh
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setBusyWebhook(false);
    }
  }

  const createProductBody = useMemo(() => ({
    title: newTitle.trim() || 'Pro Research Report',
    slug: newSlug.trim() || undefined,
    description: newDescription.trim() || 'Unlocks a JSON payload',
    amount: newAmount.trim() || '5',
    assetData: (() => {
      try {
        return parseAssetDataInput(newAssetData);
      } catch {
        return { report: 'alpha' };
      }
    })(),
  }), [newAmount, newAssetData, newDescription, newSlug, newTitle]);

  const selectedIntentIdOrPlaceholder = selectedIntent?.intentId ?? ':intentId';
  const selectedAssetIdOrPlaceholder = unlockAssetId || ':assetId';
  const selectedWebhookProvider = webhookProvider.trim().toLowerCase() || 'mockpay';
  const selectedWebhookEventId = webhookEventId.trim() || 'evt_...';
  const jsonHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${unlockToken || '<unlockToken>'}`,
  };
  const webhookHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-paywall-timestamp': '<unix-seconds>',
    'x-paywall-signature': 't=<unix-seconds>,v1=<hmac-sha256-hex>',
  };

  const actionCards = useMemo<ApiActionCardProps[]>(() => {
    const selectedIntentData = selectedIntent
      ? {
          intent: selectedIntent,
          canUnlock: selectedIntent.status === 'settled',
        }
      : {
          intent: {
            intentId: ':intentId',
            status: 'pending_payment',
            paidAmount: '0',
          },
          canUnlock: false,
        };

    const cards: ApiActionCardProps[] = [
      {
        title: 'Create Product',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: `${origin || ''}/api/paywall/products`,
          headers: jsonHeaders,
          body: createProductBody,
        },
        successExample: {
          product: selectedProduct ?? {
            productId: 'prod_...',
            slug: createProductBody.slug ?? 'pro-research-report',
            amount: createProductBody.amount,
          },
        },
        failureExamples: [
          {
            status: 409,
            payload: { error: 'Product slug "pro-research-report" already exists.', code: 'CONFLICT' },
            note: 'Use a unique slug or omit slug and let server derive one.',
          },
          {
            status: 400,
            payload: { error: 'title is required.', code: 'INVALID_PARAMS' },
            note: 'Provide required title and amount fields.',
          },
        ],
        fieldNotes: [
          'Only allowlisted Base mainnet USDC config is currently supported by paywall MVP.',
          'assetData accepts JSON payload that will be returned on unlock.',
        ],
        tryIt: {
          label: 'Try create product',
          run: async () => createProduct(),
        },
      },
      {
        title: 'Create Intent',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: `${origin || ''}/api/paywall/intents`,
          headers: jsonHeaders,
          body: {
            productSlug: selectedProductSlug || 'pro-research-report',
            expiryMinutes: 15,
          },
        },
        successExample: selectedIntentRuntime
          ? {
              intent: selectedIntentRuntime.intent,
              product: selectedProduct ?? { slug: selectedIntentRuntime.productSlug },
              paymentRequestUrl: selectedIntentRuntime.paymentRequestUrl,
              statusUrl: selectedIntentRuntime.statusUrl,
              unlockUrl: selectedIntentRuntime.unlockUrl,
            }
          : {
              intent: { intentId: 'intent_...', status: 'pending_payment' },
              product: { slug: selectedProductSlug || 'pro-research-report' },
              paymentRequestUrl: `${origin || 'https://example.local'}/api/pay?...`,
              statusUrl: `${origin || 'https://example.local'}/api/paywall/intents/intent_.../status`,
              unlockUrl: `${origin || 'https://example.local'}/api/paywall/intents/intent_.../unlock`,
            },
        failureExamples: [
          {
            status: 404,
            payload: { error: 'Product not found.', code: 'NOT_FOUND' },
            note: 'Create/select an existing product first.',
          },
          {
            status: 409,
            payload: { error: 'Product is not active.', code: 'PRODUCT_INACTIVE' },
            note: 'Use an active product.',
          },
        ],
        fieldNotes: [
          'buyerId is auto-derived from paywall cookie when omitted.',
          'checkoutUrl points to /paywall/[slug] detail page.',
        ],
        tryIt: {
          label: 'Try create intent',
          run: async () => createIntent(),
        },
      },
      {
        title: 'Poll Intent Status',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'GET',
          url: `${origin || ''}/api/paywall/intents/${selectedIntentIdOrPlaceholder}/status`,
        },
        successExample: selectedIntentData,
        failureExamples: [
          {
            status: 404,
            payload: { error: 'Intent not found.', code: 'NOT_FOUND' },
            note: 'Provide a valid intent ID.',
          },
          {
            status: 502,
            payload: { error: 'Unable to verify incoming payment events right now.', code: 'VERIFIER_UNAVAILABLE' },
            note: 'Retry polling after verifier recovers.',
          },
        ],
        fieldNotes: [
          'Status endpoint may transition pending intents to settled/expired/failed.',
        ],
        tryIt: selectedIntent
          ? {
              label: 'Try poll status',
              run: async () => refreshIntentStatus(selectedIntent.intentId),
            }
          : undefined,
      },
      {
        title: 'Request Unlock Grant',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: `${origin || ''}/api/paywall/intents/${selectedIntentIdOrPlaceholder}/unlock`,
          headers: jsonHeaders,
          body: {
            buyerId: selectedIntent?.buyerId ?? 'buyer_...',
          },
        },
        successExample: unlockToken
          ? {
              intent: selectedIntent,
              unlockToken,
              expiresAt: unlockExpiresAt,
              assetId: unlockAssetId,
              dataUrl: unlockDataUrl,
            }
          : {
              intent: { intentId: selectedIntentIdOrPlaceholder, status: 'settled' },
              unlockToken: 'eyJ...',
              expiresAt: '2026-01-01T00:00:00.000Z',
              assetId: selectedAssetIdOrPlaceholder,
              dataUrl: `${origin || 'https://example.local'}/api/paywall/data/${selectedAssetIdOrPlaceholder}`,
            },
        failureExamples: [
          {
            status: 409,
            payload: { error: 'Intent is pending_payment. Payment must be settled before unlock.', code: 'INTENT_NOT_SETTLED' },
            note: 'Wait for settled status before requesting unlock.',
          },
          {
            status: 403,
            payload: { error: 'Intent does not belong to this buyer.', code: 'FORBIDDEN' },
            note: 'Use the same buyer session that created the intent.',
          },
        ],
        fieldNotes: [
          'Unlock token is single-use and expires.',
        ],
        tryIt: selectedIntent
          ? {
              label: 'Try request unlock',
              run: async () => requestUnlockGrant(selectedIntent.intentId),
            }
          : undefined,
      },
      {
        title: 'Fetch Protected Data',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'GET',
          url: unlockDataUrl || `${origin || ''}/api/paywall/data/${selectedAssetIdOrPlaceholder}`,
          headers: authHeaders,
        },
        successExample: dataPayload
          ? {
              contentType: dataContentType,
              payload: dataPayload,
            }
          : {
              contentType: 'application/json',
              payload: { report: 'alpha' },
            },
        failureExamples: [
          {
            status: 403,
            payload: { error: 'Unlock token already used.', code: 'FORBIDDEN' },
            note: 'Request a new unlock grant for another fetch.',
          },
          {
            status: 401,
            payload: { error: 'Missing unlock token. Use Authorization: Bearer <token>.', code: 'UNAUTHORIZED' },
            note: 'Attach bearer token in Authorization header.',
          },
        ],
        fieldNotes: [
          'Successful fetch consumes token and marks intent delivered.',
        ],
        tryIt: unlockDataUrl && unlockToken
          ? {
              label: 'Try fetch data',
              run: async () => fetchProtectedData(unlockDataUrl, unlockToken),
            }
          : undefined,
      },
    ];

    if (showWebhookTools) {
      cards.push({
        title: 'Apply Webhook Event',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: `${origin || ''}/api/paywall/webhooks/${selectedWebhookProvider}`,
          headers: webhookHeaders,
          body: {
            eventId: selectedWebhookEventId,
            intentId: selectedIntentIdOrPlaceholder,
            status: webhookStatus,
            ...(webhookAmountRaw.trim() ? { amountRaw: webhookAmountRaw.trim() } : {}),
            ...(webhookTxHash.trim() ? { txHash: webhookTxHash.trim() } : {}),
            ...(webhookReason.trim() ? { reason: webhookReason.trim() } : {}),
            occurredAt: new Date().toISOString(),
          },
        },
        successExample: webhookLastResult ?? {
          ok: true,
          provider: selectedWebhookProvider,
          eventId: selectedWebhookEventId,
          intentId: selectedIntentIdOrPlaceholder,
          matched: true,
          duplicate: false,
          intent: selectedIntent
            ? { ...selectedIntent, status: 'settled' }
            : { intentId: selectedIntentIdOrPlaceholder, status: 'settled' },
          message: `Applied settled webhook status to intent ${selectedIntentIdOrPlaceholder}.`,
        },
        failureExamples: [
          {
            status: 401,
            payload: { error: 'Webhook signature verification failed.', code: 'INVALID_SIGNATURE' },
            note: 'Sign the raw JSON payload with HMAC SHA-256 and include timestamp/signature headers.',
          },
          {
            status: 503,
            payload: {
              error: 'Webhook secret is not configured. Set PAYWALL_WEBHOOK_SECRET (or provider-specific PAYWALL_WEBHOOK_SECRET_<PROVIDER>).',
              code: 'WEBHOOK_NOT_CONFIGURED',
            },
            note: 'Configure webhook secret on server before testing simulated events.',
          },
        ],
        fieldNotes: [
          'Dev-only simulator: requires explicit toggle and secret input.',
          'Event dedupe key is provider + eventId; duplicates are ignored.',
        ],
        tryIt: selectedIntent
          ? {
              label: 'Try apply webhook',
              run: async () => applyWebhookSimulation(selectedIntent.intentId),
            }
          : undefined,
      });
    }

    return cards;
  }, [
    showWebhookTools,
    selectedWebhookProvider,
    selectedWebhookEventId,
    webhookStatus,
    webhookAmountRaw,
    webhookTxHash,
    webhookReason,
    webhookLastResult,
    createProductBody,
    dataContentType,
    dataPayload,
    origin,
    selectedProduct,
    selectedProductSlug,
    selectedIntent,
    selectedIntentIdOrPlaceholder,
    selectedIntentRuntime,
    unlockAssetId,
    unlockDataUrl,
    unlockExpiresAt,
    unlockToken,
    authHeaders,
    jsonHeaders,
    webhookHeaders,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            PAYMENTS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Content Paywall
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Gate premium content behind payment links
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', background: '#1f1111', color: '#fca5a5', borderRadius: 8, padding: '0.8rem 0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'grid', gap: '0.2rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                Product and intent operations with live status + unlock lifecycle.
              </p>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Create Product</h3>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Title</span>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Slug</span>
                <input
                  value={newSlug}
                  onChange={(event) => setNewSlug(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Description</span>
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount (USDC)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newAmount}
                  onChange={(event) => setNewAmount(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Asset Data (JSON)</span>
                <textarea
                  value={newAssetData}
                  onChange={(event) => setNewAssetData(event.target.value)}
                  rows={4}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem', resize: 'vertical' }}
                />
              </label>
              <button
                onClick={() => void createProduct()}
                disabled={busyCreateProduct}
                style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', width: 'fit-content' }}
              >
                {busyCreateProduct ? 'Creating...' : 'Create Product'}
              </button>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Products ({products.length})</h3>
                <button
                  onClick={() => void loadProducts()}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Refresh
                </button>
              </div>
              {loadingProducts ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>Loading products...</p>
              ) : products.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>No products yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {products.map((product) => (
                    <button
                      key={product.productId}
                      onClick={() => setSelectedProductSlug(product.slug)}
                      style={{
                        textAlign: 'left',
                        border: `1px solid ${selectedProductSlug === product.slug ? '#4f7ca8' : 'var(--border)'}`,
                        borderRadius: 6,
                        background: selectedProductSlug === product.slug ? 'rgba(37, 99, 235, 0.14)' : 'var(--code-bg)',
                        color: 'var(--text)',
                        padding: '0.45rem 0.55rem',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: '0.12rem',
                      }}
                    >
                      <span style={{ fontSize: '0.77rem' }}>
                        <strong>{product.title}</strong> ({product.slug})
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                        {product.amount} {product.tokenSymbol} • {product.chain}/{product.network}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedProduct && (
              <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.35rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Selected Product</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>slug:</span> {selectedProduct.slug}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>price:</span> {selectedProduct.amount} {selectedProduct.tokenSymbol}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>asset:</span> {selectedProduct.assetId}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>token:</span> <code>{shortAddress(selectedProduct.tokenAddress)}</code></div>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void createIntent(selectedProduct.slug)}
                    disabled={busyCreateIntent}
                    style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                  >
                    {busyCreateIntent ? 'Creating...' : 'Create Intent'}
                  </button>
                  <a
                    href={`/paywall/${encodeURIComponent(selectedProduct.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--rule)', fontSize: '0.75rem', alignSelf: 'center' }}
                  >
                    Open /paywall/{selectedProduct.slug}
                  </a>
                </div>
              </section>
            )}

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Intent List ({intents.length})</h3>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                  Last refresh: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
                </span>
              </div>
              {intents.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>No intents created in this studio session.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  {intents.map((entry) => (
                    <button
                      key={entry.intent.intentId}
                      onClick={() => setSelectedIntentId(entry.intent.intentId)}
                      style={{
                        textAlign: 'left',
                        border: `1px solid ${selectedIntentId === entry.intent.intentId ? '#4f7ca8' : 'var(--border)'}`,
                        borderRadius: 6,
                        background: selectedIntentId === entry.intent.intentId ? 'rgba(37, 99, 235, 0.14)' : 'var(--code-bg)',
                        color: 'var(--text)',
                        padding: '0.45rem 0.55rem',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: '0.12rem',
                      }}
                    >
                      <span style={{ fontSize: '0.74rem' }}>
                        <code>{entry.intent.intentId}</code>
                      </span>
                      <span style={{ fontSize: '0.72rem' }}>
                        {entry.productSlug} • {entry.intent.status}
                      </span>
                      <span style={{ fontSize: '0.69rem', color: 'var(--text-3)' }}>
                        paid {entry.intent.paidAmount} / {entry.intent.requestedAmount} {entry.intent.tokenSymbol} • expires {timeUntil(entry.intent.expiresAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedIntentRuntime && (
              <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Unlock + Data Fetch</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>intent:</span> <code>{selectedIntentRuntime.intent.intentId}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>status:</span> {selectedIntentRuntime.intent.status}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>receiver:</span> <code>{shortAddress(selectedIntentRuntime.intent.receiverAddress)}</code></div>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void refreshIntentStatus(selectedIntentRuntime.intent.intentId)}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                  >
                    Refresh Status
                  </button>
                  <button
                    onClick={() => void requestUnlockGrant(selectedIntentRuntime.intent.intentId)}
                    disabled={busyUnlock}
                    style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                  >
                    {busyUnlock ? 'Issuing...' : 'Request Unlock Token'}
                  </button>
                  <button
                    onClick={() => void fetchProtectedData()}
                    disabled={!unlockToken || !unlockDataUrl || busyFetchData}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                  >
                    {busyFetchData ? 'Fetching...' : 'Fetch Protected Data'}
                  </button>
                </div>

                {selectedIntentRuntime.paymentRequestUrl && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'grid', gap: '0.15rem' }}>
                    <span>payment request url:</span>
                    <code style={{ overflowX: 'auto' }}>{selectedIntentRuntime.paymentRequestUrl}</code>
                  </div>
                )}

                {unlockToken && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'grid', gap: '0.15rem' }}>
                    <span>unlock token (expires {timeUntil(unlockExpiresAt)}):</span>
                    <code style={{ overflowX: 'auto' }}>{unlockToken}</code>
                  </div>
                )}

                {dataPayload && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'grid', gap: '0.15rem' }}>
                    <span>protected data ({dataContentType}):</span>
                    <pre style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--code-bg)', padding: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.72rem' }}>
                      {dataPayload}
                    </pre>
                  </div>
                )}
              </section>
            )}

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Webhook Simulation (Dev)</h3>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  <input
                    type="checkbox"
                    checked={showWebhookTools}
                    onChange={(event) => setShowWebhookTools(event.target.checked)}
                  />
                  Enable signed webhook simulator
                </label>
              </div>

              {!showWebhookTools ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Enable to apply signed webhook events (pending/settled/failed/expired) and test idempotency behavior.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                    Uses `x-paywall-signature` + `x-paywall-timestamp`. Secret must match server `PAYWALL_WEBHOOK_SECRET`.
                  </p>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider</span>
                    <input
                      value={webhookProvider}
                      onChange={(event) => setWebhookProvider(event.target.value)}
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Event ID</span>
                    <input
                      value={webhookEventId}
                      onChange={(event) => setWebhookEventId(event.target.value)}
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Status</span>
                    <select
                      value={webhookStatus}
                      onChange={(event) => setWebhookStatus(event.target.value as WebhookStatus)}
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    >
                      <option value="pending">pending</option>
                      <option value="settled">settled</option>
                      <option value="failed">failed</option>
                      <option value="expired">expired</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount Raw (optional)</span>
                    <input
                      value={webhookAmountRaw}
                      onChange={(event) => setWebhookAmountRaw(event.target.value)}
                      placeholder="5000000"
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Tx Hash (optional)</span>
                    <input
                      value={webhookTxHash}
                      onChange={(event) => setWebhookTxHash(event.target.value)}
                      placeholder="0x..."
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Reason (optional)</span>
                    <input
                      value={webhookReason}
                      onChange={(event) => setWebhookReason(event.target.value)}
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Webhook Secret</span>
                    <input
                      type="password"
                      value={webhookSecret}
                      onChange={(event) => setWebhookSecret(event.target.value)}
                      placeholder="Must match PAYWALL_WEBHOOK_SECRET"
                      style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                    />
                  </label>

                  <button
                    onClick={() => void applyWebhookSimulation()}
                    disabled={busyWebhook || !selectedIntent}
                    style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', width: 'fit-content' }}
                  >
                    {busyWebhook ? 'Applying...' : 'Apply Webhook Event'}
                  </button>

                  {!selectedIntent && (
                    <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                      Select an intent before applying webhook events.
                    </p>
                  )}

                  {webhookLastResult && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'grid', gap: '0.15rem' }}>
                      <span>last webhook response:</span>
                      <pre style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--code-bg)', padding: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.72rem' }}>
                        {JSON.stringify(webhookLastResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Timeline</h3>
              {timeline.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>No events yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  {timeline.map((entry) => (
                    <div key={`${entry.timestamp}-${entry.intentId}-${entry.kind}-${entry.details}`} style={{ fontSize: '0.73rem', color: 'var(--text-2)' }}>
                      <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono), monospace' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>{' '}
                      <strong style={{ color: 'var(--text)' }}>{entry.kind}</strong>{' '}
                      {entry.intentId !== '-' ? <code>{entry.intentId}</code> : null}{' '}
                      {entry.details}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Shared action cards for paywall product, intent, settlement status, unlock, and data fetch."
            actions={actionCards}
          />
        </div>
      </div>
    </main>
  );
}
