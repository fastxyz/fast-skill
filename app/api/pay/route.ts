import { headers } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { originFromHost } from '../../lib/origin';

export const dynamic = 'force-dynamic';

const FAST_ADDRESS_PATTERN = /^fast1[a-z0-9]{38,}$/;
const SDK_NATIVE_TOKEN = 'SET';
const DEFAULT_REQUEST_TOKEN = 'SETUSDC';

function generatePaymentId(): string {
  return 'pay_' + randomBytes(16).toString('hex');
}

function buildMarkdown(params: {
  paymentId: string;
  network: string;
  receiver: string;
  amount: string;
  token: string;
  memo: string | null;
  createdAt: string;
  baseUrl: string;
}): string {
  const { paymentId, network, receiver, amount, token, memo, createdAt, baseUrl } = params;
  const memoLine = memo ? '\n\n**Memo:** ' + memo : '';
  const memoFrontmatter = memo ?? '';
  const networkDisclaimer = network === 'testnet'
    ? 'This is a **testnet** payment request. No real funds will be transferred.'
    : 'This is a **mainnet** payment request. Real funds will be transferred.';

  const frontmatter = [
    '---',
    'type: payment_request',
    'version: "2.1"',
    'payment_id: "' + paymentId + '"',
    'chain: "fast"',
    'network: "' + network + '"',
    'receiver: "' + receiver + '"',
    'amount: "' + amount + '"',
    'token: "' + token + '"',
    'memo: "' + memoFrontmatter + '"',
    'created_at: "' + createdAt + '"',
    'skill: "' + baseUrl + '/skill.md"',
    '---',
  ].join('\n');

  const setupBlock = [
    'Load the Fast skill if your runtime does not already have it:',
    '',
    '- Skill: ' + baseUrl + '/skill.md',
    '',
    'The skill contains the current install and usage instructions for `@pi2labs/fast-sdk`.',
  ].join('\n');

  const payBlock = [
    '```js',
    'import { fast } from "@pi2labs/fast-sdk";',
    '',
    'const client = fast({ network: "' + network + '" });',
    'await client.setup();',
    'await client.send({',
    '  to: "' + receiver + '",',
    '  amount: "' + amount + '",',
    ...(token !== SDK_NATIVE_TOKEN ? ['  token: "' + token + '",'] : []),
    '});',
    '```',
  ].join('\n');

  return [
    frontmatter,
    '',
    '# Payment Request - ' + amount + ' ' + token + ' on Fast',
    '',
    'Send **' + amount + ' ' + token + '** to `' + receiver + '` on **fast** (' + network + ').' + memoLine,
    '',
    '## Setup',
    '',
    setupBlock,
    '',
    '## Pay',
    '',
    payBlock,
    '',
    '> ' + networkDisclaimer,
  ].join('\n');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const receiver = searchParams.get('receiver');
  const amount = searchParams.get('amount');
  const chain = searchParams.get('chain');
  const token = searchParams.get('token');
  const network = searchParams.get('network') ?? 'mainnet';
  const memo = searchParams.get('memo');

  if (!receiver) {
    return Response.json({ error: 'Missing required param: receiver' }, { status: 400 });
  }
  if (!amount) {
    return Response.json({ error: 'Missing required param: amount' }, { status: 400 });
  }
  if (chain && chain !== 'fast') {
    return Response.json(
      { error: 'Unsupported chain: ' + chain + '. Supported: fast' },
      { status: 400 },
    );
  }
  if (!FAST_ADDRESS_PATTERN.test(receiver)) {
    return Response.json(
      { error: 'Invalid receiver address for chain fast' },
      { status: 400 },
    );
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return Response.json({ error: 'Amount must be a positive number' }, { status: 400 });
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return Response.json({ error: 'Network must be "testnet" or "mainnet"' }, { status: 400 });
  }

  const resolvedToken = token?.trim() ? token.trim() : DEFAULT_REQUEST_TOKEN;
  const paymentId = generatePaymentId();
  const createdAt = new Date().toISOString();
  const host = (await headers()).get('host') || 'localhost:3000';
  const baseUrl = originFromHost(host);

  const markdown = buildMarkdown({
    paymentId,
    network,
    receiver,
    amount,
    token: resolvedToken,
    memo,
    createdAt,
    baseUrl,
  });

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Payment-Id': paymentId,
    },
  });
}
