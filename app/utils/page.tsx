'use client';

import { useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type UtilsUiState = 'idle' | 'resolving' | 'converted' | 'error';

type ChainOption = {
  label: string;
  value: string;
};

type IdentifyResult = {
  chains: string[];
  note: string;
};

type IdentifyResponse = {
  identify: IdentifyResult;
  request: {
    address: string;
  };
  resolvedAt: string;
  error?: string;
  code?: string;
};

type ToRawRequest = {
  amount: string;
  chain?: string;
  network?: NetworkType;
  token?: string;
  decimals?: number;
};

type ToRawResponse = {
  raw: string;
  rawBigintLiteral: string;
  request: ToRawRequest;
  convertedAt: string;
  error?: string;
  code?: string;
};

type ToHumanRequest = {
  amount: string;
  chain?: string;
  network?: NetworkType;
  token?: string;
  decimals?: number;
};

type ToHumanResponse = {
  human: string;
  request: ToHumanRequest;
  convertedAt: string;
  error?: string;
  code?: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  { label: 'Fast', value: 'fast' },
  { label: 'Ethereum', value: 'ethereum' },
  { label: 'Base', value: 'base' },
  { label: 'Arbitrum', value: 'arbitrum' },
  { label: 'Polygon', value: 'polygon' },
  { label: 'Optimism', value: 'optimism' },
  { label: 'BSC', value: 'bsc' },
  { label: 'Avalanche', value: 'avalanche' },
  { label: 'Fantom', value: 'fantom' },
  { label: 'zkSync', value: 'zksync' },
  { label: 'Linea', value: 'linea' },
  { label: 'Scroll', value: 'scroll' },
  { label: 'Solana', value: 'solana' },
];

const EVM_CHAINS = new Set([
  'ethereum',
  'base',
  'arbitrum',
  'polygon',
  'optimism',
  'bsc',
  'avalanche',
  'fantom',
  'zksync',
  'linea',
  'scroll',
]);

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

function stateColor(state: UtilsUiState): string {
  if (state === 'resolving') return '#93c5fd';
  if (state === 'converted') return '#86efac';
  if (state === 'error') return '#fca5a5';
  return 'var(--text-3)';
}

function chainFamily(chain: string): 'evm' | 'fast' | 'solana' | 'other' {
  if (chain === 'fast') return 'fast';
  if (chain === 'solana') return 'solana';
  if (EVM_CHAINS.has(chain)) return 'evm';
  return 'other';
}

function familyColor(family: 'evm' | 'fast' | 'solana' | 'other'): string {
  if (family === 'evm') return '#93c5fd';
  if (family === 'fast') return '#86efac';
  if (family === 'solana') return '#fbbf24';
  return 'var(--text-3)';
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString();
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parsePreviewDecimals(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 255) return undefined;
  return parsed;
}

function assertValidDecimals(value: string, field: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`${field} must be an integer between 0 and 255.`);
  }
  return parsed;
}

export default function AddressUnitsUtilityPage() {
  const [state, setState] = useState<UtilsUiState>('idle');
  const [error, setError] = useState('');

  const [addressInput, setAddressInput] = useState('0x1111111111111111111111111111111111111111');
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [identifyAt, setIdentifyAt] = useState('');

  const [rawAmount, setRawAmount] = useState('25');
  const [rawChain, setRawChain] = useState('base');
  const [rawNetwork, setRawNetwork] = useState<NetworkType>('mainnet');
  const [rawToken, setRawToken] = useState('USDC');
  const [rawDecimals, setRawDecimals] = useState('');
  const [rawResult, setRawResult] = useState<ToRawResponse | null>(null);

  const [humanAmount, setHumanAmount] = useState('25000000');
  const [humanChain, setHumanChain] = useState('base');
  const [humanNetwork, setHumanNetwork] = useState<NetworkType>('mainnet');
  const [humanToken, setHumanToken] = useState('USDC');
  const [humanDecimals, setHumanDecimals] = useState('');
  const [humanResult, setHumanResult] = useState<ToHumanResponse | null>(null);

  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');

  async function copyValue(label: string, value: string) {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => {
        setCopied((current) => (current === label ? '' : current));
      }, 1300);
    } catch {
      setCopyError('Clipboard is unavailable in this browser context.');
    }
  }

  const identifyRequest = useMemo(() => ({
    address: addressInput.trim() || '0x1111111111111111111111111111111111111111',
  }), [addressInput]);

  const rawRequestPreview = useMemo<ToRawRequest>(() => {
    const chain = rawChain.trim();
    const token = rawToken.trim().toUpperCase();
    const decimals = parsePreviewDecimals(rawDecimals);
    return {
      amount: rawAmount.trim() || '25',
      ...(chain ? { chain, network: rawNetwork } : {}),
      ...(token ? { token } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
    };
  }, [rawAmount, rawChain, rawDecimals, rawNetwork, rawToken]);

  const humanRequestPreview = useMemo<ToHumanRequest>(() => {
    const chain = humanChain.trim();
    const token = humanToken.trim().toUpperCase();
    const decimals = parsePreviewDecimals(humanDecimals);
    return {
      amount: humanAmount.trim() || '25000000',
      ...(chain ? { chain, network: humanNetwork } : {}),
      ...(token ? { token } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
    };
  }, [humanAmount, humanChain, humanDecimals, humanNetwork, humanToken]);

  async function runIdentify(): Promise<IdentifyResponse> {
    if (!identifyRequest.address) {
      throw new Error('Address is required.');
    }

    setState('resolving');
    setError('');
    try {
      const response = await fetchJson<IdentifyResponse>('/api/utils/identify', {
        method: 'POST',
        body: JSON.stringify(identifyRequest),
      });
      setIdentifyResult(response.identify);
      setIdentifyAt(response.resolvedAt || new Date().toISOString());
      setState('converted');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function runToRaw(): Promise<ToRawResponse> {
    const decimals = assertValidDecimals(rawDecimals, 'Raw decimals');
    const chain = rawChain.trim();
    const token = rawToken.trim().toUpperCase();
    const amount = rawAmount.trim();
    if (!amount) {
      throw new Error('Raw conversion amount is required.');
    }

    const requestBody: ToRawRequest = {
      amount,
      ...(chain ? { chain, network: rawNetwork } : {}),
      ...(token ? { token } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
    };

    setState('resolving');
    setError('');
    try {
      const response = await fetchJson<ToRawResponse>('/api/utils/to-raw', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      setRawResult(response);
      setState('converted');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function runToHuman(): Promise<ToHumanResponse> {
    const decimals = assertValidDecimals(humanDecimals, 'Human decimals');
    const chain = humanChain.trim();
    const token = humanToken.trim().toUpperCase();
    const amount = humanAmount.trim();
    if (!amount) {
      throw new Error('Human conversion raw amount is required.');
    }

    const requestBody: ToHumanRequest = {
      amount,
      ...(chain ? { chain, network: humanNetwork } : {}),
      ...(token ? { token } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
    };

    setState('resolving');
    setError('');
    try {
      const response = await fetchJson<ToHumanResponse>('/api/utils/to-human', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      setHumanResult(response);
      setState('converted');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  const identifySnippet = useMemo(() => [
    'await money.identifyChains({',
    `  address: "${escapeString(identifyRequest.address)}"`,
    '});',
  ].join('\n'), [identifyRequest.address]);

  const toRawSnippet = useMemo(() => {
    const lines = [
      'await money.toRawUnits({',
      `  amount: "${escapeString(rawRequestPreview.amount)}",`,
      rawRequestPreview.chain ? `  chain: "${escapeString(rawRequestPreview.chain)}",` : '',
      rawRequestPreview.network ? `  network: "${rawRequestPreview.network}",` : '',
      rawRequestPreview.token ? `  token: "${escapeString(rawRequestPreview.token)}",` : '',
      rawRequestPreview.decimals !== undefined ? `  decimals: ${rawRequestPreview.decimals},` : '',
      '});',
    ];
    return lines.filter(Boolean).join('\n');
  }, [rawRequestPreview]);

  const toHumanSnippet = useMemo(() => {
    const lines = [
      'await money.toHumanUnits({',
      `  amount: "${escapeString(humanRequestPreview.amount)}",`,
      humanRequestPreview.chain ? `  chain: "${escapeString(humanRequestPreview.chain)}",` : '',
      humanRequestPreview.network ? `  network: "${humanRequestPreview.network}",` : '',
      humanRequestPreview.token ? `  token: "${escapeString(humanRequestPreview.token)}",` : '',
      humanRequestPreview.decimals !== undefined ? `  decimals: ${humanRequestPreview.decimals},` : '',
      '});',
    ];
    return lines.filter(Boolean).join('\n');
  }, [humanRequestPreview]);

  const actionCards: ApiActionCardProps[] = [
    {
      title: 'Identify Chains',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.identifyChains',
        body: identifyRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: identifySnippet,
          raw_json: JSON.stringify(identifyRequest, null, 2),
        },
      },
      successExample: identifyResult ?? {
        chains: ['base', 'ethereum', 'arbitrum'],
        note: 'Multiple chains use this address format. Specify chain explicitly.',
      },
      failureExamples: [
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'address is required.',
          },
          note: 'Provide a non-empty address string.',
        },
      ],
      fieldNotes: [
        'EVM address format maps to multiple chains by design.',
      ],
      tryIt: {
        label: 'Try identify',
        run: async () => runIdentify(),
      },
    },
    {
      title: 'To Raw Units',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.toRawUnits',
        body: rawRequestPreview,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: toRawSnippet,
          raw_json: JSON.stringify(rawRequestPreview, null, 2),
        },
      },
      successExample: rawResult ?? {
        raw: '25000000',
        rawBigintLiteral: '25000000n',
      },
      failureExamples: [
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'Provide either "decimals" or "chain" (to look up token decimals)',
          },
          note: 'Pass `decimals`, or pass configured `chain` + token.',
        },
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Chain "${rawRequestPreview.chain ?? 'base'}" is not configured.`,
          },
          note: `Run setup first: await money.setup({ chain: "${rawRequestPreview.chain ?? 'base'}", network: "${rawRequestPreview.network ?? 'testnet'}" })`,
        },
      ],
      fieldNotes: [
        'Result is bigint-safe. UI exposes both decimal string and bigint literal form.',
      ],
      tryIt: {
        label: 'Try toRawUnits',
        run: async () => runToRaw(),
      },
    },
    {
      title: 'To Human Units',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.toHumanUnits',
        body: humanRequestPreview,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: toHumanSnippet,
          raw_json: JSON.stringify(humanRequestPreview, null, 2),
        },
      },
      successExample: humanResult ?? {
        human: '25',
      },
      failureExamples: [
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'Provide either "decimals" or "chain" (to look up token decimals)',
          },
          note: 'Pass `decimals`, or pass configured `chain` + token.',
        },
        {
          payload: {
            code: 'TOKEN_NOT_FOUND',
            message: `Cannot resolve decimals for token "${humanRequestPreview.token ?? 'USDC'}" on chain "${humanRequestPreview.chain ?? 'base'}".`,
          },
          note: 'Register token alias with decimals first, or pass decimals explicitly.',
        },
      ],
      fieldNotes: [
        'Inverse of `toRawUnits` when decimals context matches.',
      ],
      tryIt: {
        label: 'Try toHumanUnits',
        run: async () => runToHuman(),
      },
    },
  ];

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            TOOLS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Address + Units Utility
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Deterministic preflight checks for address family detection and safe human/raw unit conversions.
          </p>
        </header>

        {error && (
          <div style={{ border: '1px solid #7f1d1d', background: '#1f1111', color: '#fca5a5', borderRadius: 8, padding: '0.8rem 0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(390px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '0.2rem' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Address detection, to-raw conversion, and to-human conversion.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Address Inspector</h3>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Address</span>
                <input
                  value={addressInput}
                  onChange={(event) => setAddressInput(event.target.value)}
                  placeholder="0x... / set1... / base58"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => void runIdentify()}
                  disabled={state === 'resolving'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'resolving' ? 'Resolving...' : 'Identify Chains'}
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  resolved: {formatTime(identifyAt)}
                </span>
              </div>

              {!identifyResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  No result yet. Identify chain families for an address format.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {identifyResult.chains.length === 0 ? (
                      <span style={{ color: 'var(--text-3)', fontSize: '0.73rem' }}>No chain match.</span>
                    ) : (
                      identifyResult.chains.map((chainName) => {
                        const family = chainFamily(chainName);
                        return (
                          <span
                            key={chainName}
                            style={{
                              border: '1px solid var(--border)',
                              borderRadius: 999,
                              padding: '0.18rem 0.52rem',
                              fontSize: '0.7rem',
                              color: familyColor(family),
                            }}
                          >
                            {chainName} ({family})
                          </span>
                        );
                      })
                    )}
                  </div>
                  {identifyResult.note && (
                    <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                      {identifyResult.note}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>To Raw Units</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount (human)</span>
                  <input
                    value={rawAmount}
                    onChange={(event) => setRawAmount(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain (optional)</span>
                  <input
                    list="chain-options"
                    value={rawChain}
                    onChange={(event) => setRawChain(event.target.value)}
                    placeholder="base"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Network</span>
                  <select
                    value={rawNetwork}
                    onChange={(event) => setRawNetwork(event.target.value as NetworkType)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    <option value="mainnet">mainnet</option>
                    <option value="testnet">testnet</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token (optional)</span>
                  <input
                    value={rawToken}
                    onChange={(event) => setRawToken(event.target.value.toUpperCase())}
                    placeholder="USDC"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Decimals (optional)</span>
                  <input
                    value={rawDecimals}
                    onChange={(event) => setRawDecimals(event.target.value)}
                    placeholder="6"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>
              <button
                onClick={() => void runToRaw()}
                disabled={state === 'resolving'}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', width: 'fit-content' }}
              >
                Convert To Raw
              </button>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Pass `decimals`, or pass configured `chain` + `token` for deterministic lookup.
              </p>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>To Human Units</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Amount (raw)</span>
                  <input
                    value={humanAmount}
                    onChange={(event) => setHumanAmount(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Chain (optional)</span>
                  <input
                    list="chain-options"
                    value={humanChain}
                    onChange={(event) => setHumanChain(event.target.value)}
                    placeholder="base"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Network</span>
                  <select
                    value={humanNetwork}
                    onChange={(event) => setHumanNetwork(event.target.value as NetworkType)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    <option value="mainnet">mainnet</option>
                    <option value="testnet">testnet</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Token (optional)</span>
                  <input
                    value={humanToken}
                    onChange={(event) => setHumanToken(event.target.value.toUpperCase())}
                    placeholder="USDC"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Decimals (optional)</span>
                  <input
                    value={humanDecimals}
                    onChange={(event) => setHumanDecimals(event.target.value)}
                    placeholder="6"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>
              <button
                onClick={() => void runToHuman()}
                disabled={state === 'resolving'}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', width: 'fit-content' }}
              >
                Convert To Human
              </button>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                `toHumanUnits` should invert `toRawUnits` when inputs use the same decimals context.
              </p>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Conversion Results</h3>
              {rawResult ? (
                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>toRaw:</span> <code>{rawResult.raw}</code> (<code>{rawResult.rawBigintLiteral}</code>)</div>
                  <div><span style={{ color: 'var(--text-3)' }}>converted:</span> {formatTime(rawResult.convertedAt)}</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void copyValue('raw', rawResult.raw)}
                      style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.28rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      {copied === 'raw' ? 'Copied Raw' : 'Copy Raw'}
                    </button>
                    <button
                      onClick={() => void copyValue('raw_bigint', rawResult.rawBigintLiteral)}
                      style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.28rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      {copied === 'raw_bigint' ? 'Copied BigInt' : 'Copy BigInt'}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.73rem' }}>
                  No to-raw conversion yet.
                </p>
              )}

              {humanResult ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.45rem', display: 'grid', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>toHuman:</span> <code>{humanResult.human}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>converted:</span> {formatTime(humanResult.convertedAt)}</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void copyValue('human', humanResult.human)}
                      style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.28rem 0.5rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      {copied === 'human' ? 'Copied Human' : 'Copy Human'}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.73rem' }}>
                  No to-human conversion yet.
                </p>
              )}

              {copyError && (
                <div style={{ color: '#fca5a5', fontSize: '0.72rem' }}>
                  {copyError}
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="SDK identify + conversion calls with copy-ready snippets and failure guidance."
            actions={actionCards}
          />
        </div>
      </div>

      <datalist id="chain-options">
        {CHAIN_OPTIONS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </datalist>
    </main>
  );
}
