---
name: fast-skill
version: 0.2.1
description: >
  Route FAST ecosystem work to the shipped @fastxyz packages. Use when the user mentions FAST,
  fastUSDC, AllSet, @fastxyz/sdk, @fastxyz/allset-sdk, @fastxyz/x402-client,
  @fastxyz/x402-server, or @fastxyz/x402-facilitator; wants Fast wallet, balance, send, bridge,
  or x402 API payment/protection flows; or needs help choosing the right FAST package. Do not use
  for generic EVM wallets, generic bridging, unrelated HTTP 402 questions, or non-FAST payment
  stacks.
compatibility: >
  Portable across Claude- and Codex-style skill runtimes with Node.js package install support and
  network access. Examples assume TypeScript and default to FAST testnet unless the user
  explicitly asks for mainnet.
metadata:
  openclaw:
    homepage: https://github.com/fastxyz/fast-skill
    emoji: "⚡"
---

# FAST Skill

Single entrypoint for the shipped FAST package ecosystem.

## Install

```bash
npx skills add fastxyz/fast-skill
```

## Example Requests

- "Check my FAST testnet balance and send FAST to another `fast1...` address"
- "Bridge USDC from Arbitrum Sepolia into Fast"
- "Use the FAST x402 packages to protect an Express API route"
- "Which FAST package should I use for an x402 payer flow?"

## Do Not Use For

- generic EVM wallet code that does not touch FAST
- arbitrary EVM to EVM bridging presented as one SDK call
- unrelated HTTP 402 questions, payment compliance research, or non-FAST API monetization stacks

## Package Map

- `@fastxyz/sdk`: `FastProvider` read-only access plus `FastWallet` signing, sends, token lookup, and low-level claim submission
- `@fastxyz/allset-sdk`: bridge flows between Fast and supported EVM routes
- `@fastxyz/x402-client`: pay 402-protected APIs
- `@fastxyz/x402-server`: return 402 requirements and protect routes
- `@fastxyz/x402-facilitator`: verify and settle x402 payments

If an umbrella x402 package is introduced later, treat it as a wrapper. The current source-of-truth API surface is still the role-specific client, server, and facilitator packages.

## Source Of Truth

- Prefer the shipped SDK repos over stale examples or roadmap assumptions.
- For local updates, check `../fast-sdk`, `../allset-sdk`, and `../x402-sdk`.
- If docs and code disagree, route from code and fix the docs.

## Start Here

Read [references/capabilities.md](./references/capabilities.md) first when the request involves multiple packages or unclear support.

Then route by task:

- Fast wallet, balance, send, token info, signatures: [references/fast-sdk.md](./references/fast-sdk.md)
- Bridge between Fast and EVM: [references/allset-sdk.md](./references/allset-sdk.md)
- Pay for a protected API: [references/x402-client.md](./references/x402-client.md)
- Add payments to an API: [references/x402-server.md](./references/x402-server.md)
- Run verification or settlement infrastructure: [references/x402-facilitator.md](./references/x402-facilitator.md)

Load a flow playbook when the user asks for an end-to-end scenario:

- Fast to Fast transfer: [flows/fast-to-fast-payment.md](./flows/fast-to-fast-payment.md)
- EVM to Fast deposit: [flows/evm-to-fast-deposit.md](./flows/evm-to-fast-deposit.md)
- Fast to EVM withdraw: [flows/fast-to-evm-withdraw.md](./flows/fast-to-evm-withdraw.md)
- Chain to chain via Fast: [flows/chain-to-chain-via-fast.md](./flows/chain-to-chain-via-fast.md)
- Pay an x402 API: [flows/x402-pay-an-api.md](./flows/x402-pay-an-api.md)
- Protect an x402 API: [flows/x402-protect-an-api.md](./flows/x402-protect-an-api.md)

Reference map:
- Use `references/` files for package facts and support boundaries.
- Use `flows/` files only when the user wants an end-to-end implementation pattern.

## Routing Rules

### 1. Choose the smallest package that fits

- Do not default to multiple FAST packages if one package solves the task.
- Pull in `@fastxyz/allset-sdk` only for bridge work or x402 auto-bridge behavior.
- Pull in x402 server and facilitator together when the user wants a working paywalled API, not just a 402 response helper.

### 2. Default to testnets unless the user explicitly asks for mainnet

- `@fastxyz/sdk` defaults to `testnet`.
- `@fastxyz/allset-sdk` currently exposes testnet-oriented bridge routes.
- x402 packages list both testnet and mainnet-style networks, but do not move a user to mainnet silently.

### 3. Treat support limits as code-level constraints

- If a route or token is not in the shipped SDK config, say so clearly before writing code.
- Do not claim AllSet supports arbitrary EVM to EVM bridging in one call. Cross-chain EVM flows are composed from two legs through Fast.
- Do not claim x402 auto-bridge works on every EVM network; check the current bridge helper and capability matrix.

### 4. Respect irreversible operations

- Fast sends are irreversible.
- Never overwrite `~/.fast/keys/`.
- Bridge and settlement operations can move funds or consume gas. Confirm addresses and network choice before final code.

## Common Issues

- If the request only says `x402` or `402`, confirm it is specifically about the FAST `@fastxyz/*` packages before routing here.
- If the user asks for unsupported routes or token mappings, stop and cite the shipped constraint from [references/capabilities.md](./references/capabilities.md) instead of approximating a solution.
- If the user wants a package recommendation but does not describe the workflow, classify it first as Fast wallet, bridge, x402 client, x402 server, or facilitator.

## Working Pattern

1. Classify the request: Fast payment, bridge, x402 client, x402 server, or facilitator.
2. Read the matching reference file.
3. If the task is scenario-based, read the matching flow file too.
4. Implement against the package API that actually exists in code today.
5. Call out unsupported routes instead of papering over them.
