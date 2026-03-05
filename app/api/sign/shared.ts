import { z } from 'zod';
import { MoneyError } from '../../../dist/src/errors.js';

const Network = z.enum(['testnet', 'mainnet']);

export const SignBody = z.object({
  chain: z.string().min(1),
  message: z.string().min(1),
  network: Network.optional(),
});

export const VerifyBody = z.object({
  chain: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
  address: z.string().min(1),
  network: Network.optional(),
});

function inferStatus(err: MoneyError): number {
  if (err.code === 'INVALID_PARAMS' || err.code === 'INVALID_ADDRESS') {
    return 400;
  }
  if (err.code === 'CHAIN_NOT_CONFIGURED') {
    return 409;
  }
  if (err.code === 'UNSUPPORTED_OPERATION') {
    return 400;
  }
  return 500;
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return Response.json(
      {
        error: 'Invalid request payload.',
        code: 'INVALID_PARAMS',
        details: err.flatten(),
      },
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
      { status: inferStatus(err) },
    );
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}
