---
name: fast-sdk
description: >
  Fast chain SDK for AI agents. Setup wallets, send SET tokens, check balances,
  sign and verify messages, list token holdings, look up token metadata, submit claims,
  and export wallet info on Fast chain.
  Use when asked to pay, transfer, check a balance, sign a message, verify a signature,
  list tokens, look up token info, or interact with Fast chain.
  Do NOT use for EVM chain operations, swap, bridge, yield farming, lending, or staking.

---

# FAST SDK SKILL

Fast chain SDK — wallet management, payments, token operations, and message signing. No API keys or config files needed.

## Install

```bash
npx skills add Pi-Squared-Inc/fast-api
```

## SDK Setup

Install `@pi2labs/fast-sdk` from source (not yet published to npm):

```bash
git clone --depth 1 https://github.com/Pi-Squared-Inc/fast-api.git /tmp/fast-api
mkdir -p ~/.fast/sdks
cp -r /tmp/fast-api/sdk/fast-sdk ~/.fast/sdks/fast-sdk
cp /tmp/fast-api/sdk/tsconfig.base.json ~/.fast/sdks/tsconfig.base.json
rm -rf /tmp/fast-api
cd ~/.fast/sdks/fast-sdk
npm install
npm run build
```

The built SDK entry point is `~/.fast/sdks/fast-sdk/dist/index.js`.

---

## Quickstart

```typescript
import { fast } from '@pi2labs/fast-sdk'; // installed at ~/.fast/sdks/fast-sdk/

const f = fast({ network: 'testnet' });
await f.setup();                                              // 1. create wallet (once)
const bal = await f.balance();                                // 2. check balance
const tx = await f.send({ to: 'fast1qxy...', amount: '1.0' }); // 3. send tokens
```

---

## Rules

1. **Default is testnet.** Never pass `network: 'mainnet'` unless the user explicitly requested mainnet. Mainnet uses real money.
2. **Sends are irreversible.** Verify the address before calling `send()`.
3. **Amounts are strings in human units.** `'10'` means 10 SET, not 10 raw units.
4. **NEVER delete, overwrite, or modify files in `~/.fast/keys/`.** These are wallet private keys. Loss means permanent, irreversible loss of funds.

---

## API Reference

### `setup()`

Create or load a wallet. Must be called before other methods.

```typescript
const { address } = await f.setup();
// → { address: 'fast1abc...' }
```

### `balance(opts?)`

Get balance for native SET or a specific token by hex ID.

```typescript
const bal = await f.balance();
// → { amount: '42.5', token: 'SET' }

const custom = await f.balance({ token: '0xfa575e70...' });
// → { amount: '100.0', token: '0xfa575e70...' }
```

### `send(params)`

Send tokens to a `fast1...` address. Defaults to native SET. Custom tokens can be passed by a held symbol like `SETUSDC` or by raw hex token ID.

```typescript
const tx = await f.send({ to: 'fast1abc...', amount: '10.0' });
// → { txHash: '0x...', explorerUrl: 'https://explorer.fastset.xyz/txs/0x...' }

// Custom token by hex ID
const tx2 = await f.send({ to: 'fast1abc...', amount: '5.0', token: '0x1e7449...' });
```

| Param | Type | Required | Description |
|---|---|---|---|
| `to` | `string` | yes | Recipient `fast1...` address |
| `amount` | `string` | yes | Human-readable amount (e.g. `'1.5'`) |
| `token` | `string` | no | Held token symbol like `SETUSDC`, or a hex token ID. Defaults to native SET. |

### `sign(params)`

Sign a message with the wallet's Ed25519 key.

```typescript
const { signature, address } = await f.sign({ message: 'hello' });
```

### `verify(params)`

Verify an Ed25519 signature against a `fast1...` address.

```typescript
const { valid } = await f.verify({
  message: 'hello',
  signature: '...',
  address: 'fast1abc...',
});
```

### `tokens()`

List all tokens held on-chain with balances.

```typescript
const list = await f.tokens();
// → [{ symbol: 'SET', address: '0xfa575e70...', balance: '42.5', decimals: 18 }, ...]
```

### `tokenInfo(params)`

Get on-chain metadata for a token by held symbol or hex token ID.

```typescript
const info = await f.tokenInfo({ token: '0xfa575e70...' });
// → { name: 'SET', symbol: 'SET', address: '0xfa575e70...', decimals: 18, totalSupply: '...', admin: '...', minters: [...] }
```

### `exportKeys()`

Export public key and address. Never exposes the private key.

```typescript
const { publicKey, address } = await f.exportKeys();
```

### `address` (readonly)

The current wallet address, or `null` if `setup()` hasn't been called.

```typescript
console.log(f.address); // 'fast1abc...' or null
```

### `submit(params)` (advanced)

Submit an arbitrary claim to the Fast chain. Returns transaction hash and certificate.

```typescript
const result = await f.submit({
  recipient: 'fast1abc...',
  claim: {
    TokenTransfer: {
      token_id: tokenIdBytes,
      amount: '1000000',
      user_data: null,
    },
  },
});
// → { txHash: '0x...', certificate: { ... } }
```

This is a low-level method. For standard token transfers, use `send()` instead.

---

## Address Format

Fast addresses are bech32m-encoded with HRP `fast`:

| Format | Example |
|---|---|
| On-chain | `fast1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` |
| Underlying | 32-byte Ed25519 public key |

---

## Error Recovery

All errors are `FastError` instances with `{ code, message, note }`. Read `e.code` to decide action, `e.note` for a fix hint.

```typescript
import { FastError } from '@pi2labs/fast-sdk';

try {
  await f.send({ to: 'fast1...', amount: '10' });
} catch (e: unknown) {
  if (e instanceof FastError) {
    console.log(e.code, e.note);
  }
}
```

| `e.code` | Action |
|---|---|
| `INSUFFICIENT_BALANCE` | Fund the wallet, retry. |
| `CHAIN_NOT_CONFIGURED` | Call `f.setup()`, retry. |
| `TX_FAILED` | Wait 5s, retry once. If still fails, stop. |
| `INVALID_ADDRESS` | Do not retry. Confirm address with user. |
| `TOKEN_NOT_FOUND` | Verify the held token symbol or hex token ID is correct. |
| `INVALID_PARAMS` | Read `e.note` for correct call shape. |
| `UNSUPPORTED_OPERATION` | Check `e.note` — operation may not be available. |

---

## Key Concepts

### Wallet

- **Algorithm**: Ed25519
- **Key storage**: `~/.fast/keys/fast.json` (mode 0600, with backup at `~/.fast/keys/backups/fast.json`)
- **Config storage**: `~/.fast/config.json`
- **Override**: Set `FAST_CONFIG_DIR` env var to change the config directory
- One wallet per network. Same key file for testnet and mainnet.

### Native Token

- **Symbol**: SET
- **Decimals**: 18
- **Token ID**: `0xfa575e70...` (32-byte hex)

Custom tokens can be referenced by a held symbol like `SETUSDC`, or by their 32-byte hex token ID in `balance()`, `send()`, and `tokenInfo()`.

### Factory Function

```typescript
import { fast } from '@pi2labs/fast-sdk';

const f = fast();                          // defaults to testnet
const f = fast({ network: 'testnet' });    // explicit testnet
const f = fast({ network: 'mainnet' });    // mainnet — only with user consent
```

---

## NOT for this skill

This skill cannot help with: swap, bridge, EVM chain operations, yield farming, lending, staking, payment links, or price lookups.
