import type { ProviderPaymentStatus } from './types';

type ProviderStatusRecord = {
  status: ProviderPaymentStatus;
  updatedAt: string;
  raw?: unknown;
};

const g = globalThis as typeof globalThis & {
  __moneyDemoProviderStatus?: Map<string, ProviderStatusRecord>;
};

function getStore(): Map<string, ProviderStatusRecord> {
  if (!g.__moneyDemoProviderStatus) {
    g.__moneyDemoProviderStatus = new Map();
  }
  return g.__moneyDemoProviderStatus;
}

export function setMockProviderStatus(
  providerReference: string,
  status: ProviderPaymentStatus,
  raw?: unknown,
): ProviderStatusRecord {
  const record: ProviderStatusRecord = {
    status,
    updatedAt: new Date().toISOString(),
    raw,
  };
  getStore().set(providerReference, record);
  return record;
}

export function getMockProviderStatus(providerReference: string): ProviderStatusRecord | null {
  return getStore().get(providerReference) ?? null;
}

