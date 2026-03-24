# x402 Facilitator

Use this when the user wants to verify or settle x402 payments, or run the infrastructure behind a paid API.

## Install

```bash
npm install @fastxyz/x402-facilitator
```

## Public API

```ts
import {
  createFacilitatorServer,
  createFacilitatorRoutes,
  verify,
  settle,
  SUPPORTED_EVM_NETWORKS,
  SUPPORTED_FAST_NETWORKS,
} from '@fastxyz/x402-facilitator';
```

## Run As A Service

```ts
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

const app = express();
app.use(express.json());

app.use(createFacilitatorServer({
  evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
}));
```

## HTTP Endpoints

- `GET /supported`: list supported networks
- `POST /verify`: validate an incoming payment payload
- `POST /settle`: settle an EVM authorization on-chain

Fast payments do not need settlement because the payment is already on-chain.

## Use As A Library

- `verify(paymentPayload, paymentRequirement)`
- `settle(paymentPayload, paymentRequirement, config)`

## Config Requirements

- `evmPrivateKey`: required for EVM settlement, because the facilitator pays gas
- `fastRpcUrl`: optional override for Fast verification
- `committeePublicKeys`: optional override for trusted Fast committee keys
- `chains`: declared in the public type, but the current verify / settle path still uses the built-in chain map

## Supported Networks In Code

EVM:

- `arbitrum`
- `ethereum`
- `base`
- `base-sepolia`

Fast:

- `fast-testnet`, `fast-mainnet`

Hard cutover: `arbitrum-sepolia` and `ethereum-sepolia` are not in the current built-in EVM chain map. `verify(...)` and `settle(...)` return `invalid_network` for them.

## Operational Rules

- Fund the facilitator wallet with native gas on every EVM network you settle on.
- Re-verify a payment before settlement.
- Treat Fast verification and EVM settlement as different concerns.
- `GET /supported` is the source of truth for the current service surface.
- The HTTP server accepts either decoded JSON payloads or base64-encoded `paymentPayload` bodies.

## Good Fit

Use this package when:

- the user needs verifier or settlement infrastructure
- the task is about `verify`, `settle`, or `/supported`
- the API provider already uses `@fastxyz/x402-server`
