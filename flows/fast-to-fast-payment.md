# Fast To Fast Payment

Use `@fastxyz/sdk` for direct Fast transfers in code. A person sending from their own wallet should use the `fast` CLI skill (`fast send`) instead.

## Steps

1. Install `@fastxyz/sdk` (Node.js 20+)
2. Pick the network the user means, and pass it explicitly: `mainnet` moves real funds
3. Create a `Signer` from the sender's private key and a `FastProvider` for that network
4. Read the account's `nextNonce` (and balance) with `getAccountInfo`
5. Build the transfer with `TransactionBuilder`, sign it, and submit it

## Example

```ts
import { FastProvider, Signer, TransactionBuilder } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';

const signer = new Signer(process.env.FAST_PRIVATE_KEY!);
const provider = new FastProvider(mainnet);

const account = await provider.getAccountInfo({ address: await signer.getPublicKey() });

const envelope = await new TransactionBuilder({
  networkId: 'fast:mainnet',
  signer,
  nonce: account.nextNonce,
})
  .addTokenTransfer({
    tokenId: mainnet.defaultToken!.tokenId, // fastUSD
    recipient: 'fast1recipient...',
    amount: 1_000_000n, // 1 fastUSD in base units
    userData: null,
  })
  .sign();

const result = await provider.submitTransaction(envelope);
console.log(result);
```

## Checks

- recipient must be a valid `fast1...` address
- the amount is a `bigint` in base units (fastUSD and testUSDC have 6 decimals)
- the token is an ID, not a symbol: `mainnet.defaultToken.tokenId` is fastUSD, `testnet.defaultToken.tokenId` is testUSDC
- do not write new examples around removed `FastWallet`, `fast()` or `setup()`
- do not proceed if the user has not confirmed the recipient, amount and network
