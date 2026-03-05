'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type LinkDirection = 'created' | 'paid';
type DashboardState = 'idle' | 'creating' | 'created' | 'loading_links' | 'ready' | 'error';

type ChainOption = {
  label: string;
  value: string;
  token: string;
  sampleReceiver: string;
};

type PaymentLinkResult = {
  url: string;
  payment_id: string;
  receiver: string;
  amount: string;
  chain: string;
  token: string;
  network: string;
  note: string;
};

type PaymentLinkEntryView = {
  ts: string;
  payment_id: string;
  direction: LinkDirection;
  chain: string;
  network: string;
  receiver: string;
  amount: string;
  token: string;
  memo: string;
  url: string;
  txHash: string;
  shareUrl: string;
  apiRequestUrl: string;
};

type CreateLinkResponse = {
  link: PaymentLinkResult;
  shareUrl: string;
  sdkShareUrl?: string;
  apiRequestUrl: string;
  error?: string;
  code?: string;
};

type ListLinksResponse = {
  entries: PaymentLinkEntryView[];
  note: string;
  filters: {
    payment_id?: string;
    direction?: LinkDirection;
    chain?: string;
    limit?: number;
  };
  error?: string;
  code?: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  { label: 'Fast', value: 'fast', token: 'SET', sampleReceiver: 'set1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' },
  { label: 'Base', value: 'base', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Ethereum', value: 'ethereum', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Arbitrum', value: 'arbitrum', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Polygon', value: 'polygon', token: 'POL', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Optimism', value: 'optimism', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'BSC', value: 'bsc', token: 'BNB', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Avalanche', value: 'avalanche', token: 'AVAX', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Fantom', value: 'fantom', token: 'FTM', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'zkSync', value: 'zksync', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Linea', value: 'linea', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Scroll', value: 'scroll', token: 'ETH', sampleReceiver: '0x1111111111111111111111111111111111111111' },
  { label: 'Solana', value: 'solana', token: 'SOL', sampleReceiver: '11111111111111111111111111111111' },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
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

function firstMarkdownLines(markdown: string, limit: number): string {
  return markdown.split('\n').slice(0, limit).join('\n');
}

function statusColor(state: DashboardState): string {
  if (state === 'creating' || state === 'loading_links') return '#93c5fd';
  if (state === 'error') return '#fca5a5';
  if (state === 'created' || state === 'ready') return '#86efac';
  return 'var(--text-3)';
}

export default function PaymentLinksDashboardPage() {
  const defaultChain = CHAIN_OPTIONS[0];
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<DashboardState>('idle');

  const [chain, setChain] = useState(defaultChain.value);
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [receiver, setReceiver] = useState(defaultChain.sampleReceiver);
  const [amount, setAmount] = useState('10');
  const [token, setToken] = useState(defaultChain.token);
  const [memo, setMemo] = useState('intent:abc');

  const [filterPaymentId, setFilterPaymentId] = useState('');
  const [filterChain, setFilterChain] = useState('');
  const [filterDirection, setFilterDirection] = useState<'all' | LinkDirection>('all');
  const [filterLimit, setFilterLimit] = useState(20);

  const [entries, setEntries] = useState<PaymentLinkEntryView[]>([]);
  const [note, setNote] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [latestCreated, setLatestCreated] = useState<CreateLinkResponse | null>(null);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [previewPaymentId, setPreviewPaymentId] = useState('');

  const selectedChain = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === chain) ?? CHAIN_OPTIONS[0],
    [chain],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setToken(selectedChain.token);
    setReceiver(selectedChain.sampleReceiver);
  }, [selectedChain]);

  async function loadLinks(): Promise<ListLinksResponse> {
    setState('loading_links');
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterPaymentId.trim()) params.set('payment_id', filterPaymentId.trim());
      if (filterChain.trim()) params.set('chain', filterChain.trim());
      if (filterDirection !== 'all') params.set('direction', filterDirection);
      params.set('limit', String(filterLimit));

      const response = await fetchJson<ListLinksResponse>(`/api/payment-links?${params.toString()}`);
      setEntries(response.entries);
      setNote(response.note);
      setState('ready');
      setLastRefreshedAt(new Date().toISOString());
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function createLink(): Promise<CreateLinkResponse> {
    setState('creating');
    setError('');
    try {
      const payload = {
        receiver: receiver.trim(),
        amount: amount.trim(),
        chain,
        token: token.trim(),
        network,
        memo: memo.trim() || undefined,
      };
      const response = await fetchJson<CreateLinkResponse>('/api/payment-links', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setLatestCreated(response);
      setState('created');
      await loadLinks();
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function previewPayMarkdown(targetUrl?: string): Promise<{ url: string; snippet: string }> {
    const url = (targetUrl ?? latestCreated?.apiRequestUrl ?? '').trim();
    if (!url) {
      throw new Error('No /api/pay URL available for preview.');
    }

    setPreviewBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/markdown' },
        cache: 'no-store',
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Request failed (${response.status})`);
      }
      setPreviewUrl(url);
      setPreviewMarkdown(text);
      setPreviewPaymentId(response.headers.get('x-payment-id') ?? '');
      return {
        url,
        snippet: firstMarkdownLines(text, 18),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    } finally {
      setPreviewBusy(false);
    }
  }

  useEffect(() => {
    void loadLinks();
  }, []);

  const createRequestPayload = useMemo(
    () => ({
      receiver: receiver.trim() || selectedChain.sampleReceiver,
      amount: amount.trim() || '10',
      chain,
      token: token.trim() || selectedChain.token,
      network,
      memo: memo.trim() || 'intent:abc',
    }),
    [amount, chain, memo, network, receiver, selectedChain.sampleReceiver, selectedChain.token, token],
  );

  const sampleApiPayUrl = useMemo(() => {
    const params = new URLSearchParams({
      receiver: createRequestPayload.receiver,
      amount: createRequestPayload.amount,
      chain: createRequestPayload.chain,
      token: createRequestPayload.token,
      network: createRequestPayload.network,
    });
    if (createRequestPayload.memo) params.set('memo', createRequestPayload.memo);
    return `${origin || 'https://example.local'}/api/pay?${params.toString()}`;
  }, [createRequestPayload, origin]);

  const createSdkSnippet = useMemo(() => [
    'await money.createPaymentLink({',
    `  receiver: "${createRequestPayload.receiver}",`,
    `  amount: ${createRequestPayload.amount},`,
    `  chain: "${createRequestPayload.chain}",`,
    `  network: "${createRequestPayload.network}",`,
    `  token: "${createRequestPayload.token}",`,
    createRequestPayload.memo ? `  memo: "${createRequestPayload.memo}"` : '',
    '});',
  ].filter(Boolean).join('\n'), [createRequestPayload]);

  const listSdkSnippet = useMemo(() => {
    const pieces = [
      filterChain ? `chain: "${filterChain}"` : '',
      filterDirection !== 'all' ? `direction: "${filterDirection}"` : '',
      filterPaymentId.trim() ? `payment_id: "${filterPaymentId.trim()}"` : '',
      `limit: ${filterLimit}`,
    ].filter(Boolean);
    return `await money.listPaymentLinks({ ${pieces.join(', ')} });`;
  }, [filterChain, filterDirection, filterLimit, filterPaymentId]);

  const markdownSnippet = previewMarkdown
    ? firstMarkdownLines(previewMarkdown, 18)
    : '---\ntype: payment_request\nversion: "2.0"\n...\n---\n\n# Payment Request ...';

  const agentActions = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'Create Invoice Link',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.createPaymentLink',
        body: createRequestPayload,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: createSdkSnippet,
          raw_json: JSON.stringify(createRequestPayload, null, 2),
        },
      },
      successExample: latestCreated?.link ?? {
        url: `${origin || 'https://example.local'}/receive?receiver=${encodeURIComponent(createRequestPayload.receiver)}&amount=${createRequestPayload.amount}&chain=${createRequestPayload.chain}`,
        payment_id: 'pay_...',
        chain: createRequestPayload.chain,
        amount: createRequestPayload.amount,
      },
      failureExamples: [
        {
          payload: { error: 'Invalid address for chain fast: set1...', code: 'INVALID_ADDRESS' },
          note: 'Use a receiver address valid for the selected chain.',
        },
        {
          payload: { error: 'Amount must be a positive number', code: 'INVALID_PARAMS' },
          note: 'Use decimal notation and a value greater than zero.',
        },
      ],
      fieldNotes: [
        'Creates a shareable link and appends local lifecycle row at ~/.money/payment-links.csv.',
      ],
      tryIt: {
        label: 'Try create link',
        run: async () => createLink(),
      },
    },
    {
      title: 'List Invoice Links',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.listPaymentLinks',
        body: {
          ...(filterChain ? { chain: filterChain } : {}),
          ...(filterDirection !== 'all' ? { direction: filterDirection } : {}),
          ...(filterPaymentId.trim() ? { payment_id: filterPaymentId.trim() } : {}),
          limit: filterLimit,
        },
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: listSdkSnippet,
          raw_json: JSON.stringify({
            ...(filterChain ? { chain: filterChain } : {}),
            ...(filterDirection !== 'all' ? { direction: filterDirection } : {}),
            ...(filterPaymentId.trim() ? { payment_id: filterPaymentId.trim() } : {}),
            limit: filterLimit,
          }, null, 2),
        },
      },
      successExample: {
        entries: entries.slice(0, 2).map((entry) => ({
          payment_id: entry.payment_id,
          direction: entry.direction,
          chain: entry.chain,
          network: entry.network,
        })),
      },
      failureExamples: [
        {
          payload: { error: 'limit must be a positive integer.', code: 'INVALID_PARAMS' },
          note: 'Use a positive integer limit value.',
        },
      ],
      fieldNotes: [
        'Use `direction` and `chain` filters to narrow reconciliation views.',
      ],
      tryIt: {
        label: 'Try list links',
        run: async () => loadLinks(),
      },
    },
    {
      title: 'Fetch Payment Markdown',
      integrationMode: 'HTTP endpoint',
      request: {
        method: 'GET',
        url: latestCreated?.apiRequestUrl || sampleApiPayUrl,
        headers: { Accept: 'text/markdown' },
      },
      successExample: {
        contentType: 'text/markdown',
        snippet: markdownSnippet,
      },
      failureExamples: [
        {
          status: 400,
          payload: { error: 'Missing required param: receiver' },
          note: 'Provide full receiver/amount/chain params in the URL query.',
        },
        {
          status: 400,
          payload: { error: 'Unsupported chain: unknown-chain. Supported: fast, base, ...' },
          note: 'Use one of the supported chain names.',
        },
      ],
      fieldNotes: [
        'Response includes YAML frontmatter with `type: payment_request` and `payment_id`.',
      ],
      tryIt: {
        label: 'Try fetch markdown',
        run: async () => previewPayMarkdown(latestCreated?.apiRequestUrl || sampleApiPayUrl),
      },
    },
  ], [
    createRequestPayload,
    createSdkSnippet,
    entries,
    filterChain,
    filterDirection,
    filterLimit,
    filterPaymentId,
    latestCreated,
    listSdkSnippet,
    markdownSnippet,
    origin,
    sampleApiPayUrl,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            PAYMENTS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Invoice Links
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Create invoice links for services or products
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', background: '#1f1111', color: '#fca5a5', borderRadius: 8, padding: '0.8rem 0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '0.2rem' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Generate links, inspect lifecycle entries, and preview payment markdown.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: statusColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Create Invoice Link</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain</span>
                  <select
                    value={chain}
                    onChange={(event) => setChain(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    {CHAIN_OPTIONS.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
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
                    placeholder="10"
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
                  placeholder={selectedChain.sampleReceiver}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Memo</span>
                <input
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="intent:abc"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>
              <button
                onClick={() => void createLink()}
                disabled={state === 'creating'}
                style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', width: 'fit-content' }}
              >
                {state === 'creating' ? 'Creating...' : 'Create Invoice Link'}
              </button>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Latest Link Preview</h3>
              {latestCreated ? (
                <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>payment_id:</span> <code>{latestCreated.link.payment_id}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>share url:</span> <code style={{ overflowX: 'auto' }}>{latestCreated.shareUrl}</code></div>
                  {latestCreated.sdkShareUrl && (
                    <div><span style={{ color: 'var(--text-3)' }}>sdk share url:</span> <code style={{ overflowX: 'auto' }}>{latestCreated.sdkShareUrl}</code></div>
                  )}
                  <div><span style={{ color: 'var(--text-3)' }}>/api/pay:</span> <code style={{ overflowX: 'auto' }}>{latestCreated.apiRequestUrl}</code></div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <a
                      href={latestCreated.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--rule)', fontSize: '0.74rem' }}
                    >
                      Open share link
                    </a>
                    <button
                      onClick={() => void previewPayMarkdown(latestCreated.apiRequestUrl)}
                      disabled={previewBusy}
                      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.28rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem' }}
                    >
                      {previewBusy ? 'Loading markdown...' : 'Preview markdown'}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  No invoice link created yet in this dashboard session.
                </p>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Lifecycle Tracking</h3>
                <button
                  onClick={() => void loadLinks()}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Refresh
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>payment_id</span>
                  <input
                    value={filterPaymentId}
                    onChange={(event) => setFilterPaymentId(event.target.value)}
                    placeholder="pay_..."
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.55rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>chain</span>
                  <select
                    value={filterChain}
                    onChange={(event) => setFilterChain(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.55rem' }}
                  >
                    <option value="">all</option>
                    {CHAIN_OPTIONS.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.value}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>direction</span>
                  <select
                    value={filterDirection}
                    onChange={(event) => setFilterDirection(event.target.value as 'all' | LinkDirection)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.55rem' }}
                  >
                    <option value="all">all</option>
                    <option value="created">created</option>
                    <option value="paid">paid</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>limit</span>
                  <select
                    value={String(filterLimit)}
                    onChange={(event) => setFilterLimit(Number(event.target.value))}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.55rem' }}
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void loadLinks()}
                  style={{ border: 0, borderRadius: 6, padding: '0.35rem 0.6rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Apply Filters
                </button>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                  last refresh: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
                </span>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{note || 'No note.'}</div>

              {entries.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>No invoice link entries match current filters.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>time</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>payment_id</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>direction</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>chain</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>receiver</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>amount</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.3rem 0.35rem' }}>actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={`${entry.ts}-${entry.payment_id}-${entry.direction}`}>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem', color: 'var(--text-3)' }}>
                            {new Date(entry.ts).toLocaleString()}
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            <code>{entry.payment_id}</code>
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            {entry.direction}
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            {entry.chain}/{entry.network}
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            <code>{shortAddress(entry.receiver)}</code>
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            {entry.amount} {entry.token}
                          </td>
                          <td style={{ borderBottom: '1px solid var(--border)', padding: '0.32rem 0.35rem' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => void previewPayMarkdown(entry.apiRequestUrl)}
                                disabled={previewBusy}
                                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.2rem 0.45rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                              >
                                Preview markdown
                              </button>
                              <a
                                href={entry.shareUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--rule)', fontSize: '0.7rem', alignSelf: 'center' }}
                              >
                                Open link
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Markdown Preview</h3>
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--rule)', fontSize: '0.72rem' }}>
                    Open endpoint
                  </a>
                )}
              </div>
              {!previewMarkdown ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Fetch `/api/pay` markdown from the latest link or a table row to preview content here.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                    {previewPaymentId ? <>payment_id: <code>{previewPaymentId}</code></> : null}
                  </div>
                  <pre style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--code-bg)', padding: '0.6rem', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', fontSize: '0.72rem', lineHeight: 1.45 }}>
                    {previewMarkdown}
                  </pre>
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="SDK create/list methods plus HTTP markdown fetch for payment request execution."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
