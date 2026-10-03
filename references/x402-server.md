# x402 Server

Use this when the user wants to add payment requirements to API routes.

The package README is the full reference: `node_modules/@fastxyz/x402-server/README.md` after install.

## Install

```bash
npm install @fastxyz/x402-server express
```

`express` is a peer dependency.

## Public API

```ts
import {
  createPaymentRequired,
  createPaymentRequirement,
  parsePrice,
  paymentMiddleware,
  paywall,
  settlePayment,
  verifyAndSettle,
  verifyPayment,
} from '@fastxyz/x402-server';
```

Also exported: `parsePaymentHeader`, `encodePayload`, `decodePayload`, `encodePaymentResponse`.

## Standard Express Setup

```ts
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

app.use(
  paymentMiddleware(
    { fast: 'fast1merchant...' },
    {
      '/premium': {
        price: '$0.10',
        network: 'fast-mainnet',
        networkConfig: {
          asset: '0xc655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130', // fastUSD
          decimals: 6,
        },
      },
    },
    { url: process.env.FACILITATOR_URL! },
  ),
);

app.get('/premium', (_req, res) => {
  res.json({ content: 'paid content' });
});

app.listen(3000);
```

## What The Package Does

- builds 402 response payloads for matched routes
- parses `X-PAYMENT`
- calls the facilitator to verify every payment, and to settle EVM payments. A Fast payment is already on-chain when the client retries (the client submits the transfer), so it is only verified
- sets `X-PAYMENT-RESPONSE` after a successful payment
- offers `paywall(...)` as a single-route version of `paymentMiddleware(...)`

## Route Config

- `price`: human-readable, such as `'$0.10'` or `'0.1 USDC'`
- `network`: the x402 network name, such as `'fast-mainnet'`, `'fast-testnet'` or `'base'`
- `networkConfig: { asset, decimals, extra? }`: required; there are no network defaults
- optional `config: { description?, mimeType?, asset? }`

## Replay

Neither this package nor the facilitator remembers which Fast payments were already used: the same `X-PAYMENT` verifies again on a later request. Record each Fast payment's transaction hash and refuse one you have already served.

## Facilitator Dependency

This package is not the settlement engine. Run `@fastxyz/x402-facilitator`, configure it for every network your routes advertise, and point the middleware at its URL. Route acceptance here does not mean the facilitator can verify or settle that network.

## Good Fit

Use this package when:

- the user owns the API
- the user wants Express middleware or low-level 402 helpers
- the task is about route protection, pricing, or creating payment requirements
