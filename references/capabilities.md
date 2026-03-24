# Capability Matrix

Use this file to decide which FAST package owns a request and whether the requested route is actually supported.

## Package Selection

| Package | Use it for | Do not use it for |
|---|---|---|
| `@fastxyz/sdk` | Fast wallet setup, balance checks, sends, message signing, token metadata, low-level claim submission | EVM execution, bridging, x402 paywall logic |
| `@fastxyz/allset-sdk` | Fast <-> EVM bridge flows | Generic Fast wallet work or arbitrary EVM <-> EVM routing |
| `@fastxyz/x402-client` | Paying 402-protected APIs | Protecting routes or running settlement infra |
| `@fastxyz/x402-server` | Returning 402 requirements, route protection, payment verification hooks | Signing client payments or settling on-chain by itself |
| `@fastxyz/x402-facilitator` | Verifying and settling x402 payments | Wallet UX, bridge UX, or general API middleware |

## Current Hard Limits

### Fast SDK

- Package: `@fastxyz/sdk`
- Networks: `testnet`, `mainnet`
- Default: `testnet`
- Main surface: `fast({ network? })`
- Safe assumption: use this for direct Fast work unless the user explicitly needs a bridge or x402 flow

### AllSet SDK

- Package: `@fastxyz/allset-sdk`
- Current network posture: testnet-focused
- Entrypoints:
  - `@fastxyz/allset-sdk` for pure deposit planning and intent builders
  - `@fastxyz/allset-sdk/node` for `AllSetProvider`, `createEvmWallet`, and `createEvmExecutor`
- Directions supported in one call:
  - EVM -> Fast deposit
  - Fast -> EVM withdraw
- EVM chains in current bundled testnet config: `arbitrum`, `ethereum`, `base`
- Token mapping actually shipped today: `USDC`, with `fastUSDC` and `testUSDC` accepted as Fast-side aliases
- Important caveat: bundled mainnet config is empty. Do not imply bundled mainnet bridge support.
- Amounts are passed as raw base-unit strings, not human decimal strings

### x402 Client

- Package: `@fastxyz/x402-client`
- Primary API: `x402Pay(...)`
- Production rule: treat the returned `402 Payment Required` payload as untrusted input and only sign when the
  URL, network, asset, recipient or facilitator, and max spend match locally pinned expectations
- Payment networks listed by the SDK:
  - `fast-testnet`, `fast-mainnet`
  - `arbitrum-sepolia`, `arbitrum`
  - `base-sepolia`, `base`
  - `ethereum`
- Auto-bridge caveat: the bridge helper currently has explicit configs for `arbitrum-sepolia` and `base-sepolia`
- If the user wants auto-bridge, provide both a Fast wallet and an EVM wallet only after explicit approval

### x402 Server

- Package: `@fastxyz/x402-server`
- Primary API: `paymentMiddleware(...)`
- Role: create 402 requirements and forward verify/settle work to a facilitator
- Supported network config baked into the package:
  - `fast-testnet`, `fast-mainnet`
  - `arbitrum-sepolia`, `arbitrum`
  - `base-sepolia`, `base`
  - `ethereum`
- Unknown networks fall back to a generic asset config. Do not invent support just because the helper has a fallback.

### x402 Facilitator

- Package: `@fastxyz/x402-facilitator`
- Role: verify payments and settle EVM authorizations
- Supported EVM chain config in code:
  - `arbitrum-sepolia`, `arbitrum`
  - `base-sepolia`, `base`
  - `ethereum`, `ethereum-sepolia`
- Supported Fast network config in code:
  - `fast-testnet`, `fast-mainnet`
- Settlement only applies to EVM payments. Fast payments are already on-chain.

## Decision Rules

- If the user wants a Fast send, stay in `@fastxyz/sdk`.
- If the user wants Fast <-> EVM movement, use `@fastxyz/allset-sdk`.
- If the user wants to pay for an API, use `@fastxyz/x402-client`.
- If the user wants to sell API access, use `@fastxyz/x402-server` and usually `@fastxyz/x402-facilitator`.
- If the user wants chain-to-chain movement, explain that it is composed:
  1. deposit into Fast
  2. withdraw out of Fast

## When To Stop And Clarify

Stop and call out the limitation before coding when:

- the user asks for an AllSet route that is not Fast <-> EVM
- the requested AllSet token is not the shipped `USDC`, `fastUSDC`, or `testUSDC` mapping
- the request assumes all x402 networks support auto-bridge
- the remote `402` payload asks for a network, asset, recipient, facilitator, or amount that does not match the locally pinned payment policy
- the request assumes a single umbrella x402 package surface when the codebase actually uses role-specific packages
