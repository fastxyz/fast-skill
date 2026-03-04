import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  paywallErrorResponse,
  setPaywallBuyerCookie,
} from '../../../lib/paywall/api-utils';
import {
  createPaywallBuyerId,
  createPaywallIntent,
  PAYWALL_BUYER_COOKIE,
} from '../../../lib/paywall/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateIntentBody = z.object({
  productSlug: z.string().min(1),
  buyerId: z.string().min(1).optional(),
  expiryMinutes: z.number().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const body = CreateIntentBody.parse(await request.json().catch(() => ({})));
    const cookieStore = await cookies();
    const cookieBuyerId = cookieStore.get(PAYWALL_BUYER_COOKIE)?.value;
    const buyerId = body.buyerId?.trim() || cookieBuyerId || await createPaywallBuyerId();

    const baseUrl = new URL(request.url).origin;
    const created = await createPaywallIntent({
      productSlug: body.productSlug,
      buyerId,
      baseUrl,
      expiryMinutes: body.expiryMinutes,
    });

    const response = NextResponse.json({
      ...created,
      checkoutUrl: `${baseUrl}/paywall/${created.product.slug}?intentId=${created.intent.intentId}`,
    }, { status: 201 });
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
