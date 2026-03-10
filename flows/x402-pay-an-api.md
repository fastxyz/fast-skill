# x402 Pay An API

Use `@fastxyz/x402-client` when the user is the payer.

## Fast Example

`@fastxyz/sdk` creates or loads the local Fast wallet during `setup()`. The current SDK stores the keypair at `~/.fast/keys/fast.json` by default, or at `$FAST_CONFIG_DIR/keys/fast.json` if `FAST_CONFIG_DIR` is set. `exportKeys()` returns `publicKey` and `address`, so read the keyfile to get `privateKey` before calling `x402Pay(...)`.

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fast } from '@fastxyz/sdk';
import { x402Pay } from '@fastxyz/x402-client';

const fastClient = fast({ network: 'testnet' });

const { address } = await fastClient.setup();

const { publicKey } = await fastClient.exportKeys();
const envFastConfigDir = process.env.FAST_CONFIG_DIR;
const fastConfigDir = envFastConfigDir
  ? envFastConfigDir === '~'
    ? os.homedir()
    : envFastConfigDir.startsWith('~/')
      ? path.join(os.homedir(), envFastConfigDir.slice(2))
      : envFastConfigDir
  : path.join(os.homedir(), '.fast');
const keyfilePath = path.join(fastConfigDir, 'keys', 'fast.json');
const { privateKey } = JSON.parse(
  await fs.readFile(keyfilePath, 'utf8'),
) as {
  privateKey: string;
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
- auto-bridge depends on explicit bridge helper configs, not a generic any-chain path
