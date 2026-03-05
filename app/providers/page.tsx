'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type ProviderUiState = 'idle' | 'loading' | 'saving_key' | 'saved' | 'error';
type NetworkType = 'testnet' | 'mainnet';
type OperationType = 'quote' | 'price';

type SwapProviderView = {
  name: string;
  chains: string[];
};

type BridgeProviderView = {
  name: string;
  chains: string[];
  networks?: string[];
};

type PriceProviderView = {
  name: string;
  chains: string[];
};

type ProvidersRegistry = {
  swap: SwapProviderView[];
  bridge: BridgeProviderView[];
  price: PriceProviderView[];
  note: string;
};

type ProviderListResponse = {
  providers: ProvidersRegistry;
  loadedAt: string;
  error?: string;
  code?: string;
};

type SaveApiKeyResponse = {
  provider: string;
  saved: boolean;
  maskedApiKey: string;
  savedAt: string;
  error?: string;
  code?: string;
};

type QuoteOperationRequest = {
  operation: 'quote';
  chain: string;
  from: string;
  to: string;
  amount: string;
  network: NetworkType;
  slippageBps?: number;
  provider?: string;
};

type PriceOperationRequest = {
  operation: 'price';
  token: string;
  chain?: string;
  provider?: string;
};

type SelectedProvider = {
  name: string;
  chains?: string[];
  networks?: string[];
} | null;

type ExecutionError = {
  message: string;
  code?: string;
  note?: string;
};

type ExecutionResult = {
  ok: boolean;
  at: string;
  error?: ExecutionError;
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

type PriceResult = {
  price: string;
  symbol: string;
  name: string;
  priceChange24h?: string;
  volume24h?: string;
  liquidity?: string;
  marketCap?: string;
  chain?: string;
  note: string;
};

type QuoteOperationResponse = {
  operation: 'quote';
  request: QuoteOperationRequest;
  selectedProvider: SelectedProvider;
  result: QuoteResult | null;
  execution: ExecutionResult;
  note: string;
  error?: string;
  code?: string;
};

type PriceOperationResponse = {
  operation: 'price';
  request: PriceOperationRequest;
  selectedProvider: SelectedProvider;
  result: PriceResult | null;
  execution: ExecutionResult;
  note: string;
  error?: string;
  code?: string;
};

type ProviderTestResponse = QuoteOperationResponse | PriceOperationResponse;

type ChainPreset = {
  chain: string;
  label: string;
  from: string;
  to: string;
  provider: string;
};

const CHAIN_PRESETS: ChainPreset[] = [
  { chain: 'solana', label: 'Solana', from: 'SOL', to: 'USDC', provider: 'jupiter' },
  { chain: 'ethereum', label: 'Ethereum', from: 'ETH', to: 'USDC', provider: 'paraswap' },
  { chain: 'base', label: 'Base', from: 'ETH', to: 'USDC', provider: 'paraswap' },
  { chain: 'arbitrum', label: 'Arbitrum', from: 'ETH', to: 'USDC', provider: 'paraswap' },
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

function stateColor(state: ProviderUiState): string {
  if (state === 'loading' || state === 'saving_key') return '#93c5fd';
  if (state === 'saved') return '#86efac';
  if (state === 'error') return '#fca5a5';
  return 'var(--text-3)';
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString();
}

function listSummary(values: string[] | undefined): string {
  if (!values || values.length === 0) return 'all';
  return values.join(', ');
}

function maskPreview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '—';
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${trimmed.slice(0, 2)}${'*'.repeat(trimmed.length - 4)}${trimmed.slice(-2)}`;
}

function escapeSnippetString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeOperationProvider(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function ProviderControlPlanePage() {
  const [state, setState] = useState<ProviderUiState>('idle');
  const [error, setError] = useState('');

  const [registry, setRegistry] = useState<ProvidersRegistry | null>(null);
  const [loadedAt, setLoadedAt] = useState('');

  const [apiKeyProvider, setApiKeyProvider] = useState('jupiter');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [lastSavedKey, setLastSavedKey] = useState<SaveApiKeyResponse | null>(null);

  const [operation, setOperation] = useState<OperationType>('quote');
  const [quoteChain, setQuoteChain] = useState(CHAIN_PRESETS[0].chain);
  const [quoteFrom, setQuoteFrom] = useState(CHAIN_PRESETS[0].from);
  const [quoteTo, setQuoteTo] = useState(CHAIN_PRESETS[0].to);
  const [quoteAmount, setQuoteAmount] = useState('1');
  const [quoteNetwork, setQuoteNetwork] = useState<NetworkType>('mainnet');
  const [quoteSlippageBps, setQuoteSlippageBps] = useState('50');
  const [quoteProvider, setQuoteProvider] = useState(CHAIN_PRESETS[0].provider);

  const [priceToken, setPriceToken] = useState('ETH');
  const [priceChain, setPriceChain] = useState('ethereum');
  const [priceProvider, setPriceProvider] = useState('');

  const [testResult, setTestResult] = useState<ProviderTestResponse | null>(null);

  const selectedQuotePreset = useMemo(
    () => CHAIN_PRESETS.find((entry) => entry.chain === quoteChain) ?? CHAIN_PRESETS[0],
    [quoteChain],
  );

  useEffect(() => {
    setQuoteFrom(selectedQuotePreset.from);
    setQuoteTo(selectedQuotePreset.to);
    setQuoteProvider(selectedQuotePreset.provider);
  }, [selectedQuotePreset]);

  const providerNameOptions = useMemo(() => {
    const values = new Set<string>();
    registry?.swap.forEach((entry) => values.add(entry.name));
    registry?.bridge.forEach((entry) => values.add(entry.name));
    registry?.price.forEach((entry) => values.add(entry.name));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [registry]);

  async function loadProviders(): Promise<ProviderListResponse> {
    setState('loading');
    setError('');
    try {
      const response = await fetchJson<ProviderListResponse>('/api/providers');
      setRegistry(response.providers);
      setLoadedAt(response.loadedAt || new Date().toISOString());
      setState('idle');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function saveApiKey(): Promise<SaveApiKeyResponse> {
    if (!apiKeyProvider.trim()) {
      throw new Error('Provider is required.');
    }
    if (!apiKey.trim()) {
      throw new Error('API key is required.');
    }

    setState('saving_key');
    setError('');
    try {
      const response = await fetchJson<SaveApiKeyResponse>('/api/providers/api-key', {
        method: 'POST',
        body: JSON.stringify({
          provider: apiKeyProvider.trim(),
          apiKey: apiKey.trim(),
        }),
      });
      setLastSavedKey(response);
      setApiKey('');
      setShowApiKey(false);
      setState('saved');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  const quotePayload = useMemo<QuoteOperationRequest>(() => {
    const parsedSlippage = Number(quoteSlippageBps);
    return {
      operation: 'quote',
      chain: quoteChain,
      from: quoteFrom.trim() || selectedQuotePreset.from,
      to: quoteTo.trim() || selectedQuotePreset.to,
      amount: quoteAmount.trim() || '1',
      network: quoteNetwork,
      ...(Number.isFinite(parsedSlippage) && parsedSlippage > 0 && Number.isInteger(parsedSlippage)
        ? { slippageBps: parsedSlippage }
        : {}),
      ...(normalizeOperationProvider(quoteProvider) ? { provider: normalizeOperationProvider(quoteProvider) } : {}),
    };
  }, [
    quoteAmount,
    quoteChain,
    quoteFrom,
    quoteNetwork,
    quoteProvider,
    quoteSlippageBps,
    quoteTo,
    selectedQuotePreset.from,
    selectedQuotePreset.to,
  ]);

  const pricePayload = useMemo<PriceOperationRequest>(() => ({
    operation: 'price',
    token: priceToken.trim() || 'ETH',
    ...(priceChain.trim() ? { chain: priceChain.trim() } : {}),
    ...(normalizeOperationProvider(priceProvider) ? { provider: normalizeOperationProvider(priceProvider) } : {}),
  }), [priceChain, priceProvider, priceToken]);

  async function runTestOperation(): Promise<ProviderTestResponse> {
    setState('loading');
    setError('');
    try {
      const payload = operation === 'quote' ? quotePayload : pricePayload;
      const response = await fetchJson<ProviderTestResponse>('/api/providers/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTestResult(response);
      setState('idle');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    if (providerNameOptions.length === 0) return;
    if (apiKeyProvider.trim()) return;
    setApiKeyProvider(providerNameOptions[0]);
  }, [apiKeyProvider, providerNameOptions]);

  const providersSnippet = 'await money.providers();';
  const setApiKeySnippet = useMemo(() => [
    'await money.setApiKey({',
    `  provider: "${escapeSnippetString(apiKeyProvider.trim() || 'jupiter')}",`,
    `  apiKey: "${escapeSnippetString(apiKey.trim() || 'your-key')}"`,
    '});',
  ].join('\n'), [apiKey, apiKeyProvider]);

  const quoteSnippet = useMemo(() => [
    'await money.quote({',
    `  chain: "${escapeSnippetString(quotePayload.chain)}",`,
    `  from: "${escapeSnippetString(quotePayload.from)}",`,
    `  to: "${escapeSnippetString(quotePayload.to)}",`,
    `  amount: ${quotePayload.amount},`,
    `  network: "${quotePayload.network}",`,
    quotePayload.slippageBps !== undefined ? `  slippageBps: ${quotePayload.slippageBps},` : '',
    quotePayload.provider ? `  provider: "${escapeSnippetString(quotePayload.provider)}"` : '',
    '});',
  ].filter(Boolean).join('\n'), [quotePayload]);

  const priceSnippet = useMemo(() => [
    'await money.price({',
    `  token: "${escapeSnippetString(pricePayload.token)}",`,
    pricePayload.chain ? `  chain: "${escapeSnippetString(pricePayload.chain)}",` : '',
    pricePayload.provider ? `  provider: "${escapeSnippetString(pricePayload.provider)}"` : '',
    '});',
  ].filter(Boolean).join('\n'), [pricePayload]);

  const testRequestBody = operation === 'quote'
    ? {
        chain: quotePayload.chain,
        from: quotePayload.from,
        to: quotePayload.to,
        amount: quotePayload.amount,
        network: quotePayload.network,
        ...(quotePayload.slippageBps !== undefined ? { slippageBps: quotePayload.slippageBps } : {}),
        ...(quotePayload.provider ? { provider: quotePayload.provider } : {}),
      }
    : {
        token: pricePayload.token,
        ...(pricePayload.chain ? { chain: pricePayload.chain } : {}),
        ...(pricePayload.provider ? { provider: pricePayload.provider } : {}),
      };

  const testSuccessExample = useMemo(() => {
    if (testResult) return testResult;
    if (operation === 'quote') {
      return {
        operation: 'quote',
        request: quotePayload,
        selectedProvider: { name: quotePayload.provider ?? selectedQuotePreset.provider, chains: [quotePayload.chain] },
        result: {
          fromToken: quotePayload.from,
          toToken: quotePayload.to,
          fromAmount: quotePayload.amount,
          toAmount: '2450.12',
          rate: `1 ${quotePayload.from.toUpperCase()} = 2450.12 ${quotePayload.to.toUpperCase()}`,
          priceImpact: '0.31',
          provider: quotePayload.provider ?? selectedQuotePreset.provider,
          chain: quotePayload.chain,
          network: quotePayload.network,
          note: '',
        },
        execution: { ok: true, at: new Date().toISOString() },
      };
    }
    return {
      operation: 'price',
      request: pricePayload,
      selectedProvider: { name: pricePayload.provider ?? 'dexscreener', chains: [pricePayload.chain ?? 'ethereum'] },
      result: {
        symbol: pricePayload.token.toUpperCase(),
        name: pricePayload.token.toUpperCase(),
        price: '3120.42',
        chain: pricePayload.chain ?? 'ethereum',
        note: '',
      },
      execution: { ok: true, at: new Date().toISOString() },
    };
  }, [operation, pricePayload, quotePayload, selectedQuotePreset.provider, testResult]);

  const agentActions = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'List Providers',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.providers',
        body: {},
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: providersSnippet,
          raw_json: JSON.stringify({}, null, 2),
        },
      },
      successExample: registry ?? {
        swap: [{ name: 'jupiter', chains: ['solana'] }],
        bridge: [{ name: 'debridge', chains: ['ethereum', 'base', 'solana'], networks: ['mainnet'] }],
        price: [{ name: 'dexscreener', chains: ['ethereum', 'base', 'solana'] }],
      },
      failureExamples: [
        {
          payload: { code: 'INTERNAL_ERROR', message: 'Failed to read provider registry.' },
          note: 'Check server logs and provider registration order in sdk/src/index.ts.',
        },
      ],
      fieldNotes: [
        'Registry is grouped by provider type (swap, bridge, price).',
        'Auto-routing uses chain and network compatibility from this registry.',
      ],
      tryIt: {
        label: 'Try list providers',
        run: async () => loadProviders(),
      },
    },
    {
      title: 'Set API Key',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.setApiKey',
        body: {
          provider: apiKeyProvider.trim() || 'jupiter',
          apiKey: apiKey.trim() || 'your-key',
        },
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: setApiKeySnippet,
          raw_json: JSON.stringify({
            provider: apiKeyProvider.trim() || 'jupiter',
            apiKey: apiKey.trim() || 'your-key',
          }, null, 2),
        },
      },
      successExample: lastSavedKey ?? {
        provider: apiKeyProvider.trim() || 'jupiter',
        saved: true,
        maskedApiKey: 'yo****ey',
        savedAt: new Date().toISOString(),
      },
      failureExamples: [
        {
          payload: { code: 'INVALID_PARAMS', message: 'Missing required param: apiKey' },
          note: 'Pass a non-empty apiKey string.',
        },
        {
          payload: { code: 'INVALID_PARAMS', message: 'Missing required param: provider' },
          note: 'Use a registered provider name like "jupiter".',
        },
      ],
      fieldNotes: [
        'API key is stored in ~/.money/config.json under apiKeys[provider].',
      ],
      tryIt: {
        label: 'Try save API key',
        run: async () => saveApiKey(),
      },
    },
    {
      title: operation === 'quote' ? 'Test Quote Provider Selection' : 'Test Price Provider Selection',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: operation === 'quote' ? 'money.quote' : 'money.price',
        body: testRequestBody,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: operation === 'quote' ? quoteSnippet : priceSnippet,
          raw_json: JSON.stringify(testRequestBody, null, 2),
        },
      },
      successExample: testSuccessExample,
      failureExamples: operation === 'quote'
        ? [
            {
              payload: {
                code: 'CHAIN_NOT_CONFIGURED',
                message: `Chain "${quotePayload.chain}" is not configured for ${quotePayload.network}.`,
              },
              note: `Run setup first: await money.setup({ chain: "${quotePayload.chain}", network: "${quotePayload.network}" })`,
            },
            {
              payload: {
                code: 'UNSUPPORTED_OPERATION',
                message: 'Swap/quote requires mainnet. Testnet DEXes have no liquidity.',
              },
              note: 'Use network: "mainnet" for quote tests.',
            },
          ]
        : [
            {
              payload: {
                code: 'TOKEN_NOT_FOUND',
                message: `No price data found for token "${pricePayload.token}" on chain "${pricePayload.chain ?? 'ethereum'}".`,
              },
              note: 'Try symbol + chain pair with active market data.',
            },
            {
              payload: {
                code: 'UNSUPPORTED_OPERATION',
                message: `No price provider found for chain "${pricePayload.chain ?? 'unknown'}".`,
              },
              note: 'Use a chain supported by a registered price provider.',
            },
          ],
      fieldNotes: [
        'Selected provider is returned even if execution fails.',
        operation === 'quote'
          ? 'Quote tests are provider + wallet setup sensitive.'
          : 'Price tests are read-only and require discoverable market pairs.',
      ],
      tryIt: {
        label: 'Try provider test',
        run: async () => runTestOperation(),
      },
    },
  ], [
    apiKey,
    apiKeyProvider,
    lastSavedKey,
    loadProviders,
    operation,
    pricePayload,
    priceSnippet,
    providersSnippet,
    quotePayload,
    quoteSnippet,
    runTestOperation,
    saveApiKey,
    setApiKeySnippet,
    testRequestBody,
    testSuccessExample,
    registry,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            TOOLS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Provider Control Plane
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Inspect registry routing, set provider API keys, and test quote or price operations while seeing exactly which provider is selected.
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', background: '#1f1111', color: '#fca5a5', borderRadius: 8, padding: '0.8rem 0.9rem' }}>
            {error}
          </div>
        )}

        <datalist id="provider-options">
          {providerNameOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(390px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '0.2rem' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Registry visibility, API-key persistence, and operation-level provider testing.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Provider Registry</h3>
                <button
                  onClick={() => void loadProviders()}
                  disabled={state === 'loading' || state === 'saving_key'}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.35rem 0.6rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {state === 'loading' ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Loaded: {formatTime(loadedAt)} {registry?.note ? `• ${registry.note}` : ''}
              </p>

              {!registry ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Load providers to view swap, bridge, and price registry groups.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--code-bg)' }}>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Swap Provider</th>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Chains</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registry.swap.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ padding: '0.42rem 0.45rem', color: 'var(--text-3)' }}>No swap providers registered.</td>
                          </tr>
                        ) : (
                          registry.swap.map((entry) => (
                            <tr key={`swap-${entry.name}`}>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}><code>{entry.name}</code></td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                {listSummary(entry.chains)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--code-bg)' }}>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Bridge Provider</th>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Chains</th>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Networks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registry.bridge.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '0.42rem 0.45rem', color: 'var(--text-3)' }}>No bridge providers registered.</td>
                          </tr>
                        ) : (
                          registry.bridge.map((entry) => (
                            <tr key={`bridge-${entry.name}`}>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}><code>{entry.name}</code></td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                {listSummary(entry.chains)}
                              </td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                {listSummary(entry.networks)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--code-bg)' }}>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Price Provider</th>
                          <th style={{ textAlign: 'left', padding: '0.4rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Chains</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registry.price.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ padding: '0.42rem 0.45rem', color: 'var(--text-3)' }}>No price providers registered.</td>
                          </tr>
                        ) : (
                          registry.price.map((entry) => (
                            <tr key={`price-${entry.name}`}>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}><code>{entry.name}</code></td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                {listSummary(entry.chains)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Set API Key</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider</span>
                  <input
                    list="provider-options"
                    value={apiKeyProvider}
                    onChange={(event) => setApiKeyProvider(event.target.value)}
                    placeholder="jupiter"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>API Key</span>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="paste provider API key"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => setShowApiKey((current) => !current)}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.38rem 0.62rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {showApiKey ? 'Hide Key' : 'Show Key'}
                </button>
                <button
                  onClick={() => void saveApiKey()}
                  disabled={state === 'saving_key' || state === 'loading'}
                  style={{ border: 0, borderRadius: 6, padding: '0.38rem 0.62rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'saving_key' ? 'Saving...' : 'Save API Key'}
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  masked preview: <code>{maskPreview(apiKey)}</code>
                </span>
              </div>

              {lastSavedKey ? (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>
                  saved <code>{lastSavedKey.provider}</code> key as <code>{lastSavedKey.maskedApiKey}</code> at {formatTime(lastSavedKey.savedAt)}
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                  Save writes to local SDK config: <code>~/.money/config.json</code>.
                </p>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Test Operation</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Operation</span>
                  <select
                    value={operation}
                    onChange={(event) => setOperation(event.target.value as OperationType)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    <option value="quote">quote</option>
                    <option value="price">price</option>
                  </select>
                </label>

                {operation === 'quote' ? (
                  <>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain</span>
                      <select
                        value={quoteChain}
                        onChange={(event) => setQuoteChain(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      >
                        {CHAIN_PRESETS.map((entry) => (
                          <option key={entry.chain} value={entry.chain}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>From</span>
                      <input
                        value={quoteFrom}
                        onChange={(event) => setQuoteFrom(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>To</span>
                      <input
                        value={quoteTo}
                        onChange={(event) => setQuoteTo(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount</span>
                      <input
                        value={quoteAmount}
                        onChange={(event) => setQuoteAmount(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Network</span>
                      <select
                        value={quoteNetwork}
                        onChange={(event) => setQuoteNetwork(event.target.value as NetworkType)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      >
                        <option value="mainnet">mainnet</option>
                        <option value="testnet">testnet</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Slippage (bps)</span>
                      <input
                        value={quoteSlippageBps}
                        onChange={(event) => setQuoteSlippageBps(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider (optional)</span>
                      <input
                        list="provider-options"
                        value={quoteProvider}
                        onChange={(event) => setQuoteProvider(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token</span>
                      <input
                        value={priceToken}
                        onChange={(event) => setPriceToken(event.target.value)}
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain (optional)</span>
                      <input
                        value={priceChain}
                        onChange={(event) => setPriceChain(event.target.value)}
                        placeholder="ethereum"
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider (optional)</span>
                      <input
                        list="provider-options"
                        value={priceProvider}
                        onChange={(event) => setPriceProvider(event.target.value)}
                        placeholder="auto"
                        style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                      />
                    </label>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void runTestOperation()}
                  disabled={state === 'loading' || state === 'saving_key'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'loading' ? 'Testing...' : 'Run Test'}
                </button>
              </div>

              {!testResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Run a test to inspect provider auto-selection and execution output.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>selected provider:</span>{' '}
                    {testResult.selectedProvider ? (
                      <>
                        <code>{testResult.selectedProvider.name}</code>{' '}
                        <span style={{ color: 'var(--text-3)' }}>
                          (chains: {listSummary(testResult.selectedProvider.chains)})
                        </span>
                      </>
                    ) : 'none'}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>execution:</span>{' '}
                    <strong style={{ color: testResult.execution.ok ? '#86efac' : '#fca5a5' }}>
                      {testResult.execution.ok ? 'ok' : 'failed'}
                    </strong>{' '}
                    at {formatTime(testResult.execution.at)}
                  </div>
                  {testResult.execution.error ? (
                    <div style={{ color: '#fca5a5' }}>
                      {testResult.execution.error.code ? <code>{testResult.execution.error.code}</code> : null}{' '}
                      {testResult.execution.error.message}
                    </div>
                  ) : null}
                  {testResult.execution.error?.note ? (
                    <div style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>
                      note: {testResult.execution.error.note}
                    </div>
                  ) : null}
                  {testResult.result ? (
                    testResult.operation === 'quote' ? (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-3)' }}>quote:</span>{' '}
                        {testResult.result.fromAmount} {testResult.result.fromToken} → {testResult.result.toAmount} {testResult.result.toToken}
                        {' '}via <code>{testResult.result.provider}</code>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-3)' }}>price:</span>{' '}
                        {testResult.result.symbol} ${testResult.result.price}
                      </div>
                    )
                  ) : null}
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: '0.73rem', color: 'var(--text-3)' }}>
                      Raw test response
                    </summary>
                    <pre style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="SDK provider controls with copy-ready snippets and testable examples."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
