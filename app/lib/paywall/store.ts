import fs from 'node:fs/promises';
import path from 'node:path';
import type { PaywallReceiverAccountRecord, PaywallStoreData } from './types';

const g = globalThis as typeof globalThis & {
  __moneyPaywallStoreWriteQueue?: Promise<void>;
};

function defaultStoreDir(): string {
  const tmpDir = process.env.TMPDIR?.trim() || '/tmp';
  return path.join(tmpDir, 'money-paywall');
}

export function resolvePaywallStorePath(): string {
  if (process.env.PAYWALL_STORE_PATH?.trim()) {
    return process.env.PAYWALL_STORE_PATH.trim();
  }
  return path.join(defaultStoreDir(), 'paywall-store.json');
}

export function resolvePaywallStoreDir(): string {
  return path.dirname(resolvePaywallStorePath());
}

function sanitizeReceiverAccounts(
  input: Partial<PaywallStoreData>['receiver_accounts'],
): Record<string, PaywallReceiverAccountRecord> {
  const sanitized: Record<string, PaywallReceiverAccountRecord> = {};
  for (const [id, value] of Object.entries(input ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as unknown as Record<string, unknown>;
    const receiverAccountId = typeof raw.receiver_account_id === 'string'
      ? raw.receiver_account_id
      : id;
    const address = typeof raw.address === 'string' ? raw.address : '';
    const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
    const privateKeyRef = typeof raw.private_key_ref === 'string'
      ? raw.private_key_ref
      : undefined;
    sanitized[id] = {
      receiver_account_id: receiverAccountId,
      address,
      created_at: createdAt,
      ...(privateKeyRef ? { private_key_ref: privateKeyRef } : {}),
    };
  }
  return sanitized;
}

function sanitizeSeenMap(
  input: unknown,
): Record<string, true> {
  const sanitized: Record<string, true> = {};
  if (!input || typeof input !== 'object') return sanitized;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === true) {
      sanitized[key] = true;
    }
  }
  return sanitized;
}

function defaultStore(): PaywallStoreData {
  return {
    version: 1,
    products: {},
    products_by_slug: {},
    assets: {},
    receiver_accounts: {},
    intents: {},
    payment_events: {},
    unlock_grants: {},
    seen_transfers: {},
    seen_webhook_events: {},
  };
}

async function readFromDisk(): Promise<PaywallStoreData> {
  const filePath = resolvePaywallStorePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultStore();
    }
    throw err;
  }

  const parsed = JSON.parse(raw) as Partial<PaywallStoreData>;
  if (!parsed || parsed.version !== 1) {
    return defaultStore();
  }
  return {
    version: 1,
    products: parsed.products ?? {},
    products_by_slug: parsed.products_by_slug ?? {},
    assets: parsed.assets ?? {},
    receiver_accounts: sanitizeReceiverAccounts(parsed.receiver_accounts),
    intents: parsed.intents ?? {},
    payment_events: parsed.payment_events ?? {},
    unlock_grants: parsed.unlock_grants ?? {},
    seen_transfers: sanitizeSeenMap(parsed.seen_transfers),
    seen_webhook_events: sanitizeSeenMap(parsed.seen_webhook_events),
  };
}

async function writeToDisk(store: PaywallStoreData): Promise<void> {
  const filePath = resolvePaywallStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    await fs.rename(tmpPath, filePath);
  } catch (err: unknown) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

function getWriteQueue(): Promise<void> {
  if (!g.__moneyPaywallStoreWriteQueue) {
    g.__moneyPaywallStoreWriteQueue = Promise.resolve();
  }
  return g.__moneyPaywallStoreWriteQueue;
}

function setWriteQueue(queue: Promise<void>): void {
  g.__moneyPaywallStoreWriteQueue = queue;
}

export async function readPaywallStore(): Promise<PaywallStoreData> {
  await getWriteQueue();
  return readFromDisk();
}

export async function mutatePaywallStore<T>(
  mutator: (store: PaywallStoreData) => Promise<T> | T,
): Promise<T> {
  let result!: T;
  const task = getWriteQueue().then(async () => {
    const store = await readFromDisk();
    result = await mutator(store);
    await writeToDisk(store);
  });
  setWriteQueue(task.catch(() => undefined));
  await task;
  return result;
}
