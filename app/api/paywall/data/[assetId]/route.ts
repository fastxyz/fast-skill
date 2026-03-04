import { NextResponse } from 'next/server';
import { paywallErrorResponse } from '../../../../lib/paywall/api-utils';
import { PaywallError, consumePaywallUnlockToken } from '../../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readUnlockToken(request: Request): string | null {
  const auth = request.headers.get('authorization')?.trim();
  if (auth) {
    const [scheme, token] = auth.split(/\s+/, 2);
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params;
    const token = readUnlockToken(request);
    if (!token) {
      throw new PaywallError(
        'UNAUTHORIZED',
        'Missing unlock token. Use Authorization: Bearer <token>.',
        401,
      );
    }

    const unlocked = await consumePaywallUnlockToken({
      assetId,
      token,
    });

    return new Response(unlocked.asset.payload, {
      headers: {
        'Content-Type': unlocked.asset.content_type,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Paywall-Intent-Id': unlocked.intent.intentId,
      },
    });
  } catch (err: unknown) {
    return paywallErrorResponse(err);
  }
}
