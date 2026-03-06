import { FastError, fast } from '@pi2labs/fast-sdk';
import { applyFastServerWalletEnv } from '../../../lib/apply-fast-server-wallet-env';
import { ensureFastConfigDir } from '../../../lib/ensure-fast-config-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DiscoverBody = {
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
    const body = (await request.json().catch(() => ({}))) as DiscoverBody;
    const network = body.network === 'testnet' ? 'testnet' : 'mainnet';
    const chain = String(body.chain ?? 'fast').trim() || 'fast';

    if (chain !== 'fast') {
      return Response.json({ error: 'Unsupported chain: only "fast" is available.', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    applyFastServerWalletEnv(network);
    await ensureFastConfigDir();
    const client = fast({ network });
    const setup = await client.setup();
    const owned = await client.tokens();

    return Response.json({
      tokens: {
        chain: 'fast',
        network,
        address: setup.address,
        owned,
        note: owned.length === 0
          ? 'No token balances found for the current Fast wallet.'
          : `Loaded ${owned.length} token balance(s) from the Fast wallet.`,
      },
      request: {
        chain: 'fast',
        network,
      },
      discoveredAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
