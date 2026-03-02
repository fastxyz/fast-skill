'use client';

import { useEffect, useMemo, useState } from 'react';

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

  const activeIntents = useMemo(
    () => intents.filter((i) => !['expired', 'delivered'].includes(i.status)),
    [intents],
  );

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

  async function createIntent() {
    if (!session) return;
    try {
      setBusy(true);
      setCreatingIntent(true);
      setError('');
      const created = await fetchJson<CreateIntentResponse>('/api/demo/intents', {
        method: 'POST',
        body: JSON.stringify({
          buyerSessionId: session.sessionId,
          serviceId: serviceId.trim() || 'movie tickets',
          amount: amount.trim() || '2',
          settlementChain,
        }),
      });
      const appeared = await waitForIntentToAppear(created.intent.intentId);
      if (!appeared) {
        setError('Intent was created, but the list is still syncing. It should appear shortly.');
        await refreshIntents();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCreatingIntent(false);
      setBusy(false);
    }
  }

  async function payIntent(intentId: string, customAmount?: string) {
    try {
      setBusy(true);
      setError('');
      await fetchJson(`/api/demo/intents/${intentId}/pay`, {
        method: 'POST',
        body: JSON.stringify(customAmount ? { amount: customAmount } : {}),
      });
      await refreshIntents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function deliverIntent(intentId: string) {
    try {
      setBusy(true);
      setError('');
      await fetchJson(`/api/demo/intents/${intentId}/deliver`, {
        method: 'POST',
      });
      await refreshIntents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: '1.2rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Service / Product</span>
              <input
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="movie tickets"
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.65rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Amount (SET)</span>
              <input
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
              onClick={() => void createIntent()}
              disabled={busy || creatingIntent || !session}
              style={{ background: 'var(--text)', color: 'var(--bg)', border: 0, borderRadius: 6, padding: '0.55rem 0.9rem', cursor: 'pointer', alignSelf: 'end' }}
            >
              {creatingIntent ? 'Creating...' : 'Create'}
            </button>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: '0.76rem', marginTop: '0.65rem' }}>
            Expiry default: {defaults?.expiryMinutes ?? 15}m. Receiver reuse cooldown: {defaults?.receiverCooldownMinutes ?? 30}m.
            {' '}
            Auto-delivery: {defaults?.autoDeliveryEnabled === false ? 'off' : 'on'}
            {defaults?.autoDeliveryEnabled && (defaults.autoDeliveryDelayMs ?? 0) > 0
              ? ` (${Math.floor((defaults.autoDeliveryDelayMs ?? 0) / 1000)}s delay)`
              : ''}.
          </p>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Intents ({intents.length}) • Active {activeIntents.length}
          </h2>

          {intents.length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>No intents yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {intents.map((intent) => (
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
                      Link: <a href={intent.paymentLink} target="_blank" rel="noreferrer" style={{ color: 'var(--rule)' }}>{intent.paymentLink}</a>
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
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
