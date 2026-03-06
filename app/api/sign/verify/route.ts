import { FastError, fast } from '@pi2labs/fast-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VerifyBody = {
  message?: string;
  signature?: string;
  address?: string;
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
    const body = (await request.json().catch(() => ({}))) as VerifyBody;
    const message = String(body.message ?? '').trim();
    const signature = String(body.signature ?? '').trim();
    const address = String(body.address ?? '').trim();
    const network = body.network === 'testnet' ? 'testnet' : 'mainnet';
    const chain = String(body.chain ?? 'fast').trim() || 'fast';

    if (!message || !signature || !address) {
      return Response.json(
        { error: 'message, signature, and address are required.', code: 'INVALID_PARAMS' },
        { status: 400 },
      );
    }
    if (chain !== 'fast') {
      return Response.json({ error: 'Unsupported chain: only "fast" is available.', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    const client = fast({ network });
    const verified = await client.verify({ message, signature, address });

    return Response.json({
      verify: {
        ...verified,
        address,
        chain: 'fast',
        network,
      },
      request: {
        chain: 'fast',
        message,
        signature,
        address,
        network,
      },
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
