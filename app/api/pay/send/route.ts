import { money, MoneyError } from '../../../../dist/src/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SendRequestBody = {
  to?: string;
  amount?: string | number;
  chain?: string;
  network?: 'testnet' | 'mainnet';
  token?: string;
  payment_id?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const parsed = (await request.json().catch(() => null)) as unknown;
  if (!isObject(parsed)) {
    return badRequest('Request body must be a JSON object.');
  }

  const body = parsed as SendRequestBody;
  const to = String(body.to ?? '').trim();
  const amount = String(body.amount ?? '').trim();
  const chain = String(body.chain ?? '').trim();
  const network = body.network === 'mainnet' ? 'mainnet' : 'testnet';
  const token = String(body.token ?? '').trim();
  const paymentId = String(body.payment_id ?? '').trim();

  if (!to) return badRequest('Missing required field: to');
  if (!amount) return badRequest('Missing required field: amount');
  if (!chain) return badRequest('Missing required field: chain');

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return badRequest('Amount must be a positive number.');
  }

  try {
    const setup = await money.setup({ chain, network });
    const result = await money.send({
      to,
      amount,
      chain,
      network,
      ...(token ? { token } : {}),
      ...(paymentId ? { payment_id: paymentId } : {}),
    });

    return Response.json({
      request: {
        to,
        amount,
        chain,
        network,
        token: token || null,
        payment_id: paymentId || null,
      },
      setup: {
        chain: setup.chain,
        network: setup.network,
        address: setup.address,
      },
      result,
      sentAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof MoneyError) {
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

    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        error: message,
        code: 'UNKNOWN_ERROR',
      },
      { status: 500 },
    );
  }
}
