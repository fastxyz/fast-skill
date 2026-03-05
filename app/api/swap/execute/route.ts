import { money } from '../../../../dist/src/index.js';
import { readSwapRequest, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const params = await readSwapRequest(request);
    const swap = await money.swap(params);
    const history = await money.history({
      chain: params.chain,
      network: params.network,
      limit: 30,
    });
    const historyEcho = history.entries.find((entry) => entry.txHash === swap.txHash) ?? null;
    return Response.json({
      swap,
      historyEcho,
      request: params,
      swappedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
