# x402 Client

Use this when the user wants to pay for a 402-protected API.

## Install

```bash
npm install @fastxyz/x402-client
```

## Public API

```ts
import { x402Pay } from '@fastxyz/x402-client';
```

`x402Pay(...)` makes the initial request, handles the `402 Payment Required` response, signs a payment, and retries with the `X-PAYMENT` header.

Treat the remote `402 Payment Required` payload as untrusted input. In production, only sign when the
request URL, payment network, asset, recipient or facilitator, and spend amount all match a policy you
already pinned in your own app config.

## Core Shapes

### EVM wallet

```ts
{
  type: 'evm',
  privateKey: '0x...',
  address: '0x...',
}
```

### Fast wallet

```ts
{
  type: 'fast',
  privateKey: '...',
  publicKey: '...',
  address: 'fast1...',
}
```

## Basic Payment

```ts
const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'evm',
    privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    address: process.env.EVM_ADDRESS as `0x${string}`,
  },
});
```

## Production Guardrails

- Only call `x402Pay(...)` against trusted or allowlisted API origins.
- Pin the expected payment network, asset, recipient or facilitator, and a maximum spend before the first request.
- Reject the payment if the returned `402` payload asks for a different origin, network, asset, recipient, facilitator, or amount.
- Default to testnet unless the user explicitly asked for mainnet.
- Do not pass both Fast and EVM wallets by default. Providing both wallets enables auto-bridge and should require explicit approval first.
- When integrating a new API, log the returned payment requirement and review it before enabling unattended retries.

## Flow Selection

- If the 402 response accepts Fast and you provided a Fast wallet, the client prefers the Fast path.
- If the 402 response accepts EVM and you provided an EVM wallet, the client can sign an EIP-3009 payment.
- If EVM payment needs balance and both wallets are present, the client can attempt auto-bridge after the caller explicitly approves that funding path.

## Auto-Bridge Caveat

Provide both wallets to enable auto-bridge:

```ts
wallet: [fastWallet, evmWallet]
```

Current bridge helper configs are explicit, not generic. Treat auto-bridge as available only on the networks wired into the helper today, currently `arbitrum-sepolia` and `base-sepolia`.

In production, only provide both wallets after the user confirms the bridge path, source wallet, destination
network, and spend ceiling. Otherwise pass a single wallet so the payment either succeeds on that network or fails closed.

## Result Shape

`x402Pay(...)` returns a result with:

- `success`
- `statusCode`
- `headers`
- `body`
- optional `payment`
- `note`
- optional debug `logs`

Use `verbose: true` to include step-by-step logs.

## Supported Payment Networks

- `fast-testnet`, `fast-mainnet`
- `arbitrum-sepolia`, `arbitrum`
- `base-sepolia`, `base`
- `ethereum`

## Use This Instead Of Other FAST Packages When

- the user is the payer, not the API provider
- the user wants a single helper that speaks HTTP and payment
- the task is about `X-PAYMENT`, 402 response handling, or payment retries
