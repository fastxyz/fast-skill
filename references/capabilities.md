# Capability Matrix

Use this file to decide which FAST package owns a request and whether the requested route is actually supported.

Checked against `@fastxyz/sdk` 2.4.0, `@fastxyz/allset-sdk` 1.3.0, `@fastxyz/x402-client` 1.0.10, `@fastxyz/x402-server` 1.0.1, `@fastxyz/x402-facilitator` 1.0.8 and `@fastxyz/cli` 1.5.0. When an installed package disagrees with this file, the package wins: read `node_modules/@fastxyz/<package>/README.md`.

## Package Selection

- `@fastxyz/sdk`: direct Fast work: keys, provider, transactions, signatures, address and BCS helpers
- `@fastxyz/allset-sdk`: Fast <-> EVM bridge legs and intent execution
- `@fastxyz/x402-client`: payer-side HTTP 402 handling and payment retries
- `@fastxyz/x402-server`: 402 payload creation, route protection, and facilitator calls
- `@fastxyz/x402-facilitator`: payment verification and settlement
- `@fastxyz/cli` (`fast`): a person's own wallet from the terminal; route those requests to the `fast` CLI skill (`https://skill.fast.xyz/skill.md`)

## Current Hard Limits

### Fast SDK

- Package: `@fastxyz/sdk` (Node.js 20+)
- Entrypoints: `@fastxyz/sdk` (`Signer`, `FastProvider`, `TransactionBuilder`, `MultiSigWorkflow`, helpers), `@fastxyz/sdk/networks` (`mainnet`, `testnet`), `@fastxyz/sdk/core` (pure functions), `@fastxyz/sdk/wallet` (Fast app wallet connection and key handover), `@fastxyz/sdk/multisig`. There is no `@fastxyz/sdk/browser` entrypoint and no `FastWallet` class.
- Built-in networks:
  - `mainnet`: network ID `fast:mainnet`, default token `fastUSD` (`0xc655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130`, 6 decimals)
  - `testnet`: network ID `fast:testnet`, default token `testUSDC` (`0xd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46`, 6 decimals)
- Custom networks: `new FastProvider({ url, networkId? })`.
- The SDK takes token IDs, not symbols, and amounts as `bigint` base units (`1_500_000n` is 1.5 fastUSD).
- The SDK reads no files: there is no keyfile loading from `~/.fast`. The caller passes the private key to `new Signer(...)`.
- No fee estimate is exposed.

### AllSet SDK

- Package: `@fastxyz/allset-sdk` (Node.js 20+)
- One root entrypoint of pure functions. There is no `AllSetProvider`, no embedded route config, and no subpath besides `@fastxyz/allset-sdk/schemas/allset-intent-v1.json`.
- Directions supported in one call:
  - EVM -> Fast deposit via `executeDeposit(...)` (submits an ERC-20 approval first if needed), or `smartDeposit(...)` with EIP-7702, where gas is paid in USDC
  - Fast -> EVM withdraw via `executeWithdraw(...)`
  - Fast -> EVM intent execution via `executeIntent(...)` with the intent builders
- `createEvmExecutor(...)` accepts chain IDs `1` (Ethereum), `137` (Polygon), `42161` (Arbitrum One), `8453` (Base), `5042` (Arc), `11155111` (Sepolia) and `421614` (Arbitrum Sepolia).
- Bridge routes deployed today (the ones the `fast` CLI ships): mainnet `ethereum`, `arbitrum`, `base`, `polygon` and `arc`, bridging USDC, which is credited on Fast as `fastUSD`; testnet `arbitrum-sepolia` and `ethereum-sepolia`, bridging `testUSDC`.
- Route values are the caller's job: bridge contract, Fast bridge address, relayer URL, cross-sign URL, token EVM address and Fast token ID. Trusted sources:
  - `fast info bridge-chains --json` (chain IDs, bridge contracts) and `fast info bridge-tokens --json` (EVM addresses and Fast token IDs per chain)
  - the CLI's bundled config, `app/cli/src/config/networks.ts` in fastxyz/fast-sdk, which also has the relayer, cross-sign and Fast bridge addresses
- Amounts: base-unit strings for `executeDeposit`, `executeWithdraw` and `executeIntent` (`'1000000'` is 1 USDC); `bigint` for `smartDeposit` and `buildDepositTransaction`.
- Withdrawals sign with `Signer` and submit through `FastProvider`, both from `@fastxyz/sdk`.
- `IndeterminateTransactionError` and `PostPaymentRecoveryError` mean Fast transactions may already have happened: reconcile, don't retry blindly.

### x402 Client

- Package: `@fastxyz/x402-client`
- Primary API: `x402Pay(...)`. Helpers: `parse402Response(...)`, `buildPaymentHeader(...)`, `parsePaymentHeader(...)`, `getFastBalance(...)`, `bridgeFastusdcToUsdc(...)`.
- No built-in networks. A Fast wallet needs `rpcUrl`; EVM payments need `evmNetworks[<network>] = { chainId, rpcUrl, usdcAddress }`; auto-bridge needs both wallets plus a `bridgeConfig` with the AllSet route values.
- If the 402 accepts both a Fast and an EVM network and both wallets are present, the client pays on Fast.
- The helper does not pin the remote `402` payload for you. Treat network, asset, recipient, and amount as untrusted input.

### x402 Server

- Package: `@fastxyz/x402-server` (Express-compatible; `express` is a peer dependency)
- Primary APIs: `paymentMiddleware(...)` and `paywall(...)`. Low-level helpers: `createPaymentRequirement(...)`, `createPaymentRequired(...)`, `verifyPayment(...)`, `settlePayment(...)`, `verifyAndSettle(...)`, `parsePrice(...)`, `parsePaymentHeader(...)`, `encodePayload(...)`, `decodePayload(...)`, `encodePaymentResponse(...)`.
- Role: create 402 requirements and forward verify/settle work to a facilitator.
- No network defaults: every route needs `network` and `networkConfig: { asset, decimals }`.

### x402 Facilitator

- Package: `@fastxyz/x402-facilitator` (`express` is a peer dependency)
- APIs: `createFacilitatorServer(...)`, `createFacilitatorRoutes(...)`, `verify(...)`, `settle(...)`.
- No built-in networks: each one is configured in `evmChains` (`{ chain, rpcUrl?, usdcAddress }`, with a viem `Chain`) or `fastNetworks` (`{ rpcUrl, committeePublicKeys }`).
- `evmPrivateKey` is required to settle EVM authorizations; the facilitator pays the gas.

## Decision Rules

- If the user wants to manage their own money, route to the `fast` CLI skill.
- If the user wants a Fast send in code, stay in `@fastxyz/sdk`.
- If the user wants Fast <-> EVM movement in code, use `@fastxyz/allset-sdk`.
- If the user wants to pay for an API, use `@fastxyz/x402-client`.
- If the user wants to sell API access, use `@fastxyz/x402-server` and usually `@fastxyz/x402-facilitator`.
- If the user wants an end-to-end x402 stack, check that the facilitator is configured for the network the server advertises.
- If the user wants chain-to-chain movement, explain that it is composed:
  1. deposit into Fast
  2. withdraw out of Fast

## When To Stop And Clarify

Stop and call out the limitation before coding when:

- the user asks for code built around removed APIs (`fast()`, `setup()`, `FastWallet`, `AllSetProvider`)
- the user asks for an AllSet route that is not Fast <-> EVM, or a chain without a deployed route
- the requested bridge token is not one the route carries (USDC on mainnet, `testUSDC` on testnet)
- you don't have trusted route values (bridge contract, relayer, cross-sign URL, token addresses) for the chosen chain
- the request assumes the x402 packages know a network without being configured for it
- the remote `402` payload asks for a network, asset, recipient, facilitator, or amount that does not match the locally pinned payment policy
- it isn't clear whether the user means mainnet (real funds) or testnet
