'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type NetworkType = 'testnet' | 'mainnet';
type SignUiState = 'idle' | 'signing' | 'signed' | 'verifying' | 'verified' | 'error';

type ChainOption = {
  label: string;
  value: string;
  signatureFormat: string;
  addressHint: string;
  note: string;
};

type SignResult = {
  signature: string;
  address: string;
  chain: string;
  network: NetworkType;
  note: string;
};

type VerifyResult = {
  valid: boolean;
  address: string;
  chain: string;
  network: NetworkType;
  note: string;
};

type SignApiResponse = {
  sign: SignResult;
  request: {
    chain: string;
    message: string;
    network?: NetworkType;
  };
  signedAt: string;
  error?: string;
  code?: string;
};

type VerifyApiResponse = {
  verify: VerifyResult;
  request: {
    chain: string;
    message: string;
    signature: string;
    address: string;
    network?: NetworkType;
  };
  verifiedAt: string;
  error?: string;
  code?: string;
};

const CHAIN_OPTIONS: ChainOption[] = [
  {
    label: 'Fast',
    value: 'fast',
    signatureFormat: 'hex string',
    addressHint: 'set1...',
    note: 'Fast signatures are returned as raw hex strings; verify against a Fast bech32m address.',
  },
  {
    label: 'Ethereum',
    value: 'ethereum',
    signatureFormat: '0x-prefixed hex',
    addressHint: '0x...',
    note: 'EVM signatures use 65-byte secp256k1 signatures encoded as 0x-prefixed hex.',
  },
  {
    label: 'Base',
    value: 'base',
    signatureFormat: '0x-prefixed hex',
    addressHint: '0x...',
    note: 'Base uses standard EVM signature format; address must be a 0x-prefixed EVM address.',
  },
  {
    label: 'Arbitrum',
    value: 'arbitrum',
    signatureFormat: '0x-prefixed hex',
    addressHint: '0x...',
    note: 'Arbitrum uses standard EVM signature format and EVM address verification.',
  },
  {
    label: 'Solana',
    value: 'solana',
    signatureFormat: 'base58',
    addressHint: 'base58 wallet address',
    note: 'Solana signatures are base58-encoded ed25519 signatures.',
  },
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

function buildChallengeMessage(): string {
  const nonce = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    : Math.random().toString(16).slice(2, 14);
  return `Sign in: nonce-${nonce} @ ${new Date().toISOString()}`;
}

function shortSignature(value: string): string {
  if (!value) return '';
  if (value.length <= 28) return value;
  return `${value.slice(0, 16)}...${value.slice(-10)}`;
}

function stateColor(state: SignUiState): string {
  if (state === 'signing' || state === 'verifying') return '#93c5fd';
  if (state === 'error') return '#fca5a5';
  if (state === 'signed' || state === 'verified') return '#86efac';
  return 'var(--text-3)';
}

export default function SignatureLabPage() {
  const [origin, setOrigin] = useState('');
  const [state, setState] = useState<SignUiState>('idle');
  const [error, setError] = useState('');

  const [chain, setChain] = useState('fast');
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [message, setMessage] = useState('Sign in: nonce-123');

  const [signResult, setSignResult] = useState<SignResult | null>(null);
  const [signedAt, setSignedAt] = useState('');

  const [verifyMessage, setVerifyMessage] = useState('Sign in: nonce-123');
  const [verifySignature, setVerifySignature] = useState('');
  const [verifyAddress, setVerifyAddress] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifiedAt, setVerifiedAt] = useState('');

  const selectedChain = useMemo(
    () => CHAIN_OPTIONS.find((entry) => entry.value === chain) ?? CHAIN_OPTIONS[0],
    [chain],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function runSign(): Promise<SignApiResponse> {
    if (!message.trim()) {
      throw new Error('Message is required.');
    }
    setState('signing');
    setError('');
    try {
      const response = await fetchJson<SignApiResponse>('/api/sign/sign', {
        method: 'POST',
        body: JSON.stringify({
          chain,
          network,
          message,
        }),
      });
      setSignResult(response.sign);
      setSignedAt(response.signedAt || new Date().toISOString());
      setVerifyMessage(message);
      setVerifySignature(response.sign.signature);
      setVerifyAddress(response.sign.address);
      setVerifyResult(null);
      setState('signed');
      return response;
    } catch (err: unknown) {
      const messageValue = err instanceof Error ? err.message : String(err);
      setError(messageValue);
      setState('error');
      throw err;
    }
  }

  async function runVerify(): Promise<VerifyApiResponse> {
    if (!verifyMessage.trim()) {
      throw new Error('Verify message is required.');
    }
    if (!verifySignature.trim()) {
      throw new Error('Signature is required.');
    }
    if (!verifyAddress.trim()) {
      throw new Error('Address is required.');
    }

    setState('verifying');
    setError('');
    try {
      const response = await fetchJson<VerifyApiResponse>('/api/sign/verify', {
        method: 'POST',
        body: JSON.stringify({
          chain,
          network,
          message: verifyMessage,
          signature: verifySignature,
          address: verifyAddress,
        }),
      });
      setVerifyResult(response.verify);
      setVerifiedAt(response.verifiedAt || new Date().toISOString());
      setState('verified');
      return response;
    } catch (err: unknown) {
      const messageValue = err instanceof Error ? err.message : String(err);
      setError(messageValue);
      setState('error');
      throw err;
    }
  }

  const signRequest = useMemo(
    () => ({
      chain,
      message: message.trim() || 'Sign in: nonce-123',
      network,
    }),
    [chain, message, network],
  );

  const verifyRequest = useMemo(
    () => ({
      chain,
      message: verifyMessage.trim() || signRequest.message,
      signature: verifySignature.trim() || '<signature>',
      address: verifyAddress.trim() || selectedChain.addressHint,
      network,
    }),
    [chain, network, selectedChain.addressHint, signRequest.message, verifyAddress, verifyMessage, verifySignature],
  );

  const signSdkSnippet = useMemo(() => [
    'await money.sign({',
    `  chain: "${signRequest.chain}",`,
    `  message: "${signRequest.message.replace(/"/g, '\\"')}",`,
    `  network: "${signRequest.network}"`,
    '});',
  ].join('\n'), [signRequest]);

  const verifySdkSnippet = useMemo(() => [
    'await money.verifySign({',
    `  chain: "${verifyRequest.chain}",`,
    `  message: "${verifyRequest.message.replace(/"/g, '\\"')}",`,
    `  signature: "${verifyRequest.signature.replace(/"/g, '\\"')}",`,
    `  address: "${verifyRequest.address.replace(/"/g, '\\"')}",`,
    `  network: "${verifyRequest.network}"`,
    '});',
  ].join('\n'), [verifyRequest]);

  const agentActions = useMemo<ApiActionCardProps[]>(() => [
    {
      title: 'Sign',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.sign',
        body: signRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: signSdkSnippet,
          raw_json: JSON.stringify(signRequest, null, 2),
        },
      },
      successExample: signResult ?? {
        signature: '...',
        address: selectedChain.addressHint,
        chain,
        network,
      },
      failureExamples: [
        {
          payload: {
            code: 'CHAIN_NOT_CONFIGURED',
            message: `Chain "${chain}" is not configured for ${network}.`,
          },
          note: `Run setup first: await money.setup({ chain: "${chain}", network: "${network}" })`,
        },
        {
          payload: {
            code: 'INVALID_PARAMS',
            message: 'Missing required param: message',
          },
          note: 'Provide a non-empty message.',
        },
      ],
      fieldNotes: [
        `Signature format on ${selectedChain.label}: ${selectedChain.signatureFormat}.`,
      ],
      tryIt: {
        label: 'Try sign',
        run: async () => runSign(),
      },
    },
    {
      title: 'Verify',
      integrationMode: 'SDK method',
      request: {
        method: 'CALL',
        url: 'money.verifySign',
        body: verifyRequest,
        snippets: {
          curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
          javascript: verifySdkSnippet,
          raw_json: JSON.stringify(verifyRequest, null, 2),
        },
      },
      successExample: verifyResult ?? {
        valid: true,
        address: verifyRequest.address,
        chain: verifyRequest.chain,
        network: verifyRequest.network,
      },
      failureExamples: [
        {
          payload: {
            valid: false,
            note: 'Signature verification failed. The signature does not match the provided address and message.',
          },
          note: 'Ensure chain, message, signature, and address all match the original sign payload.',
        },
      ],
      fieldNotes: [
        'Verification can run independently from sign if you provide all fields.',
      ],
      tryIt: {
        label: 'Try verify',
        run: async () => runVerify(),
      },
    },
  ], [
    chain,
    network,
    selectedChain.addressHint,
    selectedChain.label,
    selectedChain.signatureFormat,
    signRequest,
    signResult,
    signSdkSnippet,
    verifyRequest,
    verifyResult,
    verifySdkSnippet,
  ]);

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Demo
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Signature Lab
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Sign and verify challenge messages for agent auth proofs across Fast, EVM, and Solana-style signature formats.
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
                  Message challenge, sign output, and signature verification.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Sign</h3>
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
                    <option value="testnet">testnet</option>
                    <option value="mainnet">mainnet</option>
                  </select>
                </label>
              </div>

              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Message</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem', resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setMessage(buildChallengeMessage())}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  New Challenge
                </button>
                <button
                  onClick={() => void runSign()}
                  disabled={state === 'signing' || state === 'verifying'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'signing' ? 'Signing...' : 'Sign Message'}
                </button>
              </div>

              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Signature format on {selectedChain.label}: {selectedChain.signatureFormat}. {selectedChain.note}
              </p>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Sign Output</h3>
              {!signResult ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  No signature yet. Run sign to capture `signature` and signer `address`.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>address:</span> <code>{signResult.address}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>signature:</span> <code>{shortSignature(signResult.signature)}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>signed at:</span> {signedAt ? new Date(signedAt).toLocaleTimeString() : '—'}</div>
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Verify</h3>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Message</span>
                <textarea
                  value={verifyMessage}
                  onChange={(event) => setVerifyMessage(event.target.value)}
                  rows={3}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem', resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Signature</span>
                <textarea
                  value={verifySignature}
                  onChange={(event) => setVerifySignature(event.target.value)}
                  rows={3}
                  placeholder="Paste signature to verify"
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.6rem', resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Address</span>
                <input
                  value={verifyAddress}
                  onChange={(event) => setVerifyAddress(event.target.value)}
                  placeholder={selectedChain.addressHint}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                />
              </label>

              <button
                onClick={() => void runVerify()}
                disabled={state === 'signing' || state === 'verifying'}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.42rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', width: 'fit-content' }}
              >
                {state === 'verifying' ? 'Verifying...' : 'Verify Signature'}
              </button>

              {verifyResult ? (
                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>status:</span>{' '}
                    <strong style={{ color: verifyResult.valid ? '#86efac' : '#fca5a5' }}>
                      {verifyResult.valid ? 'valid' : 'invalid'}
                    </strong>
                  </div>
                  <div><span style={{ color: 'var(--text-3)' }}>verified at:</span> {verifiedAt ? new Date(verifiedAt).toLocaleTimeString() : '—'}</div>
                  {verifyResult.note ? (
                    <div style={{ color: verifyResult.valid ? 'var(--text-3)' : '#fca5a5', fontSize: '0.72rem' }}>
                      {verifyResult.note}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Verification can be run independently with chain/message/signature/address.
                </p>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="SDK sign/verify calls with chain-specific signature format notes."
            actions={agentActions}
          />
        </div>
      </div>
    </main>
  );
}
