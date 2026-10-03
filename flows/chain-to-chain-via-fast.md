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

`executeDeposit(...)` returns once the EVM deposit transaction is submitted; the Fast-side credit comes later. A single balance read doesn't prove this deposit arrived (the account may already have held fastUSD), so read the balance before the deposit and poll until it has grown by the deposited amount, with a timeout:

```ts
import { FastProvider, fromHex, toHex } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';

const provider = new FastProvider(mainnet);
const fastUsd = mainnet.defaultToken!.tokenId.toLowerCase();
const intermediate = 'fast1intermediate...';

const fastUsdBalance = async (): Promise<bigint> => {
  const account = await provider.getAccountInfo({ address: intermediate, tokenBalancesFilter: [fromHex(fastUsd)] });
  const entry = account.tokenBalance.find(([tokenId]) => toHex(tokenId).toLowerCase() === fastUsd);
  return entry ? entry[1] : 0n;
};

// Read before submitting the deposit leg.
const before = await fastUsdBalance();
const deposited = 1_000_000n; // the deposit amount in base units

// ... submit the deposit with executeDeposit(...) here ...

const deadline = Date.now() + 30 * 60_000;
while ((await fastUsdBalance()) < before + deposited) {
  if (Date.now() > deadline) throw new Error('Deposit not credited on Fast in 30 minutes; not starting the withdrawal.');
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
```

This assumes nothing else spends from the intermediate account while you wait.

## Checks

- explain the two-leg model and its timing to the user
- verify both routes before implementing
- the intermediate Fast address must be the account whose `Signer` signs the withdrawal leg
- wait for the deposit to settle on Fast before starting the withdrawal
- wait for the withdrawal to land on the destination chain before treating the transfer as complete
- do not hide timing or relayer risk
