import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

type StoreModule = {
  readPaywallStore: () => Promise<Record<string, unknown>>;
  mutatePaywallStore: <T>(
    mutator: (store: Record<string, any>) => Promise<T> | T,
  ) => Promise<T>;
};

type EnvKey =
  | 'PAYWALL_STORE_DRIVER'
  | 'PAYWALL_ALLOW_RUNTIME_DDL'
  | 'PAYWALL_DATABASE_URL'
  | 'DATABASE_URL'
  | 'PAYWALL_POSTGRES_STORE_KEY'
  | 'NODE_ENV';

const ENV_KEYS: EnvKey[] = [
  'PAYWALL_STORE_DRIVER',
  'PAYWALL_ALLOW_RUNTIME_DDL',
  'PAYWALL_DATABASE_URL',
  'DATABASE_URL',
  'PAYWALL_POSTGRES_STORE_KEY',
  'NODE_ENV',
];

const ORIGINAL_ENV = new Map<EnvKey, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const storeSourcePath = path.join(repoRoot, 'app/lib/paywall/store.ts');

let tmpDir = '';
let compiledModulePath = '';

function defaultStoreData(): Record<string, unknown> {
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

function resetGlobals(): void {
  delete (globalThis as any).__moneyPaywallPgPool;
  delete (globalThis as any).__moneyPaywallPgInitPromise;
  delete (globalThis as any).__moneyPaywallStoreWriteQueue;
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function loadStoreModule(): StoreModule {
  delete require.cache[compiledModulePath];
  return require(compiledModulePath) as StoreModule;
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'money-paywall-store-test-'));
  compiledModulePath = path.join(tmpDir, 'paywall-store.cjs');
  await build({
    entryPoints: [storeSourcePath],
    outfile: compiledModulePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    logLevel: 'silent',
  });
});

after(async () => {
  restoreEnv();
  resetGlobals();
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  restoreEnv();
  resetGlobals();
});

afterEach(() => {
  restoreEnv();
  resetGlobals();
});

describe('paywall postgres store runtime safety', () => {
  it('fails with a targeted error when runtime DDL is disabled and table is missing', async () => {
    process.env.PAYWALL_STORE_DRIVER = 'postgres';
    process.env.PAYWALL_ALLOW_RUNTIME_DDL = 'false';
    process.env.NODE_ENV = 'production';

    const poolQueries: string[] = [];
    (globalThis as any).__moneyPaywallPgPool = {
      query: async (sql: string) => {
        poolQueries.push(sql);
        if (sql.includes('to_regclass')) {
          return { rowCount: 1, rows: [{ exists: false }] };
        }
        throw new Error(`Unexpected pool query: ${sql}`);
      },
      connect: async () => {
        throw new Error('connect should not be called for init failure');
      },
    };

    const storeModule = loadStoreModule();
    await assert.rejects(
      () => storeModule.readPaywallStore(),
      /runtime DDL is disabled/i,
    );
    assert.equal(poolQueries.some((sql) => sql.includes('to_regclass')), true);
    assert.equal(poolQueries.some((sql) => sql.includes('CREATE TABLE')), false);
  });

  it('runs CREATE TABLE only when runtime DDL is enabled', async () => {
    process.env.PAYWALL_STORE_DRIVER = 'postgres';
    process.env.PAYWALL_ALLOW_RUNTIME_DDL = 'true';

    const poolQueries: string[] = [];
    (globalThis as any).__moneyPaywallPgPool = {
      query: async (sql: string) => {
        poolQueries.push(sql);
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('ON CONFLICT (store_key) DO NOTHING')) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('SELECT store_data')) {
          return { rowCount: 1, rows: [{ store_data: defaultStoreData() }] };
        }
        throw new Error(`Unexpected pool query: ${sql}`);
      },
      connect: async () => {
        throw new Error('connect should not be called in read test');
      },
    };

    const storeModule = loadStoreModule();
    const store = await storeModule.readPaywallStore();
    assert.equal(store.version, 1);
    assert.equal(poolQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')), true);
    assert.equal(poolQueries.some((sql) => sql.includes('to_regclass')), false);
  });

  it('uses row-level locking without advisory transaction locks during mutation', async () => {
    process.env.PAYWALL_STORE_DRIVER = 'postgres';
    process.env.PAYWALL_ALLOW_RUNTIME_DDL = 'true';

    const poolQueries: string[] = [];
    const clientQueries: string[] = [];
    let released = false;

    const fakeClient = {
      query: async (sql: string) => {
        clientQueries.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rowCount: 0, rows: [] };
        }
        if (
          sql.includes('INSERT INTO money_paywall_store')
          && sql.includes('ON CONFLICT (store_key) DO NOTHING')
        ) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('SELECT store_data') && sql.includes('FOR UPDATE')) {
          return { rowCount: 1, rows: [{ store_data: defaultStoreData() }] };
        }
        if (
          sql.includes('INSERT INTO money_paywall_store')
          && sql.includes('updated_at')
          && sql.includes('ON CONFLICT (store_key) DO UPDATE')
        ) {
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected client query: ${sql}`);
      },
      release: () => {
        released = true;
      },
    };

    (globalThis as any).__moneyPaywallPgPool = {
      query: async (sql: string) => {
        poolQueries.push(sql);
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('ON CONFLICT (store_key) DO NOTHING')) {
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected pool query: ${sql}`);
      },
      connect: async () => fakeClient,
    };

    const storeModule = loadStoreModule();
    const result = await storeModule.mutatePaywallStore((store) => {
      store.seen_webhook_events.evt_1 = true;
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.equal(released, true);
    assert.equal(clientQueries.some((sql) => sql.includes('pg_advisory_xact_lock')), false);
    assert.equal(clientQueries.some((sql) => sql.includes('FOR UPDATE')), true);

    const ensureRowIndex = clientQueries.findIndex(
      (sql) => sql.includes('ON CONFLICT (store_key) DO NOTHING'),
    );
    const lockRowIndex = clientQueries.findIndex((sql) => sql.includes('FOR UPDATE'));
    assert.equal(ensureRowIndex >= 0, true);
    assert.equal(lockRowIndex >= 0, true);
    assert.equal(ensureRowIndex < lockRowIndex, true);

    assert.equal(poolQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')), true);
  });
});

