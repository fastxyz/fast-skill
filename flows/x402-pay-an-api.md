# x402 Pay An API

Use `@fastxyz/x402-client` when the user's code is the payer. A person paying a URL from the terminal can use the `fast` CLI skill (`fast pay <url> --dry-run`, then `fast pay <url>`).

## Production Preconditions

Before using this flow in production:

- allowlist the API origin you intend to pay
- pin the expected payment network, asset, recipient, and max spend in your app config
- `x402Pay(...)` pays whatever the `402` asks, with no hook to stop it: to enforce the pinned policy, check the `402` with `parse402Response(...)` and pay the matching requirement with `handleFastPayment(...)`, as in the [x402 client reference](../references/x402-client.md#enforce-a-payment-policy)
- confirm whether the user means mainnet (real funds) or testnet
- do not enable auto-bridge unless the user explicitly approved a bridge-backed payment path

## Fast Example

```ts
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'fast',
    privateKey: process.env.FAST_PRIVATE_KEY!,
    publicKey: process.env.FAST_PUBLIC_KEY!,
    address: process.env.FAST_ADDRESS!,
    rpcUrl: 'https://api.fast.xyz/proxy-rest',
  },
});

console.log(result.success, result.statusCode);
```

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
  evmNetworks: {
    base: {
      chainId: 8453,
      rpcUrl: process.env.BASE_RPC_URL!,
      usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
});

console.log(result.success, result.statusCode);
```

Auto-bridge needs both wallets as an array plus a `bridgeConfig` with the AllSet route values; see the package README.

## Flow With A Pinned Policy

1. Make the request to a trusted or allowlisted API URL.
2. Parse `402 Payment Required` with `parse402Response(...)` as untrusted remote input.
3. Compare the returned network, asset, recipient, and amount against the pinned policy.
4. Stop if any field mismatches, if the flow would switch to mainnet without approval, or if it would require an unapproved auto-bridge.
5. Pay only the matching requirement with `handleFastPayment(...)`. It submits the Fast transfer, then retries the request with `X-PAYMENT`; the money has moved even if that retry fails.

The two `x402Pay(...)` examples above skip steps 2 to 4: use them only with an API you trust to ask the right price.

## Checks

- if the 402 accepts both a Fast and an EVM network and both wallets are given, the client pays on Fast
- a Fast payment requirement must name its `asset` (the token ID); the client refuses one without it
- the client knows only the EVM networks you pass in `evmNetworks`
- the `402` response must not be trusted by itself; pin expectations locally and reject mismatches
- require explicit approval before using both wallets for auto-bridge
- require explicit approval before any mainnet payment path
