# Fast To EVM Withdraw

This is an AllSet withdrawal flow using `@fastxyz/allset-sdk`.

## Preconditions

- supported destination chain in the current SDK config
- compatible Fast wallet
- Fast sender address
- EVM receiver address

## Example

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

## Checks

- `to` must be `0x...`
- `amount` is raw base units
- use `@fastxyz/allset-sdk/node` for runtime execution; the root package is pure-helper only
- withdrawal may fail at the relayer leg even after the Fast-side action is created
