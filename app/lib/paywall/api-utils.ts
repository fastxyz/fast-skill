import { NextResponse } from 'next/server';
import { PAYWALL_BUYER_COOKIE, PaywallError } from './service';

export function setPaywallBuyerCookie(response: NextResponse, buyerId: string): void {
  response.cookies.set(PAYWALL_BUYER_COOKIE, buyerId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function paywallErrorResponse(err: unknown) {
  if (err instanceof PaywallError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
}
