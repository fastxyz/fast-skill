import { z } from 'zod';
import { MoneyError } from '../../../dist/src/errors.js';
import type { BridgeParams } from '../../../dist/src/types.js';

const Network = z.enum(['testnet', 'mainnet']);

export const BridgeRequestBody = z.object({
  from: z.object({
    chain: z.string().min(1),
    token: z.string().min(1),
  }),
  to: z.object({
    chain: z.string().min(1),
    token: z.string().optional(),
  }),
  amount: z.union([z.string(), z.number()]),
  network: Network.optional(),
  receiver: z.string().optional(),
  provider: z.string().optional(),
});

function inferStatusCode(err: MoneyError): number {
  if (err.code === 'INVALID_PARAMS' || err.code === 'UNSUPPORTED_OPERATION' || err.code === 'INVALID_ADDRESS') {
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
      { status: inferStatusCode(err) },
    );
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}

function normalizedAmount(value: string | number): string {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new MoneyError('INVALID_PARAMS', 'amount must be a positive number.');
  }
  return raw;
}

export function parseBridgeParams(body: unknown): BridgeParams {
  const parsed = BridgeRequestBody.parse(body);
  const amount = normalizedAmount(parsed.amount);
  return {
    from: {
      chain: parsed.from.chain.trim(),
      token: parsed.from.token.trim(),
    },
    to: {
      chain: parsed.to.chain.trim(),
      ...(parsed.to.token?.trim() ? { token: parsed.to.token.trim() } : {}),
    },
    amount,
    ...(parsed.network ? { network: parsed.network } : {}),
    ...(parsed.receiver?.trim() ? { receiver: parsed.receiver.trim() } : {}),
    ...(parsed.provider?.trim() ? { provider: parsed.provider.trim() } : {}),
  };
}
