import { z } from 'zod';
import { MoneyError } from '../../../dist/src/errors.js';
import { money } from '../../../dist/src/index.js';
import type { PaymentLinkEntry, PaymentLinkParams, PaymentLinksParams } from '../../../dist/src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreatePaymentLinkBody = z.object({
  receiver: z.string().min(1),
  amount: z.union([z.string().min(1), z.number()]),
  chain: z.string().min(1),
  token: z.string().optional(),
  network: z.enum(['testnet', 'mainnet']).optional(),
  memo: z.string().optional(),
});

const Direction = z.enum(['created', 'paid']);

function baseOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function toApiPayUrl(rawUrl: string, origin: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${origin}/api/pay${parsed.search}`;
  } catch {
    try {
      const parsedRelative = new URL(rawUrl, origin);
      return `${origin}/api/pay${parsedRelative.search}`;
    } catch {
      return `${origin}/api/pay`;
    }
  }
}

function toLocalShareUrl(rawUrl: string, origin: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${origin}/receive${parsed.search}`;
  } catch {
    try {
      const parsedRelative = new URL(rawUrl, origin);
      return `${origin}/receive${parsedRelative.search}`;
    } catch {
      return `${origin}/receive`;
    }
  }
}

function toEntryView(entry: PaymentLinkEntry, origin: string) {
  return {
    ...entry,
    shareUrl: toLocalShareUrl(entry.url, origin),
    apiRequestUrl: toApiPayUrl(entry.url, origin),
  };
}

function inferStatusCode(err: MoneyError): number {
  if (err.code === 'INVALID_PARAMS' || err.code === 'INVALID_ADDRESS') {
    return 400;
  }
  return 500;
}

function toErrorResponse(err: unknown): Response {
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
  if (err instanceof z.ZodError) {
    return Response.json(
      { error: 'Invalid request payload', code: 'INVALID_PARAMS', details: err.flatten() },
      { status: 400 },
    );
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}

function toOptionalString(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  try {
    const json = (await request.json().catch(() => ({}))) as unknown;
    const body = CreatePaymentLinkBody.parse(json);
    const params: PaymentLinkParams = {
      receiver: body.receiver.trim(),
      amount: body.amount,
      chain: body.chain.trim(),
      ...(body.token?.trim() ? { token: body.token.trim() } : {}),
      ...(body.network ? { network: body.network } : {}),
      ...(body.memo?.trim() ? { memo: body.memo.trim() } : {}),
    };

    const created = await money.createPaymentLink(params);
    const origin = baseOrigin(request);
    return Response.json({
      link: created,
      shareUrl: toLocalShareUrl(created.url, origin),
      sdkShareUrl: created.url,
      apiRequestUrl: toApiPayUrl(created.url, origin),
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawDirection = toOptionalString(url.searchParams.get('direction'));
    const rawLimit = toOptionalString(url.searchParams.get('limit'));
    const direction = rawDirection ? Direction.parse(rawDirection) : undefined;

    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsed = Number(rawLimit);
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(parsed)) {
        return Response.json(
          { error: 'limit must be a positive integer.', code: 'INVALID_PARAMS' },
          { status: 400 },
        );
      }
      limit = parsed;
    }

    const params: PaymentLinksParams = {
      payment_id: toOptionalString(url.searchParams.get('payment_id')),
      direction,
      chain: toOptionalString(url.searchParams.get('chain')),
      limit,
    };
    const listed = await money.listPaymentLinks(params);
    const origin = baseOrigin(request);
    const entries = listed.entries.map((entry) => toEntryView(entry, origin));

    return Response.json({
      entries,
      note: listed.note,
      filters: params,
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
