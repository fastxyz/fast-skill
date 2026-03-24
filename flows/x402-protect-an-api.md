# x402 Protect An API

Use `@fastxyz/x402-server` for route protection and `@fastxyz/x402-facilitator` for verification and settlement.

## Minimal Setup

```ts
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

const facilitator = express();
facilitator.use(express.json());
facilitator.use(createFacilitatorServer({
  evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
}));
facilitator.listen(4020);

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

## Flow

1. API returns 402 requirements for protected routes
2. Client retries with `X-PAYMENT`
3. Server asks facilitator to verify the payment
4. Facilitator settles EVM payments if needed
5. API serves the protected response

## Checks

- use a facilitator-supported network such as `base-sepolia`, `base`, `arbitrum`, `ethereum`, or `fast-mainnet`
- if you expose `fast-testnet`, do not rely on the server defaults alone; provide the Fast token asset explicitly
- route acceptance in `@fastxyz/x402-server` does not guarantee the facilitator can verify or settle that network
- facilitator must be reachable from the API server
- `express.json()` is required on the facilitator process
- facilitator wallet must hold gas on EVM settlement networks
- Fast payments verify differently from EVM authorizations
