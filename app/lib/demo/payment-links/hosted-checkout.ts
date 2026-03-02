import type { PaymentLinkProvider } from '../types';
import { getMockProviderStatus, setMockProviderStatus } from './mock-status';
import type { PaymentLinkProviderAdapter } from './types';

function normalizeProviderStatus(value: unknown) {
  if (typeof value !== 'string') return 'unknown' as const;
  const lower = value.toLowerCase();
  if (lower === 'paid' || lower === 'completed' || lower === 'succeeded') return 'paid' as const;
  if (lower === 'failed' || lower === 'canceled') return 'failed' as const;
  if (lower === 'expired') return 'expired' as const;
  if (lower === 'pending' || lower === 'processing') return 'pending' as const;
  if (lower === 'payment_intent.succeeded' || lower === 'checkout.session.completed') return 'paid' as const;
  if (lower === 'payment_intent.payment_failed') return 'failed' as const;
  return 'unknown' as const;
}

function readProviderReference(
  providerId: Extract<PaymentLinkProvider, 'coinbase' | 'stripe'>,
  payload: unknown,
): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const row = payload as Record<string, unknown>;
  const fromPayload = row.providerReference ?? row.provider_ref ?? row.reference ?? row.ref;
  if (typeof fromPayload === 'string' && fromPayload.length > 0) {
    return fromPayload;
  }
  const intentId = row.intentId ?? row.intent_id;
  if (typeof intentId === 'string' && intentId.length > 0) {
    return `${providerId}:checkout:${intentId}`;
  }
  return undefined;
}

function createHostedCheckoutProvider(id: Extract<PaymentLinkProvider, 'coinbase' | 'stripe'>): PaymentLinkProviderAdapter {
  return {
    id,
    mode: 'hosted-checkout',
    async createLink(input) {
      const checkoutUrl = new URL('/merchant/checkout', input.baseUrl);
      checkoutUrl.searchParams.set('intentId', input.intentId);
      checkoutUrl.searchParams.set('provider', id);
      return {
        url: checkoutUrl.toString(),
        providerReference: `${id}:checkout:${input.intentId}`,
      };
    },
    async getStatus(providerReference) {
      const status = getMockProviderStatus(providerReference);
      return {
        status: status?.status ?? 'pending',
        raw: status?.raw,
      };
    },
    async parseWebhook(payload) {
      const providerReference = readProviderReference(id, payload);
      if (!providerReference) {
        return {
          status: 'unknown',
          raw: payload,
        };
      }
      const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const status = normalizeProviderStatus(row.status ?? row.event ?? 'paid');
      setMockProviderStatus(providerReference, status, payload);
      return {
        status,
        providerReference,
        raw: payload,
      };
    },
  };
}

export const coinbaseMockPaymentLinkProvider = createHostedCheckoutProvider('coinbase');
export const stripeMockPaymentLinkProvider = createHostedCheckoutProvider('stripe');
