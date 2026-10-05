# x402 Client

Use this when the user wants their code to pay for a 402-protected API. For a person paying a URL from the terminal, the `fast` CLI skill has `fast pay <url>`.

The package README is the full reference: `node_modules/@fastxyz/x402-client/README.md` after install.

## Install

```bash
npm install @fastxyz/x402-client
```

## Public API

```ts
import { buildPaymentHeader, parse402Response, parsePaymentHeader, x402Pay } from '@fastxyz/x402-client';
```

Also exported: `handleFastPayment(...)`, `handleEvmPayment(...)`, `getFastBalance(...)` and `bridgeFastusdcToUsdc(...)`.

`x402Pay(...)` makes the request, handles a `402 Payment Required` response, signs a payment, and retries with the `X-PAYMENT` header. If the first response isn't `402`, it returns that response as-is.

Treat the remote `402 Payment Required` payload as untrusted input. `x402Pay(...)` itself pays whatever the `402` asks, so in production enforce a pinned policy as shown in [Enforce A Payment Policy](#enforce-a-payment-policy).

## No Built-In Networks

The client has no network tables. You supply:

- Fast wallet: `{ type: 'fast', privateKey, publicKey, address, rpcUrl }`. `rpcUrl` is required (mainnet: `https://api.fast.xyz/proxy-rest`).
- EVM wallet: `{ type: 'evm', privateKey, address }`, plus `evmNetworks[<network>] = { chainId, rpcUrl, usdcAddress }` for every EVM network you're willing to pay on.
- Auto-bridge (Fast USDC to EVM USDC when the EVM balance is short): both wallets as an array, plus a `bridgeConfig` with the AllSet route values (`rpcUrl`, `fastBridgeAddress`, `relayerUrl`, `crossSignUrl`, `tokenEvmAddress`, `tokenFastTokenId`, `networkId`).

## Pay On Fast

```ts
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'fast',
    privateKey: process.env.FAST_PRIVATE_KEY!,
    publicKey: process.env.FAST_PUBLIC_KEY!,
    address: process.env.FAST_ADDRESS!, // fast1...
    rpcUrl: 'https://api.fast.xyz/proxy-rest',
  },
});

console.log(result.statusCode, result.body);
```

## Enforce A Payment Policy

`x402Pay(...)` pays whatever the `402` asks: on Fast it submits the transfer of `maxAmountRequired` to `payTo` as soon as it reads the `402`, before retrying the request, and it has no hook to stop it. Checking a `402` yourself first doesn't help, because `x402Pay` fetches the URL again. To pay only within a pinned policy, parse and check the `402` (including its payment scheme), then pay that exact requirement with `handleFastPayment(...)`:

```ts
import { handleFastPayment, parse402Response } from '@fastxyz/x402-client';

const url = 'https://api.example.com/premium';
const policy = {
  network: 'fast-mainnet',
  asset: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130', // fastUSD, hex without 0x
  payTo: 'fast1merchant...',
  maxAmount: 100_000n, // 0.10 fastUSD in base units
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

The Fast transfer happens before the paid retry, so the money has moved even if that retry fails.

## Runtime Behavior That Matters

- If the 402 accepts both a Fast and an EVM network and both wallets are present, the client pays on Fast.
- An EVM payment is signed as EIP-3009 `transferWithAuthorization`, and fails if `evmNetworks` has no entry for the requested network.
- For Fast payments, `result.payment.amount` is a raw base-unit string; humanize it with the token's decimals yourself.
- `verbose: true` returns step-by-step logs.

## Production Guardrails

- Only call `x402Pay(...)` against trusted or allowlisted API origins.
- Pin the expected payment scheme, network, asset, recipient and a maximum spend, and pay only a requirement that matches them (see above). `x402Pay(...)` does not do this for you.
- Confirm whether the user means mainnet (real funds) or testnet before paying.
- Don't pass both wallets by default: that enables auto-bridge, which needs the user's explicit approval of the bridge path, destination network and spend ceiling.

## Use This Instead Of Other FAST Packages When

- the user is the payer, not the API provider
- the user wants a single helper that speaks HTTP and payment
- the task is about `X-PAYMENT`, 402 response handling, or payment retries
