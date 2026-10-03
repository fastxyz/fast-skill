# Chain To Chain Via Fast

This is a composed flow, not one SDK call.

## Structure

1. Deposit from the source EVM chain into Fast with `executeDeposit(...)` ([EVM-to-Fast deposit flow](./evm-to-fast-deposit.md))
2. Wait until the Fast account actually holds the bridged funds
3. Withdraw from Fast to the destination EVM chain with `executeWithdraw(...)` ([Fast-to-EVM withdraw flow](./fast-to-evm-withdraw.md))
4. Wait until the destination EVM address actually holds the funds

## Important Constraint

This only works if both legs have a deployed route (mainnet: `ethereum`, `arbitrum`, `base`, `polygon`, `arc`; testnet: `arbitrum-sepolia`, `ethereum-sepolia`) and you have trusted route values for both chains. Do not describe it as atomic or universally available.

## Waiting Between Legs

`executeDeposit(...)` returns once the EVM deposit transaction is submitted; the Fast-side credit comes later. Poll the Fast account before starting the withdrawal:

```ts
import { FastProvider, fromHex } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';

const provider = new FastProvider(mainnet);
const fastUsd = fromHex(mainnet.defaultToken!.tokenId);

const account = await provider.getAccountInfo({
  address: 'fast1intermediate...',
  tokenBalancesFilter: [fastUsd],
});

console.log(account.tokenBalance);
```

## Checks

- explain the two-leg model and its timing to the user
- verify both routes before implementing
- the intermediate Fast address must be the account whose `Signer` signs the withdrawal leg
- wait for the deposit to settle on Fast before starting the withdrawal
- wait for the withdrawal to land on the destination chain before treating the transfer as complete
- do not hide timing or relayer risk
