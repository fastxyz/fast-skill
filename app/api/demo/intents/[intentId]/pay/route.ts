import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  DEMO_SESSION_COOKIE,
  demoErrorResponse,
  setDemoSessionCookie,
} from '../../../../../lib/demo/api-utils';
import { ensureBuyerSession, payIntent } from '../../../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ intentId: string }> },
) {
  try {
    const { intentId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      amount?: string | number;
    };

    const cookieStore = await cookies();
    const cookieSessionId = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
    const session = await ensureBuyerSession(cookieSessionId);

    const intent = await payIntent({
      intentId,
      buyerSessionId: session.sessionId,
      amount: body.amount,
    });

    const response = NextResponse.json({ intent, session });
    setDemoSessionCookie(response, session.sessionId);
    return response;
  } catch (err: unknown) {
    return demoErrorResponse(err);
  }
}
