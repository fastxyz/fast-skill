import { money } from '../../../../dist/src/index.js';
import { readSwapRequest, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const params = await readSwapRequest(request);
    const quote = await money.quote(params);
    return Response.json({
      quote,
      request: params,
      quotedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
