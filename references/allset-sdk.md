# AllSet SDK

Use this when the user wants to move value between Fast and a supported EVM route.

## Install

```bash
npm install @fastxyz/allset-sdk
```

Add `@fastxyz/sdk` too when the workflow needs a Fast wallet for Fast -> EVM withdrawals or intent execution.

## Public API

```ts
import {
  buildDepositTransaction,
  buildTransferIntent,
  buildExecuteIntent,
  buildDepositBackIntent,
} from '@fastxyz/allset-sdk';

import {
  AllSetProvider,
  createEvmExecutor,
  createEvmWallet,
} from '@fastxyz/allset-sdk/node';
```

- Root `@fastxyz/allset-sdk`: pure helpers only
- `@fastxyz/allset-sdk/node`: provider, executor, wallet, bridge execution, config access
- `AllSetProvider`: read config and execute supported bridge legs
- `createEvmWallet(...)`: create or load an EVM account
- `createEvmExecutor(account, rpcUrl, chainId)`: create viem clients for approvals and deposits
- `buildDepositTransaction(...)`: plan an EVM -> Fast deposit without node-only runtime helpers

## Supported Directions

- EVM -> Fast deposit
- Fast -> EVM withdraw

This SDK does not expose a single EVM -> EVM bridge call. Cross-chain EVM movement is composed from two legs through Fast.

## Current Support Limits

- Network posture: testnet-focused
- Root import does not expose `AllSetProvider` or `createEvmExecutor`
- Node/runtime bridge config currently ships testnet routes for `arbitrum`, `ethereum`, and `base`
- Mainnet config path exists, but bundled mainnet chain config is empty
- Token mapping actually shipped today is `USDC`, with `fastUSDC` and `testUSDC` accepted as Fast-side aliases
- Amounts are raw base-unit strings such as `'1000000'` for 1 USDC

## EVM To Fast Deposit

Use the node entrypoint for execution:

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

Use a Fast wallet plus the node entrypoint:

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

## Failure Modes To Watch

- `INVALID_PARAMS`: missing `evmClients` or `fastWallet`
- `INVALID_ADDRESS`: deposit receiver is not a valid Fast bech32m address
- `TOKEN_NOT_FOUND`: token mapping not shipped for that route
- `UNSUPPORTED_OPERATION`: route is not Fast <-> EVM or the EVM chain is not in the current shipped config
- `TX_FAILED`: approval, deposit, relayer leg, or other downstream bridge execution failed

## Use This Instead Of Other FAST Packages When

- the user explicitly wants bridging
- the workflow crosses Fast and an EVM chain
- x402 auto-bridge behavior needs to be explained or debugged
