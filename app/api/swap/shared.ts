import { z } from 'zod';
import { MoneyError } from '../../../dist/src/errors.js';

const Network = z.enum(['testnet', 'mainnet']);

export const SwapRequestBody = z.object({
  chain: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  network: Network.default('testnet'),
  slippageBps: z.number().int().min(1).max(5000).optional(),
  provider: z.string().min(1).optional(),
});

export type SwapRequest = {
  chain: string;
  from: string;
  to: string;
  amount: string | number;
  network: 'testnet' | 'mainnet';
  slippageBps?: number;
  provider?: string;
};

function moneyErrorStatus(err: MoneyError): number {
  if (err.code === 'INVALID_PARAMS' || err.code === 'INVALID_ADDRESS' || err.code === 'UNSUPPORTED_OPERATION') {
    return 400;
  }
  if (err.code === 'CHAIN_NOT_CONFIGURED') {
    return 409;
  }
  return 500;
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return Response.json(
      { error: 'Invalid request payload.', code: 'INVALID_PARAMS', details: err.flatten() },
      { status: 400 },
    );
  }
  if (err instanceof MoneyError) {
    return Response.json(
      {
        error: err.message,
        code: err.code,
        note: err.note,
      },
      { status: moneyErrorStatus(err) },
    );
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}

export async function readSwapRequest(request: Request): Promise<SwapRequest> {
  const body = SwapRequestBody.parse((await request.json().catch(() => ({}))) as unknown);
  const amount = typeof body.amount === 'string' ? body.amount.trim() : body.amount;
  if (typeof amount === 'string' && amount.length === 0) {
    throw new MoneyError('INVALID_PARAMS', 'amount is required.');
  }
  return {
    chain: body.chain.trim(),
    from: body.from.trim(),
    to: body.to.trim(),
    amount,
    network: body.network,
    ...(body.slippageBps !== undefined ? { slippageBps: body.slippageBps } : {}),
    ...(body.provider?.trim() ? { provider: body.provider.trim() } : {}),
  };
}
