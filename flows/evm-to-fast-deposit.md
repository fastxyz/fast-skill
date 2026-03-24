# EVM To Fast Deposit

This is an AllSet deposit flow using `@fastxyz/allset-sdk`.

## Preconditions

- supported source chain in the current SDK config
- supported token mapping in the current SDK config
- EVM sender address
- Fast receiver address
- EVM private key and RPC URL

## Example

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
  to: 'fast1YourFastAddress',
  evmClients,
});
```

## Checks

- `to` must be `fast1...`
- `amount` is raw base units
- bundled AllSet chain keys are `ethereum`, `arbitrum`, and `base`
- use `@fastxyz/allset-sdk/node` for explicit runtime imports; the root package currently re-exports the same runtime APIs too
- if approval is needed, the executor will handle it before deposit
- unsupported token mappings should be called out before writing code
