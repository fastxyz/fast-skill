'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeLocalOrigin } from '../lib/origin';

type NetworkType = 'testnet' | 'mainnet';

const SAMPLE_RECEIVER = 'fast1rv8wsdd5pnkwt4u637g2yj4tpuyq26rzw8380rfhpnsnljz7v3tqv4njuq';
const FAST_ADDRESS_PATTERN = /^fast1[a-z0-9]{38,}$/;

function firstLines(value: string, limit = 28): string {
  return value.split('\n').slice(0, limit).join('\n');
}

export default function ReceivePage() {
  const [origin, setOrigin] = useState('');
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [receiver, setReceiver] = useState(SAMPLE_RECEIVER);
  const [amount, setAmount] = useState('1');
  const [token, setToken] = useState('SETUSDC');
  const [memo, setMemo] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(normalizeLocalOrigin(window.location.origin));
  }, []);

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams({
      chain: 'fast',
      receiver: receiver.trim() || SAMPLE_RECEIVER,
      amount: amount.trim() || '1',
      network,
    });
    if (token.trim()) params.set('token', token.trim());
    if (memo.trim()) params.set('memo', memo.trim());
    return params.toString();
  }, [amount, memo, network, receiver, token]);

  function buildUrl(): string | null {
    setError('');

    if (!FAST_ADDRESS_PATTERN.test(receiver.trim())) {
      setError('Receiver must be a valid fast1... address.');
      return null;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return null;
    }

    return `${normalizeLocalOrigin(window.location.origin)}/api/pay?${requestQuery}`;
  }

  async function generateLink() {
    const url = buildUrl();
    if (!url) return;
    setLinkUrl(url);
    setPreview('');
    await previewMarkdown(url);
  }

  async function previewMarkdown(targetUrl?: string) {
    const url = (targetUrl ?? linkUrl).trim();
    if (!url) {
      setError('Generate a payment request URL first.');
      return;
    }

    setPreviewBusy(true);
    setError('');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/markdown' },
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      const markdown = await response.text();
      setPreview(firstLines(markdown));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function copyUrl() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Fast SDK
          </p>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Receive
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Generate Fast-only payment request markdown for agents.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Receiver</span>
                <input
                  value={receiver}
                  onChange={(event) => setReceiver(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.7rem', fontFamily: 'var(--font-mono), monospace', fontSize: '0.82rem' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem' }}>
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
              </div>

              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Memo (optional metadata)</span>
                <input
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="invoice:alpha-001"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.6rem' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void generateLink()}
                style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 999, padding: '0.6rem 1rem', border: 'none', cursor: 'pointer' }}
              >
                {previewBusy ? 'Generating...' : 'Generate Link'}
              </button>
              <button
                type="button"
                onClick={copyUrl}
                disabled={!linkUrl}
                style={{ background: 'transparent', color: 'var(--text)', borderRadius: 999, padding: '0.6rem 1rem', border: '1px solid var(--border)', cursor: !linkUrl ? 'not-allowed' : 'pointer', opacity: !linkUrl ? 0.55 : 1 }}
              >
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>

            {error ? <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.8rem' }}>{error}</p> : null}

            <div style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>/api/pay URL</span>
              <code style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {linkUrl || `${origin || 'http://localhost:3000'}/api/pay?${requestQuery}`}
              </code>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
            <header style={{ display: 'grid', gap: '0.2rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Preview</h2>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.78rem' }}>
                Fast-only markdown that points agents to the current skill and `fast.send(...)`.
              </p>
            </header>
            <pre style={{ margin: 0, padding: '0.9rem', borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border)', minHeight: 320, overflowX: 'auto', fontSize: '0.76rem', lineHeight: 1.5 }}>
              {preview || 'No preview loaded yet.'}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}
