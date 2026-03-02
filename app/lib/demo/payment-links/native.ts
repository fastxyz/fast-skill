import type { PaymentLinkProviderAdapter } from './types';

export const nativePaymentLinkProvider: PaymentLinkProviderAdapter = {
  id: 'native',
  mode: 'hosted-checkout',
  async createLink(input) {
    const url = new URL('/merchant/checkout', input.baseUrl);
    url.searchParams.set('intentId', input.intentId);
    return { url: url.toString() };
  },
};
