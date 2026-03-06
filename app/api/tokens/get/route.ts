import { FastError, fast } from '@pi2labs/fast-sdk';
import { applyFastServerWalletEnv } from '../../../lib/apply-fast-server-wallet-env';
import { ensureFastConfigDir } from '../../../lib/ensure-fast-config-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GetBody = {
  token?: string;
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
    const body = (await request.json().catch(() => ({}))) as GetBody;
    const token = String(body.token ?? '').trim();
    const network = body.network === 'testnet' ? 'testnet' : 'mainnet';
    const chain = String(body.chain ?? 'fast').trim() || 'fast';

    if (!token) {
      return Response.json({ error: 'token is required.', code: 'INVALID_PARAMS' }, { status: 400 });
    }
    if (chain !== 'fast') {
      return Response.json({ error: 'Unsupported chain: only "fast" is available.', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    applyFastServerWalletEnv(network);
    await ensureFastConfigDir();
    const client = fast({ network });
    await client.setup();
    try {
      const info = await client.tokenInfo({ token });
      return Response.json({
        token: info,
        found: true,
        request: {
          chain: 'fast',
          token,
          network,
        },
        resolvedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      if (error instanceof FastError && error.code === 'TOKEN_NOT_FOUND') {
        return Response.json({
          token: null,
          found: false,
          request: {
            chain: 'fast',
            token,
            network,
          },
          resolvedAt: new Date().toISOString(),
        });
      }
      throw error;
    }
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
