import { money } from '../../../../dist/src/index.js';
import { parseBridgeParams, toErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const params = parseBridgeParams(body);
    const bridge = await money.bridge(params);

    const network = params.network ?? 'testnet';
    const history = await money.history({
      chain: params.from.chain,
      network,
      limit: 30,
    });
    const historyEcho = history.entries.find((entry) => entry.txHash === bridge.txHash) ?? null;

    return Response.json({
      bridge,
      historyEcho,
      request: params,
      bridgedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
