import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { money, MoneyError } from '../src/index.js';
import { _resetAdapterCache } from '../src/registry.js';

type FetchFn = typeof globalThis.fetch;

const ORIGINAL_CONFIG_DIR = process.env.MONEY_CONFIG_DIR;
const API_URL = 'https://paid.example.com/premium';
const FAST_RPC_URL = 'https://proxy.fastset.xyz';
const RECIPIENT = 'set1ld55rskkecy2wflhf0kmfr82ay937tpq7zwmx978udetmqqt2task3fcxc';

let originalFetch: FetchFn;
let tmpDir: string;

function makeSetTokenId(): Uint8Array {
  const tokenId = new Uint8Array(32);
  tokenId.set([0xfa, 0x57, 0x5e, 0x70], 0);
  return tokenId;
}

function toAssetBase64(tokenId: Uint8Array): string {
  return Buffer.from(tokenId).toString('base64');
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  const target = name.toLowerCase();
  const headers = init?.headers;
  if (!headers) return null;
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === target);
    return found ? found[1] : null;
  }
  const maybeHeaders = headers as { get?: (header: string) => string | null };
  if (typeof maybeHeaders.get === 'function') {
    return maybeHeaders.get(name);
  }
  const headerMap = headers as Record<string, string>;
  for (const [k, v] of Object.entries(headerMap)) {
    if (k.toLowerCase() === target) return v;
  }
  return null;
}

function rpcResponse(result: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
    text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
  } as Response;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'money-x402-test-'));
  process.env.MONEY_CONFIG_DIR = tmpDir;
  originalFetch = globalThis.fetch;
  _resetAdapterCache();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (ORIGINAL_CONFIG_DIR === undefined) {
    delete process.env.MONEY_CONFIG_DIR;
  } else {
    process.env.MONEY_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('money.x402Pay', () => {
  it('uses Fast mainnet config when server requests fastset-mainnet', async () => {
    const setTokenId = makeSetTokenId();
    const setAsset = toAssetBase64(setTokenId);
    const rpcMethods: string[] = [];
    let apiCalls = 0;

    await money.setup({ chain: 'fast', network: 'mainnet' });

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlString === API_URL) {
        apiCalls += 1;
        const xPayment = getHeader(init, 'X-PAYMENT');
        if (!xPayment) {
          const body = {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'fastset-mainnet',
              maxAmountRequired: '1000000000000000000',
              payTo: RECIPIENT,
              asset: setAsset,
            }],
          };
          return {
            ok: false,
            status: 402,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => body,
            text: async () => JSON.stringify(body),
          } as Response;
        }
        const paymentPayload = JSON.parse(Buffer.from(xPayment, 'base64').toString('utf-8')) as {
          network: string;
          payload?: { transactionCertificate?: unknown };
        };
        assert.equal(paymentPayload.network, 'fastset-mainnet');
        assert.ok(paymentPayload.payload?.transactionCertificate, 'expected transactionCertificate in X-PAYMENT payload');
        const body = { delivered: true };
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }

      if (urlString === FAST_RPC_URL) {
        const req = JSON.parse(String(init?.body)) as { method: string };
        rpcMethods.push(req.method);
        if (req.method === 'proxy_getAccountInfo') {
          return rpcResponse({ balance: '0', next_nonce: 3 });
        }
        if (req.method === 'proxy_submitTransaction') {
          return rpcResponse({
            Success: { envelope: { transaction: { nonce: 3 } }, signatures: [] },
          });
        }
        if (req.method === 'proxy_getTokenInfo') {
          return rpcResponse({
            requested_token_metadata: [[Array.from(setTokenId), {
              token_name: 'SET',
              decimals: 18,
              total_supply: '0',
              admin: [],
              mints: [],
              update_id: 0,
            }]],
          });
        }
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    }) as FetchFn;

    const result = await money.x402Pay({ url: API_URL });

    assert.equal(result.success, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payment?.network, 'fastset-mainnet');
    assert.equal(result.payment?.amount, '1');
    assert.equal(result.payment?.amountRaw, '1000000000000000000');
    assert.equal(result.payment?.decimals, 18);
    assert.equal(result.payment?.token, 'SET');
    assert.equal(apiCalls, 2);
    assert.ok(rpcMethods.includes('proxy_getAccountInfo'));
    assert.ok(rpcMethods.includes('proxy_submitTransaction'));
  });

  it('throws INVALID_PARAMS when 402 response omits accepts[].asset', async () => {
    await money.setup({ chain: 'fast' });
    let rpcCalled = false;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString === API_URL) {
        const body = {
          x402Version: 1,
          accepts: [{
            scheme: 'exact',
            network: 'fastset-devnet',
            maxAmountRequired: '1000',
            payTo: RECIPIENT,
          }],
        };
        return {
          ok: false,
          status: 402,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }

      if (typeof init?.body === 'string' && init.body.includes('proxy_')) {
        rpcCalled = true;
      }
      return rpcResponse(null);
    }) as FetchFn;

    await assert.rejects(
      () => money.x402Pay({ url: API_URL }),
      (err: unknown) => {
        assert.ok(err instanceof MoneyError);
        assert.equal(err.code, 'INVALID_PARAMS');
        assert.ok(err.message.includes('Missing asset'));
        return true;
      },
    );
    assert.equal(rpcCalled, false);
  });

  it('returns raw amount when token metadata is unavailable', async () => {
    await money.setup({ chain: 'fast' });
    const tokenId = new Uint8Array(32);
    tokenId.fill(0x42);
    const tokenAsset = toAssetBase64(tokenId);
    const largeRawAmount = '1234567890123456789012345678901234567890';
    let apiCalls = 0;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlString === API_URL) {
        apiCalls += 1;
        if (!getHeader(init, 'X-PAYMENT')) {
          const body = {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'fastset-devnet',
              maxAmountRequired: largeRawAmount,
              payTo: RECIPIENT,
              asset: tokenAsset,
            }],
          };
          return {
            ok: false,
            status: 402,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => body,
            text: async () => JSON.stringify(body),
          } as Response;
        }
        const body = { delivered: true };
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }

      if (urlString === FAST_RPC_URL) {
        const req = JSON.parse(String(init?.body)) as { method: string };
        if (req.method === 'proxy_getAccountInfo') {
          return rpcResponse({ balance: '0', next_nonce: 0 });
        }
        if (req.method === 'proxy_submitTransaction') {
          return rpcResponse({
            Success: { envelope: { transaction: { nonce: 0 } }, signatures: [] },
          });
        }
        if (req.method === 'proxy_getTokenInfo') {
          return rpcResponse({
            requested_token_metadata: [[Array.from(tokenId), null]],
          });
        }
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    }) as FetchFn;

    const result = await money.x402Pay({ url: API_URL });

    assert.equal(result.success, true);
    assert.equal(apiCalls, 2);
    assert.equal(result.payment?.amountRaw, largeRawAmount);
    assert.equal(result.payment?.amount, largeRawAmount);
    assert.equal(result.payment?.decimals, null);
    assert.equal(result.payment?.token, 'TOKEN');
    assert.ok(result.note.includes('raw units'));
    assert.ok(!result.note.includes('USDC'));
  });
});
