'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';
import { PRODUCT_TOUR_QUERY_PARAM, PRODUCT_TOUR_STORAGE_KEY } from '../lib/demo/tour';

type BuyerSession = {
  sessionId: string;
  addressFast: string;
  createdAt: string;
  lastSeenAt: string;
};

type ProofEvent = {
  intentId: string;
  kind: string;
  timestamp: string;
  details: string;
};

type PaymentIntent = {
  intentId: string;
  buyerSessionId: string;
  serviceId: string;
  requestedAmount: string;
  tokenRequested: string;
  sourceChain: string;
  settlementChain: string;
  receiverAddress: string;
  paymentLink: string;
  paymentLinkAgent?: string;
  expiresAt: string;
  status: string;
  createdAt: string;
  settledAt?: string;
  deliveredAt?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  overpaid: boolean;
  overpayAmount?: string;
  paidAmountSource?: string;
  events: ProofEvent[];
};

type SettlementChain = 'fast' | 'arbitrum-sepolia';
type MerchantTourStep = 'fill_fields' | 'create_intent' | 'open_link';

type IntentResponse = {
  intents: PaymentIntent[];
  defaults: {
    expiryMinutes: number;
    receiverCooldownMinutes: number;
    verifierIntervalMs: number;
    autoDeliveryEnabled: boolean;
    autoDeliveryDelayMs: number;
  };
  error?: string;
};

type SessionResponse = {
  session: BuyerSession;
  error?: string;
};

type CreateIntentResponse = {
  intent: PaymentIntent;
  session: BuyerSession;
  error?: string;
};

type PayIntentResponse = {
  intent: PaymentIntent;
  session: BuyerSession;
  error?: string;
};

type DeliverIntentResponse = {
  intent: PaymentIntent;
  error?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

function shortHash(value: string | undefined, left = 8, right = 6): string {
  if (!value) return '';
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function statusColor(status: string): string {
  if (status === 'delivered') return '#10b981';
  if (status === 'settled') return '#22c55e';
  if (status === 'source_paid') return '#f59e0b';
  if (status === 'pending_payment' || status === 'created') return '#60a5fa';
  if (status === 'expired' || status === 'failed') return '#ef4444';
  return '#8b8b8b';
}

function countdownLabel(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return 'expired';
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function tourMessage(step: MerchantTourStep): string {
  if (step === 'fill_fields') {
    return 'Add service/product details and amount to start the flow.';
  }
  if (step === 'create_intent') {
    return 'Click Create to generate a new payment intent.';
  }
  return 'Open the payment link in a new tab to continue buyer checkout.';
}

export default function DemoPage() {
  const [session, setSession] = useState<BuyerSession | null>(null);
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [error, setError] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [settlementChain, setSettlementChain] = useState<SettlementChain>('fast');
  const [defaults, setDefaults] = useState<IntentResponse['defaults'] | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState<MerchantTourStep>('fill_fields');
  const [tourIntentId, setTourIntentId] = useState<string | null>(null);
  const [tourCursor, setTourCursor] = useState<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState('');
  const [lastCreateIntentResponse, setLastCreateIntentResponse] = useState<CreateIntentResponse | null>(null);
  const serviceInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const tourLinkRef = useRef<HTMLAnchorElement | null>(null);

  const activeIntents = useMemo(
    () => intents.filter((i) => !['expired', 'delivered'].includes(i.status)),
    [intents],
  );
  const latestIntent = useMemo(
    () => activeIntents[0] ?? intents[0] ?? null,
    [activeIntents, intents],
  );

  const createRequestBody = useMemo(() => ({
    buyerSessionId: session?.sessionId ?? 'buyer_...',
    serviceId: serviceId.trim() || 'movie tickets',
    amount: amount.trim() || '2',
    settlementChain,
  }), [amount, serviceId, session?.sessionId, settlementChain]);

  const merchantAgentActions = useMemo<ApiActionCardProps[]>(() => {
    const createSuccess = lastCreateIntentResponse ?? {
      intent: {
        intentId: 'intent_...',
        status: 'pending_payment',
        paymentLink: `${origin || 'https://example.local'}/merchant/checkout?intentId=intent_...`,
        paymentLinkAgent: `${origin || 'https://example.local'}/api/pay?...`,
      },
      session: {
        sessionId: session?.sessionId ?? 'buyer_...',
        addressFast: session?.addressFast ?? '0x...',
      },
    };

    const payIntentId = latestIntent?.intentId ?? ':intentId';
    const payUrl = `${origin || ''}/api/demo/intents/${payIntentId}/pay`;
    const deliverUrl = `${origin || ''}/api/demo/intents/${payIntentId}/deliver`;
    const payAmount = latestIntent?.requestedAmount ?? (amount.trim() || '2');

    return [
      {
        title: 'Create Intent',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: `${origin || ''}/api/demo/intents`,
          headers: { 'Content-Type': 'application/json' },
          body: createRequestBody,
        },
        successExample: createSuccess,
        failureExamples: [
          {
            status: 400,
            payload: { error: 'Amount is required.' },
            note: 'Provide a positive decimal amount.',
          },
          {
            status: 400,
            payload: { error: 'Settlement chain must be one of: fast, arbitrum-sepolia.' },
            note: 'Use a supported settlement chain value.',
          },
          {
            status: 404,
            payload: { error: 'Buyer session not found. Create a session first.' },
            note: 'Refresh buyer session and retry.',
          },
        ],
        environment: 'Demo APIs (testnet defaults)',
        fieldNotes: [
          '`buyerSessionId` can be omitted when demo cookie session is present.',
          '`amount` must be positive decimal notation.',
        ],
        tryIt: {
          label: 'Try create intent',
          run: async () => createIntent(),
        },
      },
      {
        title: 'Pay Intent',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: payUrl || '/api/demo/intents/:intentId/pay',
          headers: { 'Content-Type': 'application/json' },
          body: { amount: payAmount },
        },
        successExample: latestIntent
          ? {
              intent: {
                intentId: latestIntent.intentId,
                status: latestIntent.status === 'delivered' ? 'delivered' : 'source_paid',
                sourceTxHash: latestIntent.sourceTxHash ?? '0x...',
              },
              session: {
                sessionId: session?.sessionId ?? latestIntent.buyerSessionId,
              },
            }
          : {
              intent: {
                intentId: ':intentId',
                status: 'source_paid',
                sourceTxHash: '0x...',
              },
              session: {
                sessionId: session?.sessionId ?? 'buyer_...',
              },
            },
        failureExamples: [
          {
            status: 400,
            payload: { error: 'Payment link expired.' },
            note: 'Create a new intent.',
          },
          {
            status: 404,
            payload: { error: 'Payment intent not found.' },
            note: 'Verify the `intentId`.',
          },
        ],
        fieldNotes: [
          'Use the latest active intent ID.',
          'Verifier advances status to settled after payment detection.',
        ],
        tryIt: latestIntent
          ? {
              label: 'Try pay latest intent',
              run: async () => payIntent(latestIntent.intentId),
            }
          : undefined,
      },
      {
        title: 'Deliver Intent',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: deliverUrl || '/api/demo/intents/:intentId/deliver',
          headers: { 'Content-Type': 'application/json' },
          body: {},
        },
        successExample: {
          intent: {
            intentId: payIntentId,
            status: 'delivered',
            deliveredAt: latestIntent?.deliveredAt ?? '2026-01-01T00:00:00.000Z',
          },
        },
        failureExamples: [
          {
            status: 400,
            payload: { error: 'Intent must be settled before delivery.' },
            note: 'Wait for settled status before calling deliver.',
          },
          {
            status: 404,
            payload: { error: 'Payment intent not found.' },
            note: 'Verify the `intentId`.',
          },
        ],
        fieldNotes: [
          'Requires settled status.',
          'Transitions intent to delivered.',
        ],
        tryIt: latestIntent
          ? {
              label: 'Try deliver latest intent',
              run: async () => deliverIntent(latestIntent.intentId),
            }
          : undefined,
      },
    ];
  }, [
    amount,
    createRequestBody,
    createIntent,
    deliverIntent,
    lastCreateIntentResponse,
    latestIntent,
    origin,
    payIntent,
    session?.addressFast,
    session?.sessionId,
  ]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const isTourRequested = params.get(PRODUCT_TOUR_QUERY_PARAM) === '1';
      const storedValue = window.localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY);
      const completed = storedValue === 'completed';
      const seen = storedValue === 'seen' || completed;

      if (isTourRequested && !completed) {
        setTourActive(true);
      } else if (!seen) {
        setTourActive(true);
        window.localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, 'seen');
      }
    } catch {
      setTourActive(false);
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== PRODUCT_TOUR_STORAGE_KEY) return;
      if (event.newValue === 'completed') {
        setTourActive(false);
      }
    }

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!tourActive) return;
    if (tourStep !== 'fill_fields') return;
    if (serviceId.trim().length > 0 && amount.trim().length > 0) {
      setTourStep('create_intent');
    }
  }, [tourActive, tourStep, serviceId, amount]);

  useEffect(() => {
    if (!tourActive) {
      setTourCursor(null);
      return;
    }

    function targetElement(): HTMLElement | null {
      if (tourStep === 'fill_fields') {
        return serviceInputRef.current ?? amountInputRef.current;
      }
      if (tourStep === 'create_intent') {
        return createButtonRef.current;
      }
      return tourLinkRef.current;
    }

    function updateCursorPosition() {
      const target = targetElement();
      if (!target) {
        setTourCursor(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTourCursor({
        x: rect.left + 12,
        y: rect.bottom - 8,
      });
    }

    updateCursorPosition();
    const intervalId = window.setInterval(updateCursorPosition, 220);
    window.addEventListener('resize', updateCursorPosition);
    window.addEventListener('scroll', updateCursorPosition, true);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', updateCursorPosition);
      window.removeEventListener('scroll', updateCursorPosition, true);
    };
  }, [tourActive, tourStep, intents, creatingIntent]);

  async function refreshSession() {
    const data = await fetchJson<SessionResponse>('/api/demo/session', {
      method: 'POST',
    });
    setSession(data.session);
  }

  async function refreshIntents() {
    const data = await fetchJson<IntentResponse>('/api/demo/intents', {
      cache: 'no-store',
    });
    setIntents(data.intents);
    setDefaults(data.defaults);
  }

  async function waitForIntentToAppear(intentId: string): Promise<boolean> {
    const timeoutMs = 15_000;
    const pollMs = 600;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const data = await fetchJson<IntentResponse>('/api/demo/intents', {
        cache: 'no-store',
      });
      setIntents(data.intents);
      setDefaults(data.defaults);
      if (data.intents.some((intent) => intent.intentId === intentId)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    return false;
  }

  async function bootstrap() {
    try {
      setLoading(true);
      setError('');
      await Promise.all([refreshSession(), refreshIntents()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
    const id = setInterval(() => {
      void refreshIntents().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  async function createIntent(): Promise<CreateIntentResponse | null> {
    if (!session) return null;
    try {
      setBusy(true);
      setCreatingIntent(true);
      setError('');
      if (tourActive && tourStep === 'fill_fields') {
        setTourStep('create_intent');
      }
      const created = await fetchJson<CreateIntentResponse>('/api/demo/intents', {
        method: 'POST',
        body: JSON.stringify({
          buyerSessionId: session.sessionId,
          serviceId: serviceId.trim() || 'movie tickets',
          amount: amount.trim() || '2',
          settlementChain,
        }),
      });
      setLastCreateIntentResponse(created);
      const appeared = await waitForIntentToAppear(created.intent.intentId);
      if (!appeared) {
        setError('Intent was created, but the list is still syncing. It should appear shortly.');
        await refreshIntents();
      }
      if (tourActive) {
        setTourIntentId(created.intent.intentId);
        setTourStep('open_link');
      }
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setCreatingIntent(false);
      setBusy(false);
    }
  }

  async function payIntent(intentId: string, customAmount?: string): Promise<PayIntentResponse> {
    try {
      setBusy(true);
      setError('');
      const response = await fetchJson<PayIntentResponse>(`/api/demo/intents/${intentId}/pay`, {
        method: 'POST',
        body: JSON.stringify(customAmount ? { amount: customAmount } : {}),
      });
      await refreshIntents();
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function deliverIntent(intentId: string): Promise<DeliverIntentResponse> {
    try {
      setBusy(true);
      setError('');
      const response = await fetchJson<DeliverIntentResponse>(`/api/demo/intents/${intentId}/deliver`, {
        method: 'POST',
      });
      await refreshIntents();
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1.2rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Demo
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Merchant + Buyer Flow Demo
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            This merchant dashboard creates payment intents...
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', background: '#1f1111', color: '#fca5a5', borderRadius: 8, padding: '0.8rem 0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Buyer Session</h2>
              {loading ? (
                <p style={{ color: 'var(--text-3)' }}>Loading session...</p>
              ) : session ? (
                <div style={{ display: 'grid', gap: '0.4rem', fontFamily: 'var(--font-mono), monospace', fontSize: '0.78rem' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>session:</span> {session.sessionId}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>buyer fast wallet:</span> {session.addressFast}</div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-3)' }}>No session yet.</p>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Merchant: Create Intent</h2>
              <div style={{ display: 'grid', gap: '0.8rem', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                    <label
                      style={{
                        display: 'grid',
                        gap: '0.3rem',
                        borderRadius: 8,
                        padding: tourActive && tourStep === 'fill_fields' ? '0.35rem' : 0,
                        outline: tourActive && tourStep === 'fill_fields' ? '1px solid #7dd3fc' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Service / Product</span>
                      <input
                        ref={serviceInputRef}
                        value={serviceId}
                        onChange={(e) => setServiceId(e.target.value)}
                        placeholder="movie tickets"
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.65rem' }}
                      />
                    </label>
                    <label
                      style={{
                        display: 'grid',
                        gap: '0.3rem',
                        borderRadius: 8,
                        padding: tourActive && tourStep === 'fill_fields' ? '0.35rem' : 0,
                        outline: tourActive && tourStep === 'fill_fields' ? '1px solid #7dd3fc' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Amount (SET)</span>
                      <input
                        ref={amountInputRef}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="2"
                        type="number"
                        min="0"
                        step="any"
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.65rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Settlement Chain</span>
                      <select
                        value={settlementChain}
                        onChange={(e) => setSettlementChain(e.target.value as SettlementChain)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.65rem' }}
                      >
                        <option value="fast">Fast</option>
                        <option value="arbitrum-sepolia">Arbitrum Sepolia (via OmniSet)</option>
                      </select>
                    </label>
                    <button
                      ref={createButtonRef}
                      onClick={() => void createIntent()}
                      disabled={busy || creatingIntent || !session}
                      style={{
                        background: 'var(--text)',
                        color: 'var(--bg)',
                        border: 0,
                        borderRadius: 6,
                        padding: '0.55rem 0.9rem',
                        cursor: 'pointer',
                        alignSelf: 'end',
                        outline: tourActive && tourStep === 'create_intent' ? '1px solid #7dd3fc' : 'none',
                        boxShadow: tourActive && tourStep === 'create_intent' ? '0 0 0 4px rgba(125, 211, 252, 0.25)' : 'none',
                      }}
                    >
                      {creatingIntent ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.76rem' }}>
                    Expiry default: {defaults?.expiryMinutes ?? 15}m. Receiver reuse cooldown: {defaults?.receiverCooldownMinutes ?? 30}m.
                    {' '}
                    Auto-delivery: {defaults?.autoDeliveryEnabled === false ? 'off' : 'on'}
                    {defaults?.autoDeliveryEnabled && (defaults.autoDeliveryDelayMs ?? 0) > 0
                      ? ` (${Math.floor((defaults.autoDeliveryDelayMs ?? 0) / 1000)}s delay)`
                      : ''}.
                  </p>
                </div>
              </div>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                Intents ({intents.length}) • Active {activeIntents.length}
              </h2>

              {intents.length === 0 ? (
                <p style={{ color: 'var(--text-3)' }}>No intents yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  {intents.map((intent, index) => {
                    const isTourLinkTarget = tourActive
                      && tourStep === 'open_link'
                      && (tourIntentId ? intent.intentId === tourIntentId : index === 0);
                    return (
                      <article
                        key={intent.intentId}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--code-bg)',
                          padding: '0.9rem',
                          display: 'grid',
                          gap: '0.65rem',
                        }}
                      >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono), monospace', fontSize: '0.76rem', color: 'var(--text-3)' }}>
                        {intent.intentId}
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        Service <code>{intent.serviceId}</code> • Request <strong>{intent.requestedAmount} SET</strong>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '0.18rem 0.55rem',
                        borderRadius: 999,
                        border: `1px solid ${statusColor(intent.status)}`,
                        color: statusColor(intent.status),
                        fontSize: '0.74rem',
                        alignSelf: 'flex-start',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {intent.status}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.78rem', color: 'var(--text-2)' }}>
                    <div>Receiver: <code>{intent.receiverAddress}</code></div>
                    <div>
                      Settlement: <strong>{intent.settlementChain === 'fast' ? 'Fast' : 'Arbitrum Sepolia'}</strong>
                    </div>
                    <div>
                      Link to payment page:{' '}
                      <a
                        ref={isTourLinkTarget ? tourLinkRef : undefined}
                        href={intent.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          if (!isTourLinkTarget || !tourActive || tourStep !== 'open_link') return;
                          event.preventDefault();
                          const checkoutUrl = new URL(intent.paymentLink, window.location.origin);
                          checkoutUrl.searchParams.set(PRODUCT_TOUR_QUERY_PARAM, '1');
                          window.open(checkoutUrl.toString(), '_blank', 'noopener,noreferrer');
                        }}
                        style={{
                          color: 'var(--rule)',
                          borderRadius: 6,
                          padding: isTourLinkTarget ? '0.05rem 0.2rem' : 0,
                          outline: isTourLinkTarget ? '1px solid #7dd3fc' : 'none',
                          boxShadow: isTourLinkTarget ? '0 0 0 4px rgba(125, 211, 252, 0.25)' : 'none',
                        }}
                      >
                        {intent.paymentLink}
                      </a>
                    </div>
                    <div>
                      Link for agents:{' '}
                      {intent.paymentLinkAgent ? (
                        <a href={intent.paymentLinkAgent} target="_blank" rel="noreferrer" style={{ color: 'var(--rule)' }}>
                          {intent.paymentLinkAgent}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>—</span>
                      )}
                    </div>
                    <div>
                      Expires in: <strong>{countdownLabel(intent.expiresAt)}</strong>
                    </div>
                    <div>
                      Paid: <strong>{intent.paidAmountSource ?? '0'} {intent.settlementChain === 'fast' ? 'SET' : 'WSET'}</strong>
                      {intent.overpaid && intent.overpayAmount
                        ? ` (overpaid by ${intent.overpayAmount} ${intent.settlementChain === 'fast' ? 'SET' : 'WSET'})`
                        : ''}
                    </div>
                    <div>
                      Source tx: <code>{intent.sourceTxHash ? shortHash(intent.sourceTxHash) : '—'}</code>
                    </div>
                    <div>
                      Destination tx: <code>{intent.destinationTxHash ? shortHash(intent.destinationTxHash) : '—'}</code>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {intent.status !== 'expired' && intent.status !== 'delivered' && (
                      <details style={{ color: 'var(--text-2)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.79rem' }}>
                          Simulate Buyer Transaction
                        </summary>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.55rem' }}>
                          <button
                            disabled={busy}
                            onClick={() => void payIntent(intent.intentId)}
                            style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.4rem 0.7rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                          >
                            Buyer Pays Exact Price
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              const overpay = (Number(intent.requestedAmount) + 1).toString();
                              void payIntent(intent.intentId, overpay);
                            }}
                            style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.4rem 0.7rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                          >
                            Buyer Overpays +1 SET
                          </button>
                        </div>
                      </details>
                    )}
                    {intent.status === 'settled' && (
                      <button
                        disabled={busy}
                        onClick={() => void deliverIntent(intent.intentId)}
                        style={{ border: 0, borderRadius: 5, padding: '0.4rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                      >
                        Merchant Deliver Service
                      </button>
                    )}
                  </div>

                  {intent.events.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem', display: 'grid', gap: '0.35rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Timeline
                      </div>
                      {intent.events.map((event) => (
                        <div key={`${event.timestamp}-${event.kind}`} style={{ fontSize: '0.76rem', color: 'var(--text-2)' }}>
                          <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono), monospace' }}>
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>{' '}
                          <strong style={{ color: 'var(--text)' }}>{event.kind}</strong>{' '}
                          {event.details}
                        </div>
                      ))}
                    </div>
                  )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Shared action-card system wired to merchant demo endpoints."
            actions={merchantAgentActions}
          />
        </div>
      </div>
      {tourActive && (
        <>
          {tourCursor && (
            <>
              <div
                style={{
                  position: 'fixed',
                  left: tourCursor.x,
                  top: tourCursor.y,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#7dd3fc',
                  transform: 'translate(-8px, -8px)',
                  pointerEvents: 'none',
                  zIndex: 90,
                  animation: 'productTourCursorDot 1.1s ease-in-out infinite alternate',
                }}
              />
              <div
                style={{
                  position: 'fixed',
                  left: tourCursor.x,
                  top: tourCursor.y,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '2px solid rgba(125, 211, 252, 0.8)',
                  transform: 'translate(-14px, -14px)',
                  pointerEvents: 'none',
                  zIndex: 89,
                  animation: 'productTourCursorRing 1.1s ease-out infinite',
                }}
              />
            </>
          )}
          <div
            style={{
              position: 'fixed',
              right: 18,
              bottom: 18,
              width: 'min(360px, calc(100vw - 2rem))',
              borderRadius: 10,
              border: '1px solid #33506a',
              background: 'rgba(12, 18, 24, 0.92)',
              color: '#dbeafe',
              padding: '0.8rem 0.9rem',
              zIndex: 95,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93c5fd' }}>
              GET STARTED
            </div>
            <div style={{ fontSize: '0.86rem', marginTop: '0.35rem' }}>
              {tourMessage(tourStep)}
            </div>
          </div>
          <style jsx global>{`
            @keyframes productTourCursorDot {
              from { transform: translate(-8px, -8px) scale(1); }
              to { transform: translate(-8px, -8px) scale(0.82); }
            }
            @keyframes productTourCursorRing {
              from { transform: translate(-14px, -14px) scale(0.7); opacity: 0.95; }
              to { transform: translate(-14px, -14px) scale(1.2); opacity: 0.15; }
            }
          `}</style>
        </>
      )}
    </main>
  );
}
