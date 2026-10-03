# x402 Facilitator

Use this when the user wants to verify or settle x402 payments, or run the infrastructure behind a paid API.

The package README is the full reference: `node_modules/@fastxyz/x402-facilitator/README.md` after install.

## Install

```bash
npm install @fastxyz/x402-facilitator express viem
```

`express` is a peer dependency; `viem` provides the `Chain` objects for EVM networks.

## Public API

```ts
import { createFacilitatorRoutes, createFacilitatorServer, settle, verify } from '@fastxyz/x402-facilitator';
```

## Run As A Service

```ts
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';
import { base } from 'viem/chains';

const app = express();
app.use(express.json());

app.use(
  createFacilitatorServer({
    evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
    evmChains: {
      base: {
        chain: base,
        rpcUrl: process.env.BASE_RPC_URL!,
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
    },
    fastNetworks: {
      'fast-mainnet': {
        rpcUrl: 'https://api.fast.xyz/proxy-rest',
        committeePublicKeys: process.env.FAST_COMMITTEE_PUBLIC_KEYS!.split(','),
      },
    },
  }),
);

app.listen(4402);
```

## HTTP Endpoints

- `GET /supported`: list the configured payment kinds
- `POST /verify`: validate an incoming payment payload against a requirement
- `POST /settle`: settle a verified payment

## Config Requirements

- No built-in networks: configure every network in `evmChains` or `fastNetworks`.
- `evmChains[<network>]`: `{ chain, rpcUrl?, usdcAddress, usdcName?, usdcVersion? }`, where `chain` is a viem `Chain`.
- `fastNetworks[<network>]`: `{ rpcUrl, committeePublicKeys }`. The committee keys are the Ed25519 keys used to verify Fast transactions; get them from a trusted source, never from the payment payload.
- `evmPrivateKey`: required to settle EVM authorizations, because the facilitator pays the gas.

## Operational Rules

- Fund the facilitator wallet with native gas on every EVM network you settle on.
- Re-verify a payment before settlement.
- `GET /supported` is the source of truth for what a running facilitator accepts.

## Good Fit

Use this package when:

- the user needs verifier or settlement infrastructure
- the task is about `verify`, `settle`, or `/supported`
- the API provider already uses `@fastxyz/x402-server`
