'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

type SnippetTab = 'curl' | 'javascript' | 'raw_json';

export type AgentActionRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  snippets?: Partial<Record<SnippetTab, string>>;
};

export type AgentActionFailure = {
  status?: number;
  payload: unknown;
  note?: string;
};

export type AgentActionTryIt = {
  label?: string;
  run: () => Promise<unknown>;
};

export type ApiActionCardProps = {
  title: string;
  integrationMode: 'HTTP endpoint' | 'SDK method';
  request: AgentActionRequest;
  successExample: unknown;
  failureExamples: AgentActionFailure[];
  environment?: string;
  fieldNotes?: string[];
  tryIt?: AgentActionTryIt;
};

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function escapeForSingleQuotes(value: string): string {
  return value.replace(/'/g, '\'\"\'\"\'');
}

function toCurlSnippet(request: AgentActionRequest): string {
  const headers = request.headers ?? {};
  const headerArgs = Object.entries(headers)
    .map(([key, value]) => `  -H '${key}: ${value}'`)
    .join(' \\\n');
  const body = request.body === undefined
    ? ''
    : ` \\\n  -d '${escapeForSingleQuotes(JSON.stringify(request.body))}'`;

  const headerPart = headerArgs.length > 0 ? ` \\\n${headerArgs}` : '';
  return `curl -X ${request.method.toUpperCase()} '${request.url}'${headerPart}${body}`;
}

function toJsSnippet(request: AgentActionRequest): string {
  const headers = request.headers ?? {};
  const lines = [
    `const response = await fetch('${request.url}', {`,
    `  method: '${request.method.toUpperCase()}',`,
    `  headers: ${toJson(headers)},`,
  ];

  if (request.body !== undefined) {
    lines.push(`  body: JSON.stringify(${toJson(request.body)})`);
  }

  lines.push('});', '', 'const data = await response.json();', 'console.log(data);');
  return lines.join('\n');
}

function toRawRequestJson(request: AgentActionRequest): string {
  return toJson({
    method: request.method.toUpperCase(),
    url: request.url,
    headers: request.headers ?? {},
    body: request.body ?? null,
  });
}

const codeBlockStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

export function ApiActionCard(props: ApiActionCardProps) {
  const [activeTab, setActiveTab] = useState<SnippetTab>('curl');
  const [copiedKey, setCopiedKey] = useState<'url' | 'curl' | 'javascript' | 'raw_json' | null>(null);
  const [copyError, setCopyError] = useState('');
  const [runningTryIt, setRunningTryIt] = useState(false);
  const [tryItResult, setTryItResult] = useState<unknown>(null);
  const [tryItError, setTryItError] = useState('');

  const curlSnippet = useMemo(
    () => props.request.snippets?.curl ?? toCurlSnippet(props.request),
    [props.request],
  );
  const jsSnippet = useMemo(
    () => props.request.snippets?.javascript ?? toJsSnippet(props.request),
    [props.request],
  );
  const rawRequest = useMemo(
    () => props.request.snippets?.raw_json ?? toRawRequestJson(props.request),
    [props.request],
  );
  const activeSnippet = activeTab === 'curl'
    ? curlSnippet
    : activeTab === 'javascript'
      ? jsSnippet
      : rawRequest;

  async function copyValue(key: 'url' | 'curl' | 'javascript' | 'raw_json', value: string) {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1400);
    } catch {
      setCopyError('Clipboard is unavailable in this browser context.');
    }
  }

  async function runTryIt() {
    if (!props.tryIt) return;
    setRunningTryIt(true);
    setTryItError('');
    setTryItResult(null);

    try {
      const result = await props.tryIt.run();
      setTryItResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTryItError(message);
    } finally {
      setRunningTryIt(false);
    }
  }

  return (
    <article style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--code-bg)', padding: '0.75rem', display: 'grid', gap: '0.55rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.86rem' }}>{props.title}</h4>
          <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>
            {props.integrationMode}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono), monospace',
            fontSize: '0.71rem',
            color: 'var(--text-2)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.3rem',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          <span style={{ color: '#93c5fd', whiteSpace: 'nowrap' }}>{props.request.method.toUpperCase()}</span>
          <code style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{props.request.url}</code>
        </div>
      </header>

      {props.environment && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
          Env: {props.environment}
        </div>
      )}

      {props.fieldNotes && props.fieldNotes.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'grid', gap: '0.2rem' }}>
          {props.fieldNotes.map((note) => (
            <div key={note}>- {note}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 999, width: 'fit-content', padding: 2 }}>
        <button
          onClick={() => setActiveTab('curl')}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '0.28rem 0.58rem',
            background: activeTab === 'curl' ? 'var(--text)' : 'transparent',
            color: activeTab === 'curl' ? 'var(--bg)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.72rem',
          }}
        >
          cURL
        </button>
        <button
          onClick={() => setActiveTab('javascript')}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '0.28rem 0.58rem',
            background: activeTab === 'javascript' ? 'var(--text)' : 'transparent',
            color: activeTab === 'javascript' ? 'var(--bg)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.72rem',
          }}
        >
          JavaScript
        </button>
        <button
          onClick={() => setActiveTab('raw_json')}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '0.28rem 0.58rem',
            background: activeTab === 'raw_json' ? 'var(--text)' : 'transparent',
            color: activeTab === 'raw_json' ? 'var(--bg)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.72rem',
          }}
        >
          Raw JSON
        </button>
      </div>

      <pre style={codeBlockStyle}>{activeSnippet}</pre>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <button
          onClick={() => void copyValue('url', props.request.url)}
          style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.55rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.71rem' }}
        >
          {copiedKey === 'url' ? 'Copied URL' : 'Copy URL'}
        </button>
        <button
          onClick={() => void copyValue('curl', curlSnippet)}
          style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.55rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.71rem' }}
        >
          {copiedKey === 'curl' ? 'Copied cURL' : 'Copy cURL'}
        </button>
        <button
          onClick={() => void copyValue('javascript', jsSnippet)}
          style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.55rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.71rem' }}
        >
          {copiedKey === 'javascript' ? 'Copied JS' : 'Copy JS'}
        </button>
        <button
          onClick={() => void copyValue('raw_json', rawRequest)}
          style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.55rem', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.71rem' }}
        >
          {copiedKey === 'raw_json' ? 'Copied JSON' : 'Copy JSON'}
        </button>
      </div>

      {copyError && (
        <div style={{ color: '#fca5a5', fontSize: '0.72rem' }}>
          {copyError}
        </div>
      )}

      {props.tryIt && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <button
            onClick={() => void runTryIt()}
            disabled={runningTryIt}
            style={{ border: 0, borderRadius: 5, padding: '0.35rem 0.6rem', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', width: 'fit-content', fontSize: '0.72rem' }}
          >
            {runningTryIt ? 'Running...' : (props.tryIt.label ?? 'Try it')}
          </button>
          {tryItError && (
            <div style={{ color: '#fca5a5', fontSize: '0.72rem' }}>
              {tryItError}
            </div>
          )}
          {tryItResult !== null && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.73rem', color: 'var(--text-2)' }}>Try it response</summary>
              <pre style={{ ...codeBlockStyle, marginTop: '0.45rem' }}>{toJson(tryItResult)}</pre>
            </details>
          )}
        </div>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.73rem', color: 'var(--text-2)' }}>
          Example success response
        </summary>
        <pre style={{ ...codeBlockStyle, marginTop: '0.45rem' }}>{toJson(props.successExample)}</pre>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.73rem', color: 'var(--text-2)' }}>
          Example failure responses
        </summary>
        <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.4rem' }}>
          {props.failureExamples.map((failure, index) => (
            <div key={`${failure.status ?? 'status'}-${index}`}>
              <div style={{ fontSize: '0.69rem', color: 'var(--text-3)' }}>
                {failure.status ? `HTTP ${failure.status}` : 'Failure'}
              </div>
              <pre style={{ ...codeBlockStyle, marginTop: '0.2rem', fontSize: '0.71rem' }}>{toJson(failure.payload)}</pre>
              {failure.note && (
                <div style={{ marginTop: '0.2rem', fontSize: '0.7rem', color: 'var(--text-3)' }}>
                  Recovery: {failure.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
