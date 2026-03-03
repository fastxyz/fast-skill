import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  DEMO_SESSION_COOKIE,
  demoErrorResponse,
  setDemoSessionCookie,
} from '../../../lib/demo/api-utils';
import {
  createPaymentIntent,
  DEMO_DEFAULTS,
  ensureBuyerSession,
  listPaymentIntents,
} from '../../../lib/demo/service';
import type { SettlementChain } from '../../../lib/demo/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const intents = await listPaymentIntents();
    return NextResponse.json({
      intents,
      defaults: DEMO_DEFAULTS,
    });
  } catch (err: unknown) {
    return demoErrorResponse(err);
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
    setDemoSessionCookie(response, session.sessionId);
    return response;
  } catch (err: unknown) {
    return demoErrorResponse(err);
  }
}
