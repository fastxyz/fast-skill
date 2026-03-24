# x402 Pay An API

Use `@fastxyz/x402-client` when the user is the payer.

## Production Preconditions

Before using this flow in production:

- allowlist the API origin you intend to pay
- pin the expected payment network, asset, recipient or facilitator, and max spend in your app config
- default to testnet unless the user explicitly approved mainnet
- do not enable auto-bridge unless the user explicitly approved a bridge-backed payment path
- do not assume the client's supported network list matches the bundled server + facilitator stack

## EVM Example

```ts
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'evm',
    privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    address: process.env.EVM_ADDRESS as `0x${string}`,
  },
  verbose: true,
});
```

## Auto-Bridge Example

```ts
const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: [fastWallet, evmWallet],
  verbose: true,
});
```

That only enables the bridge path. The current shipped helper still needs the server to ask for a network that resolves a bundled bridge config, which is currently `base`.

## Flow

1. Make the request to a trusted or allowlisted API URL.
2. Parse `402 Payment Required` as untrusted remote input.
3. Compare the returned network, asset, recipient or facilitator, and amount against the pinned policy.
4. Stop if any field mismatches, if the flow would switch to mainnet without approval, or if it would require an unapproved auto-bridge.
5. Sign and attach `X-PAYMENT` only after the pinned checks pass.
6. Retry the request.

## Checks

- if both Fast and EVM are accepted, the client prefers Fast
- auto-bridge depends on explicit bridge helper configs, not a generic any-chain path
- the shipped auto-bridge helper currently resolves only the bundled `base` path
- the `402` response must not be trusted by itself; pin expectations locally and reject mismatches
- if a Fast payment requirement omits `asset`, the client falls back to native `FAST`
- require explicit approval before using both wallets for auto-bridge
- require explicit approval before any mainnet payment path
