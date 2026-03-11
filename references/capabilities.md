# Capability Matrix

Use this file to decide which FAST package owns a request and whether the requested route is actually supported.

## Package Selection

| Package | Use it for | Do not use it for |
|---|---|---|
| `@fastxyz/sdk` | FastProvider read-only queries, FastWallet sends and signing, token metadata, low-level claim submission | EVM execution, bridging, x402 paywall logic |
| `@fastxyz/allset-sdk` | Fast <-> EVM bridge flows | Generic Fast wallet work or arbitrary EVM <-> EVM routing |
| `@fastxyz/x402-client` | Paying 402-protected APIs | Protecting routes or running settlement infra |
| `@fastxyz/x402-server` | Returning 402 requirements, route protection, payment verification hooks | Signing client payments or settling on-chain by itself |
| `@fastxyz/x402-facilitator` | Verifying and settling x402 payments | Wallet UX, bridge UX, or general API middleware |

## Current Hard Limits

### Fast SDK

- Package: `@fastxyz/sdk`
- Networks: built-in `testnet` and `mainnet`, plus custom names from `~/.fast/networks.json`
- Default: `testnet`
- Main surface: `new FastProvider({ network?, rpcUrl?, explorerUrl? })` for reads, then `FastWallet.fromKeyfile(..., provider)` or `FastWallet.fromPrivateKey(..., provider)` for signing
- Package split: none. `FastProvider` and `FastWallet` are both exported from the same `@fastxyz/sdk` package.
- Safe assumption: use this for direct Fast work unless the user explicitly needs a bridge or x402 flow

### AllSet SDK

- Package: `@fastxyz/allset-sdk`
- Current network posture: testnet-focused
- Directions supported in one call:
  - EVM -> Fast deposit
  - Fast -> EVM withdraw
- EVM chains in current bridge config: `arbitrum`, `ethereum`
- Token mapping actually shipped today: Arbitrum Sepolia `USDC` and `fastUSDC`
- Important caveat: Ethereum Sepolia has config in code, but no shipped token mapping in the current SDK. Do not claim it works without adding code.
- Amounts are passed as raw base-unit strings, not human decimal strings

### x402 Client

- Package: `@fastxyz/x402-client`
- Primary API: `x402Pay(...)`
- Payment networks listed by the SDK:
  - `fast-testnet`, `fast-mainnet`
  - `arbitrum-sepolia`, `arbitrum`
  - `base-sepolia`, `base`
  - `ethereum`
- Auto-bridge caveat: the bridge helper currently has explicit configs for `arbitrum-sepolia` and `base-sepolia`
- If the user wants auto-bridge, provide both a Fast wallet and an EVM wallet

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
- the requested AllSet token is not the shipped `USDC` or `fastUSDC` mapping
- the request assumes all x402 networks support auto-bridge
- the request assumes a single umbrella x402 package surface when the codebase actually uses role-specific packages
