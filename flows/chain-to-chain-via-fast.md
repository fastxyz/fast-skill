# Chain To Chain Via Fast

This is a composed flow, not one SDK call.

## Structure

1. Deposit from the source EVM chain into Fast using `@fastxyz/allset-sdk`
2. Withdraw from Fast to the destination EVM chain using `@fastxyz/allset-sdk`

## Important Constraint

This only works if both bridge legs are individually supported by the shipped SDK config. Do not describe it as atomic or universally available.

## Skeleton

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider, createEvmExecutor, createEvmWallet } from '@fastxyz/allset-sdk/node';

const account = createEvmWallet(process.env.EVM_PRIVATE_KEY!);
const evmClients = createEvmExecutor(account, process.env.ARBITRUM_SEPOLIA_RPC_URL!, 421614);
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const allset = new AllSetProvider({ network: 'testnet' });

const deposit = await allset.sendToFast({
  chain: 'arbitrum',
  token: 'USDC',
  amount: '1000000',
  from: account.address,
  to: fastWallet.address,
  evmClients,
});

console.log(deposit.orderId);
console.log(deposit.estimatedTime);
```

Wait until the intermediate Fast wallet actually receives the bridged funds before starting the withdrawal leg. `sendToFast(...)` submits the deposit leg, but it does not guarantee the Fast-side balance is already available.

After the deposit settles on Fast, run the withdrawal leg:

```ts

const withdraw = await allset.sendToExternal({
  chain: 'base',
  token: 'fastUSDC',
  amount: '1000000',
  from: fastWallet.address,
  to: '0xDestinationAddress',
  fastWallet,
});

console.log(withdraw.orderId);
console.log(withdraw.estimatedTime);
```

Wait until the destination EVM wallet actually receives the funds before treating the chain-to-chain transfer as complete. `sendToExternal(...)` submits the withdrawal leg to the relayer, but it does not guarantee the destination balance is already updated.

## Checks

- explain the two-leg model to the user
- verify support for both legs before implementing
- bundled AllSet chain keys are `ethereum`, `arbitrum`, and `base`
- the example shows Arbitrum -> Fast -> Base, but any route still needs both legs shipped in the current SDK config
- wait for the deposit leg to settle on Fast before starting the withdrawal leg
- wait for the withdrawal leg to settle on the destination EVM chain before treating the transfer as complete
- use `@fastxyz/allset-sdk/node` for explicit runtime examples; the root package currently re-exports the same runtime APIs too
- the intermediate Fast address should be the same wallet that signs the withdrawal leg
- do not hide timing or relayer risk
