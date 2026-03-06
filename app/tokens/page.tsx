'use client';

import { useState } from 'react';

type NetworkType = 'testnet' | 'mainnet';

type DiscoverResponse = {
  tokens: {
    chain: 'fast';
    network: NetworkType;
    address: string;
    owned: Array<{
      symbol: string;
      address: string;
      balance: string;
      decimals: number;
    }>;
    note: string;
  };
  discoveredAt: string;
};

type LookupResponse = {
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    totalSupply?: string;
    admin?: string;
    minters?: string[];
  } | null;
  found: boolean;
  resolvedAt: string;
};

export default function TokensPage() {
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [token, setToken] = useState('SETUSDC');
  const [busy, setBusy] = useState<'idle' | 'discovering' | 'lookup'>('idle');
  const [error, setError] = useState('');
  const [discoverResult, setDiscoverResult] = useState<DiscoverResponse | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);

  async function discover() {
    setBusy('discovering');
    setError('');

    try {
      const response = await fetch('/api/tokens/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'fast', network }),
      });
      const payload = (await response.json().catch(() => ({}))) as DiscoverResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setDiscoverResult(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  }

  async function lookup() {
    setBusy('lookup');
    setError('');

    try {
      const response = await fetch('/api/tokens/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'fast', network, token }),
      });
      const payload = (await response.json().catch(() => ({}))) as LookupResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setLookupResult(payload);
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
            Tokens
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Inspect Fast wallet balances and query on-chain token metadata.
          </p>
        </header>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto auto', gap: '0.45rem', alignItems: 'end' }}>
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
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token Lookup</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="SETUSDC or 0x..."
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.6rem' }}
              />
            </label>
            <button
              type="button"
              onClick={() => void discover()}
              disabled={busy !== 'idle'}
              style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 999, padding: '0.6rem 1rem', border: 'none', cursor: busy !== 'idle' ? 'not-allowed' : 'pointer', opacity: busy !== 'idle' ? 0.65 : 1 }}
            >
              {busy === 'discovering' ? 'Loading...' : 'Discover'}
            </button>
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={busy !== 'idle'}
              style={{ background: 'transparent', color: 'var(--text)', borderRadius: 999, padding: '0.6rem 1rem', border: '1px solid var(--border)', cursor: busy !== 'idle' ? 'not-allowed' : 'pointer', opacity: busy !== 'idle' ? 0.65 : 1 }}
            >
              {busy === 'lookup' ? 'Looking up...' : 'Lookup'}
            </button>
          </div>

          {error ? <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.8rem' }}>{error}</p> : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
            <section style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Wallet holdings</span>
              <pre style={{ margin: 0, padding: '0.9rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', minHeight: 280, overflowX: 'auto', fontSize: '0.76rem', lineHeight: 1.5 }}>
                {discoverResult ? JSON.stringify(discoverResult, null, 2) : 'No discovery run yet.'}
              </pre>
            </section>
            <section style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token info</span>
              <pre style={{ margin: 0, padding: '0.9rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', minHeight: 280, overflowX: 'auto', fontSize: '0.76rem', lineHeight: 1.5 }}>
                {lookupResult ? JSON.stringify(lookupResult, null, 2) : 'No token lookup yet.'}
              </pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
