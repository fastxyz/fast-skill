'use client';

import { useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type TokenUiState = 'idle' | 'discovering' | 'discovered' | 'registering' | 'registered' | 'error';

type ChainOption = {
  label: string;
  value: string;
  nativeToken: string;
  addressHint: string;
};

type OwnedToken = {
  symbol: string;
  address: string;
  balance: string;
  rawBalance: string;
  decimals: number;
};

type TokenDiscoveryResult = {
  chain: string;
  network: NetworkType;
  owned: OwnedToken[];
  note: string;
};

type TokenAlias = {
  chain: string;
  network: NetworkType;
  name: string;
  address?: string;
  mint?: string;
  decimals: number;
};

type DiscoverResponse = {
  tokens: TokenDiscoveryResult;
  request: {
    chain: string;
    network?: NetworkType;
  };
  discoveredAt: string;
  error?: string;
  code?: string;
};

type RegisterResponse = {
  saved: boolean;
  token: TokenAlias | null;
  request: {
    chain: string;
    name: string;
    network?: NetworkType;
    address?: string;
    mint?: string;
    decimals?: number;
  };
  registeredAt: string;
  error?: string;
  code?: string;
};

type GetResponse = {
  token: TokenAlias | null;
  found: boolean;
  request: {
    chain: string;
    name: string;
    network?: NetworkType;
  };
  resolvedAt: string;
  error?: string;
  code?: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  { label: 'Fast', value: 'fast', nativeToken: 'FAST', addressHint: 'set1...' },
  { label: 'Ethereum', value: 'ethereum', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Base', value: 'base', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Arbitrum', value: 'arbitrum', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Polygon', value: 'polygon', nativeToken: 'POL', addressHint: '0x...' },
  { label: 'Optimism', value: 'optimism', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'BSC', value: 'bsc', nativeToken: 'BNB', addressHint: '0x...' },
  { label: 'Avalanche', value: 'avalanche', nativeToken: 'AVAX', addressHint: '0x...' },
  { label: 'Fantom', value: 'fantom', nativeToken: 'FTM', addressHint: '0x...' },
  { label: 'zkSync', value: 'zksync', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Linea', value: 'linea', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Scroll', value: 'scroll', nativeToken: 'ETH', addressHint: '0x...' },
  { label: 'Solana', value: 'solana', nativeToken: 'SOL', addressHint: 'base58 mint' },
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

function stateColor(state: TokenUiState): string {
  if (state === 'discovering' || state === 'registering') return '#93c5fd';
  if (state === 'discovered' || state === 'registered') return '#86efac';
  if (state === 'error') return '#fca5a5';
  return 'var(--text-3)';
}

function shortAddress(value: string): string {
  if (!value) return '';
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
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

export default function TokenDiscoveryAliasManagerPage() {
  const [state, setState] = useState<TokenUiState>('idle');
  const [error, setError] = useState('');

  const [chain, setChain] = useState('base');
  const [network, setNetwork] = useState<NetworkType>('mainnet');

  const [discovery, setDiscovery] = useState<TokenDiscoveryResult | null>(null);
  const [discoveredAt, setDiscoveredAt] = useState('');

  const [aliasName, setAliasName] = useState('USDC');
  const [aliasAddress, setAliasAddress] = useState('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  const [aliasMint, setAliasMint] = useState('');
  const [aliasDecimals, setAliasDecimals] = useState('6');
  const [registerResult, setRegisterResult] = useState<RegisterResponse | null>(null);

  const [lookupName, setLookupName] = useState('USDC');
  const [lookupResult, setLookupResult] = useState<GetResponse | null>(null);

  const selectedChain = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === chain) ?? CHAIN_OPTIONS[0],
    [chain],
  );

  function fillAliasFromOwned(token: OwnedToken) {
    const normalizedSymbol = token.symbol.trim().toUpperCase();
    setAliasName(normalizedSymbol);
    setLookupName(normalizedSymbol);
    setAliasDecimals(String(token.decimals));
    if (chain === 'solana') {
      setAliasMint(token.address);
      setAliasAddress('');
    } else {
      setAliasAddress(token.address);
      setAliasMint('');
    }
  }

  async function runDiscover(): Promise<DiscoverResponse> {
    setState('discovering');
    setError('');
    try {
      const response = await fetchJson<DiscoverResponse>('/api/tokens/discover', {
        method: 'POST',
        body: JSON.stringify({ chain, network }),
      });
      setDiscovery(response.tokens);
      setDiscoveredAt(response.discoveredAt || new Date().toISOString());
      if (response.tokens.owned.length > 0) {
        fillAliasFromOwned(response.tokens.owned[0]);
      }
      setState('discovered');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function runRegisterAlias(): Promise<RegisterResponse> {
    const normalizedName = aliasName.trim().toUpperCase();
    if (!normalizedName) {
      throw new Error('Alias name is required.');
    }

    const normalizedAddress = aliasAddress.trim();
    const normalizedMint = aliasMint.trim();
    if (!normalizedAddress && !normalizedMint) {
      throw new Error('Provide address or mint.');
    }

    let decimals: number | undefined;
    if (aliasDecimals.trim()) {
      const parsed = Number(aliasDecimals.trim());
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
        throw new Error('Decimals must be an integer between 0 and 36.');
      }
      decimals = parsed;
    }

    setState('registering');
    setError('');
    try {
      const response = await fetchJson<RegisterResponse>('/api/tokens/register', {
        method: 'POST',
        body: JSON.stringify({
          chain,
          name: normalizedName,
          network,
          ...(normalizedAddress ? { address: normalizedAddress } : {}),
          ...(normalizedMint ? { mint: normalizedMint } : {}),
          ...(decimals !== undefined ? { decimals } : {}),
        }),
      });
      setRegisterResult(response);
      setLookupName(normalizedName);
      setLookupResult(response.token
        ? {
            token: response.token,
            found: true,
            request: { chain, name: normalizedName, network },
            resolvedAt: response.registeredAt,
          }
        : null);
      setState('registered');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  async function runLookupAlias(): Promise<GetResponse> {
    const normalizedName = lookupName.trim().toUpperCase();
    if (!normalizedName) {
      throw new Error('Alias lookup name is required.');
    }

    setState('discovering');
    setError('');
    try {
      const response = await fetchJson<GetResponse>('/api/tokens/get', {
        method: 'POST',
        body: JSON.stringify({
          chain,
          name: normalizedName,
          network,
        }),
      });
      setLookupResult(response);
      setState(registerResult ? 'registered' : 'discovered');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  const discoverRequest = useMemo(
    () => ({
      chain,
      network,
    }),
    [chain, network],
  );

  const registerRequest = useMemo(() => {
    const normalizedName = aliasName.trim().toUpperCase() || 'USDC';
    const normalizedDecimals = aliasDecimals.trim();
    return {
      chain,
      name: normalizedName,
      network,
      ...(aliasAddress.trim() ? { address: aliasAddress.trim() } : {}),
      ...(aliasMint.trim() ? { mint: aliasMint.trim() } : {}),
      ...(normalizedDecimals ? { decimals: Number(normalizedDecimals) } : {}),
    };
  }, [aliasAddress, aliasDecimals, aliasMint, aliasName, chain, network]);

  const lookupRequest = useMemo(
    () => ({
      chain,
      name: lookupName.trim().toUpperCase() || registerRequest.name,
      network,
    }),
    [chain, lookupName, network, registerRequest.name],
  );

  const discoverSnippet = useMemo(() => [
    'await money.tokens({',
    `  chain: "${escapeString(discoverRequest.chain)}",`,
    `  network: "${discoverRequest.network}"`,
    '});',
  ].join('\n'), [discoverRequest]);

  const registerSnippet = useMemo(() => [
    'await money.registerToken({',
    `  chain: "${escapeString(registerRequest.chain)}",`,
    `  name: "${escapeString(registerRequest.name)}",`,
    registerRequest.address ? `  address: "${escapeString(registerRequest.address)}",` : '',
    registerRequest.mint ? `  mint: "${escapeString(registerRequest.mint)}",` : '',
    registerRequest.decimals !== undefined ? `  decimals: ${registerRequest.decimals},` : '',
    `  network: "${registerRequest.network}"`,
    '});',
  ].filter(Boolean).join('\n'), [registerRequest]);

  const lookupSnippet = useMemo(() => [
    'await money.getToken({',
    `  chain: "${escapeString(lookupRequest.chain)}",`,
    `  name: "${escapeString(lookupRequest.name)}",`,
    `  network: "${lookupRequest.network}"`,
    '});',
  ].join('\n'), [lookupRequest]);

  const actionCards = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'Discover Tokens',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.tokens',
        body: discoverRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: discoverSnippet,
          raw_json: JSON.stringify(discoverRequest, null, 2),
        },
      },
      successExample: discovery ?? {
        chain: discoverRequest.chain,
        network: discoverRequest.network,
        owned: [
          { symbol: 'USDC', address: '0x...', balance: '245.41', rawBalance: '245410000', decimals: 6 },
        ],
        note: '',
      },
      failureExamples: [
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'Missing required param: chain',
          },
          note: 'Provide a chain name.',
        },
        {
          payload: {
            chain: discoverRequest.chain,
            network: discoverRequest.network,
            owned: [],
            note: `Chain "${discoverRequest.chain}" is not configured. Run setup first.`,
          },
          note: `Expected non-throw behavior. Setup first: await money.setup({ chain: "${discoverRequest.chain}" })`,
        },
      ],
      fieldNotes: [
        'Discovery auto-caches token symbols as aliases where possible.',
        'Use discovered decimals/address to avoid send/balance ambiguity.',
      ],
      tryIt: {
        label: 'Try discover',
        run: async () => runDiscover(),
      },
    },
    {
      title: 'Register Alias',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.registerToken',
        body: registerRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: registerSnippet,
          raw_json: JSON.stringify(registerRequest, null, 2),
        },
      },
      successExample: registerResult ?? {
        saved: true,
        token: {
          chain: registerRequest.chain,
          network: registerRequest.network,
          name: registerRequest.name,
          ...(registerRequest.address ? { address: registerRequest.address } : {}),
          ...(registerRequest.mint ? { mint: registerRequest.mint } : {}),
          decimals: registerRequest.decimals ?? 6,
        },
      },
      failureExamples: [
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'Either address or mint is required.',
          },
          note: 'Provide address for EVM/Fast or mint for Solana.',
        },
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Chain "${registerRequest.chain}" is not configured.`,
          },
          note: `Run setup first: await money.setup({ chain: "${registerRequest.chain}", network: "${registerRequest.network}" })`,
        },
      ],
      fieldNotes: [
        'Alias name is uppercased for deterministic lookup.',
        'Decimals are persisted and used for unit conversions.',
      ],
      tryIt: {
        label: 'Try register alias',
        run: async () => runRegisterAlias(),
      },
    },
    {
      title: 'Get Alias',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.getToken',
        body: lookupRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: lookupSnippet,
          raw_json: JSON.stringify(lookupRequest, null, 2),
        },
      },
      successExample: lookupResult ?? {
        token: {
          chain: lookupRequest.chain,
          network: lookupRequest.network,
          name: lookupRequest.name,
          address: '0x...',
          decimals: 6,
        },
        found: true,
      },
      failureExamples: [
        {
          payload: {
            token: null,
            found: false,
          },
          note: 'Alias not found. Register first, then retry lookup.',
        },
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Chain "${lookupRequest.chain}" is not configured.`,
          },
          note: `Run setup first: await money.setup({ chain: "${lookupRequest.chain}", network: "${lookupRequest.network}" })`,
        },
      ],
      fieldNotes: [
        'Lookup returns alias metadata with decimals and address/mint.',
      ],
      tryIt: {
        label: 'Try get alias',
        run: async () => runLookupAlias(),
      },
    },
  ], [
    discoverRequest,
    discoverSnippet,
    discovery,
    lookupRequest,
    lookupResult,
    lookupSnippet,
    registerRequest,
    registerResult,
    registerSnippet,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            TOOLS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Token Discovery + Alias Manager
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Discover wallet tokens, register deterministic aliases, and verify decimals/address resolution for balance and send workflows.
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
                  Discover tokens, register alias metadata, and verify alias lookup.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Discover Tokens</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.45rem' }}>
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
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => void runDiscover()}
                  disabled={state === 'discovering' || state === 'registering'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'discovering' ? 'Discovering...' : 'Run Discovery'}
                </button>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>
                  discovered at: {formatTime(discoveredAt)}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Native token on {selectedChain.label}: <code>{selectedChain.nativeToken}</code>
              </p>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Discovery Results</h3>
              {!discovery ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  No discovery results yet. Run discovery to list owned tokens.
                </p>
              ) : (
                <>
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                    {discovery.note || `${discovery.owned.length} token(s) discovered.`}
                  </p>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--code-bg)' }}>
                          <th style={{ textAlign: 'left', padding: '0.42rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Symbol</th>
                          <th style={{ textAlign: 'left', padding: '0.42rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Address/Mint</th>
                          <th style={{ textAlign: 'left', padding: '0.42rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Decimals</th>
                          <th style={{ textAlign: 'left', padding: '0.42rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Balance</th>
                          <th style={{ textAlign: 'left', padding: '0.42rem 0.45rem', borderBottom: '1px solid var(--border)' }}>Alias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discovery.owned.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '0.45rem', color: 'var(--text-3)' }}>
                              No owned tokens returned.
                            </td>
                          </tr>
                        ) : (
                          discovery.owned.map((token) => (
                            <tr key={`${token.symbol}-${token.address}`}>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}>
                                <code>{token.symbol}</code>
                              </td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                <code title={token.address}>{shortAddress(token.address)}</code>
                              </td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}>{token.decimals}</td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}>{token.balance}</td>
                              <td style={{ padding: '0.42rem 0.45rem', borderTop: '1px solid var(--border)' }}>
                                <button
                                  onClick={() => fillAliasFromOwned(token)}
                                  style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.22rem 0.48rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem' }}
                                >
                                  Use
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Register Alias</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Alias Name</span>
                  <input
                    value={aliasName}
                    onChange={(event) => setAliasName(event.target.value.toUpperCase())}
                    placeholder="USDC"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Address (EVM/Fast)</span>
                  <input
                    value={aliasAddress}
                    onChange={(event) => setAliasAddress(event.target.value)}
                    placeholder={selectedChain.addressHint}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Mint (Solana)</span>
                  <input
                    value={aliasMint}
                    onChange={(event) => setAliasMint(event.target.value)}
                    placeholder="So11111111111111111111111111111111111111112"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Decimals</span>
                  <input
                    value={aliasDecimals}
                    onChange={(event) => setAliasDecimals(event.target.value)}
                    placeholder="6"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => void runRegisterAlias()}
                  disabled={state === 'discovering' || state === 'registering'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'registering' ? 'Registering...' : 'Register Alias'}
                </button>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>
                  provide `address` or `mint`; decimals strongly recommended.
                </span>
              </div>

              {registerResult?.token ? (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', display: 'grid', gap: '0.2rem' }}>
                  <div>
                    saved <code>{registerResult.token.name}</code> on {registerResult.token.chain}/{registerResult.token.network}
                  </div>
                  <div>
                    {registerResult.token.address ? (
                      <>
                        address: <code>{registerResult.token.address}</code>
                      </>
                    ) : (
                      <>
                        mint: <code>{registerResult.token.mint}</code>
                      </>
                    )}
                  </div>
                  <div>decimals: <code>{registerResult.token.decimals}</code></div>
                  <div style={{ color: 'var(--text-3)' }}>registered at: {formatTime(registerResult.registeredAt)}</div>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                  Last save: {registerResult ? formatTime(registerResult.registeredAt) : '—'}
                </p>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Alias Lookup</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem' }}>
                <input
                  value={lookupName}
                  onChange={(event) => setLookupName(event.target.value.toUpperCase())}
                  placeholder="USDC"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
                <button
                  onClick={() => void runLookupAlias()}
                  disabled={state === 'discovering' || state === 'registering'}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  Resolve
                </button>
              </div>

              {!lookupResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Resolve an alias to verify persisted decimals and address/mint.
                </p>
              ) : lookupResult.token ? (
                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>status:</span> <strong style={{ color: '#86efac' }}>found</strong></div>
                  <div><span style={{ color: 'var(--text-3)' }}>name:</span> <code>{lookupResult.token.name}</code></div>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>{lookupResult.token.address ? 'address' : 'mint'}:</span>{' '}
                    <code>{lookupResult.token.address ?? lookupResult.token.mint}</code>
                  </div>
                  <div><span style={{ color: 'var(--text-3)' }}>decimals:</span> <code>{lookupResult.token.decimals}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>resolved:</span> {formatTime(lookupResult.resolvedAt)}</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>status:</span> <strong style={{ color: '#fca5a5' }}>not found</strong></div>
                  <div style={{ color: 'var(--text-3)' }}>
                    Alias {lookupResult.request.name} is not registered for {lookupResult.request.chain}/{lookupResult.request.network ?? 'testnet'}.
                  </div>
                </div>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Exact SDK calls for discovery, alias registration, and alias lookup."
            actions={actionCards}
          />
        </div>
      </div>
    </main>
  );
}
