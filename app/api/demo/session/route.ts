import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ensureBuyerSession } from '../../../lib/demo/service';

const DEMO_SESSION_COOKIE = 'money_demo_session_id';

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
  response.cookies.set(DEMO_SESSION_COOKIE, session.sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function POST() {
  const session = await getOrCreateSession();
  const response = NextResponse.json({ session });
  response.cookies.set(DEMO_SESSION_COOKIE, session.sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

