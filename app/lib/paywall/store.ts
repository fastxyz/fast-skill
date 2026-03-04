import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolConfig } from 'pg';
import type { PaywallReceiverAccountRecord, PaywallStoreData } from './types';

const g = globalThis as typeof globalThis & {
  __moneyPaywallStoreWriteQueue?: Promise<void>;
  __moneyPaywallPgPool?: Pool;
  __moneyPaywallPgInitPromise?: Promise<void>;
};

type StoreDriver = 'file' | 'postgres';

const POSTGRES_TABLE = 'money_paywall_store';
const POSTGRES_STORE_KEY = process.env.PAYWALL_POSTGRES_STORE_KEY?.trim() || 'default';
const POSTGRES_LOCK_ID = '812947563281447303';
const STORE_DRIVER = resolveStoreDriver();

function resolveStoreDriver(): StoreDriver {
  const value = process.env.PAYWALL_STORE_DRIVER?.trim().toLowerCase() || 'file';
  if (value === 'file' || value === 'postgres') {
    return value;
  }
  throw new Error(`Unsupported PAYWALL_STORE_DRIVER "${value}". Use "file" or "postgres".`);
}

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

function sanitizeSeenMap(input: unknown): Record<string, true> {
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

function normalizeStore(parsed: unknown): PaywallStoreData {
  const casted = parsed as Partial<PaywallStoreData> | null | undefined;
  if (!casted || casted.version !== 1) {
    return defaultStore();
  }
  return {
    version: 1,
    products: casted.products ?? {},
    products_by_slug: casted.products_by_slug ?? {},
    assets: casted.assets ?? {},
    receiver_accounts: sanitizeReceiverAccounts(casted.receiver_accounts),
    intents: casted.intents ?? {},
    payment_events: casted.payment_events ?? {},
    unlock_grants: casted.unlock_grants ?? {},
    seen_transfers: sanitizeSeenMap(casted.seen_transfers),
    seen_webhook_events: sanitizeSeenMap(casted.seen_webhook_events),
  };
}

function resolvePostgresUrl(): string {
  const url = process.env.PAYWALL_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim()
    || '';
  if (!url) {
    throw new Error(
      'PAYWALL_STORE_DRIVER=postgres requires PAYWALL_DATABASE_URL or DATABASE_URL.',
    );
  }
  return url;
}

function shouldAllowInsecurePostgresTls(): boolean {
  const value = process.env.PAYWALL_DATABASE_SSL_INSECURE_SKIP_VERIFY
    ?.trim()
    .toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function resolvePostgresSslConfig(): PoolConfig['ssl'] {
  const sslMode = process.env.PAYWALL_DATABASE_SSL?.trim().toLowerCase();
  if (sslMode !== 'require') {
    return undefined;
  }
  if (shouldAllowInsecurePostgresTls()) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

function getPostgresPool(): Pool {
  if (!g.__moneyPaywallPgPool) {
    g.__moneyPaywallPgPool = new Pool({
      connectionString: resolvePostgresUrl(),
      ssl: resolvePostgresSslConfig(),
    });
  }
  return g.__moneyPaywallPgPool;
}

async function ensurePostgresStoreReady(): Promise<void> {
  if (!g.__moneyPaywallPgInitPromise) {
    g.__moneyPaywallPgInitPromise = (async () => {
      const pool = getPostgresPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${POSTGRES_TABLE} (
          store_key text PRIMARY KEY,
          store_data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await pool.query(
        `
          INSERT INTO ${POSTGRES_TABLE} (store_key, store_data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (store_key) DO NOTHING;
        `,
        [POSTGRES_STORE_KEY, JSON.stringify(defaultStore())],
      );
    })().catch((err: unknown) => {
      g.__moneyPaywallPgInitPromise = undefined;
      throw err;
    });
  }
  await g.__moneyPaywallPgInitPromise;
}

async function readFileStore(): Promise<PaywallStoreData> {
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

  const parsed = JSON.parse(raw) as unknown;
  return normalizeStore(parsed);
}

async function writeFileStore(store: PaywallStoreData): Promise<void> {
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

async function readPostgresStore(): Promise<PaywallStoreData> {
  await ensurePostgresStoreReady();
  const pool = getPostgresPool();
  const result = await pool.query<{ store_data: unknown }>(
    `
      SELECT store_data
      FROM ${POSTGRES_TABLE}
      WHERE store_key = $1
      LIMIT 1;
    `,
    [POSTGRES_STORE_KEY],
  );
  if (result.rowCount === 0) {
    return defaultStore();
  }
  return normalizeStore(result.rows[0]?.store_data);
}

async function mutatePostgresStore<T>(
  mutator: (store: PaywallStoreData) => Promise<T> | T,
): Promise<T> {
  await ensurePostgresStoreReady();
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint);', [POSTGRES_LOCK_ID]);
    const readResult = await client.query<{ store_data: unknown }>(
      `
        SELECT store_data
        FROM ${POSTGRES_TABLE}
        WHERE store_key = $1
        FOR UPDATE;
      `,
      [POSTGRES_STORE_KEY],
    );

    const store = normalizeStore(readResult.rows[0]?.store_data);
    const result = await mutator(store);

    await client.query(
      `
        INSERT INTO ${POSTGRES_TABLE} (store_key, store_data, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (store_key) DO UPDATE
        SET store_data = EXCLUDED.store_data,
            updated_at = now();
      `,
      [POSTGRES_STORE_KEY, JSON.stringify(store)],
    );

    await client.query('COMMIT');
    return result;
  } catch (err: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failures
    }
    throw err;
  } finally {
    client.release();
  }
}

async function readFromStore(): Promise<PaywallStoreData> {
  if (STORE_DRIVER === 'postgres') {
    return readPostgresStore();
  }
  return readFileStore();
}

async function mutateWithStore<T>(
  mutator: (store: PaywallStoreData) => Promise<T> | T,
): Promise<T> {
  if (STORE_DRIVER === 'postgres') {
    return mutatePostgresStore(mutator);
  }
  const store = await readFileStore();
  const result = await mutator(store);
  await writeFileStore(store);
  return result;
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
  return readFromStore();
}

export async function mutatePaywallStore<T>(
  mutator: (store: PaywallStoreData) => Promise<T> | T,
): Promise<T> {
  let result!: T;
  const task = getWriteQueue().then(async () => {
    result = await mutateWithStore(mutator);
  });
  setWriteQueue(task.catch(() => undefined));
  await task;
  return result;
}
