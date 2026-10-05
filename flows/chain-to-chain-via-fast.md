# Chain To Chain Via Fast

This is a composed flow, not one SDK call.

## Structure

1. Deposit from the source EVM chain into Fast with `executeDeposit(...)` ([EVM-to-Fast deposit flow](./evm-to-fast-deposit.md))
2. Wait until the specific source deposit is credited to the Fast account
3. Withdraw from Fast to the destination EVM chain with `executeWithdraw(...)` ([Fast-to-EVM withdraw flow](./fast-to-evm-withdraw.md))
4. Wait until the destination EVM address actually holds the funds

## Important Constraint

This only works if both legs have a deployed route (mainnet: `ethereum`, `arbitrum`, `base`, `polygon`, `arc`; testnet: `arbitrum-sepolia`, `ethereum-sepolia`) and you have trusted route values for both chains. Do not describe it as atomic or universally available.

## Waiting Between Legs

`executeDeposit(...)` returns once the EVM deposit transaction is submitted; the Fast-side credit comes later. A balance increase alone does not identify that deposit: an unrelated credit of the same amount could arrive first. The following balance poll is only a candidate signal for a dedicated intermediate account. Before using it to start the withdrawal, verify that there were no other credits or debits from the initial balance read through the final read. If the account is shared, or you cannot establish that exclusivity, correlate the Fast credit to the original source deposit transaction using trusted bridge/activity records. If you cannot make that correlation, stop rather than withdraw against an unrelated credit.

```ts
import { FastProvider, fromHex, toHex } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';

const provider = new FastProvider(mainnet);
const fastUsd = mainnet.defaultToken!.tokenId.toLowerCase();
const intermediate = 'fast1intermediate...'; // dedicated to this one bridge operation

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

The loop only establishes that enough fastUSD is present; it does not itself prove deposit identity. Do not start the withdrawal until the no-other-credits-or-debits condition or the original-deposit correlation above has been checked.

## Checks

- explain the two-leg model and its timing to the user
- verify both routes before implementing
- the intermediate Fast address must be the account whose `Signer` signs the withdrawal leg
- verify the Fast credit belongs to this source deposit before starting the withdrawal
- wait for the withdrawal to land on the destination chain before treating the transfer as complete
- do not hide timing or relayer risk
