import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fast } from '../src/client.js';
import { FastError } from '../src/errors.js';

let tmpDir: string;
let originalConfigDir: string | undefined;

before(async () => {
  originalConfigDir = process.env.FAST_CONFIG_DIR;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-client-test-'));
  process.env.FAST_CONFIG_DIR = tmpDir;
});

after(async () => {
  if (originalConfigDir !== undefined) {
    process.env.FAST_CONFIG_DIR = originalConfigDir;
  } else {
    delete process.env.FAST_CONFIG_DIR;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fast() factory', () => {
  it('returns an object (not null/undefined)', () => {
    const f = fast();
    assert.ok(f !== null && f !== undefined);
  });

  it('returns object with expected method names', () => {
    const f = fast();
    const methods = [
      'setup',
      'balance',
      'send',
      'submit',
      'evmSign',
      'sign',
      'verify',
      'tokens',
      'tokenInfo',
      'exportKeys',
    ];
    for (const method of methods) {
      assert.ok(
        typeof (f as unknown as Record<string, unknown>)[method] === 'function',
        `expected method "${method}" to exist`,
      );
    }
  });

  it('fast({ network: "testnet" }) works without error', () => {
    assert.doesNotThrow(() => fast({ network: 'testnet' }));
  });
});

describe('address before setup', () => {
  it('address is null before calling setup()', () => {
    const f = fast();
    assert.equal(f.address, null);
  });
});

describe('ensureSetup guard', () => {
  it('balance() throws before setup', async () => {
    const f = fast();
    await assert.rejects(
      () => f.balance(),
      (err: unknown) => {
        assert(err instanceof FastError);
        assert.equal(err.code, 'CHAIN_NOT_CONFIGURED');
        return true;
      },
    );
  });

  it('send() throws before setup', async () => {
    const f = fast();
    await assert.rejects(
      () => f.send({ to: 'fast1abc', amount: '1.0' }),
      (err: unknown) => {
        assert(err instanceof FastError);
        assert.equal(err.code, 'CHAIN_NOT_CONFIGURED');
        return true;
      },
    );
  });

  it('exportKeys() throws before setup', async () => {
    const f = fast();
    await assert.rejects(
      () => f.exportKeys(),
      (err: unknown) => {
        assert(err instanceof FastError);
        assert.equal(err.code, 'CHAIN_NOT_CONFIGURED');
        return true;
      },
    );
  });
});

describe('setup()', () => {
  it('returns { address: string } where address starts with "fast1"', async () => {
    const f = fast();
    const result = await f.setup();
    assert.ok(typeof result.address === 'string');
    assert.ok(result.address.startsWith('fast1'), `expected address to start with "fast1", got "${result.address}"`);
  });

  it('after setup, client.address is not null', async () => {
    const f = fast();
    await f.setup();
    assert.notEqual(f.address, null);
  });

  it('after setup, client.address matches the returned address', async () => {
    const f = fast();
    const result = await f.setup();
    assert.equal(f.address, result.address);
  });

  it('creates a keyfile at path.join(tmpDir, "keys", "fast.json")', async () => {
    const f = fast();
    await f.setup();
    const keyfilePath = path.join(tmpDir, 'keys', 'fast.json');
    const stat = await fs.stat(keyfilePath);
    assert.ok(stat.isFile(), `expected keyfile at ${keyfilePath}`);
  });

  it('creates a config at path.join(tmpDir, "config.json")', async () => {
    const f = fast();
    await f.setup();
    const configPath = path.join(tmpDir, 'config.json');
    const stat = await fs.stat(configPath);
    assert.ok(stat.isFile(), `expected config at ${configPath}`);
  });
});

describe('setup() idempotency', () => {
  it('returns same address on second call', async () => {
    const f = fast();
    const first = await f.setup();
    const second = await f.setup();
    assert.equal(first.address, second.address);
  });
});

describe('exportKeys()', () => {
  it('after setup, returns { publicKey: string, address: string }', async () => {
    const f = fast();
    await f.setup();
    const keys = await f.exportKeys();
    assert.ok(typeof keys.publicKey === 'string');
    assert.ok(typeof keys.address === 'string');
  });

  it('publicKey is 64 hex chars', async () => {
    const f = fast();
    await f.setup();
    const { publicKey } = await f.exportKeys();
    assert.match(publicKey, /^[0-9a-f]{64}$/, `expected 64 hex chars, got "${publicKey}"`);
  });

  it('address matches client.address', async () => {
    const f = fast();
    await f.setup();
    const { address } = await f.exportKeys();
    assert.equal(address, f.address);
  });
});

describe('sign() / verify() roundtrip', () => {
  it('sign then verify roundtrip', async () => {
    const f = fast();
    await f.setup();
    const { signature, address } = await f.sign({ message: 'hello' });
    const { valid } = await f.verify({ message: 'hello', signature, address });
    assert.equal(valid, true);
  });

  it('verify fails with wrong message', async () => {
    const f = fast();
    await f.setup();
    const { signature, address } = await f.sign({ message: 'hello' });
    const { valid } = await f.verify({ message: 'wrong', signature, address });
    assert.equal(valid, false);
  });
});
