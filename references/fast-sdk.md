# Fast SDK

Use this when the request is purely about Fast network wallets, balances, transfers, signatures, token metadata, or low-level claim submission.

## Install

```bash
npm install @fastxyz/sdk
```

## Public API

```ts
import { FastProvider, FastWallet, FastError } from '@fastxyz/sdk';

const provider = new FastProvider({ network: 'testnet' });
const wallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);
```

- `FastProvider`: read-only RPC access for balances, token metadata, account info, and explorer links
- `FastWallet`: signing and sending surface; always requires a `FastProvider`
- `FastError`: typed operational errors with `code`, `message`, and optional `note`

## Standard Flow

```ts
const provider = new FastProvider({ network: 'testnet' });

const balance = await provider.getBalance('fast1...');
const tokenInfo = await provider.getTokenInfo('fastUSDC');
```

```ts
const provider = new FastProvider({ network: 'testnet' });
const wallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

const balance = await wallet.balance();
const sent = await wallet.send({ to: 'fast1...', amount: '1.0' });
const signed = await wallet.sign({ message: 'hello fast' });
```

Read-only work stays on `FastProvider`. Anything that signs or submits transactions uses `FastWallet`.

## Methods That Matter

- `FastProvider.getBalance(address, token?)`: get native `FAST` or a token by symbol or token id
- `FastProvider.getTokens(address)`: list held token balances for any Fast address
- `FastProvider.getTokenInfo(token)`: fetch token metadata by symbol or token id
- `FastProvider.getAccountInfo(address)`: fetch raw account data from RPC
- `FastProvider.getExplorerUrl(txHash?)`: build an explorer URL when the network config has one
- `FastWallet.fromKeyfile(pathOrOpts, provider)`: load or create a wallet from disk
- `FastWallet.fromPrivateKey(privateKey, provider)`: load an in-memory wallet from a raw private key
- `FastWallet.generate(provider)`: create a new in-memory wallet
- `wallet.balance(token?)`: get this wallet's balance
- `wallet.send({ to, amount, token? })`: send native `FAST` or a custom token
- `wallet.sign({ message })`: sign with the local Ed25519 key
- `wallet.verify({ message, signature, address })`: verify a signature
- `wallet.tokens()`: list held tokens and balances
- `wallet.submit({ recipient, claim })`: low-level custom claim submission
- `wallet.exportKeys()`: return public key and address only
- `wallet.saveToKeyfile(path)`: persist an in-memory wallet created with `generate()` or `fromPrivateKey()`
- `wallet.address`: current wallet address

## Important Data Rules

- Default network is `testnet`. Only use `mainnet` if the user explicitly asks.
- Transfer amounts are human-readable strings, for example `'1.5'`.
- Fast addresses must be bech32m with `fast` prefix.
- The native token is `FAST`.
- `@fastxyz/sdk` is still one package. The API split is `FastProvider` plus `FastWallet`, not separate npm packages.
- The default keyfile location is `~/.fast/keys/default.json`, or `$FAST_CONFIG_DIR/keys/default.json` if `FAST_CONFIG_DIR` is set.
- Named keys resolve to `~/.fast/keys/<name>.json` or `$FAST_CONFIG_DIR/keys/<name>.json`.
- `FastWallet.fromKeyfile(...)` creates a missing keyfile by default. Pass `createIfMissing: false` when the file must already exist.
- Current keyfiles are written as `{ privateKey, address }`. The loader still accepts legacy `{ publicKey, privateKey }`.
- Custom networks and token aliases come from `~/.fast/networks.json` and `~/.fast/tokens.json`, or the same files under `$FAST_CONFIG_DIR`.

## Safety Rules

- Never overwrite or delete `~/.fast/keys/`.
- Fast sends are irreversible.
- Confirm the recipient address before calling `send()`.

## Error Handling

The package throws `FastError`. Common codes:

- `KEYFILE_NOT_FOUND`: the requested keyfile is missing and `createIfMissing` was disabled
- `INSUFFICIENT_BALANCE`: fund the wallet and retry
- `INVALID_ADDRESS`: fix the `fast1...` address
- `TOKEN_NOT_FOUND`: use a configured symbol such as `FAST` or `fastUSDC`, or pass a valid hex token id
- `TX_FAILED`: wait, inspect, retry once if appropriate
- `INVALID_PARAMS`: fix the input shape
- `UNSUPPORTED_OPERATION`: for example, trying to `saveToKeyfile()` on a wallet already loaded from disk

## Use This Instead Of Other FAST Packages When

- the task is a direct Fast payment or balance check
- the user wants Fast signatures or token metadata
- the user does not need EVM bridging or 402 HTTP payment behavior
