import { money } from '../../../../dist/src/index.js';
import { SignBody, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = SignBody.parse((await request.json().catch(() => ({}))) as unknown);
    const params = {
      chain: body.chain.trim(),
      message: body.message,
      ...(body.network ? { network: body.network } : {}),
    };
    const signed = await money.sign(params);
    return Response.json({
      sign: signed,
      request: params,
      signedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
