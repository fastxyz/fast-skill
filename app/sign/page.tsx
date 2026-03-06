'use client';

import { useState } from 'react';

type NetworkType = 'testnet' | 'mainnet';

type SignResponse = {
  sign: {
    signature: string;
    address: string;
    chain: 'fast';
    network: NetworkType;
  };
  signedAt: string;
};

type VerifyResponse = {
  verify: {
    valid: boolean;
    address: string;
    chain: 'fast';
    network: NetworkType;
  };
  verifiedAt: string;
};

function buildChallengeMessage(): string {
  const nonce = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    : Math.random().toString(16).slice(2, 14);
  return `Sign in: nonce-${nonce} @ ${new Date().toISOString()}`;
}

export default function SignPage() {
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [message, setMessage] = useState(buildChallengeMessage());
  const [signature, setSignature] = useState('');
  const [address, setAddress] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'idle' | 'signing' | 'verifying'>('idle');
  const [signResult, setSignResult] = useState<SignResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  async function sign() {
    setBusy('signing');
    setError('');

    try {
      const response = await fetch('/api/sign/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'fast',
          network,
          message,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SignResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setSignResult(payload);
      setSignature(payload.sign.signature);
      setAddress(payload.sign.address);
      setVerifyMessage(message);
      setVerifyResult(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  }

  async function verify() {
    setBusy('verifying');
    setError('');

    try {
      const response = await fetch('/api/sign/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'fast',
          network,
          message: verifyMessage,
          signature,
          address,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as VerifyResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setVerifyResult(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Fast SDK
          </p>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Sign
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Sign and verify messages with the Fast wallet managed by the split SDK.
          </p>
        </header>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '0.45rem', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Network</span>
              <select
                value={network}
                onChange={(event) => setNetwork(event.target.value as NetworkType)}
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.6rem' }}
              >
                <option value="mainnet">mainnet</option>
                <option value="testnet">testnet</option>
              </select>
            </label>
            <div>
              <button
                type="button"
                onClick={() => setMessage(buildChallengeMessage())}
                style={{ background: 'transparent', color: 'var(--text)', borderRadius: 999, padding: '0.55rem 0.95rem', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                New Challenge
              </button>
            </div>
          </div>

          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void sign()}
              disabled={busy !== 'idle'}
              style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 999, padding: '0.6rem 1rem', border: 'none', cursor: busy !== 'idle' ? 'not-allowed' : 'pointer', opacity: busy !== 'idle' ? 0.65 : 1 }}
            >
              {busy === 'signing' ? 'Signing...' : 'Sign Message'}
            </button>
            <button
              type="button"
              onClick={() => void verify()}
              disabled={busy !== 'idle' || !signature || !address}
              style={{ background: 'transparent', color: 'var(--text)', borderRadius: 999, padding: '0.6rem 1rem', border: '1px solid var(--border)', cursor: busy !== 'idle' || !signature || !address ? 'not-allowed' : 'pointer', opacity: busy !== 'idle' || !signature || !address ? 0.55 : 1 }}
            >
              {busy === 'verifying' ? 'Verifying...' : 'Verify Signature'}
            </button>
          </div>

          {error ? <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.8rem' }}>{error}</p> : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Signature</span>
              <textarea
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                rows={6}
                placeholder="hex signature"
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', resize: 'vertical', fontFamily: 'var(--font-mono), monospace', fontSize: '0.78rem' }}
              />
            </div>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Address</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="fast1..."
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', fontFamily: 'var(--font-mono), monospace', fontSize: '0.8rem' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Verify message</span>
              <textarea
                value={verifyMessage}
                onChange={(event) => setVerifyMessage(event.target.value)}
                rows={4}
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', resize: 'vertical' }}
              />
            </div>
          </div>

          <pre style={{ margin: 0, padding: '0.9rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', minHeight: 260, overflowX: 'auto', fontSize: '0.76rem', lineHeight: 1.5 }}>
            {JSON.stringify({ signResult, verifyResult }, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
