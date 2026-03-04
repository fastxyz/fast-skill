import { NextResponse } from 'next/server';
import { z } from 'zod';
import { paywallErrorResponse } from '../../../../lib/paywall/api-utils';
import {
  applyPaywallWebhookEvent,
  PaywallError,
  type PaywallWebhookStatus,
} from '../../../../lib/paywall/service';
import { verifyPaywallWebhookSignature } from '../../../../lib/paywall/webhook-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PaywallWebhookBody = z.object({
  eventId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  intentId: z.string().min(1).optional(),
  status: z.string().min(1),
  amountRaw: z.union([z.string(), z.number()]).optional(),
  txHash: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  occurredAt: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

function normalizeWebhookStatus(input: string): PaywallWebhookStatus {
  const status = input.trim().toLowerCase();
  if (status === 'settled' || status === 'paid' || status === 'succeeded' || status === 'completed') {
    return 'settled';
  }
  if (status === 'failed' || status === 'failure' || status === 'canceled' || status === 'cancelled') {
    return 'failed';
  }
  if (status === 'expired') {
    return 'expired';
  }
  if (status === 'pending' || status === 'processing') {
    return 'pending';
  }
  throw new PaywallError('INVALID_PARAMS', `Unsupported webhook status "${input}".`, 400);
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeAmountRaw(
  amountRaw: string | number | undefined,
): string | undefined {
  if (amountRaw === undefined) return undefined;
  if (typeof amountRaw === 'number') {
    if (!Number.isFinite(amountRaw) || amountRaw < 0 || !Number.isSafeInteger(amountRaw)) {
      throw new PaywallError('INVALID_PARAMS', 'amountRaw number must be a non-negative safe integer.');
    }
    return amountRaw.toString();
  }
  return amountRaw;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await context.params;
    const providerId = provider?.trim().toLowerCase();
    if (!providerId) {
      throw new PaywallError('INVALID_PARAMS', 'Webhook provider is required.', 400);
    }

    const rawBody = await request.text().catch(() => '');
    verifyPaywallWebhookSignature({
      provider: providerId,
      rawBody,
      signatureHeader: request.headers.get('x-paywall-signature'),
      timestampHeader: request.headers.get('x-paywall-timestamp'),
    });

    let rawPayload: unknown = {};
    if (rawBody.trim()) {
      try {
        rawPayload = JSON.parse(rawBody) as unknown;
      } catch {
        throw new PaywallError('INVALID_PARAMS', 'Webhook payload must be valid JSON.', 400);
      }
    }
    const body = PaywallWebhookBody.parse(rawPayload);

    const intentId = body.intentId?.trim()
      || request.headers.get('x-paywall-intent-id')?.trim()
      || readStringMetadata(body.metadata, 'intentId', 'intent_id', 'paywall_intent_id');
    if (!intentId) {
      throw new PaywallError(
        'INVALID_PARAMS',
        'intentId is required in payload (or metadata.intentId / x-paywall-intent-id).',
        400,
      );
    }

    const eventId = body.eventId?.trim()
      || body.id?.trim()
      || request.headers.get('x-paywall-event-id')?.trim();
    if (!eventId) {
      throw new PaywallError(
        'INVALID_PARAMS',
        'eventId is required in payload (or id / x-paywall-event-id).',
        400,
      );
    }

    const applied = await applyPaywallWebhookEvent({
      provider: providerId,
      eventId,
      intentId,
      status: normalizeWebhookStatus(body.status),
      amountRaw: normalizeAmountRaw(body.amountRaw),
      txHash: body.txHash,
      reason: body.reason,
      occurredAt: body.occurredAt,
    });

    return NextResponse.json({
      ok: true,
      provider: providerId,
      eventId,
      intentId,
      ...applied,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid webhook payload', details: err.flatten(), code: 'INVALID_PARAMS' },
        { status: 400 },
      );
    }
    return paywallErrorResponse(err);
  }
}
