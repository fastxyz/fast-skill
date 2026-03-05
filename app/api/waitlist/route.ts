import { NextRequest, NextResponse } from 'next/server';

type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
};

const DEFAULT_WAITLIST_ENDPOINT = 'https://sheetdb.io/api/v1/k795qny6qgb93';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLocalRequest(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function isCaptchaEnabled(): boolean {
  const flag = (
    process.env.WAITLIST_CAPTCHA_ENABLED ||
    process.env.NEXT_PUBLIC_WAITLIST_CAPTCHA_ENABLED ||
    ''
  ).trim().toLowerCase();
  return ENABLED_VALUES.has(flag);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; token?: string };
    const email = body.email?.trim() ?? '';
    const token = body.token?.trim() ?? '';
    const localBypass = process.env.NODE_ENV === 'development' || isLocalRequest(request.nextUrl.hostname);
    const captchaRequired = isCaptchaEnabled() && !localBypass;

    if (!email || (!token && captchaRequired)) {
      return NextResponse.json(
        { message: 'Email and captcha token are required.' },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (captchaRequired) {
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
