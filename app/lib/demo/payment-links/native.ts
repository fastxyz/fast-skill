import type { PaymentLinkProviderAdapter } from './types';
import type { SettlementChain } from '../types';

function settlementToken(chain: SettlementChain): 'SET' | 'WSET' {
  return chain === 'fast' ? 'SET' : 'WSET';
}

function settlementNetwork(_chain: SettlementChain): 'testnet' {
  return 'testnet';
}

function settlementPaymentChain(chain: SettlementChain): 'fast' | 'arbitrum' {
  return chain === 'fast' ? 'fast' : 'arbitrum';
}

export function createNativeAgentLink(input: {
  baseUrl: string;
  intentId: string;
  receiver: string;
  amount: string;
  settlementChain: SettlementChain;
}): string {
  const url = new URL('/api/pay', input.baseUrl);
  url.searchParams.set('receiver', input.receiver);
  url.searchParams.set('amount', input.amount);
  url.searchParams.set('chain', settlementPaymentChain(input.settlementChain));
  url.searchParams.set('token', settlementToken(input.settlementChain));
  url.searchParams.set('network', settlementNetwork(input.settlementChain));
  url.searchParams.set('memo', `intent:${input.intentId}`);
  return url.toString();
}

export const nativePaymentLinkProvider: PaymentLinkProviderAdapter = {
  id: 'native',
  mode: 'hosted-checkout',
  async createLink(input) {
    const url = new URL('/merchant/checkout', input.baseUrl);
    url.searchParams.set('intentId', input.intentId);
    return { url: url.toString() };
  },
};
