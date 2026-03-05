import { money } from '../../../../dist/src/index.js';
import { VerifyBody, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = VerifyBody.parse((await request.json().catch(() => ({}))) as unknown);
    const params = {
      chain: body.chain.trim(),
      message: body.message,
      signature: body.signature.trim(),
      address: body.address.trim(),
      ...(body.network ? { network: body.network } : {}),
    };
    const verified = await money.verifySign(params);
    return Response.json({
      verify: verified,
      request: params,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
