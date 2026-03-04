import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface UnlockTokenPayload {
  grant_id: string;
  intent_id: string;
  asset_id: string;
  sub: string;
  iat: number;
  exp: number;
}

function requireSecret(): string {
  const secret = process.env.PAYWALL_UNLOCK_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing PAYWALL_UNLOCK_SECRET');
  }
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(normalized, 'base64');
}

function sign(data: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(data).digest());
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueUnlockToken(params: {
  grantId: string;
  intentId: string;
  assetId: string;
  subject: string;
  ttlSeconds: number;
}): { token: string; payload: UnlockTokenPayload } {
  const secret = requireSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: UnlockTokenPayload = {
    grant_id: params.grantId,
    intent_id: params.intentId,
    asset_id: params.assetId,
    sub: params.subject,
    iat: now,
    exp: now + params.ttlSeconds,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerPart}.${payloadPart}`;
  const signature = sign(data, secret);
  return {
    token: `${data}.${signature}`,
    payload,
  };
}

export function verifyUnlockToken(token: string): UnlockTokenPayload {
  const secret = requireSecret();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid unlock token format');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const expectedSig = sign(data, secret);

  const givenSigBytes = Buffer.from(signaturePart);
  const expectedSigBytes = Buffer.from(expectedSig);
  if (
    givenSigBytes.length !== expectedSigBytes.length
    || !timingSafeEqual(givenSigBytes, expectedSigBytes)
  ) {
    throw new Error('Invalid unlock token signature');
  }

  let payload: UnlockTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf-8')) as UnlockTokenPayload;
  } catch {
    throw new Error('Invalid unlock token payload');
  }
  if (!payload?.grant_id || !payload?.intent_id || !payload?.asset_id || !payload?.sub) {
    throw new Error('Unlock token payload is missing required claims');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || now >= payload.exp) {
    throw new Error('Unlock token expired');
  }
  return payload;
}

