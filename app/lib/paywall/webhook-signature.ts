import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaywallError } from './service';

const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

function normalizeProviderForEnv(provider: string): string {
  return provider
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveWebhookSecret(provider: string): string {
  const normalized = normalizeProviderForEnv(provider);
  const specific = normalized
    ? process.env[`PAYWALL_WEBHOOK_SECRET_${normalized}`]?.trim()
    : '';
  const generic = process.env.PAYWALL_WEBHOOK_SECRET?.trim();
  const secret = specific || generic;
  if (!secret) {
    throw new PaywallError(
      'WEBHOOK_NOT_CONFIGURED',
      'Webhook secret is not configured. Set PAYWALL_WEBHOOK_SECRET (or provider-specific PAYWALL_WEBHOOK_SECRET_<PROVIDER>).',
      503,
    );
  }
  return secret;
}

function parseTimestamp(input: string, label: string): number {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    throw new PaywallError('INVALID_SIGNATURE', `${label} must be a Unix timestamp in seconds.`, 401);
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PaywallError('INVALID_SIGNATURE', `${label} must be a valid Unix timestamp.`, 401);
  }
  return Math.floor(value);
}

function normalizeHexDigest(value: string): string {
  const digest = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new PaywallError('INVALID_SIGNATURE', 'Webhook signature must be a 64-char hex SHA-256 digest.', 401);
  }
  return digest;
}

function parseSignatureHeader(input: string): {
  signatures: string[];
  timestampSeconds?: number;
} {
  const raw = input.trim();
  if (!raw) {
    throw new PaywallError('INVALID_SIGNATURE', 'Missing webhook signature header.', 401);
  }

  if (raw.includes('v1=') || raw.includes('t=')) {
    let timestampSeconds: number | undefined;
    const signatures: string[] = [];
    for (const part of raw.split(',')) {
      const [k, ...rest] = part.split('=');
      if (!k || rest.length === 0) continue;
      const key = k.trim();
      const value = rest.join('=').trim();
      if (key === 't' && value) {
        timestampSeconds = parseTimestamp(value, 'Webhook signature timestamp');
      } else if (key === 'v1' && value) {
        signatures.push(normalizeHexDigest(value));
      }
    }
    if (signatures.length === 0) {
      throw new PaywallError('INVALID_SIGNATURE', 'Webhook signature header missing v1 digest.', 401);
    }
    return { signatures, timestampSeconds };
  }

  if (raw.startsWith('sha256=')) {
    return { signatures: [normalizeHexDigest(raw.slice('sha256='.length))] };
  }

  return { signatures: [normalizeHexDigest(raw)] };
}

function webhookToleranceSeconds(): number {
  const raw = Number(process.env.PAYWALL_WEBHOOK_TOLERANCE_SECONDS ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
}

export function verifyPaywallWebhookSignature(params: {
  provider: string;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
}): void {
  const secret = resolveWebhookSecret(params.provider);
  const signatureHeader = params.signatureHeader?.trim() ?? '';
  const parsed = parseSignatureHeader(signatureHeader);

  let timestampSeconds = parsed.timestampSeconds;
  if (params.timestampHeader?.trim()) {
    const explicit = parseTimestamp(params.timestampHeader, 'x-paywall-timestamp');
    if (timestampSeconds !== undefined && timestampSeconds !== explicit) {
      throw new PaywallError('INVALID_SIGNATURE', 'Webhook timestamp headers do not match.', 401);
    }
    timestampSeconds = explicit;
  }

  if (timestampSeconds !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const tolerance = webhookToleranceSeconds();
    if (Math.abs(now - timestampSeconds) > tolerance) {
      throw new PaywallError('INVALID_SIGNATURE', 'Webhook signature timestamp is outside allowed tolerance.', 401);
    }
  }

  const signedPayload = timestampSeconds !== undefined
    ? `${timestampSeconds}.${params.rawBody}`
    : params.rawBody;
  const expectedHex = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');

  let matched = false;
  for (const digest of parsed.signatures) {
    const candidate = Buffer.from(digest, 'hex');
    if (candidate.length !== expected.length) continue;
    if (timingSafeEqual(candidate, expected)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    throw new PaywallError('INVALID_SIGNATURE', 'Webhook signature verification failed.', 401);
  }
}
