import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  paywallErrorResponse,
  setPaywallBuyerCookie,
} from '../../../../../lib/paywall/api-utils';
import {
  PAYWALL_BUYER_COOKIE,
  PaywallError,
  issuePaywallUnlockGrant,
} from '../../../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UnlockIntentBody = z.object({
  buyerId: z.string().min(1).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const body = UnlockIntentBody.parse(await request.json().catch(() => ({})));

    const cookieStore = await cookies();
    const cookieBuyerId = cookieStore.get(PAYWALL_BUYER_COOKIE)?.value;
    const buyerId = body.buyerId?.trim() || cookieBuyerId;
    if (!buyerId) {
      throw new PaywallError(
        'INVALID_PARAMS',
        'buyerId is required. Provide it in the request body or via paywall session cookie.',
      );
    }

    const unlocked = await issuePaywallUnlockGrant({
      intentId,
      buyerId,
      baseUrl: new URL(request.url).origin,
    });

    const response = NextResponse.json(unlocked);
    setPaywallBuyerCookie(response, buyerId);
    return response;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: err.flatten(), code: 'INVALID_PARAMS' },
        { status: 400 },
      );
    }
    return paywallErrorResponse(err);
  }
}
