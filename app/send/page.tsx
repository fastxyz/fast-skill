'use client';

import { useState } from 'react';

type NetworkType = 'testnet' | 'mainnet';

const SAMPLE_RECEIVER = 'fast1rv8wsdd5pnkwt4u637g2yj4tpuyq26rzw8380rfhpnsnljz7v3tqv4njuq';

type SendResponse = {
  request: {
    to: string;
    amount: string;
    chain: 'fast';
    network: NetworkType;
    token: string | null;
  };
  setup: {
    address: string;
    chain: 'fast';
    network: NetworkType;
  };
  result: {
    txHash: string;
    explorerUrl: string;
  };
  sentAt: string;
};

type SendErrorPayload = {
  error?: string;
  code?: string;
  note?: string | null;
};

export default function SendPage() {
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [to, setTo] = useState(SAMPLE_RECEIVER);
  const [amount, setAmount] = useState('0.1');
  const [token, setToken] = useState('SETUSDC');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendResponse | null>(null);

  async function send() {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/pay/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'fast',
          to,
          amount,
          network,
          token,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SendResponse & SendErrorPayload;
      if (!response.ok) {
        const message = [payload.error, payload.note].filter((value): value is string => Boolean(value && value.trim())).join(' ');
        throw new Error(message || `Request failed (${response.status})`);
      }
      setResult(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
            Send
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Execute a real Fast send from the server wallet configured by the split SDK.
          </p>
        </header>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem' }}>
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
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.6rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="SETUSDC"
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.6rem' }}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Recipient</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', fontFamily: 'var(--font-mono), monospace', fontSize: '0.82rem' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 999, padding: '0.6rem 1rem', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.65 : 1 }}
            >
              {busy ? 'Sending...' : 'Send'}
            </button>
            <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>
              This uses `fast().setup()` + `send()` under `FAST_CONFIG_DIR`.
            </span>
          </div>

          {error ? <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.8rem' }}>{error}</p> : null}

          <pre style={{ margin: 0, padding: '0.9rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', minHeight: 280, overflowX: 'auto', fontSize: '0.76rem', lineHeight: 1.5 }}>
            {result ? JSON.stringify(result, null, 2) : 'No send executed yet.'}
          </pre>
        </section>
      </div>
    </main>
  );
}
