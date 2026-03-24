# Capability Matrix

Use this file to decide which FAST package owns a request and whether the requested route is actually supported.

## Package Selection

- `@fastxyz/sdk`: direct Fast wallet/provider work, browser-safe Fast helpers, config/address/BCS utilities
- `@fastxyz/allset-sdk`: Fast <-> EVM bridge legs and intent execution
- `@fastxyz/x402-client`: payer-side HTTP 402 handling and payment retries
- `@fastxyz/x402-server`: 402 payload creation, route protection, and facilitator calls
- `@fastxyz/x402-facilitator`: payment verification and EVM settlement

## Current Hard Limits

### Fast SDK

- Package: `@fastxyz/sdk`
- Current surface is provider/wallet based. The old `fast()` / `setup()` wrapper is not in the shipped package.
- Root package is the Node entrypoint. Use `@fastxyz/sdk/browser` for browser-safe provider helpers and `@fastxyz/sdk/core` for pure helpers.
- Built-in networks: `testnet`, `mainnet`
- Custom named networks are allowed when config provides RPC and optionally explorer / network ID metadata.
- Bundled token symbols currently resolve `FAST` and `testUSDC` on `testnet`, and `FAST` plus `fastUSDC` on `mainnet`.

### AllSet SDK

- Package: `@fastxyz/allset-sdk`
- Root package currently re-exports runtime APIs. `@fastxyz/allset-sdk/node` is still the clearest explicit runtime import path.
- Directions supported in one call:
  - EVM -> Fast deposit via `sendToFast(...)`
  - Fast -> EVM withdraw via `sendToExternal(...)`
  - Fast -> EVM intent execution via `executeIntent(...)`
- Bundled bridge config is testnet-only:
  - `ethereum` -> chain ID `11155111`
  - `arbitrum` -> chain ID `421614`
  - `base` -> chain ID `8453`
- Bundled mainnet `chains` config is empty. Do not imply turnkey bundled mainnet routing.
- `createEvmExecutor(...)` only accepts chain IDs `11155111`, `421614`, and `8453`.
- Bundled token mapping is `USDC`, with `fastUSDC` and `testUSDC` normalized to that route on Fast-side operations.
- Amounts are raw 6-decimal base-unit strings, not human decimal strings.

### x402 Client

- Package: `@fastxyz/x402-client`
- Primary API: `x402Pay(...)`
- Helper exports also include `parse402Response(...)`, `buildPaymentHeader(...)`, `parsePaymentHeader(...)`, `FAST_NETWORKS`, `EVM_NETWORKS`, `getBridgeConfig(...)`, `getFastBalance(...)`, and `bridgeFastusdcToUsdc(...)`.
- Networks the client can sign today:
  - Fast: `fast-testnet`, `fast-mainnet`
  - EVM: `ethereum-sepolia`, `arbitrum-sepolia`, `arbitrum`, `base-sepolia`, `base`
- If both Fast and EVM are accepted and both wallets are present, the client prefers the Fast path.
- The helper does not pin the remote `402` payload for you. Treat network, asset, recipient, and amount as untrusted input.
- Auto-bridge is not generic. In the current shipped helper, only the bundled `base` path resolves a bridge config.

### x402 Server

- Package: `@fastxyz/x402-server`
- Primary APIs: `paymentMiddleware(...)` and `paywall(...)`
- Low-level helpers are also exported: `createPaymentRequirement(...)`, `createPaymentRequired(...)`, `verifyPayment(...)`, `settlePayment(...)`, `verifyAndSettle(...)`, `parsePrice(...)`, `getNetworkConfig(...)`, `encodePayload(...)`, `decodePayload(...)`
- Role: create 402 requirements and forward verify/settle work to a facilitator
- The only hard rejection is the deprecated alias `fast`. Route acceptance is broader than the real built-in config.
- Built-in `NETWORK_CONFIGS` currently resolve concrete asset metadata for:
  - `fast-mainnet`
  - `arbitrum`
  - `ethereum`
  - `base`
  - `base-sepolia`
- Any other network name falls back to a generic asset `0x0000000000000000000000000000000000000000` with 6 decimals.
- Do not describe `fast-testnet`, `arbitrum-sepolia`, or `ethereum-sepolia` as turnkey server defaults today.

### x402 Facilitator

- Package: `@fastxyz/x402-facilitator`
- Role: verify payments and settle EVM authorizations
- Fast networks in code: `fast-testnet`, `fast-mainnet`
- Current built-in EVM chain map loads:
  - `arbitrum`
  - `ethereum`
  - `base`
  - `base-sepolia`
- `arbitrum-sepolia` and `ethereum-sepolia` currently fail facilitator verify/settle with `invalid_network`.
- `evmPrivateKey` is required for EVM settlement. Fast settlement is already on-chain and becomes a no-op.
- `FacilitatorConfig.chains` is declared in the public type, but the current verify/settle path still uses the built-in chain map.

## Decision Rules

- If the user wants a Fast send, stay in `@fastxyz/sdk`.
- If the user wants Fast <-> EVM movement, use `@fastxyz/allset-sdk`.
- If the user wants to pay for an API, use `@fastxyz/x402-client`.
- If the user wants to sell API access, use `@fastxyz/x402-server` and usually `@fastxyz/x402-facilitator`.
- If the user wants an end-to-end x402 stack, verify the facilitator network first instead of trusting the client or server surface alone.
- If the user wants chain-to-chain movement, explain that it is composed:
  1. deposit into Fast
  2. withdraw out of Fast

## When To Stop And Clarify

Stop and call out the limitation before coding when:

- the user asks for Fast SDK code built around `fast()` or `setup()`
- the user asks for an AllSet route that is not Fast <-> EVM
- the user asks for AllSet chain names like `ethereum-sepolia` or `arbitrum-sepolia` instead of the shipped chain keys `ethereum` and `arbitrum`
- the requested AllSet token is not the shipped `USDC`, `fastUSDC`, or `testUSDC` mapping
- the request assumes all x402 networks support auto-bridge
- the request assumes the x402 client network list equals end-to-end server + facilitator support
- the request assumes `fast-testnet` has a turnkey server-side stablecoin default without explicit asset configuration
- the remote `402` payload asks for a network, asset, recipient, facilitator, or amount that does not match the locally pinned payment policy
- the request assumes a single umbrella x402 package surface when the codebase actually uses role-specific packages
