# x402 Pay An API

Use `@fastxyz/x402-client` when the user's code is the payer. A person paying a URL from the terminal can use the `fast` CLI skill (`fast pay <url> --dry-run`, then `fast pay <url>`).

## Production Preconditions

Before using this flow in production:

- allowlist the API origin you intend to pay
- pin the expected payment network, asset, recipient, and max spend in your app config
- check the `402` with `parse402Response(...)` and pay only a requirement that matches the pinned policy, as in the examples below: `x402Pay(...)` pays whatever the `402` asks, with no hook to stop it
- confirm whether the user means mainnet (real funds) or testnet
- do not enable auto-bridge unless the user explicitly approved a bridge-backed payment path

## Fast Example

Check the `402` against a pinned policy, then pay only the requirement that matches it:

```ts
import { handleFastPayment, parse402Response } from '@fastxyz/x402-client';

const url = 'https://api.example.com/premium'; // an allowlisted origin
const policy = {
  network: 'fast-mainnet',
  asset: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130', // fastUSD, hex without 0x
  payTo: 'fast1merchant...',
  maxAmount: 100_000n, // 0.10 fastUSD in base units: the most this call may spend
};
const hex = (value: string) => value.replace(/^0x/i, '').toLowerCase();

const response = await fetch(url);
if (response.status !== 402) throw new Error(`Expected 402, got ${response.status}`);
const paymentRequired = await parse402Response(response);

const requirement = (paymentRequired.accepts ?? []).find(
  (r) =>
    r.scheme === 'exact' &&
    r.network === policy.network &&
    r.asset !== undefined &&
    hex(r.asset) === policy.asset &&
    r.payTo === policy.payTo &&
    BigInt(r.maxAmountRequired) <= policy.maxAmount,
);
if (!requirement) throw new Error('The 402 does not match the pinned payment policy; not paying.');

const result = await handleFastPayment(url, 'GET', {}, undefined, paymentRequired, requirement, {
  type: 'fast',
  privateKey: process.env.FAST_PRIVATE_KEY!,
  publicKey: process.env.FAST_PUBLIC_KEY!,
  address: process.env.FAST_ADDRESS!,
  rpcUrl: 'https://api.fast.xyz/proxy-rest',
});

console.log(result.success, result.statusCode);
```

## EVM Example

The same check, paying on Base with `handleEvmPayment(...)`. Without a Fast wallet and a `bridgeConfig` it never bridges:

```ts
import { handleEvmPayment, parse402Response } from '@fastxyz/x402-client';

const url = 'https://api.example.com/premium'; // an allowlisted origin
const policy = {
  network: 'base',
  asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const, // USDC on Base, lowercase
  payTo: '0xmerchant...'.toLowerCase(),
  maxAmount: 100_000n, // 0.10 USDC in base units: the most this call may spend
};

const response = await fetch(url);
if (response.status !== 402) throw new Error(`Expected 402, got ${response.status}`);
const paymentRequired = await parse402Response(response);

const requirement = (paymentRequired.accepts ?? []).find(
  (r) =>
    r.scheme === 'exact' &&
    r.network === policy.network &&
    r.asset?.toLowerCase() === policy.asset &&
    r.payTo.toLowerCase() === policy.payTo &&
    BigInt(r.maxAmountRequired) <= policy.maxAmount,
);
if (!requirement) throw new Error('The 402 does not match the pinned payment policy; not paying.');

const result = await handleEvmPayment(
  url, 'GET', {}, undefined, paymentRequired, requirement,
  {
    type: 'evm',
    privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    address: process.env.EVM_ADDRESS as `0x${string}`,
  },
  { chainId: 8453, rpcUrl: process.env.BASE_RPC_URL!, usdcAddress: policy.asset },
);

console.log(result.success, result.statusCode);
```

## `x402Pay(...)`: Testnet Only

`x402Pay({ url, wallet, evmNetworks?, bridgeConfig? })` does the whole round trip in one call, but it pays whatever the `402` asks, with no spend limit and no hook to stop it. Use it only on testnet, or for a quick check against your own server, never as production code. Auto-bridge needs both wallets as an array plus a `bridgeConfig` with the AllSet route values; see the package README.

## Steps

1. Make the request to a trusted or allowlisted API URL.
2. Parse `402 Payment Required` with `parse402Response(...)` as untrusted remote input.
3. Compare the returned scheme, network, asset, recipient and amount against the pinned policy.
4. Stop if any field mismatches, if the flow would switch to mainnet without approval, or if it would require an unapproved auto-bridge.
5. Pay only the matching requirement with `handleFastPayment(...)` or `handleEvmPayment(...)`. On Fast the transfer is submitted before the request is retried with `X-PAYMENT`, so the money has moved even if that retry fails.

## Checks

- if the 402 accepts both a Fast and an EVM network and both wallets are given, the client pays on Fast
- a Fast payment requirement must name its `asset` (the token ID); the client refuses one without it
- the client knows only the EVM networks you pass in `evmNetworks`
- the `402` response must not be trusted by itself; pin expectations locally and reject mismatches
- require explicit approval before using both wallets for auto-bridge
- require explicit approval before any mainnet payment path
