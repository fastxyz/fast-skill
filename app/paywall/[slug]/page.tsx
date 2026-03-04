'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

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

type CreateIntentResponse = {
  intent: PaywallIntent;
  product: PaywallProduct;
  paymentRequestUrl: string;
  agentPaymentUrl: string;
  statusUrl: string;
  unlockUrl: string;
  checkoutUrl: string;
};

type StatusResponse = {
  intent: PaywallIntent;
  canUnlock: boolean;
};

type UnlockResponse = {
  intent: PaywallIntent;
  unlockToken: string;
  expiresAt: string;
  assetId: string;
  dataUrl: string;
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
    code?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

function shortAddress(value: string): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
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

function buildPaymentRequestUrl(intent: PaywallIntent): string {
  const url = new URL('/api/pay', window.location.origin);
  url.searchParams.set('receiver', intent.receiverAddress);
  url.searchParams.set('amount', intent.requestedAmount);
  url.searchParams.set('chain', intent.chain);
  url.searchParams.set('token', intent.tokenAddress);
  url.searchParams.set('network', intent.network);
  url.searchParams.set('memo', `intent:${intent.intentId}`);
  return url.toString();
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

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '2rem 1rem',
  background: 'linear-gradient(135deg, #06090f 0%, #0b1622 55%, #13222c 100%)',
  color: '#f8fafc',
};

const cardStyle: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  border: '1px solid #29415a',
  borderRadius: 14,
  background: 'rgba(7, 15, 24, 0.7)',
  backdropFilter: 'blur(6px)',
  padding: '1.25rem',
  display: 'grid',
  gap: '0.95rem',
};

const buttonStyle: CSSProperties = {
  background: '#f8fafc',
  color: '#0f172a',
  border: 0,
  borderRadius: 8,
  padding: '0.55rem 0.8rem',
  fontSize: '0.86rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const codeBoxStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: 10,
  padding: '0.75rem',
  background: 'rgba(15, 23, 42, 0.65)',
  overflowX: 'auto',
  fontSize: '0.78rem',
};

export default function PaywallCheckoutPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const slug = useMemo(() => {
    const raw = params?.slug;
    if (Array.isArray(raw)) return raw[0] ?? '';
    return raw ?? '';
  }, [params]);
  const intentIdFromUrl = searchParams.get('intentId') ?? '';

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [product, setProduct] = useState<PaywallProduct | null>(null);
  const [intentId, setIntentId] = useState(intentIdFromUrl);
  const [intent, setIntent] = useState<PaywallIntent | null>(null);
  const [paymentRequestUrl, setPaymentRequestUrl] = useState('');
  const [canUnlock, setCanUnlock] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyUnlock, setBusyUnlock] = useState(false);
  const [busyFetchData, setBusyFetchData] = useState(false);
  const [unlockToken, setUnlockToken] = useState('');
  const [unlockExpiresAt, setUnlockExpiresAt] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [dataContentType, setDataContentType] = useState('');
  const [dataPayload, setDataPayload] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setIntentId(intentIdFromUrl);
    setPaymentRequestUrl('');
  }, [intentIdFromUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadProduct() {
      if (!slug) return;
      try {
        setLoadingProduct(true);
        setError('');
        const response = await fetchJson<{ product: PaywallProduct }>(
          `/api/paywall/products/${encodeURIComponent(slug)}`,
        );
        if (cancelled) return;
        setProduct(response.product);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (!cancelled) {
          setLoadingProduct(false);
        }
      }
    }
    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!intentId) return;
    let cancelled = false;

    async function refreshStatus() {
      try {
        const response = await fetchJson<StatusResponse>(
          `/api/paywall/intents/${encodeURIComponent(intentId)}/status`,
        );
        if (cancelled) return;
        setIntent(response.intent);
        setCanUnlock(response.canUnlock);
        setPaymentRequestUrl(buildPaymentRequestUrl(response.intent));
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    }

    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intentId]);

  async function onCreateIntent() {
    if (!slug) return;
    try {
      setBusyCreate(true);
      setError('');
      setUnlockToken('');
      setUnlockExpiresAt('');
      setDataUrl('');
      setDataPayload('');
      setDataContentType('');

      const response = await fetchJson<CreateIntentResponse>('/api/paywall/intents', {
        method: 'POST',
        body: JSON.stringify({ productSlug: slug }),
      });

      setProduct(response.product);
      setIntent(response.intent);
      setIntentId(response.intent.intentId);
      setPaymentRequestUrl(response.paymentRequestUrl);
      setCanUnlock(response.intent.status === 'settled');
      router.replace(
        `/paywall/${encodeURIComponent(slug)}?intentId=${encodeURIComponent(response.intent.intentId)}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusyCreate(false);
    }
  }

  async function onRequestUnlock() {
    if (!intentId) return;
    try {
      setBusyUnlock(true);
      setError('');
      const response = await fetchJson<UnlockResponse>(
        `/api/paywall/intents/${encodeURIComponent(intentId)}/unlock`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      setIntent(response.intent);
      setCanUnlock(response.intent.status === 'settled');
      setUnlockToken(response.unlockToken);
      setUnlockExpiresAt(response.expiresAt);
      setDataUrl(response.dataUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusyUnlock(false);
    }
  }

  async function onFetchData() {
    if (!dataUrl || !unlockToken) return;
    try {
      setBusyFetchData(true);
      setError('');
      const response = await fetch(dataUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${unlockToken}` },
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type');
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Request failed (${response.status})`);
      }
      setDataContentType(contentType ?? 'text/plain');
      setDataPayload(parseDataPayload(contentType, text));
      if (intentId) {
        const status = await fetchJson<StatusResponse>(
          `/api/paywall/intents/${encodeURIComponent(intentId)}/status`,
        );
        setIntent(status.intent);
        setCanUnlock(status.canUnlock);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusyFetchData(false);
    }
  }

  if (!slug) {
    return (
      <main style={shellStyle}>
        <div style={cardStyle}>
          <p>Missing product slug.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <div style={cardStyle}>
        <header style={{ display: 'grid', gap: '0.4rem' }}>
          <p style={{ letterSpacing: '0.16em', textTransform: 'uppercase', color: '#93c5fd', fontSize: '0.72rem' }}>
            Paywall Checkout
          </p>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 600 }}>
            {loadingProduct ? 'Loading product...' : product?.title ?? 'Product not found'}
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '0.92rem' }}>
            {product?.description || 'Pay on-chain, verify settlement server-side, then unlock protected data.'}
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', borderRadius: 8, padding: '0.7rem', background: 'rgba(69, 10, 10, 0.55)', color: '#fecaca' }}>
            {error}
          </div>
        )}

        {product && (
          <section style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.85rem', display: 'grid', gap: '0.35rem' }}>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Price: <strong style={{ color: '#f8fafc' }}>{product.amount} {product.tokenSymbol}</strong>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Chain: <strong style={{ color: '#f8fafc' }}>{product.chain}</strong> ({product.network})
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Token contract: <code style={{ color: '#e2e8f0' }}>{shortAddress(product.tokenAddress)}</code>
            </div>
          </section>
        )}

        <section style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          <button type="button" style={buttonStyle} onClick={onCreateIntent} disabled={busyCreate || loadingProduct || !product}>
            {busyCreate ? 'Creating...' : 'Create Payment Intent'}
          </button>
          {intent && (
            <button
              type="button"
              style={{ ...buttonStyle, opacity: canUnlock ? 1 : 0.6 }}
              onClick={onRequestUnlock}
              disabled={!canUnlock || busyUnlock}
            >
              {busyUnlock ? 'Issuing token...' : 'Request Unlock Token'}
            </button>
          )}
          {unlockToken && dataUrl && (
            <button
              type="button"
              style={buttonStyle}
              onClick={onFetchData}
              disabled={busyFetchData}
            >
              {busyFetchData ? 'Fetching data...' : 'Fetch Protected Data'}
            </button>
          )}
        </section>

        {intent && (
          <section style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.85rem', display: 'grid', gap: '0.35rem' }}>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Intent: <code style={{ color: '#e2e8f0' }}>{intent.intentId}</code>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Receiver: <code style={{ color: '#e2e8f0' }}>{intent.receiverAddress}</code>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Status: <strong style={{ color: '#f8fafc' }}>{intent.status}</strong>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Paid: <strong style={{ color: '#f8fafc' }}>{intent.paidAmount} / {intent.requestedAmount} {intent.tokenSymbol}</strong>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>
              Expires in: <strong style={{ color: '#f8fafc' }}>{timeUntil(intent.expiresAt)}</strong>
            </div>
          </section>
        )}

        {paymentRequestUrl && (
          <section style={{ display: 'grid', gap: '0.45rem' }}>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
              Agent payment request URL:
            </p>
            <div style={codeBoxStyle}>
              <code>{paymentRequestUrl}</code>
            </div>
            <a
              href={paymentRequestUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#93c5fd', fontSize: '0.84rem' }}
            >
              Open payment request markdown
            </a>
          </section>
        )}

        {unlockToken && (
          <section style={{ display: 'grid', gap: '0.45rem' }}>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
              Unlock token (one-time): expires in {timeUntil(unlockExpiresAt)}
            </p>
            <div style={codeBoxStyle}>
              <code>{unlockToken}</code>
            </div>
          </section>
        )}

        {dataPayload && (
          <section style={{ display: 'grid', gap: '0.45rem' }}>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
              Unlocked payload ({dataContentType || 'text/plain'}):
            </p>
            <pre style={{ ...codeBoxStyle, margin: 0, whiteSpace: 'pre-wrap' }}>
              <code>{dataPayload}</code>
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
