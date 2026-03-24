# x402 Server

Use this when the user wants to add payment requirements to API routes.

## Install

```bash
npm install @fastxyz/x402-server
```

## Public API

```ts
import {
  paymentMiddleware,
  paywall,
  createPaymentRequirement,
  createPaymentRequired,
  parsePaymentHeader,
  verifyPayment,
  settlePayment,
  verifyAndSettle,
  NETWORK_CONFIGS,
  parsePrice,
  getNetworkConfig,
} from '@fastxyz/x402-server';
```

## Standard Express Setup

```ts
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

app.use(paymentMiddleware(
  {
    evm: '0x1234...',
    fast: 'fast1abc...',
  },
  {
    'GET /api/premium/*': {
      price: '$0.10',
      network: 'base-sepolia',
    },
  },
  { url: 'http://localhost:4020' },
));
```

## What The Package Does

- build 402 response payloads
- match configured routes
- parse `X-PAYMENT`
- call the facilitator to verify payments
- call the facilitator to settle EVM payments
- set `X-PAYMENT-RESPONSE` after successful verify / settlement
- offer `paywall(...)` as a one-config wrapper around `paymentMiddleware(...)`

## Route Config Notes

Each route config needs:

- `price`
- `network`

Optional config can add:

- `description`
- `mimeType`
- `asset`

Price strings can be human-readable like `'$0.10'` or raw like `'100000'`.

`config.asset` overrides the asset address or token id, but decimals and any EIP-3009 metadata still come from the package network config or its fallback.

## Facilitator Dependency

This package is not the settlement engine. For working payment verification and EVM settlement, run `@fastxyz/x402-facilitator` and point the middleware at its base URL.

## Built-In Network Caveats

- The only hard-rejected alias is `fast`. Most other network strings are accepted by the builder.
- Built-in `NETWORK_CONFIGS` currently resolve concrete asset metadata for:
  - `fast-mainnet`
  - `arbitrum`
  - `ethereum`
  - `base`
  - `base-sepolia`
- Any other network name falls back to generic asset `0x0000000000000000000000000000000000000000` with 6 decimals.
- Hard cutover: do not describe `fast-testnet`, `arbitrum-sepolia`, or `ethereum-sepolia` as turnkey defaults in this package today.
- Route acceptance still does not guarantee that the facilitator can verify or settle that network.

Use explicit route assets and capability checks when you need anything outside the current built-in config.

## Good Fit

Use this package when:

- the user owns the API
- the user wants Express middleware or low-level 402 helpers
- the task is about route protection, pricing, or creating payment requirements
