# Fast SDK

Use this when the request is about Fast network keys, balances, transfers, signatures, or token metadata in code. For a person managing their own wallet from the terminal, use the `fast` CLI skill instead.

The package README is the full reference: `node_modules/@fastxyz/sdk/README.md` after install.

## Install

```bash
npm install @fastxyz/sdk
```

Requires Node.js 20+.

## Entrypoints

- `@fastxyz/sdk`: `Signer`, `FastProvider`, `TransactionBuilder`, `MultiSigWorkflow`, `MultiSigSigner`, errors, and helpers (`toHex`, `fromHex`, `toFastAddress`, `fromFastAddress`, `encode`, `hash`, `hashHex`, `getTokenId`, `verify`, `verifyTypedData`)
- `@fastxyz/sdk/networks`: the `mainnet` and `testnet` constants (URL, network ID, explorer URL, default token)
- `@fastxyz/sdk/core`: standalone functions over the same REST API
- `@fastxyz/sdk/wallet`: connecting to the Fast app wallet and key handover
- `@fastxyz/sdk/multisig`: the multisig workflow on its own

Removed APIs: `FastWallet` (`fromKeyfile`, `fromPrivateKey`, `generate`), `fast()` / `setup()` and the `@fastxyz/sdk/browser` entrypoint. Don't write new code against them.

## Transfer fastUSD on Mainnet

```ts
import { FastProvider, Signer, TransactionBuilder } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';

const signer = new Signer(process.env.FAST_PRIVATE_KEY!); // 32-byte Ed25519 seed, hex
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
    amount: 1_500_000n, // 1.5 fastUSD in base units (6 decimals)
    userData: null,
  })
  .sign();

const result = await provider.submitTransaction(envelope);
console.log(result);
```

## APIs That Matter

`FastProvider` (REST client):

- `getAccountInfo({ address, tokenBalancesFilter?, stateKeyFilter?, certificateByNonce? })`: native balance, `tokenBalance` pairs, `nextNonce`
- `submitTransaction(envelope)`
- `getTokenInfo({ tokenIds })`
- `getTransactionCertificates({ address, fromNonce, limit })`
- `getPendingMultisigTransactions({ address })`

`Signer`: `new Signer(privateKey)`, `getPublicKey()`, `getFastAddress()`, `signMessage(bytes)`, `signTypedData(bcsType, data)`.

`TransactionBuilder`: `new TransactionBuilder({ networkId, signer, nonce })`, then `addTokenTransfer`, `addTokenCreation`, `addTokenManagement`, `addMint`, `addBurn`, state and claim operations, and `sign()`. Several operations in one builder are batched.

## Data Rules

- Pass the network explicitly: `new FastProvider(mainnet)` or `new FastProvider(testnet)`. Mainnet moves real funds.
- Token IDs, not symbols: mainnet `fastUSD` is `mainnet.defaultToken.tokenId`, testnet `testUSDC` is `testnet.defaultToken.tokenId`.
- Amounts are `bigint` base units.
- Fast addresses are bech32m with the `fast` prefix (`toFastAddress`, `fromFastAddress`).
- The SDK reads no key files. The `fast` CLI keeps its accounts in `~/.fast/fast.db`; don't read or modify that database from code.
- Explorer links: `${mainnet.explorerUrl}/txs/<txHash>`.

## Safety Rules

- Fast sends are irreversible. Confirm the recipient, amount and network before submitting.
- Never print or log private keys.
- `UnexpectedNonceError` means another transaction used the nonce: re-read `nextNonce` before rebuilding.

## Use This Instead Of Other FAST Packages When

- the task is a direct Fast payment or balance check in code
- the user wants Fast signatures or token metadata
- the user does not need EVM bridging or 402 HTTP payment behavior
