'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';
import { CHAINS, isValidAddress } from '../lib/pay-chains';

type NetworkType = 'testnet' | 'mainnet';
type SendUiState = 'idle' | 'sending' | 'sent' | 'error';

type SendExecutionResponse = {
  request: {
    to: string;
    amount: string;
    chain: string;
    network: NetworkType;
    token: string | null;
    payment_id: string | null;
  };
  setup: {
    chain: string;
    network: NetworkType;
    address: string;
  };
  result: {
    txHash: string;
    explorerUrl: string;
    fee: string;
    chain: string;
    network: NetworkType;
    note: string;
  };
  sentAt: string;
};

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

function statusColor(state: SendUiState): string {
  if (state === 'sending') return '#93c5fd';
  if (state === 'sent') return '#86efac';
  if (state === 'error') return '#fca5a5';
  return 'var(--text-3)';
}

export default function SendPage() {
  const defaultChain = CHAINS[0];

  const [origin, setOrigin] = useState('');
  const [chain, setChain] = useState(defaultChain.value);
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [token, setToken] = useState(defaultChain.token);
  const [paymentId, setPaymentId] = useState('');
  const [state, setState] = useState<SendUiState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendExecutionResponse | null>(null);

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

  const sendBody = useMemo(
    () => ({
      to: to.trim() || selectedChain.sampleReceiver,
      amount: amount.trim() || '0.1',
      chain,
      network,
      token: token.trim() || selectedChain.token,
      ...(paymentId.trim() ? { payment_id: paymentId.trim() } : {}),
    }),
    [amount, chain, network, paymentId, selectedChain.sampleReceiver, selectedChain.token, to, token],
  );

  async function sendTokens(): Promise<SendExecutionResponse> {
    setError('');
    setResult(null);
    const resolvedTo = to.trim() || selectedChain.sampleReceiver;

    if (!to.trim()) {
      setTo(selectedChain.sampleReceiver);
    }

    if (!isValidAddress(resolvedTo, chain)) {
      setState('error');
      const message = 'Recipient address is invalid for the selected chain.';
      setError(message);
      throw new Error(message);
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setState('error');
      const message = 'Amount must be a positive number.';
      setError(message);
      throw new Error(message);
    }

    setState('sending');
    try {
      const response = await fetchJson<SendExecutionResponse>('/api/pay/send', {
        method: 'POST',
        body: JSON.stringify({
          ...sendBody,
          to: resolvedTo,
        }),
      });
      setResult(response);
      setState('sent');
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }

  const agentActions = useMemo<ApiActionCardProps[]>(() => {
    const sendUrl = `${origin || ''}/api/pay/send`;
    const sendHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    return [
      {
        title: 'Execute Send',
        integrationMode: 'HTTP endpoint',
        request: {
          method: 'POST',
          url: sendUrl,
          headers: sendHeaders,
          body: sendBody,
        },
        successExample: result ?? {
          request: sendBody,
          setup: { chain, network, address: '0x...' },
          result: {
            txHash: '0x...',
            explorerUrl: 'https://...',
            fee: '0',
            chain,
            network,
            note: '',
          },
          sentAt: new Date().toISOString(),
        },
        failureExamples: [
          {
            status: 400,
            payload: { error: 'Recipient address is invalid for the selected chain.' },
            note: 'Validate recipient format for the selected chain.',
          },
          {
            status: 500,
            payload: { error: 'Chain is not configured.', code: 'CHAIN_NOT_CONFIGURED' },
            note: 'Configure/setup the chain wallet before sending.',
          },
        ],
        environment: 'Node runtime with local SDK keyfiles',
        fieldNotes: [
          'This endpoint executes a real `money.send(...)` from the server wallet.',
          'Defaults to `network: "testnet"` unless `mainnet` is provided.',
        ],
        tryIt: {
          label: 'Send now',
          run: async () => sendTokens(),
        },
      },
    ];
  }, [chain, network, origin, result, sendBody]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Payments
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Send
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Send tokens to another wallet
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0.9rem', alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '0.2rem' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Human Flow</h2>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Configure transaction fields and execute send.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: statusColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
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
                  placeholder="0.1"
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
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Recipient Address</span>
              <input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder={selectedChain.placeholder}
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
              />
            </label>

            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>payment_id (optional)</span>
              <input
                value={paymentId}
                onChange={(event) => setPaymentId(event.target.value)}
                placeholder="pay_..."
                style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => void sendTokens()}
                disabled={state === 'sending'}
                style={{ border: 0, borderRadius: 6, padding: '0.45rem 0.7rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
              >
                {state === 'sending' ? 'Sending...' : 'Send Now'}
              </button>
            </div>

            {error && (
              <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.74rem' }}>{error}</p>
            )}

            {result && (
              <div style={{ display: 'grid', gap: '0.28rem', fontSize: '0.74rem', color: 'var(--text-2)' }}>
                <div><span style={{ color: 'var(--text-3)' }}>from:</span> <code>{result.setup.address}</code></div>
                <div><span style={{ color: 'var(--text-3)' }}>txHash:</span> <code>{result.result.txHash}</code></div>
                <div><span style={{ color: 'var(--text-3)' }}>network:</span> <code>{result.result.chain}/{result.result.network}</code></div>
                <a
                  href={result.result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--rule)', fontSize: '0.74rem' }}
                >
                  Open explorer
                </a>
              </div>
            )}
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Use endpoint calls to execute send from a configured wallet."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
