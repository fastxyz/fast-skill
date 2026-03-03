'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PRODUCT_TOUR_QUERY_PARAM, PRODUCT_TOUR_STORAGE_KEY } from '../../lib/demo/tour';

type SettlementChain = 'fast' | 'arbitrum-sepolia';
type CheckoutTourStep = 'pay_now' | 'back_to_merchant';

type PaymentIntent = {
  intentId: string;
  serviceId: string;
  requestedAmount: string;
  settlementChain: SettlementChain;
  receiverAddress: string;
  paymentLink: string;
  expiresAt: string;
  status: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  paidAmountSource?: string;
};

type IntentResponse = {
  intent: PaymentIntent;
  error?: string;
};

const THEME = {
  label: 'Checkout',
  bg: 'linear-gradient(135deg, #0f1115 0%, #171b24 60%, #13232b 100%)',
  border: '#263042',
  accent: '#7dd3fc',
  button: '#f8fafc',
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

function countdownLabel(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return 'expired';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function checkoutTourMessage(step: CheckoutTourStep): string {
  if (step === 'pay_now') {
    return 'Click Pay Now to submit the buyer transaction.';
  }
  return 'Payment finished. Click Back To Merchant to return.';
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get('intentId') ?? '';
  const tourParam = searchParams.get(PRODUCT_TOUR_QUERY_PARAM) ?? '';
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState<CheckoutTourStep>('pay_now');
  const [tourCursor, setTourCursor] = useState<{ x: number; y: number } | null>(null);
  const payButtonRef = useRef<HTMLButtonElement | null>(null);
  const backLinkRef = useRef<HTMLAnchorElement | null>(null);

  const settlementToken = useMemo(
    () => (intent?.settlementChain === 'fast' ? 'SET' : 'WSET'),
    [intent],
  );

  useEffect(() => {
    if (tourParam !== '1') return;
    try {
      const completed = window.localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY) === 'completed';
      setTourActive(!completed);
    } catch {
      setTourActive(false);
    }
  }, [tourParam]);

  useEffect(() => {
    if (!tourActive || !intent) return;
    if (intent.status === 'settled' || intent.status === 'delivered') {
      setTourStep('back_to_merchant');
      return;
    }
    setTourStep('pay_now');
  }, [tourActive, intent]);

  useEffect(() => {
    if (!tourActive) {
      setTourCursor(null);
      return;
    }

    function targetElement(): HTMLElement | null {
      if (tourStep === 'pay_now') return payButtonRef.current;
      return backLinkRef.current;
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
  }, [tourActive, tourStep, intent, busy]);

  async function loadIntent() {
    if (!intentId) return;
    const data = await fetchJson<IntentResponse>(`/api/demo/intents/${intentId}`, { cache: 'no-store' });
    setIntent(data.intent);
  }

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        setLoading(true);
        setError('');
        await loadIntent();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mounted) setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void bootstrap();
    const id = setInterval(() => {
      void loadIntent().catch(() => {
        // silent polling retry
      });
    }, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [intentId]);

  async function pay() {
    if (!intentId) return;
    try {
      setBusy(true);
      setError('');
      const data = await fetchJson<IntentResponse>(`/api/demo/intents/${intentId}/pay`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setIntent(data.intent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function markTourCompleted(): void {
    try {
      window.localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, 'completed');
    } catch {
      // no-op
    }
    setTourActive(false);
  }

  if (!intentId) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--text-2)' }}>Missing `intentId` in URL.</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: THEME.bg, color: '#f8fafc', padding: '2rem 1rem' }}>
      <div
        style={{
          maxWidth: 620,
          margin: '0 auto',
          borderRadius: 16,
          border: `1px solid ${THEME.border}`,
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(6px)',
          padding: '1.3rem',
          display: 'grid',
          gap: '1rem',
        }}
      >
        <header style={{ display: 'grid', gap: '0.4rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: THEME.accent }}>
            {THEME.label}
          </p>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Pay {intent?.requestedAmount ?? '...'} SET</h1>
          <p style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
            Demo checkout for buyer-side flow. Clicking pay submits the on-chain payment on Fast (or Fast + OmniSet bridge for Arbitrum settlement).
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #b91c1c', background: 'rgba(69, 10, 10, 0.7)', borderRadius: 8, padding: '0.7rem 0.8rem', color: '#fecaca' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#cbd5e1' }}>Loading checkout...</p>
        ) : intent ? (
          <>
            <section style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '0.9rem', display: 'grid', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Service: <strong style={{ color: '#f8fafc' }}>{intent.serviceId}</strong>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Settlement: <strong style={{ color: '#f8fafc' }}>{intent.settlementChain === 'fast' ? 'Fast' : 'Arbitrum Sepolia'}</strong>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Receiver: <code style={{ color: '#f8fafc', fontSize: '0.75rem' }}>{intent.receiverAddress}</code>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Expires in: <strong style={{ color: '#f8fafc' }}>{countdownLabel(intent.expiresAt)}</strong>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Status: <strong style={{ color: '#f8fafc' }}>{intent.status}</strong>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                Settled amount: <strong style={{ color: '#f8fafc' }}>{intent.paidAmountSource ?? '0'} {settlementToken}</strong>
              </div>
            </section>

            {intent.settlementChain !== 'fast' && (
              <p style={{ fontSize: '0.8rem', color: '#d1d5db' }}>
                This flow pays on Fast and uses OmniSet to settle on Arbitrum Sepolia.
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {intent.status !== 'settled' && intent.status !== 'delivered' && intent.status !== 'expired' && (
                <button
                  ref={payButtonRef}
                  onClick={() => void pay()}
                  disabled={busy}
                  style={{
                    border: 0,
                    borderRadius: 8,
                    padding: '0.65rem 1rem',
                    background: THEME.button,
                    color: '#111827',
                    cursor: 'pointer',
                    fontWeight: 600,
                    outline: tourActive && tourStep === 'pay_now' ? '1px solid #7dd3fc' : 'none',
                    boxShadow: tourActive && tourStep === 'pay_now' ? '0 0 0 4px rgba(125, 211, 252, 0.25)' : 'none',
                  }}
                >
                  {busy ? 'Processing...' : 'Pay Now'}
                </button>
              )}
              <Link
                ref={backLinkRef}
                href="/merchant"
                onClick={() => {
                  if (tourActive && tourStep === 'back_to_merchant') {
                    markTourCompleted();
                  }
                }}
                style={{
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 8,
                  padding: '0.65rem 1rem',
                  color: '#f8fafc',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  outline: tourActive && tourStep === 'back_to_merchant' ? '1px solid #7dd3fc' : 'none',
                  boxShadow: tourActive && tourStep === 'back_to_merchant' ? '0 0 0 4px rgba(125, 211, 252, 0.25)' : 'none',
                }}
              >
                Back To Merchant
              </Link>
            </div>

            {intent.sourceTxHash && (
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Source tx: <code style={{ color: '#f8fafc' }}>{intent.sourceTxHash}</code>
              </p>
            )}
            {intent.destinationTxHash && (
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Destination tx: <code style={{ color: '#f8fafc' }}>{intent.destinationTxHash}</code>
              </p>
            )}
          </>
        ) : (
          <p style={{ color: '#cbd5e1' }}>Intent not found.</p>
        )}
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
              width: 'min(340px, calc(100vw - 2rem))',
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
              Product Tour
            </div>
            <div style={{ fontSize: '0.86rem', marginTop: '0.35rem' }}>
              {checkoutTourMessage(tourStep)}
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

export default function DemoCheckoutPage() {
  return (
    <Suspense
      fallback={(
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-2)' }}>Loading checkout...</p>
        </main>
      )}
    >
      <CheckoutContent />
    </Suspense>
  );
}
