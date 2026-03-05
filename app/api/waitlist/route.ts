import { NextRequest, NextResponse } from 'next/server';

type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
};

const DEFAULT_WAITLIST_ENDPOINT = 'https://sheetdb.io/api/v1/k795qny6qgb93';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; token?: string };
    const email = body.email?.trim() ?? '';
    const token = body.token?.trim() ?? '';

    if (!email || !token) {
      return NextResponse.json(
        { message: 'Email and captcha token are required.' },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (process.env.NODE_ENV !== 'development') {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret) {
        return NextResponse.json({ message: 'Captcha is not configured on the server.' }, { status: 500 });
      }

      const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: token,
        }).toString(),
      });

      const verifyData = (await verifyResponse.json().catch(() => ({}))) as TurnstileResponse;
      if (!verifyData.success) {
        return NextResponse.json(
          { message: 'Captcha verification failed. Please try again.' },
          { status: 400 },
        );
      }
    }

    const waitlistEndpoint = process.env.WAITLIST_SHEETDB_URL || DEFAULT_WAITLIST_ENDPOINT;
    const saveResponse = await fetch(waitlistEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { email } }),
    });

    if (!saveResponse.ok) {
      return NextResponse.json({ message: 'Failed to save email. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Success' });
  } catch {
    return NextResponse.json(
      { message: 'Unexpected error while processing waitlist signup.' },
      { status: 500 },
    );
  }
}
