import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DemoError, ensureBuyerSession, payIntent } from '../../../../../lib/demo/service';

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

