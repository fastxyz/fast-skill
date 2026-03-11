# x402 Pay An API

Use `@fastxyz/x402-client` when the user is the payer.

## Fast Example

Use `FastProvider` for the connection and `FastWallet` for the Fast identity. `x402Pay(...)` still needs the raw private key, so read it from the same keyfile path you give to `FastWallet.fromKeyfile(...)`. The SDK default is `~/.fast/keys/default.json`, or `$FAST_CONFIG_DIR/keys/default.json` when `FAST_CONFIG_DIR` is set. Current keyfiles are JSON with `{ privateKey, address }`.

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { x402Pay } from '@fastxyz/x402-client';

function getFastConfigDir(): string {
  const override = process.env.FAST_CONFIG_DIR;
  if (!override) return path.join(os.homedir(), '.fast');
  if (override === '~') return os.homedir();
  if (override.startsWith('~/')) return path.join(os.homedir(), override.slice(2));
  return override;
}

const keyfilePath = path.join(getFastConfigDir(), 'keys', 'default.json');
const provider = new FastProvider({ network: 'testnet' });
const wallet = await FastWallet.fromKeyfile(keyfilePath, provider);

const { publicKey, address } = await wallet.exportKeys();
const { privateKey } = JSON.parse(
  await fs.readFile(keyfilePath, 'utf8'),
) as {
  privateKey: string;
  address: string;
};

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'fast',
    privateKey,
    publicKey,
    address,
  },
  verbose: true,
});
```

## EVM Example

```ts
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'evm',
    privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    address: process.env.EVM_ADDRESS as `0x${string}`,
  },
  verbose: true,
});
```

## Auto-Bridge Example

```ts
const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: [fastWallet, evmWallet],
  verbose: true,
});
```

## Flow

1. Make the request
2. Parse `402 Payment Required`
3. Pick a supported network for the available wallet
4. Sign and attach `X-PAYMENT`
5. Retry the request

## Checks

- if both Fast and EVM are accepted, the client prefers Fast
- if you load a named key or custom keyfile, read the `privateKey` from that same path instead of assuming `default.json`
- auto-bridge depends on explicit bridge helper configs, not a generic any-chain path
