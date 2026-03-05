'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type BridgeUiState = 'idle' | 'validating' | 'ready' | 'bridging' | 'success' | 'error';

type ChainOption = {
  label: string;
  value: string;
  defaultToken: string;
};

type BridgeProviderView = {
  name: string;
  chains: string[];
  networks?: string[];
};

type SelectedProviderView = BridgeProviderView & {
  chainPairCompatible: boolean;
  networkCompatible: boolean;
};

type ValidationResponse = {
  request: BridgeRequestPayload;
  network: NetworkType;
  receiverMode: 'explicit' | 'inferred';
  providers: BridgeProviderView[];
  selectedProvider: SelectedProviderView | null;
  validation: {
    ready: boolean;
    code?: string;
    message: string;
  };
  notes: string[];
  error?: string;
  code?: string;
};

type BridgeResult = {
  txHash: string;
  explorerUrl: string;
  fromChain: string;
  toChain: string;
  fromAmount: string;
  toAmount: string;
  orderId: string;
  estimatedTime?: string;
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

type BridgeExecuteResponse = {
  bridge: BridgeResult;
  historyEcho: HistoryEntry | null;
  request: BridgeRequestPayload;
  bridgedAt: string;
  error?: string;
  code?: string;
};

type BridgeRequestPayload = {
  from: {
    chain: string;
    token: string;
  };
  to: {
    chain: string;
    token?: string;
  };
  amount: string;
  network: NetworkType;
  receiver?: string;
  provider?: string;
};

type TimelineEntry = {
  ts: string;
  kind: string;
  detail: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  { label: 'Fast', value: 'fast', defaultToken: 'SET' },
  { label: 'Ethereum', value: 'ethereum', defaultToken: 'ETH' },
  { label: 'Base', value: 'base', defaultToken: 'ETH' },
  { label: 'Arbitrum', value: 'arbitrum', defaultToken: 'ETH' },
  { label: 'Solana', value: 'solana', defaultToken: 'SOL' },
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

function shortHash(value: string): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function stateColor(state: BridgeUiState): string {
  if (state === 'validating' || state === 'bridging') return '#93c5fd';
  if (state === 'error') return '#fca5a5';
  if (state === 'ready' || state === 'success') return '#86efac';
  return 'var(--text-3)';
}

function normalizedAmount(value: string): string {
  return value.trim();
}

export default function BridgeConsolePage() {
  const [origin, setOrigin] = useState('');
  const [state, setState] = useState<BridgeUiState>('idle');
  const [error, setError] = useState('');

  const [fromChain, setFromChain] = useState('fast');
  const [fromToken, setFromToken] = useState('SET');
  const [toChain, setToChain] = useState('arbitrum');
  const [toToken, setToToken] = useState('WSET');
  const [amount, setAmount] = useState('10');
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [receiver, setReceiver] = useState('');
  const [provider, setProvider] = useState('');

  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  const [historyEcho, setHistoryEcho] = useState<HistoryEntry | null>(null);
  const [bridgedAt, setBridgedAt] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  const fromChainOption = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === fromChain) ?? CHAIN_OPTIONS[0],
    [fromChain],
  );
  const toChainOption = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === toChain) ?? CHAIN_OPTIONS[0],
    [toChain],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function pushTimeline(kind: string, detail: string) {
    setTimeline((current) => [{ ts: new Date().toISOString(), kind, detail }, ...current].slice(0, 40));
  }

  useEffect(() => {
    if (!fromToken.trim()) setFromToken(fromChainOption.defaultToken);
  }, [fromChainOption, fromToken]);

  useEffect(() => {
    if (!toToken.trim()) {
      if (fromChain === 'fast' && (toChain === 'arbitrum' || toChain === 'ethereum' || toChain === 'base')) {
        setToToken('WSET');
      } else {
        setToToken(toChainOption.defaultToken);
      }
    }
  }, [fromChain, toChain, toChainOption.defaultToken, toToken]);

  const requestPayload = useMemo<BridgeRequestPayload>(() => ({
    from: {
      chain: fromChain,
      token: fromToken.trim() || fromChainOption.defaultToken,
    },
    to: {
      chain: toChain,
      ...(toToken.trim() ? { token: toToken.trim() } : {}),
    },
    amount: normalizedAmount(amount) || '10',
    network,
    ...(receiver.trim() ? { receiver: receiver.trim() } : {}),
    ...(provider.trim() ? { provider: provider.trim() } : {}),
  }), [amount, fromChain, fromChainOption.defaultToken, fromToken, network, provider, receiver, toChain, toToken]);

  const requestFingerprint = useMemo(() => JSON.stringify(requestPayload), [requestPayload]);
  const [validatedFingerprint, setValidatedFingerprint] = useState('');

  async function validateBridge(): Promise<ValidationResponse> {
    setState('validating');
    setError('');
    try {
      const response = await fetchJson<ValidationResponse>('/api/bridge/preview', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      });
      setValidation(response);
      setValidatedFingerprint(requestFingerprint);
      setState(response.validation.ready ? 'ready' : 'idle');
      pushTimeline(
        'validated',
        `${response.validation.ready ? 'ready' : 'blocked'}: ${response.validation.message}`,
      );
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      pushTimeline('validation_error', message);
      throw err;
    }
  }

  async function executeBridge(): Promise<BridgeExecuteResponse> {
    if (!validation?.validation.ready) {
      throw new Error('Bridge request is not ready. Resolve validation issues first.');
    }
    if (validatedFingerprint !== requestFingerprint) {
      throw new Error('Bridge request changed after validation. Re-validate before bridging.');
    }

    setState('bridging');
    setError('');
    try {
      const response = await fetchJson<BridgeExecuteResponse>('/api/bridge/execute', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      });
      setBridgeResult(response.bridge);
      setHistoryEcho(response.historyEcho);
      setBridgedAt(response.bridgedAt || new Date().toISOString());
      setState('success');
      pushTimeline('bridge_submitted', `tx ${shortHash(response.bridge.txHash)} via order ${response.bridge.orderId}`);
      if (response.historyEcho) {
        pushTimeline('history_echo', `${response.historyEcho.chain}/${response.historyEcho.network} ${response.historyEcho.amount} ${response.historyEcho.token}`);
      }
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      pushTimeline('bridge_error', message);
      throw err;
    }
  }

  const bridgeSdkSnippet = useMemo(() => {
    const lines = [
      'await money.bridge({',
      `  from: { chain: "${requestPayload.from.chain}", token: "${requestPayload.from.token}" },`,
      `  to: { chain: "${requestPayload.to.chain}"${requestPayload.to.token ? `, token: "${requestPayload.to.token}"` : ''} },`,
      `  amount: ${requestPayload.amount},`,
      `  network: "${requestPayload.network}",`,
      requestPayload.receiver ? `  receiver: "${requestPayload.receiver}",` : '',
      requestPayload.provider ? `  provider: "${requestPayload.provider}",` : '',
      '});',
    ];
    return lines.filter(Boolean).join('\n');
  }, [requestPayload]);

  const agentActions = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'Bridge',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.bridge',
        body: requestPayload,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: bridgeSdkSnippet,
          raw_json: JSON.stringify(requestPayload, null, 2),
        },
      },
      successExample: bridgeResult ?? {
        txHash: '0x...',
        explorerUrl: 'https://...',
        fromChain: requestPayload.from.chain,
        toChain: requestPayload.to.chain,
        fromAmount: requestPayload.amount,
        toAmount: requestPayload.amount,
        orderId: 'order_...',
        estimatedTime: '2-5 min',
      },
      failureExamples: [
        {
          payload: {
            code: 'UNSUPPORTED_OPERATION',
            message: `Bridge provider "${validation?.selectedProvider?.name ?? '...'}" does not support network "${requestPayload.network}".`,
          },
          note: 'Switch to a supported network/provider combination.',
        },
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Source chain "${requestPayload.from.chain}" is not configured for ${requestPayload.network}.`,
          },
          note: `Run setup first: await money.setup({ chain: "${requestPayload.from.chain}", network: "${requestPayload.network}" })`,
        },
      ],
      fieldNotes: [
        'If receiver is omitted, SDK infers destination wallet when destination chain is configured.',
        'Provider is auto-selected unless `provider` is explicitly set.',
      ],
      tryIt: validation?.validation.ready && validatedFingerprint === requestFingerprint
        ? {
            label: 'Try bridge',
            run: async () => executeBridge(),
          }
        : undefined,
    },
  ], [
    bridgeResult,
    bridgeSdkSnippet,
    requestPayload,
    validation,
    validatedFingerprint,
    requestFingerprint,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            CRYPTO
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Bridge Tokens
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Transfer tokens across mutliple chains
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
                  Source/destination setup, compatibility checks, and bridge submission.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Bridge Inputs</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.45rem' }}>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>From Chain</span>
                  <select
                    value={fromChain}
                    onChange={(event) => setFromChain(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    {CHAIN_OPTIONS.map((entry) => (
                      <option key={`from-${entry.value}`} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>From Token</span>
                  <input
                    value={fromToken}
                    onChange={(event) => setFromToken(event.target.value)}
                    placeholder={fromChainOption.defaultToken}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>To Chain</span>
                  <select
                    value={toChain}
                    onChange={(event) => setToChain(event.target.value)}
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  >
                    {CHAIN_OPTIONS.map((entry) => (
                      <option key={`to-${entry.value}`} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>To Token (optional)</span>
                  <input
                    value={toToken}
                    onChange={(event) => setToToken(event.target.value)}
                    placeholder={toChainOption.defaultToken}
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
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Provider (optional)</span>
                  <input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="auto"
                    style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Receiver (optional)</span>
                <input
                  value={receiver}
                  onChange={(event) => setReceiver(event.target.value)}
                  placeholder="Leave blank to infer destination wallet"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void validateBridge()}
                  disabled={state === 'validating' || state === 'bridging'}
                  style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'validating' ? 'Validating...' : 'Validate Combination'}
                </button>
                <button
                  onClick={() => void executeBridge()}
                  disabled={state === 'validating' || state === 'bridging' || !validation?.validation.ready || validatedFingerprint !== requestFingerprint}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.7rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {state === 'bridging' ? 'Bridging...' : 'Execute Bridge'}
                </button>
              </div>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Provider Compatibility</h3>
              {!validation ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Run validation to resolve provider/network compatibility and receiver mode behavior.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>validation:</span>{' '}
                    <strong style={{ color: validation.validation.ready ? '#86efac' : '#fca5a5' }}>
                      {validation.validation.ready ? 'ready' : 'blocked'}
                    </strong>{' '}
                    {validation.validation.code ? <code>{validation.validation.code}</code> : null} {validation.validation.message}
                  </div>
                  <div><span style={{ color: 'var(--text-3)' }}>receiver mode:</span> {validation.receiverMode}</div>
                  {validation.selectedProvider ? (
                    <div>
                      <span style={{ color: 'var(--text-3)' }}>selected provider:</span>{' '}
                      <code>{validation.selectedProvider.name}</code>{' '}
                      <span style={{ color: validation.selectedProvider.chainPairCompatible ? '#86efac' : '#fca5a5' }}>
                        chain pair {validation.selectedProvider.chainPairCompatible ? 'compatible' : 'incompatible'}
                      </span>{' '}
                      <span style={{ color: validation.selectedProvider.networkCompatible ? '#86efac' : '#fca5a5' }}>
                        network {validation.selectedProvider.networkCompatible ? 'compatible' : 'incompatible'}
                      </span>
                    </div>
                  ) : (
                    <div><span style={{ color: 'var(--text-3)' }}>selected provider:</span> none</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {validation.providers.map((entry) => (
                      <span
                        key={entry.name}
                        style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '0.18rem 0.5rem', fontSize: '0.7rem' }}
                      >
                        {entry.name} ({entry.networks?.join(', ') ?? 'mainnet'})
                      </span>
                    ))}
                  </div>
                  {validation.notes.map((note) => (
                    <div key={note} style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>
                      - {note}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Result + Timeline</h3>
              {!bridgeResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Execute bridge after validation to show tx hash, explorer URL, and history echo.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>tx hash:</span> <code>{shortHash(bridgeResult.txHash)}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>order id:</span> <code>{bridgeResult.orderId}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>path:</span> {bridgeResult.fromChain} → {bridgeResult.toChain}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>amount:</span> {bridgeResult.fromAmount} → {bridgeResult.toAmount}</div>
                  {bridgeResult.estimatedTime ? (
                    <div><span style={{ color: 'var(--text-3)' }}>estimated:</span> {bridgeResult.estimatedTime}</div>
                  ) : null}
                  <div><span style={{ color: 'var(--text-3)' }}>submitted:</span> {bridgedAt ? new Date(bridgedAt).toLocaleTimeString() : '—'}</div>
                  <a href={bridgeResult.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--rule)', fontSize: '0.74rem' }}>
                    Open explorer
                  </a>
                  {historyEcho ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                      history echo: {historyEcho.chain}/{historyEcho.network} {historyEcho.amount} {historyEcho.token}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                      history echo not found.
                    </div>
                  )}
                </div>
              )}
              {timeline.length > 0 ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.45rem', display: 'grid', gap: '0.25rem' }}>
                  {timeline.map((entry) => (
                    <div key={`${entry.ts}-${entry.kind}-${entry.detail}`} style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                      <span style={{ fontFamily: 'var(--font-mono), monospace' }}>{new Date(entry.ts).toLocaleTimeString()}</span>{' '}
                      <strong style={{ color: 'var(--text)' }}>{entry.kind}</strong> {entry.detail}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Bridge SDK call with provider/network compatibility notes and failure guidance."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
