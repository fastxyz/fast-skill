---
name: fast-api
version: {{VERSION}}
description: >
  Universal payment SDK for AI agents. Send tokens, check balances, create payment links, swap tokens, bridge cross-chain,
  look up prices, sign messages, list providers, and register custom EVM chains across 13 chains
  (Fast, Base, Ethereum, Arbitrum, Polygon, Optimism, BSC, Avalanche, Fantom, zkSync, Linea, Scroll, Solana)
  or any EVM chain.
  Use when asked to pay, transfer, request payment, create payment link, swap, bridge, check price, sign a message, fund a wallet, check a balance,
  or list available providers.
  Do NOT use for yield farming, lending, staking, or SDK-only incoming payment detection from arbitrary external senders.

---

# FAST API SKILL

Everything works out of the box — RPCs, token addresses, explorer URLs, all built in for 13 chains, testnet and mainnet. No API keys or config files needed.

## Install

```bash
npx skills add Pi-Squared-Inc/fast-api
```

That's it! One command installs everything to `~/.money/`.

<details>
<summary>Manual installation (alternative)</summary>

```bash
mkdir -p ~/.money
curl -sL {{HOST}}/skill.md -o ~/.money/SKILL.md
curl -sL {{HOST}}/money.bundle.js -o ~/.money/money.bundle.js
curl -sL {{HOST}}/money.bundle.js.sha256 -o /tmp/money.sha256
(cd ~/.money && shasum -a 256 -c /tmp/money.sha256) && rm -f /tmp/money.sha256
```

</details>

v{{VERSION}}. Two files. Integrity verified via SHA-256. No dependencies.

**Auto-discovery:** To let your AI framework find this skill automatically, copy or symlink `~/.money/SKILL.md` into your framework's skill discovery directory. Consult your framework's documentation for the correct path.

---

## Quickstart

```js
const { money } = await import(`${process.env.HOME}/.money/money.bundle.js`);
await money.setup({ chain: "fast" });                                          // 1. create wallet (once)
const bal = await money.balance({ chain: "fast" });                            // 2. check balance
const tx = await money.send({ to: "set1qxy...", amount: 10, chain: "fast" }); // 3. send tokens
```

Same pattern on every chain. Only the chain name and address format change.

Supported chains: `"fast"` `"base"` `"ethereum"` `"arbitrum"` `"polygon"` `"optimism"` `"bsc"` `"avalanche"` `"fantom"` `"zksync"` `"linea"` `"scroll"` `"solana"`

## Discover All Methods

Call `money.help()` to list every method, or `money.describe("methodName")` for full details including params, result shape, examples, and notes. Both are synchronous.

```js
money.help();               // → [{ name, params, description }, ...]
money.describe("bridge");   // → { name, params, paramDetails, result, examples, notes }
money.describe("swap");     // → full details for swap
```

Use these instead of reading this entire document. The sections below cover **operational knowledge** that can't be discovered programmatically.

---

## Rules

1. **Default is testnet.** Never pass `network: "mainnet"` unless the user explicitly requested mainnet. If unsure, always use testnet. Mainnet uses real money.
2. **Sends are irreversible.** Verify the address before calling `send()`.
3. **Amounts are in human units.** `10` means 10 tokens, not 10 wei or 10 lamports.
4. **Mainnet requires explicit user consent.** Only call `setup({ network: "mainnet" })` when the user specifically asks.
5. **NEVER delete, overwrite, or modify files in `~/.money/keys/`.** These are wallet private keys. Loss means permanent, irreversible loss of funds. Do not run `rm`, `mv`, `cp`, `echo >`, or any command that could alter these files.

---

## Address Detection

Use `money.identifyChains({ address })` when you don't know the chain.

| Address looks like | Chain | Default token |
|---|---|---|
| `set1` prefix (bech32m) | Fast | SET |
| `0x` + 40 hex chars | Any EVM chain | ETH (or POL, BNB, AVAX, FTM) |
| Base58, 32-44 chars | Solana | SOL |

---

## Error Recovery

All errors have `{ code, message, note }`. Read `e.code` to decide action, `e.note` for a fix example.

| `e.code` | Action |
|---|---|
| `INSUFFICIENT_BALANCE` | Testnet: `money.faucet({ chain })`, retry. Mainnet: fund wallet. |
| `CHAIN_NOT_CONFIGURED` | `money.setup({ chain })`, retry. |
| `TX_FAILED` | Wait 5s, retry once. If still fails, stop. |
| `FAUCET_THROTTLED` | Wait and retry later. |
| `INVALID_ADDRESS` | Do not retry. Confirm address with user. |
| `TOKEN_NOT_FOUND` | `money.registerToken({ chain, name, address, decimals })`, retry. |
| `INVALID_PARAMS` | Read `e.note` for correct call shape. |
| `UNSUPPORTED_OPERATION` | Check `e.note` — method may not be available for this chain/network. |

---

## Idempotency

Check `money.history({ chain })` before sending to avoid double sends. Match on `to` + `amount`.

---

## Payment Links

Create a shareable payment link to request tokens on any chain:

```js
const link = await money.createPaymentLink({ receiver: "set1...", amount: 10, chain: "fast" });
// → { url: "https://.../pay?...", payment_id: "pay_abc...", ... }

// Non-native token — use the contract/mint address, not the symbol
const usdcLink = await money.createPaymentLink({ receiver: "0xABC...", amount: 5, chain: "base", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "mainnet" });
```

Share the URL with a payer. They (or their AI agent) can fetch it to get payment instructions with a `money.send()` call pre-filled.

For non-native tokens, always use the on-chain contract address (EVM) or mint address (Solana), not the symbol name. Native tokens (ETH, SOL, SET) use the symbol.

### Paying from a link

1. Fetch the payment link URL to get the markdown response
2. Parse `payment_id`, `receiver`, `amount`, `chain`, `token`, `network` from the YAML frontmatter
3. Execute:

```js
await money.setup({ chain: "base" });
await money.send({ to: "0x...", amount: 10, chain: "base", payment_id: "pay_abc..." });
```

Passing `payment_id` to `send()` enables duplicate tracking — it warns if the link was already paid.

### Tracking

```js
await money.listPaymentLinks();                                    // all tracked links
await money.listPaymentLinks({ payment_id: "pay_abc..." });       // specific link
await money.listPaymentLinks({ direction: "paid", chain: "fast" }); // paid links on fast
```

Tracked locally in `~/.money/payment-links.csv`. Two directions: `created` (you requested payment) and `paid` (you paid a link).

---

## Verified Paywall Flow (Server API)

Use this when you need: **payment verified -> unlock protected data**.

This flow is implemented as app API routes, not as `money.*` SDK methods.

MVP constraints:
- Chain/network/token allowlist is `base` + `mainnet` + Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- Server must set `PAYWALL_UNLOCK_SECRET`.

### 1. Create a paid product (merchant)

```bash
curl -sX POST {{HOST}}/api/paywall/products \
  -H 'content-type: application/json' \
  -d '{"title":"Premium data","amount":"5","description":"$5 USDC unlock"}'
```

### 2. Create a payment intent (buyer or agent)

```bash
curl -sX POST {{HOST}}/api/paywall/intents \
  -H 'content-type: application/json' \
  -d '{"productSlug":"premium-data"}'
```

Response includes:
- `intent.receiverAddress`, `intent.requestedAmount`, `intent.tokenAddress`, `intent.chain`, `intent.network`
- `statusUrl`, `unlockUrl`, `paymentRequestUrl`, `checkoutUrl`

### 3. Pay on-chain (wallet or AI agent)

```js
await money.setup({ chain: "base", network: "mainnet" });
await money.send({
  to: intent.receiverAddress,
  amount: intent.requestedAmount,
  chain: "base",
  token: intent.tokenAddress,
  network: "mainnet",
});
```

### 4. Poll until settled

```bash
curl -s {{HOST}}/api/paywall/intents/<intentId>/status
```

Wait for `intent.status === "settled"` and stop on terminal non-success states (`"expired"` or `"failed"`).

### Optional: provider webhook callback (signed)

If you use an external provider to drive settlement/failure updates, POST a signed webhook:

```bash
curl -sX POST {{HOST}}/api/paywall/webhooks/<provider> \
  -H "content-type: application/json" \
  -H "x-paywall-signature: sha256=<hmac_hex>" \
  -d '{"eventId":"evt_123","intentId":"intent_abc","status":"settled"}'
```

`intentId` and `eventId` must be present in the signed JSON body (header fallbacks are not accepted).

Signature input:
- Secret: `PAYWALL_WEBHOOK_SECRET` (or provider override `PAYWALL_WEBHOOK_SECRET_<PROVIDER>`)
- Digest: `hex(hmac_sha256(secret, raw_request_body))`
- Optional anti-replay timestamp: send `x-paywall-timestamp: <unix_seconds>` and sign `<timestamp>.<raw_request_body>` instead of raw body.

Supported webhook statuses:
- `settled` (`paid`, `succeeded`, `completed` aliases)
- `failed` (`failure`, `canceled`, `cancelled` aliases)
- `expired`
- `pending` (`processing` alias)

Webhook ingestion is idempotent by `<provider>:<eventId>`.

### 5. Request unlock token

```bash
curl -sX POST {{HOST}}/api/paywall/intents/<intentId>/unlock \
  -H 'content-type: application/json' \
  -d '{}'
```

### 6. Fetch protected data

```bash
curl -s {{HOST}}/api/paywall/data/<assetId> \
  -H "Authorization: Bearer <unlockToken>"
```

Operational notes:
- Status is verified server-side from chain transfer logs (with confirmations).
- Repeated verifier failures transition an intent to `failed` (threshold via `PAYWALL_MAX_VERIFIER_FAILURES`, default `3`).
- Signed webhook ingestion route: `POST /api/paywall/webhooks/<provider>`.
- Paywall state storage driver is selected via `PAYWALL_STORE_DRIVER`:
  - `file` (default): local JSON store (`PAYWALL_STORE_PATH` or `/tmp/...`), good for demo/dev.
  - `postgres`: durable DB-backed state; requires `PAYWALL_DATABASE_URL` (or `DATABASE_URL`).
- Optional postgres settings:
  - `PAYWALL_POSTGRES_STORE_KEY` to namespace a store row (default `default`).
  - `PAYWALL_DATABASE_SSL=require` for managed Postgres TLS.
  - `PAYWALL_DATABASE_SSL_INSECURE_SKIP_VERIFY=true` only for local/dev cert bypass.
- Unlock token TTL defaults to 10 minutes.
- Unlock token is one-time use; first successful data fetch consumes it.

---

## Receiving

SDK-only receiving still has no built-in incoming payment detection for arbitrary sender wallets.

Use one of:
1. `money.createPaymentLink()` for payment requests.
2. Balance-before/balance-after checks as a proxy.
3. The verified paywall server API above when you control the host backend and need settlement-gated unlock.

---

## Key Concepts

### Network rules

- `swap`, `quote` require `network: "mainnet"` (testnet DEXes have no liquidity)
- `bridge` depends on provider: DeBridge requires `"mainnet"`, OmniSet requires `"testnet"`
- Solana swaps require a free Jupiter API key: `money.setApiKey({ provider: "jupiter", apiKey: "..." })`
- `price`, `tokenInfo` are read-only — work regardless of network

### Token discovery

`money.tokens({ chain })` returns **all** tokens you own: on-chain discovered tokens **plus** any registered aliases (including tokens auto-registered after a bridge). Use by name in `balance()`, `send()`, etc.

After `bridge()`, the destination token is auto-registered — call `tokens()` or `balance()` on the destination chain immediately.

### Token registration

For tokens not auto-discovered, register once:
```js
await money.registerToken({ chain: "base", name: "USDC", address: "0x036...", decimals: 6 });
```
Built-in tokens (USDC, USDT, WETH, WBTC, DAI) are hardcoded on mainnet — no registration needed.

### Providers

`money.providers()` lists all registered swap, bridge, and price providers with their supported chains and networks.

### Custom EVM chains

Register any EVM chain at runtime:
```js
await money.registerEvmChain({ chain: "celo", chainId: 42220, rpc: "https://forno.celo.org", defaultToken: "CELO", network: "mainnet" });
await money.setup({ chain: "celo", network: "mainnet" });
```

All EVM chains share the same wallet key — same address everywhere.

---

## NOT for this skill

Stop. Tell the user this skill cannot help with: yield farming, lending, staking, or SDK-only incoming payment detection from arbitrary external senders.
