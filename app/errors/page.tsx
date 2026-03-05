'use client';

import { useMemo, useState } from 'react';
import { AgentFlowPanel } from '../components/agent-flow/agent-flow-panel';
import type { ApiActionCardProps } from '../components/agent-flow/api-action-card';

type PlaygroundState = 'idle' | 'running' | 'failed' | 'recovered';
type ScenarioId =
  | 'chain_not_configured'
  | 'invalid_address'
  | 'insufficient_balance'
  | 'unsupported_operation'
  | 'invalid_params';

type MoneyErrorView = {
  code?: string;
  message: string;
  note?: string;
  chain?: string;
  details?: Record<string, unknown>;
};

type ScenarioRunResponse = {
  scenarioId: ScenarioId;
  title: string;
  mode: 'fail' | 'recover';
  status: 'failed' | 'recovered' | 'unexpected_success' | 'recovery_failed';
  request: unknown;
  failSnippet: string;
  recoverySnippet: string;
  recoveryRequest?: unknown;
  result?: unknown;
  error?: MoneyErrorView;
  matchedExpectedCode?: boolean;
  ranAt: string;
};

type ScenarioDef = {
  id: ScenarioId;
  label: string;
  expectedCode: string;
  failureMethod: string;
  failRequest: unknown;
  recoveryRequest: unknown;
  failSnippet: string;
  recoverySnippet: string;
  summary: string;
};

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'chain_not_configured',
    label: 'Missing chain setup',
    expectedCode: 'CHAIN_NOT_CONFIGURED',
    failureMethod: 'money.balance',
    summary: 'Calls balance on an unconfigured chain to force setup guidance.',
    failRequest: { chain: 'demo-unconfigured', network: 'mainnet' },
    recoveryRequest: { chain: 'base', network: 'mainnet' },
    failSnippet: 'await money.balance({ chain: "demo-unconfigured", network: "mainnet" });',
    recoverySnippet: [
      'await money.setup({ chain: "base", network: "mainnet" });',
      'await money.balance({ chain: "base", network: "mainnet" });',
    ].join('\n'),
  },
  {
    id: 'invalid_address',
    label: 'Invalid address format',
    expectedCode: 'INVALID_ADDRESS',
    failureMethod: 'money.send',
    summary: 'Calls send with an invalid address string.',
    failRequest: { chain: 'ethereum', to: 'not-an-address', amount: '1', network: 'mainnet' },
    recoveryRequest: { address: '0x1111111111111111111111111111111111111111' },
    failSnippet: 'await money.send({ chain: "ethereum", to: "not-an-address", amount: "1", network: "mainnet" });',
    recoverySnippet: [
      'const checks = await money.identifyChains({ address: "0x1111111111111111111111111111111111111111" });',
      'console.log(checks.chains);',
    ].join('\n'),
  },
  {
    id: 'insufficient_balance',
    label: 'Insufficient balance',
    expectedCode: 'INSUFFICIENT_BALANCE',
    failureMethod: 'money.send',
    summary: 'Attempts to send an intentionally huge amount after setup.',
    failRequest: { chain: 'fast', network: 'testnet', amount: '999999999999999999', token: 'FAST' },
    recoveryRequest: { chain: 'fast', network: 'testnet', amount: '1', token: 'FAST' },
    failSnippet: [
      'const wallet = await money.setup({ chain: "fast", network: "testnet" });',
      'await money.send({',
      '  chain: "fast",',
      '  network: "testnet",',
      '  to: wallet.address,',
      '  amount: "999999999999999999"',
      '});',
    ].join('\n'),
    recoverySnippet: [
      'await money.faucet({ chain: "fast", network: "testnet" });',
      'await money.send({ chain: "fast", network: "testnet", to: "<valid set1...>", amount: "1" });',
    ].join('\n'),
  },
  {
    id: 'unsupported_operation',
    label: 'Mainnet-only swap constraint',
    expectedCode: 'UNSUPPORTED_OPERATION',
    failureMethod: 'money.quote',
    summary: 'Runs quote on testnet to trigger mainnet-only guardrails.',
    failRequest: { chain: 'base', from: 'ETH', to: 'USDC', amount: '1', network: 'testnet' },
    recoveryRequest: { chain: 'base', from: 'ETH', to: 'USDC', amount: '1', network: 'mainnet' },
    failSnippet: 'await money.quote({ chain: "base", from: "ETH", to: "USDC", amount: "1", network: "testnet" });',
    recoverySnippet: [
      'await money.quote({',
      '  chain: "base",',
      '  from: "ETH",',
      '  to: "USDC",',
      '  amount: "1",',
      '  network: "mainnet"',
      '});',
    ].join('\n'),
  },
  {
    id: 'invalid_params',
    label: 'Invalid params',
    expectedCode: 'INVALID_PARAMS',
    failureMethod: 'money.toRawUnits',
    summary: 'Calls conversion without enough decimal context.',
    failRequest: { amount: '25' },
    recoveryRequest: { amount: '25', decimals: 6 },
    failSnippet: 'await money.toRawUnits({ amount: "25" });',
    recoverySnippet: 'await money.toRawUnits({ amount: "25", decimals: 6 });',
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

function stateColor(state: PlaygroundState): string {
  if (state === 'running') return '#93c5fd';
  if (state === 'recovered') return '#86efac';
  if (state === 'failed') return '#fca5a5';
  return 'var(--text-3)';
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString();
}

function fallbackFailureExample(expectedCode: string): MoneyErrorView {
  return {
    code: expectedCode,
    message: `Expected ${expectedCode} from scenario.`,
    note: 'Inspect note and apply recovery snippet.',
  };
}

export default function ErrorRecoveryPlaygroundPage() {
  const [state, setState] = useState<PlaygroundState>('idle');
  const [error, setError] = useState('');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('chain_not_configured');
  const [lastFailure, setLastFailure] = useState<ScenarioRunResponse | null>(null);
  const [lastRecovery, setLastRecovery] = useState<ScenarioRunResponse | null>(null);

  const selectedScenario = useMemo(
    () => SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId],
  );

  async function runScenario(mode: 'fail' | 'recover'): Promise<ScenarioRunResponse> {
    setState('running');
    setError('');
    try {
      const response = await fetchJson<ScenarioRunResponse>('/api/errors/run', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          mode,
        }),
      });
      if (mode === 'fail') {
        setLastFailure(response);
        setLastRecovery(null);
      } else {
        setLastRecovery(response);
      }

      if (response.status === 'failed' || response.status === 'recovery_failed') {
        setState('failed');
      } else if (response.status === 'recovered') {
        setState('recovered');
      } else {
        setState('idle');
      }
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('failed');
      throw err;
    }
  }

  const actionCards = useMemo<ApiActionCardProps[]>(
    () =>
      SCENARIOS.map((scenario) => ({
        title: `Scenario: ${scenario.label}`,
        integrationMode: 'SDK method',
        request: {
          method: 'CALL',
          url: scenario.failureMethod,
          body: scenario.failRequest,
          snippets: {
            curl: '# SDK method (no HTTP endpoint)\n# Use JavaScript snippet instead.',
            javascript: scenario.failSnippet,
            raw_json: JSON.stringify(scenario.failRequest, null, 2),
          },
        },
        successExample:
          lastFailure && lastFailure.scenarioId === scenario.id && lastFailure.error
            ? lastFailure.error
            : fallbackFailureExample(scenario.expectedCode),
        failureExamples: [
          {
            payload: {
              status: 'unexpected_success',
              message: 'Scenario did not fail as expected in this environment.',
            },
            note: 'Use the route `/api/errors/run` response to confirm actual runtime behavior.',
          },
          {
            payload: {
              status: 'recovery_failed',
              code: scenario.expectedCode,
            },
            note: 'Apply recovery snippet in sequence and retry.',
          },
        ],
        fieldNotes: [
          `Expected error code: ${scenario.expectedCode}`,
          scenario.summary,
          `Recovery snippet:\n${scenario.recoverySnippet}`,
        ],
        tryIt: {
          label: `Try ${scenario.id}`,
          run: async () =>
            fetchJson<ScenarioRunResponse>('/api/errors/run', {
              method: 'POST',
              body: JSON.stringify({ scenarioId: scenario.id, mode: 'fail' }),
            }),
        },
      })),
    [lastFailure],
  );

  return (
    <main style={{ minHeight: '100vh', padding: '7rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            TOOLS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display), serif', fontStyle: 'italic', fontWeight: 400 }}>
            Error Recovery
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.92rem' }}>
            Trigger representative `MoneyError` cases and practice deterministic, code-driven recovery sequences.
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
                  Pick a scenario, run failure mode, inspect code/message/note, then execute recovery.
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: stateColor(state), fontFamily: 'var(--font-mono), monospace' }}>
                state: {state}
              </span>
            </header>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Scenario Selector</h3>
              <label style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Scenario</span>
                <select
                  value={scenarioId}
                  onChange={(event) => {
                    setScenarioId(event.target.value as ScenarioId);
                    setError('');
                  }}
                  style={{ background: 'var(--code-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.6rem' }}
                >
                  {SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.label}
                    </option>
                  ))}
                </select>
              </label>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Expected code: <code>{selectedScenario.expectedCode}</code> • {selectedScenario.summary}
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void runScenario('fail')}
                  disabled={state === 'running'}
                  style={{ border: 0, borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer' }}
                >
                  {state === 'running' ? 'Running...' : 'Run Scenario'}
                </button>
                <button
                  onClick={() => void runScenario('recover')}
                  disabled={state === 'running'}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  Run Recovery
                </button>
              </div>
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Error Output</h3>
              {!lastFailure ? (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Run scenario to inspect structured error output.
                </p>
              ) : lastFailure.status === 'failed' && lastFailure.error ? (
                <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div><span style={{ color: 'var(--text-3)' }}>code:</span> <code>{lastFailure.error.code ?? 'UNKNOWN'}</code></div>
                  <div><span style={{ color: 'var(--text-3)' }}>message:</span> {lastFailure.error.message}</div>
                  <div><span style={{ color: 'var(--text-3)' }}>note:</span> {lastFailure.error.note || '—'}</div>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>matched expected:</span>{' '}
                    <strong style={{ color: lastFailure.matchedExpectedCode ? '#86efac' : '#fca5a5' }}>
                      {lastFailure.matchedExpectedCode ? 'yes' : 'no'}
                    </strong>
                  </div>
                  <div><span style={{ color: 'var(--text-3)' }}>ran:</span> {formatTime(lastFailure.ranAt)}</div>
                  {lastFailure.error.details ? (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-3)' }}>details</summary>
                      <pre style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                        {JSON.stringify(lastFailure.error.details, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  Scenario status: <code>{lastFailure.status}</code>
                  <pre style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                    {JSON.stringify(lastFailure, null, 2)}
                  </pre>
                </div>
              )}
            </section>

            <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.84rem' }}>Retry Panel (Adjusted Inputs)</h3>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Failing request
              </p>
              <pre style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                {JSON.stringify(selectedScenario.failRequest, null, 2)}
              </pre>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Adjusted recovery request
              </p>
              <pre style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                {JSON.stringify(selectedScenario.recoveryRequest, null, 2)}
              </pre>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.72rem' }}>
                Recovery sequence
              </p>
              <pre style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                {selectedScenario.recoverySnippet}
              </pre>

              {lastRecovery ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.45rem', display: 'grid', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>recovery status:</span>{' '}
                    <strong style={{ color: lastRecovery.status === 'recovered' ? '#86efac' : '#fca5a5' }}>
                      {lastRecovery.status}
                    </strong>
                  </div>
                  <div><span style={{ color: 'var(--text-3)' }}>ran:</span> {formatTime(lastRecovery.ranAt)}</div>
                  {lastRecovery.error ? (
                    <div style={{ color: '#fca5a5' }}>
                      <code>{lastRecovery.error.code ?? 'UNKNOWN'}</code> {lastRecovery.error.message}
                    </div>
                  ) : (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-3)' }}>Recovery output</summary>
                      <pre style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', lineHeight: 1.45, overflowX: 'auto' }}>
                        {JSON.stringify(lastRecovery.result, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.74rem' }}>
                  Run recovery to execute the adjusted sequence.
                </p>
              )}
            </section>
          </section>

          <AgentFlowPanel
            title="Agent Flow"
            subtitle="Scenario-specific failure payloads and deterministic recovery patterns."
            actions={actionCards}
          />
        </div>
      </div>
    </main>
  );
}
