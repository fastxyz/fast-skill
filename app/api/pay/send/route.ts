import { FastError, fast } from '@pi2labs/fast-sdk';
import { applyFastServerWalletEnv } from '../../../lib/apply-fast-server-wallet-env';
import { ensureFastConfigDir } from '../../../lib/ensure-fast-config-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SendRequestBody = {
  to?: string;
  amount?: string | number;
  network?: 'testnet' | 'mainnet';
  token?: string;
  chain?: string;
};

const FAST_ADDRESS_PATTERN = /^fast1[a-z0-9]{38,}$/;
const SDK_NATIVE_TOKEN = 'SET';
const DEFAULT_SEND_TOKEN = 'SETUSDC';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function errorStatus(error: FastError): number {
  if (
    error.code === 'INVALID_PARAMS'
    || error.code === 'INVALID_ADDRESS'
    || error.code === 'TOKEN_NOT_FOUND'
  ) {
    return 400;
  }
  if (error.code === 'CHAIN_NOT_CONFIGURED' || error.code === 'INSUFFICIENT_BALANCE') {
    return 409;
  }
  return 500;
}

export async function POST(request: Request) {
  const parsed = (await request.json().catch(() => null)) as unknown;
  if (!isObject(parsed)) {
    return badRequest('Request body must be a JSON object.');
  }

  const body = parsed as SendRequestBody;
  const to = String(body.to ?? '').trim();
  const amount = String(body.amount ?? '').trim();
  const network = body.network === 'testnet' ? 'testnet' : 'mainnet';
  const token = String(body.token ?? DEFAULT_SEND_TOKEN).trim() || DEFAULT_SEND_TOKEN;
  const chain = String(body.chain ?? 'fast').trim() || 'fast';

  if (!to) return badRequest('Missing required field: to');
  if (!amount) return badRequest('Missing required field: amount');
  if (chain !== 'fast') return badRequest('Unsupported chain: only "fast" is available.');
  if (!FAST_ADDRESS_PATTERN.test(to)) {
    return badRequest('Recipient address must be a valid fast1... address.');
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return badRequest('Amount must be a positive number.');
  }

  try {
    applyFastServerWalletEnv(network);
    await ensureFastConfigDir();
    const client = fast({ network });
    const setup = await client.setup();
    const result = await client.send({
      to,
      amount,
      ...(token.toUpperCase() !== SDK_NATIVE_TOKEN ? { token } : {}),
    });

    return Response.json({
      request: {
        to,
        amount,
        chain: 'fast',
        network,
        token,
      },
      setup: {
        address: setup.address,
        chain: 'fast',
        network,
      },
      result,
      sentAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof FastError) {
      const message = error.code === 'INSUFFICIENT_BALANCE'
        ? `Insufficient ${token} balance in the configured Fast ${network} wallet.`
        : error.message;
      return Response.json(
        {
          error: message,
          code: error.code,
          note: error.note ?? null,
        },
        { status: errorStatus(error) },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        error: message.startsWith('Unable to initialize FAST_CONFIG_DIR')
          ? `Failed to initialize SDK config directory: ${message}`
          : message,
        code: message.startsWith('Unable to initialize FAST_CONFIG_DIR')
          ? 'CONFIG_DIR_INIT_FAILED'
          : 'UNKNOWN_ERROR',
      },
      { status: 500 },
    );
  }
}
