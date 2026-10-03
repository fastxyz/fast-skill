# x402 Protect An API

Use `@fastxyz/x402-server` for route protection and `@fastxyz/x402-facilitator` for verification and settlement.

## Minimal Setup

```ts
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';
import { paymentMiddleware } from '@fastxyz/x402-server';

const FASTUSD = '0xc655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130';

const facilitator = express();
facilitator.use(express.json());
facilitator.use(
  createFacilitatorServer({
    fastNetworks: {
      'fast-mainnet': {
        rpcUrl: 'https://api.fast.xyz/proxy-rest',
        committeePublicKeys: process.env.FAST_COMMITTEE_PUBLIC_KEYS!.split(','),
      },
    },
  }),
);
facilitator.listen(4020);

const app = express();
app.use(
  paymentMiddleware(
    { fast: 'fast1merchant...' },
    {
      '/api/premium': {
        price: '$0.10',
        network: 'fast-mainnet',
        networkConfig: { asset: FASTUSD, decimals: 6 },
      },
    },
    { url: 'http://localhost:4020' },
  ),
);
app.listen(3000);
```

## Flow

1. API returns 402 requirements for protected routes
2. Client retries with `X-PAYMENT`
3. Server asks facilitator to verify the payment
4. Facilitator settles the payment
5. API serves the protected response

## Checks

- every route needs `networkConfig` (asset and decimals); there are no defaults
- the facilitator must be configured for every network the routes advertise: `fastNetworks` for Fast, `evmChains` (with a viem `Chain` and `evmPrivateKey`) for EVM
- route acceptance in `@fastxyz/x402-server` does not guarantee the facilitator can verify or settle that network
- facilitator must be reachable from the API server
- `express.json()` is required on the facilitator process
- facilitator wallet must hold gas on EVM settlement networks
- Fast payments verify differently from EVM authorizations
