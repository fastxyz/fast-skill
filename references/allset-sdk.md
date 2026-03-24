# AllSet SDK

Use this when the user wants to move value between Fast and a supported EVM route.

## Install

```bash
npm install @fastxyz/allset-sdk
```

Add `@fastxyz/sdk` too when the workflow needs a Fast wallet for Fast -> EVM withdrawals or intent execution.

## Entrypoints

```ts
import {
  buildDepositTransaction,
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
  buildRevokeIntent,
} from '@fastxyz/allset-sdk';

import {
  AllSetProvider,
  createEvmExecutor,
  createEvmWallet,
} from '@fastxyz/allset-sdk/node';
```

- Root `@fastxyz/allset-sdk` currently re-exports both pure helpers and the node/runtime APIs
- `@fastxyz/allset-sdk/node` is still the clearest explicit runtime import path
- `@fastxyz/allset-sdk/browser` and `@fastxyz/allset-sdk/core` are the pure-helper surfaces

## Supported Directions

- EVM -> Fast deposit
- Fast -> EVM withdraw
- Fast -> EVM intent execution

This SDK does not expose a single EVM -> EVM bridge call. Cross-chain EVM movement is composed from two legs through Fast.

## Current Support Limits

- Bundled bridge config is testnet-only
- Shipped chain keys are `ethereum`, `arbitrum`, and `base`
- Bundled chain IDs are:
  - `ethereum` -> `11155111`
  - `arbitrum` -> `421614`
  - `base` -> `8453`
- Bundled mainnet config exists, but its `chains` map is empty
- `createEvmExecutor(...)` only supports chain IDs `11155111`, `421614`, and `8453`
- Bundled token mapping is `USDC`, with `fastUSDC` and `testUSDC` normalized to the Fast-side USDC route
- Amounts are raw 6-decimal base-unit strings such as `'1000000'` for 1 USDC
- Hard cutover: do not call AllSet with chain names like `arbitrum-sepolia` or `ethereum-sepolia`. The shipped SDK keys are `arbitrum` and `ethereum`.

## EVM To Fast Deposit

Use the explicit runtime entrypoint for execution:

```ts
import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk/node';

const account = createEvmWallet(process.env.EVM_PRIVATE_KEY!);
const evmClients = createEvmExecutor(
  account,
  process.env.ARBITRUM_SEPOLIA_RPC_URL!,
  421614,
);

const allset = new AllSetProvider({ network: 'testnet' });

const result = await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: account.address,
  to: 'fast1yourfastaddress',
  evmClients,
});
```

## Fast To EVM Withdraw

Use a Fast wallet plus the explicit runtime entrypoint:

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk/node';

const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const allset = new AllSetProvider({ network: 'testnet' });

const result = await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: '0xYourEvmAddress',
  fastWallet,
});
```

## Intent Execution

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk/node';
import { buildTransferIntent } from '@fastxyz/allset-sdk';

const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile({ key: 'default' }, fastProvider);
const allset = new AllSetProvider({ network: 'testnet' });

const result = await allset.executeIntent({
  chain: 'arbitrum',
  fastWallet,
  token: 'fastUSDC',
  amount: '1000000',
  intents: [
    buildTransferIntent('0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', '0xRecipient'),
  ],
});
```

## Failure Modes To Watch

- `INVALID_PARAMS`: missing `evmClients` or `fastWallet`
- `INVALID_ADDRESS`: deposit receiver is not a valid Fast bech32m address
- `TOKEN_NOT_FOUND`: token mapping not shipped for that route
- `UNSUPPORTED_OPERATION`: route is not Fast <-> EVM or the EVM chain is not in the current shipped config
- `TX_FAILED`: approval, deposit, relayer leg, or other downstream bridge execution failed
- user-supplied mainnet/custom deployments need caller-provided config instead of the bundled defaults

## Use This Instead Of Other FAST Packages When

- the user explicitly wants bridging
- the workflow crosses Fast and an EVM chain
- x402 auto-bridge behavior needs to be explained or debugged
