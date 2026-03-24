# Fast SDK

Use this when the request is purely about Fast network wallets, balances, transfers, signatures, token metadata, or low-level claim submission.

## Install

```bash
npm install @fastxyz/sdk
```

## Entrypoints

```ts
import { FastProvider, FastWallet, FastError } from '@fastxyz/sdk';
import { FastProvider as BrowserFastProvider } from '@fastxyz/sdk/browser';
import { encodeFastAddress, decodeFastAddress } from '@fastxyz/sdk/core';
```

- `@fastxyz/sdk`: Node runtime entrypoint with `FastProvider`, `FastWallet`, config helpers, address helpers, and BCS / certificate utilities
- `@fastxyz/sdk/browser`: browser-safe `FastProvider` plus shared helpers, with no keyfile support
- `@fastxyz/sdk/core`: pure helpers only

Hard cutover: do not write against an old `fast()` / `setup()` wrapper. The shipped package is provider/wallet based.

## Standard Node Flow

```ts
import { FastProvider, FastWallet } from '@fastxyz/sdk';

const provider = new FastProvider({ network: 'testnet' });
const wallet = await FastWallet.fromKeyfile({ key: 'default' }, provider);

const balance = await wallet.balance('FAST');
const sent = await wallet.send({
  to: 'fast1recipient...',
  amount: '1.0',
  token: 'FAST',
});

console.log(wallet.address);
console.log(balance.amount);
console.log(sent.txHash, sent.explorerUrl);
```

## Browser-Safe Flow

```ts
import { FastProvider, getCertificateHash } from '@fastxyz/sdk/browser';

const provider = new FastProvider({ network: 'testnet' });
const balance = await provider.getBalance('fast1recipient...', 'FAST');
const certificate = await provider.getCertificateByNonce('fast1recipient...', 1);

console.log(balance.amount);
if (certificate) {
  console.log(getCertificateHash(certificate));
}
```

## APIs That Matter

Provider:

- `new FastProvider({ network?, networkId?, rpcUrl?, explorerUrl?, networks?, tokens? })`
- `getBalance(address, token?)`
- `getTokens(address)`
- `getTokenInfo(token)`
- `getAccountInfo(address)`
- `getTransactionCertificates(address, fromNonce, limit)`
- `getCertificateByNonce(address, nonce)`
- `submitTransaction(envelope)`
- `faucetDrip({ recipient, amount, token? })`
- `getExplorerUrl(txHash?)`
- `resolveKnownToken(token)`, `getKnownTokens()`, `getKnownNetworks()`, `getNetworkId()`

Wallet:

- `FastWallet.fromKeyfile(pathOrOpts, provider)`
- `FastWallet.fromPrivateKey(privateKey, provider)`
- `FastWallet.generate(provider)`
- `saveToKeyfile(path)`
- `balance(token?)`
- `tokens()`
- `send({ to, amount, token? })`
- `sign({ message })`
- `verify({ message, signature, address })`
- `submit({ claim })`
- `exportKeys()`

Shared helpers:

- `encodeFastAddress`, `fastAddressToBytes`, `decodeFastAddress`
- `getNetworkInfo`, `getAllNetworks`, `resolveKnownFastToken`, `getAllTokens`, `getDefaultRpcUrl`, `getExplorerUrl`
- `hashTransaction`, `serializeVersionedTransaction`, `decodeTransactionEnvelope`, `getTransferDetails`
- `FAST_TOKEN_ID`, `FAST_DECIMALS`, `FAST_NETWORK_IDS`

## Config And Data Rules

- Default network is `testnet`. Only use `mainnet` if the user explicitly asks.
- Node config precedence:
  1. constructor overrides
  2. `~/.fast/networks.json` and `~/.fast/tokens.json`
  3. bundled defaults
  4. hardcoded fallbacks
- Browser config omits the `~/.fast/*` layer and uses constructor overrides plus bundled defaults.
- Built-in token symbols currently resolve `FAST` and `testUSDC` on `testnet`, and `FAST` plus `fastUSDC` on `mainnet`.
- `wallet.send(...)` expects human-readable amount strings such as `'1.5'`.
- Fast addresses must be bech32m with `fast` prefix.
- The native token symbol is `FAST`.
- `FastWallet.fromKeyfile({ key: 'merchant' }, provider)` resolves `~/.fast/keys/merchant.json` and auto-creates the key unless `createIfMissing: false`.

## Safety Rules

- Never overwrite or delete `~/.fast/keys/`.
- Only wallets created in memory via `generate()` or `fromPrivateKey()` can be saved with `saveToKeyfile(...)`.
- Fast sends are irreversible.
- Confirm the recipient address before calling `send()`.
- Use `provider.getExplorerUrl(txHash)` instead of hardcoded explorer hosts.

## Error Handling

The package throws `FastError`. Common codes:

- `INSUFFICIENT_BALANCE`: fund the wallet and retry
- `INVALID_ADDRESS`: fix the `fast1...` address
- `TOKEN_NOT_FOUND`: use a held symbol or a valid token id
- `KEYFILE_NOT_FOUND`: `fromKeyfile(..., createIfMissing: false)` could not find the file
- `TX_FAILED`: wait, inspect, retry once if appropriate
- `UNSUPPORTED_OPERATION`: unsupported keyfile/save path or malformed low-level call
- `INVALID_PARAMS`: fix the input shape

## Use This Instead Of Other FAST Packages When

- the task is a direct Fast payment or balance check
- the user wants Fast signatures or token metadata
- the user does not need EVM bridging or 402 HTTP payment behavior
