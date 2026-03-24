---
name: fast-skill
description: >
  Router skill for the FAST ecosystem. Use when the user asks about FAST, fastUSDC, AllSet,
  @fastxyz/sdk, @fastxyz/allset-sdk, @fastxyz/x402-client, @fastxyz/x402-server, or
  @fastxyz/x402-facilitator; wants Fast balances, Fast transfers, Fast to EVM or EVM to Fast
  bridging, needs to top up Fast-side USDC via the hosted ramp link on `https://ramp.fast.xyz`, or wants to pay for or
  protect an API with FAST x402 packages. Do not use for generic EVM wallets, generic bridging,
  unrelated HTTP 402 questions, or non-FAST payment stacks.
compatibility: >
  Portable across Claude- and Codex-style skill runtimes with Node.js package install support and
  network access. Examples assume TypeScript and default to FAST testnet unless the user
  explicitly asks for mainnet.
metadata:
  version: 0.2.0
---

# FAST Skill

Single entrypoint for the FAST SDK ecosystem.

## Install

```bash
npx skills add fastxyz/fast-skill
```

## Bundled Docs

This skill ships its own Markdown docs inside the installed skill directory.

- Treat `references/*.md` and `flows/*.md` as local bundled files, not web URLs.
- Resolve them relative to this `SKILL.md`.
- Open the file path directly if your runtime does not expose clickable Markdown links.
- Do not assume GitHub access is required to read these docs.

## Example Requests

- "Check my FAST testnet balance and send SET to another `fast1...` address"
- "Bridge USDC from Arbitrum Sepolia into Fast"
- "My FAST wallet is low, give me a top-up link"
- "Use the FAST x402 packages to protect an Express API route"

## Do Not Use For

- generic EVM wallet code that does not touch FAST
- arbitrary EVM to EVM bridging presented as one SDK call
- unrelated HTTP 402 questions, payment compliance research, or non-FAST API monetization stacks

## Package Map

- `@fastxyz/sdk`: `FastProvider`, `FastWallet`, browser/core helpers, config helpers, address and BCS utilities for direct Fast work
- `@fastxyz/allset-sdk`: Fast <-> EVM bridge flows, intent builders, `AllSetProvider`, EVM wallet/executor helpers
- `@fastxyz/x402-client`: pay 402-protected APIs
- `@fastxyz/x402-server`: return 402 requirements and protect routes
- `@fastxyz/x402-facilitator`: verify and settle x402 payments

If an umbrella x402 package is introduced later, treat it as a wrapper. The current source-of-truth API surface is still the role-specific client, server, and facilitator packages.

## Start Here

Read `references/capabilities.md` first when the request involves multiple packages or unclear support.

Then route by task:

- Fast wallet, balance, send, token info, signatures: `references/fast-sdk.md`
- Bridge between Fast and EVM: `references/allset-sdk.md`
- Pay for a protected API: `references/x402-client.md`
- Add payments to an API: `references/x402-server.md`
- Run verification or settlement infrastructure: `references/x402-facilitator.md`

Load a flow playbook when the user asks for an end-to-end scenario:

- Fast to Fast transfer: `flows/fast-to-fast-payment.md`
- EVM to Fast deposit: `flows/evm-to-fast-deposit.md`
- Fast to EVM withdraw: `flows/fast-to-evm-withdraw.md`
- Top up Fast wallet via hosted ramp: `flows/top-up-fast-wallet-via-ramp.md`
- Chain to chain via Fast: `flows/chain-to-chain-via-fast.md`
- Pay an x402 API: `flows/x402-pay-an-api.md`
- Protect an x402 API: `flows/x402-protect-an-api.md`

## Routing Rules

### 1. Choose the smallest package that fits

- Do not default to multiple FAST packages if one package solves the task.
- Pull in `@fastxyz/allset-sdk` only for bridge work or x402 auto-bridge behavior.
- Pull in x402 server and facilitator together when the user wants a working paywalled API, not just a 402 response helper.

### 2. Default to testnets unless the user explicitly asks for mainnet

- `@fastxyz/sdk` ships `testnet` and `mainnet` defaults and can also load custom named networks from config.
- `@fastxyz/allset-sdk` ships bundled testnet routes only: `ethereum` (chain ID `11155111`), `arbitrum` (`421614`), and `base` (`8453`). The bundled mainnet `chains` map is empty.
- x402 client, server, and facilitator do not expose the same network set. Check `references/capabilities.md` before promising an end-to-end paid API flow.

### 3. Treat support limits as code-level constraints

- If a route or token is not in the shipped SDK config, say so clearly before writing code.
- Do not claim AllSet supports arbitrary EVM to EVM bridging in one call. Cross-chain EVM flows are composed from two legs through Fast.
- Do not write against removed Fast examples such as `fast()` or `setup()`. The shipped Fast SDK is provider/wallet based.
- Do not claim x402 auto-bridge works on every EVM network; the current client helper only resolves the bundled bridge path documented in the capability matrix.
- Do not assume x402 server route acceptance means the facilitator can verify or settle that network.

### 4. Respect irreversible operations

- Fast sends are irreversible.
- Never overwrite `~/.fast/keys/`.
- Bridge and settlement operations can move funds or consume gas. Confirm addresses and network choice before final code.
- Hosted ramp flows require user interaction in the browser. Do not imply the agent can complete the card or KYC flow itself.

## Common Issues

- If the request only says `x402` or `402`, confirm it is specifically about the FAST `@fastxyz/*` packages before routing here.
- If the user asks for unsupported routes or token mappings, stop and cite the shipped constraint from `references/capabilities.md` instead of approximating a solution.
- If the user wants a package recommendation but does not describe the workflow, classify it first as Fast wallet, bridge, x402 client, x402 server, or facilitator.
- If the user asks for AllSet chains named `ethereum-sepolia` or `arbitrum-sepolia`, translate that request back to the shipped AllSet chain keys `ethereum` and `arbitrum` before coding.
- If the user wants end-to-end x402 on `arbitrum-sepolia` or `ethereum-sepolia`, stop and cite the current facilitator limits instead of pretending the full stack supports them.
- If the user needs more Fast-side USDC and already has a `fast1...` address, prefer offering the hosted ramp link on `https://ramp.fast.xyz` over inventing a custom funding workflow.

## Working Pattern

1. Classify the request: Fast payment, bridge, x402 client, x402 server, or facilitator.
2. Read the matching reference file.
3. If the task is scenario-based, read the matching flow file too.
4. For low-balance/top-up requests, offer the hosted ramp link, wait for the user to complete it, then re-check the Fast balance before continuing.
5. Implement against the package API that actually exists in code today.
6. Call out unsupported routes instead of papering over them.
