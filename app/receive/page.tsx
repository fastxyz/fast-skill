'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';
import { CHAINS, isValidAddress } from '../lib/pay-chains';

type NetworkType = 'testnet' | 'mainnet';

function firstLines(value: string, limit = 26): string {
  return value.split('\n').slice(0, limit).join('\n');
}

export default function ReceivePage() {
  const defaultChain = CHAINS[0];

  const [origin, setOrigin] = useState('');
  const [chain, setChain] = useState(defaultChain.value);
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('1');
  const [token, setToken] = useState(defaultChain.token);
  const [memo, setMemo] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);

  const selectedChain = useMemo(
    () => CHAINS.find((entry) => entry.value === chain) ?? defaultChain,
    [chain, defaultChain],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setToken(selectedChain.token);
  }, [selectedChain]);

  function buildPayUrl(): string | null {
    setError('');
    setLinkUrl('');
    const resolvedReceiver = receiver.trim() || selectedChain.sampleReceiver;

    if (!receiver.trim()) {
      setReceiver(selectedChain.sampleReceiver);
    }

    if (!isValidAddress(resolvedReceiver, chain)) {
      setError('Receiver address is invalid for the selected chain.');
      return null;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return null;
    }

    const params = new URLSearchParams({
      receiver: resolvedReceiver,
      amount: amount.trim(),
      chain,
      network,
      token: token.trim() || selectedChain.token,
    });
    if (memo.trim()) params.set('memo', memo.trim());

    return `${window.location.origin}/api/pay?${params.toString()}`;
  }

  function generateLink() {
    const url = buildPayUrl();
    if (!url) return;

    setLinkUrl(url);
    setMarkdownPreview('');
  }

  async function previewMarkdownFromUrl(targetUrl?: string): Promise<{ url: string; preview: string }> {
    const url = (targetUrl ?? linkUrl).trim();
    if (!url) throw new Error('No /api/pay URL available. Generate one first.');

    setPreviewBusy(true);
    setError('');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/markdown' },
        cache: 'no-store',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Markdown request failed (${response.status})`);
      }

      const markdown = await response.text();
      const preview = firstLines(markdown, 28);
      setMarkdownPreview(preview);
      return { url, preview };
    } finally {
      setPreviewBusy(false);
    }
  }

  async function copyLinkUrl() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const payQuery = useMemo(() => {
    const params = new URLSearchParams({
      receiver: receiver.trim() || selectedChain.sampleReceiver,
      amount: amount.trim() || '1',
      chain,
      network,
      token: token.trim() || selectedChain.token,
    });
    if (memo.trim()) params.set('memo', memo.trim());
    return params.toString();
  }, [amount, chain, memo, network, receiver, selectedChain.sampleReceiver, selectedChain.token, token]);

  const agentActions = useMemo<ApiActionCardProps[]>(() => {
    const payUrl = `${origin || ''}/api/pay?${payQuery}`;
    const payHeaders: Record<string, string> = { Accept: 'text/markdown' };

    return [
      {
        title: 'Generate Payment Request Markdown',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'GET',
          url: payUrl,
          headers: payHeaders,
          snippets: {
            javascript: [
              `const response = await fetch('${payUrl}', { method: 'GET', headers: { Accept: 'text/markdown' } });`,
              'const markdown = await response.text();',
              'console.log(markdown);',
            ].join('\n'),
          },
        },
        successExample: {
          type: 'text/markdown',
          preview: markdownPreview || '---\ntype: payment_request\nversion: "2.0"\n...\n',
        },
        failureExamples: [
          {
            status: 400,
            payload: { error: 'Missing required param: receiver' },
            note: 'Include receiver, amount, and chain query params.',
          },
          {
            status: 400,
            payload: { error: 'Invalid receiver address for chain fast' },
            note: 'Validate address format for the selected chain.',
          },
        ],
        environment: 'Public API endpoint',
        fieldNotes: [
          '`/api/pay` returns markdown, not JSON.',
          'Use frontmatter fields in agent runtimes to execute `money.send(...)`.',
        ],
        tryIt: {
          label: 'Fetch markdown preview',
          run: async () => previewMarkdownFromUrl(payUrl),
        },
      },
    ];
  }, [markdownPreview, origin, payQuery]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Payments
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Receive
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Request payments through invoice links
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'grid', gap: '0.2rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                Create Payment Request Link
              </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem' }}>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain</span>
                <select
                  value={chain}
                  onChange={(event) => setChain(event.target.value)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                >
                  {CHAINS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Network</span>
                <select
                  value={network}
                  onChange={(event) => setNetwork(event.target.value as NetworkType)}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                >
                  <option value="testnet">testnet</option>
                  <option value="mainnet">mainnet</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="1"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={selectedChain.token}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Receiver Address</span>
              <input
                value={receiver}
                onChange={(event) => setReceiver(event.target.value)}
                placeholder={selectedChain.placeholder}
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
              />
            </label>

            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Memo (optional)</span>
              <input
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="invoice_42"
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={generateLink}
                style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
              >
                Generate Link
              </button>
              {linkUrl && (
                <button
                  onClick={() => void previewMarkdownFromUrl(linkUrl)}
                  disabled={previewBusy}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.42rem 0.62rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {previewBusy ? 'Loading markdown...' : 'Preview markdown'}
                </button>
              )}
            </div>

            {error && (
              <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.74rem' }}>{error}</p>
            )}

            {linkUrl && (
              <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.74rem', color: 'var(--text-2)' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <code style={{ overflowX: 'auto', maxWidth: '100%' }}>{linkUrl}</code>
                  <button
                    onClick={() => void copyLinkUrl()}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.22rem 0.45rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                  >
                    {copied ? 'copied' : 'copy'}
                  </button>
                </div>
              </div>
            )}

            {markdownPreview && (
              <pre style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--code-bg)', padding: '0.6rem', whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', fontSize: '0.72rem', lineHeight: 1.45 }}>
                {markdownPreview}
              </pre>
            )}
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Use endpoint calls to generate payment request markdown."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
