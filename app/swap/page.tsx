'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type SwapUiState = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'success' | 'error';

type ChainOption = {
  label: string;
  value: string;
  fromToken: string;
  toToken: string;
  provider: string;
};

type QuoteResult = {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  priceImpact: string;
  provider: string;
  chain: string;
  network: NetworkType;
  note: string;
};

type SwapResult = {
  txHash: string;
  explorerUrl: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  provider: string;
  chain: string;
  network: NetworkType;
  note: string;
};

type HistoryEntry = {
  ts: string;
  chain: string;
  network: NetworkType;
  to: string;
  amount: string;
  token: string;
  txHash: string;
};

type QuoteApiResponse = {
  quote: QuoteResult;
  request: SwapRequestPayload;
  quotedAt: string;
  error?: string;
  code?: string;
};

type SwapApiResponse = {
  swap: SwapResult;
  historyEcho: HistoryEntry | null;
  request: SwapRequestPayload;
  swappedAt: string;
  error?: string;
  code?: string;
};

type SwapRequestPayload = {
  chain: string;
  from: string;
  to: string;
  amount: string;
  network: NetworkType;
  slippageBps: number;
  provider?: string;
};

type QuoteDiff = {
  toAmountDelta: string;
  rateDelta: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  { label: 'Ethereum', value: 'ethereum', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Base', value: 'base', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Arbitrum', value: 'arbitrum', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Polygon', value: 'polygon', fromToken: 'MATIC', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Optimism', value: 'optimism', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'BSC', value: 'bsc', fromToken: 'BNB', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Avalanche', value: 'avalanche', fromToken: 'AVAX', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Fantom', value: 'fantom', fromToken: 'FTM', toToken: 'USDC', provider: 'paraswap' },
  { label: 'zkSync', value: 'zksync', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Linea', value: 'linea', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Scroll', value: 'scroll', fromToken: 'ETH', toToken: 'USDC', provider: 'paraswap' },
  { label: 'Solana', value: 'solana', fromToken: 'SOL', toToken: 'USDC', provider: 'jupiter' },
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

function parseDecimal(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRateValue(rate: string): number | null {
  const match = rate.match(/=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSigned(value: number, digits = 6): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}`;
}

function stateColor(state: SwapUiState): string {
  if (state === 'quoting' || state === 'swapping') return '#93c5fd';
  if (state === 'error') return '#fca5a5';
  if (state === 'quoted' || state === 'success') return '#86efac';
  return 'var(--text-3)';
}

function shortHash(value: string): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export default function SwapQuoteTerminalPage() {
  const defaultChain = CHAIN_OPTIONS[0];
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<SwapUiState>('idle');

  const [chain, setChain] = useState(defaultChain.value);
  const [fromToken, setFromToken] = useState(defaultChain.fromToken);
  const [toToken, setToToken] = useState(defaultChain.toToken);
  const [amount, setAmount] = useState('0.5');
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [slippageBps, setSlippageBps] = useState('50');
  const [provider, setProvider] = useState(defaultChain.provider);

  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [previousQuote, setPreviousQuote] = useState<QuoteResult | null>(null);
  const [lastQuotedAt, setLastQuotedAt] = useState('');
  const [quoteFingerprint, setQuoteFingerprint] = useState('');

  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [historyEcho, setHistoryEcho] = useState<HistoryEntry | null>(null);
  const [lastSwappedAt, setLastSwappedAt] = useState('');

  const selectedChain = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === chain) ?? CHAIN_OPTIONS[0],
    [chain],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setProvider(selectedChain.provider);
    setFromToken(selectedChain.fromToken);
    setToToken(selectedChain.toToken);
    setQuoteResult(null);
    setPreviousQuote(null);
    setSwapResult(null);
    setHistoryEcho(null);
    setQuoteFingerprint('');
  }, [selectedChain]);

  const requestPayload = useMemo<SwapRequestPayload>(() => {
    const parsedSlippage = Number(slippageBps);
    return {
      chain,
      from: fromToken.trim(),
      to: toToken.trim(),
      amount: amount.trim(),
      network,
      slippageBps: Number.isFinite(parsedSlippage) && parsedSlippage > 0 ? Math.floor(parsedSlippage) : 50,
      ...(provider.trim() ? { provider: provider.trim() } : {}),
    };
  }, [amount, chain, fromToken, network, provider, slippageBps, toToken]);

  const payloadFingerprint = useMemo(() => JSON.stringify(requestPayload), [requestPayload]);

  const quoteDiff = useMemo<QuoteDiff | null>(() => {
    if (!quoteResult || !previousQuote) return null;
    const currentOut = parseDecimal(quoteResult.toAmount);
    const previousOut = parseDecimal(previousQuote.toAmount);
    const currentRate = parseRateValue(quoteResult.rate);
    const previousRate = parseRateValue(previousQuote.rate);
    if (currentOut === null || previousOut === null || currentRate === null || previousRate === null) {
      return null;
    }
    return {
      toAmountDelta: formatSigned(currentOut - previousOut, 8),
      rateDelta: formatSigned(currentRate - previousRate, 8),
    };
  }, [previousQuote, quoteResult]);

  function validateInputs(forSwap: boolean): void {
    if (!requestPayload.chain.trim()) {
      throw new Error('chain is required.');
    }
    if (!requestPayload.from.trim()) {
      throw new Error('from token is required.');
    }
    if (!requestPayload.to.trim()) {
      throw new Error('to token is required.');
    }
    if (requestPayload.from.trim().toUpperCase() === requestPayload.to.trim().toUpperCase()) {
      throw new Error('from and to tokens must be different.');
    }
    const parsedAmount = parseDecimal(requestPayload.amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      throw new Error('amount must be a positive number.');
    }
    const parsedSlippage = Number(slippageBps);
    if (!Number.isFinite(parsedSlippage) || parsedSlippage <= 0 || !Number.isInteger(parsedSlippage)) {
      throw new Error('slippageBps must be a positive integer.');
    }
    if (parsedSlippage > 5000) {
      throw new Error('slippageBps must be <= 5000.');
    }
    if (forSwap && requestPayload.network !== 'mainnet') {
      throw new Error('Swap requires explicit network: "mainnet".');
    }
  }

  async function runQuote(): Promise<QuoteApiResponse> {
    validateInputs(false);
    const nextPrevious = quoteResult;
    setState('quoting');
    setError('');
    try {
      const response = await fetchJson<QuoteApiResponse>('/api/swap/quote', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      });
      setPreviousQuote(nextPrevious);
      setQuoteResult(response.quote);
      setQuoteFingerprint(payloadFingerprint);
      setLastQuotedAt(response.quotedAt || new Date().toISOString());
      setSwapResult(null);
      setHistoryEcho(null);
      setState('quoted');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function runSwap(): Promise<SwapApiResponse> {
    validateInputs(true);
    if (!quoteResult) {
      throw new Error('Run quote before executing swap.');
    }
    if (quoteFingerprint !== payloadFingerprint) {
      throw new Error('Quote is stale for current form values. Re-quote before swapping.');
    }

    setState('swapping');
    setError('');
    try {
      const response = await fetchJson<SwapApiResponse>('/api/swap/execute', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      });
      setSwapResult(response.swap);
      setHistoryEcho(response.historyEcho);
      setLastSwappedAt(response.swappedAt || new Date().toISOString());
      setState('success');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  const quoteSdkSnippet = useMemo(() => [
    'await money.quote({',
    `  chain: "${requestPayload.chain}",`,
    `  from: "${requestPayload.from}",`,
    `  to: "${requestPayload.to}",`,
    `  amount: ${requestPayload.amount},`,
    `  network: "${requestPayload.network}",`,
    `  slippageBps: ${requestPayload.slippageBps},`,
    requestPayload.provider ? `  provider: "${requestPayload.provider}"` : '',
    '});',
  ].filter(Boolean).join('\n'), [requestPayload]);

  const swapSdkSnippet = useMemo(() => [
    'await money.swap({',
    `  chain: "${requestPayload.chain}",`,
    `  from: "${requestPayload.from}",`,
    `  to: "${requestPayload.to}",`,
    `  amount: ${requestPayload.amount},`,
    `  network: "${requestPayload.network}",`,
    `  slippageBps: ${requestPayload.slippageBps},`,
    requestPayload.provider ? `  provider: "${requestPayload.provider}"` : '',
    '});',
  ].filter(Boolean).join('\n'), [requestPayload]);

  const agentActions = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'Quote',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.quote',
        body: requestPayload,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: quoteSdkSnippet,
          raw_json: JSON.stringify(requestPayload, null, 2),
        },
      },
      successExample: quoteResult ?? {
        fromToken: requestPayload.from,
        toToken: requestPayload.to,
        fromAmount: requestPayload.amount,
        toAmount: '1234.56',
        rate: `1 ${requestPayload.from.toUpperCase()} = 2469.12 ${requestPayload.to.toUpperCase()}`,
        priceImpact: '0.42',
        provider: requestPayload.provider ?? selectedChain.provider,
        chain: requestPayload.chain,
        network: requestPayload.network,
      },
      failureExamples: [
        {
          payload: {
            code: 'UNSUPPORTED_OPERATION',
            message: 'Swap/quote requires mainnet. Testnet DEXes have no liquidity.',
          },
          note: 'Set `network: "mainnet"` explicitly.',
        },
        {
          payload: {
            code: 'UNSUPPORTED_OPERATION',
            message: 'No swap provider available for chain "fast".',
          },
          note: 'Use a supported swap chain/provider pair.',
        },
      ],
      fieldNotes: [
        'Quote is read-only and does not execute a transaction.',
        'Keep quote parameters unchanged before swap execution.',
      ],
      tryIt: {
        label: 'Try quote',
        run: async () => runQuote(),
      },
    },
    {
      title: 'Swap',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.swap',
        body: requestPayload,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: swapSdkSnippet,
          raw_json: JSON.stringify(requestPayload, null, 2),
        },
      },
      successExample: swapResult ?? {
        txHash: '0x...',
        explorerUrl: 'https://...',
        fromToken: requestPayload.from,
        toToken: requestPayload.to,
        fromAmount: requestPayload.amount,
        toAmount: quoteResult?.toAmount ?? '1234.56',
        provider: quoteResult?.provider ?? requestPayload.provider ?? selectedChain.provider,
        chain: requestPayload.chain,
        network: requestPayload.network,
      },
      failureExamples: [
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Chain "${requestPayload.chain}" is not configured for mainnet.`,
          },
          note: `Run setup first: await money.setup({ chain: "${requestPayload.chain}", network: "mainnet" })`,
        },
        {
          payload: {
            code: 'UNSUPPORTED_OPERATION',
            message: 'Swap requires mainnet. Testnet DEXes have no liquidity.',
          },
          note: 'Switch to mainnet and re-run quote before swap.',
        },
      ],
      fieldNotes: [
        'Swap executes on-chain and returns tx hash + explorer URL.',
        'UI requires a fresh quote with matching params before execution.',
      ],
      tryIt: quoteResult && quoteFingerprint === payloadFingerprint && network === 'mainnet'
        ? {
            label: 'Try swap',
            run: async () => runSwap(),
          }
        : undefined,
    },
  ], [
    network,
    payloadFingerprint,
    quoteFingerprint,
    quoteResult,
    quoteSdkSnippet,
    requestPayload,
    runQuote,
    runSwap,
    selectedChain.provider,
    swapResult,
    swapSdkSnippet,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            CRYPTO
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Swap Tokens
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Quote first, inspect pricing risk fields, then execute swap with explicit mainnet parameters.
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
                  Quote preview, swap execution, and on-chain evidence.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Swap Inputs</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.45rem' }}>
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
                    <option value="mainnet">mainnet</option>
                    <option value="testnet">testnet</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>From</span>
                  <input
                    value={fromToken}
                    onChange={(event) => setFromToken(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>To</span>
                  <input
                    value={toToken}
                    onChange={(event) => setToToken(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount</span>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Slippage (bps)</span>
                  <input
                    value={slippageBps}
                    onChange={(event) => setSlippageBps(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider (optional)</span>
                  <input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder={selectedChain.provider}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void runQuote()}
                  disabled={state === 'quoting' || state === 'swapping'}
                  style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'quoting' ? 'Quoting...' : 'Run Quote'}
                </button>
                <button
                  onClick={() => void runSwap()}
                  disabled={state === 'quoting' || state === 'swapping' || !quoteResult || quoteFingerprint !== payloadFingerprint || network !== 'mainnet'}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.7rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {state === 'swapping' ? 'Swapping...' : 'Execute Swap'}
                </button>
              </div>

              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Swap button unlocks only after a fresh quote and requires `network: "mainnet"`.
              </p>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Quote Preview</h3>
              {!quoteResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  No quote yet. Run quote to inspect output amount, provider, and price impact.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>pair:</span> {quoteResult.fromToken} → {quoteResult.toToken}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>amounts:</span> {quoteResult.fromAmount} → {quoteResult.toAmount}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>rate:</span> {quoteResult.rate}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>price impact:</span> {quoteResult.priceImpact}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>provider:</span> {quoteResult.provider}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>quoted at:</span> {lastQuotedAt ? new Date(lastQuotedAt).toLocaleTimeString() : '—'}</div>
                  {quoteDiff && (
                    <div style={{ color: 'var(--text-3)' }}>
                      delta vs previous quote: toAmount {quoteDiff.toAmountDelta}, rate {quoteDiff.rateDelta}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Swap Result</h3>
              {!swapResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Execute swap after quote to see tx evidence and local history echo.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>tx hash:</span> <code>{shortHash(swapResult.txHash)}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>amounts:</span> {swapResult.fromAmount} {swapResult.fromToken} → {swapResult.toAmount} {swapResult.toToken}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>provider:</span> {swapResult.provider}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>swapped at:</span> {lastSwappedAt ? new Date(lastSwappedAt).toLocaleTimeString() : '—'}</div>
                  <a
                    href={swapResult.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--rule)', fontSize: '0.74rem' }}
                  >
                    Open explorer
                  </a>
                  {historyEcho ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: '0.45rem' }}>
                      local history echo: {historyEcho.chain}/{historyEcho.network} {historyEcho.amount} {historyEcho.token} ({historyEcho.to})
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: '0.45rem' }}>
                      local history echo not found yet.
                    </div>
                  )}
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="SDK quote/swap calls with copy-ready snippets, examples, and failure guidance."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
