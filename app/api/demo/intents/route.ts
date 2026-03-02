import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createPaymentIntent,
  DEMO_DEFAULTS,
  DemoError,
  ensureBuyerSession,
  listPaymentIntents,
} from '../../../lib/demo/service';
import type { SettlementChain } from '../../../lib/demo/types';

const DEMO_SESSION_COOKIE = 'money_demo_session_id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(err: unknown) {
  if (err instanceof DemoError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const intents = await listPaymentIntents();
    return NextResponse.json({
      intents,
      defaults: DEMO_DEFAULTS,
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      buyerSessionId?: string;
      serviceId?: string;
      amount?: string | number;
      expiryMinutes?: number;
      settlementChain?: SettlementChain;
    };

    const cookieStore = await cookies();
    const cookieSessionId = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
    const session = await ensureBuyerSession(body.buyerSessionId ?? cookieSessionId);

    const intent = await createPaymentIntent({
      buyerSessionId: session.sessionId,
      serviceId: body.serviceId,
      amount: body.amount ?? '10',
      expiryMinutes: body.expiryMinutes,
      settlementChain: body.settlementChain,
      baseUrl: new URL(request.url).origin,
    });

    const response = NextResponse.json({
      intent,
      session,
    });
    response.cookies.set(DEMO_SESSION_COOKIE, session.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
