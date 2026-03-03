import type { PaymentLinkProvider, SettlementChain } from '../types';

export type ProviderCheckoutMode = 'direct-api' | 'hosted-checkout' | 'external';
export type ProviderPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'unknown';

export interface CreatePaymentLinkInput {
  baseUrl: string;
  intentId: string;
  receiver: string;
  amount: string;
  settlementChain: SettlementChain;
}

export interface CreatePaymentLinkResult {
  url: string;
  providerReference?: string;
}

export interface ProviderStatusResult {
  status: ProviderPaymentStatus;
  raw?: unknown;
}

export interface ProviderWebhookResult {
  status: ProviderPaymentStatus;
  providerReference?: string;
  raw?: unknown;
}

export interface PaymentLinkProviderAdapter {
  id: PaymentLinkProvider;
  mode: ProviderCheckoutMode;
  createLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>;
  getStatus?(providerReference: string): Promise<ProviderStatusResult>;
  parseWebhook?(
    payload: unknown,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<ProviderWebhookResult>;
}

