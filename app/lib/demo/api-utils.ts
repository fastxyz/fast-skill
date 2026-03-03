import { NextResponse } from 'next/server';
import { DemoError } from './service';

export const DEMO_SESSION_COOKIE = 'money_demo_session_id';

export function setDemoSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(DEMO_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function demoErrorResponse(err: unknown) {
  if (err instanceof DemoError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}
