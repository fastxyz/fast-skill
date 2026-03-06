import { FastError, fast } from '@pi2labs/fast-sdk';
import { applyFastServerWalletEnv } from '../../../lib/apply-fast-server-wallet-env';
import { ensureFastConfigDir } from '../../../lib/ensure-fast-config-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SignBody = {
  message?: string;
  network?: 'testnet' | 'mainnet';
  chain?: string;
};

function errorResponse(error: unknown): Response {
  if (error instanceof FastError) {
    const status = error.code === 'INVALID_PARAMS' || error.code === 'INVALID_ADDRESS' ? 400 : 500;
    return Response.json(
      {
        error: error.message,
        code: error.code,
        note: error.note ?? null,
      },
      { status },
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SignBody;
    const message = String(body.message ?? '').trim();
    const network = body.network === 'testnet' ? 'testnet' : 'mainnet';
    const chain = String(body.chain ?? 'fast').trim() || 'fast';

    if (!message) {
      return Response.json({ error: 'message is required.', code: 'INVALID_PARAMS' }, { status: 400 });
    }
    if (chain !== 'fast') {
      return Response.json({ error: 'Unsupported chain: only "fast" is available.', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    applyFastServerWalletEnv(network);
    await ensureFastConfigDir();
    const client = fast({ network });
    await client.setup();
    const signed = await client.sign({ message });

    return Response.json({
      sign: {
        ...signed,
        chain: 'fast',
        network,
      },
      request: {
        chain: 'fast',
        message,
        network,
      },
      signedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
