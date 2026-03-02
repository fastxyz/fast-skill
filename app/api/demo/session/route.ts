import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEMO_SESSION_COOKIE, setDemoSessionCookie } from '../../../lib/demo/api-utils';
import { ensureBuyerSession } from '../../../lib/demo/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getOrCreateSession() {
  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
  return ensureBuyerSession(existingSessionId);
}

export async function GET() {
  const session = await getOrCreateSession();
  const response = NextResponse.json({ session });
  setDemoSessionCookie(response, session.sessionId);
  return response;
}

export async function POST() {
  const session = await getOrCreateSession();
  const response = NextResponse.json({ session });
  setDemoSessionCookie(response, session.sessionId);
  return response;
}
