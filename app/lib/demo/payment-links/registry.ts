import type { PaymentLinkProvider } from '../types';
import { coinbaseMockPaymentLinkProvider, stripeMockPaymentLinkProvider } from './hosted-checkout';
import { nativePaymentLinkProvider } from './native';
import type { PaymentLinkProviderAdapter } from './types';

export const DEFAULT_PAYMENT_LINK_PROVIDER: PaymentLinkProvider = 'native';

const PROVIDERS: Record<PaymentLinkProvider, PaymentLinkProviderAdapter> = {
  native: nativePaymentLinkProvider,
  coinbase: coinbaseMockPaymentLinkProvider,
  stripe: stripeMockPaymentLinkProvider,
};

export function isPaymentLinkProvider(input: string): input is PaymentLinkProvider {
  return input === 'native' || input === 'coinbase' || input === 'stripe';
}

export function normalizePaymentLinkProvider(input?: string): PaymentLinkProvider {
  if (input && isPaymentLinkProvider(input)) {
    return input;
  }
  return DEFAULT_PAYMENT_LINK_PROVIDER;
}

export function tryGetPaymentLinkProvider(input?: string): PaymentLinkProviderAdapter | null {
  if (!input || !isPaymentLinkProvider(input)) {
    return null;
  }
  return PROVIDERS[input];
}

export function getPaymentLinkProvider(input?: string): PaymentLinkProviderAdapter {
  const id = normalizePaymentLinkProvider(input);
  return PROVIDERS[id];
}

export function listPaymentLinkProviders(): PaymentLinkProvider[] {
  return Object.keys(PROVIDERS) as PaymentLinkProvider[];
}
