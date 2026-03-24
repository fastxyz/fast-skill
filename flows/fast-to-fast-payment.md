# Fast To Fast Payment

Use `@fastxyz/sdk` for direct Fast transfers.

## Steps

1. Install `@fastxyz/sdk`
2. Create a `FastProvider` on `testnet` unless the user explicitly asked for mainnet
3. Load or create a `FastWallet`
4. Check balance
5. Call `send({ to, amount, token? })`

## Example

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';

const provider = new FastProvider({ network: 'testnet' });
const wallet = await FastWallet.fromKeyfile({ key: 'default' }, provider);

const before = await wallet.balance('FAST');
const sent = await wallet.send({
  to: 'fast1recipient...',
  amount: '1.0',
  token: 'FAST',
});

console.log(before, sent.txHash, sent.explorerUrl);
```

## Checks

- recipient must be `fast1...`
- amount is a human-readable string
- the native token symbol is `FAST`
- do not write new examples around removed `fast()` / `setup()` helpers
- do not proceed if the user has not confirmed the recipient
