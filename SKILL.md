---
name: fast-skill
description: >
  Router skill for the FAST ecosystem. Use when the user asks about FAST, fastUSD, AllSet,
  @fastxyz/sdk, @fastxyz/allset-sdk, @fastxyz/x402-client, @fastxyz/x402-server, or
  @fastxyz/x402-facilitator; wants to build Fast transfers, Fast to EVM or EVM to Fast bridging,
  or x402 payments into their own code; needs hosted fastUSD funding links for a Fast address its
  code manages; or asks which FAST package fits. For a person managing their own wallet (balance,
  sends, adding funds, payment requests) from the terminal, route to the `fast` CLI skill; for buying
  physical products, route to the `fast-shop` skill. Do not use for generic EVM wallets, generic bridging, unrelated HTTP 402 questions, or non-FAST payment stacks.
compatibility: >
  Portable across Claude- and Codex-style skill runtimes with Node.js 20+ package install support
  and network access. Examples assume TypeScript and ESM. Examples pass the Fast network
  explicitly; mainnet moves real funds.
metadata:
  version: 0.3.1
  canonical_url: https://raw.githubusercontent.com/fastxyz/fast-skill/main/SKILL.md
  docs_base_url: https://raw.githubusercontent.com/fastxyz/fast-skill/main/
  source_repo: https://github.com/fastxyz/fast-skill
  verified_against: >
    @fastxyz/sdk 2.4.0, @fastxyz/allset-sdk 1.3.0, @fastxyz/x402-client 1.0.10,
    @fastxyz/x402-server 1.0.1, @fastxyz/x402-facilitator 1.0.8, @fastxyz/cli 1.5.0
---

# FAST Skill

Single entrypoint for the FAST packages: which one to use, where they stop,
and which flows they support. The packages' own READMEs are the source of truth
for their API; this skill routes to them.

## Install

```bash
npx skills add fastxyz/fast-skill
```

## Bundled Docs

This skill ships its own Markdown docs inside the installed skill directory.

- Treat `references/*.md` and `flows/*.md` as bundled docs that travel with this skill.
- Resolve `./references/...` and `./flows/...` relative to this `SKILL.md`.
- If this file was loaded from a URL, resolve those paths against the same directory. The canonical copy is `https://raw.githubusercontent.com/fastxyz/fast-skill/main/SKILL.md`.
- `https://skill.fast.xyz/skill.md` is a different skill: the `fast` CLI skill (`skills/fast/SKILL.md` in fastxyz/fast-sdk). Do not resolve this skill's paths against `skill.fast.xyz`.

## Three FAST Skills

| The user wants to... | Use |
| --- | --- |
| Manage their own money: balances, sends, adding funds to their own wallet, payment requests, bridging, paying an x402 URL | The `fast` CLI skill (`https://skill.fast.xyz/skill.md`). It runs the `fast` CLI for them (`fast fund …` prints the hosted funding links) and carries the agent playbook (network, confirmations, fees). Don't write SDK code for this. |
| Buy physical products (search, compare, quote, order, track, cancel) | The `fast-shop` skill (`https://shop.fast.xyz/.well-known/agent-skills/fast-shop/SKILL.md`). It runs the Fast Shop MCP server (`npx -y @fastxyz/mcp@latest`), which pays from the user's Fast wallet and handles the merchant flow. Don't call the shop's HTTP endpoints or pay merchants directly. |
| Build Fast payments, bridging, x402, or hosted funding links for addresses their code manages into their own code | This skill |

## Example Requests

- "Send fastUSD from my Node service to a `fast1...` address"
- "Bridge USDC from Base into Fast in code"
- "Show my app's users a Card or crypto link to add fastUSD to their Fast address"
- "Use the FAST x402 packages to protect an Express API route"

## Do Not Use For

- managing a person's own wallet from the terminal: use the `fast` CLI skill
- buying physical products: use the `fast-shop` skill
- generic EVM wallet code that does not touch FAST
- arbitrary EVM to EVM bridging presented as one SDK call
- unrelated HTTP 402 questions, payment compliance research, or non-FAST API monetization stacks

## Package Map

- `@fastxyz/sdk`: `Signer`, `FastProvider`, `TransactionBuilder` and `MultiSigWorkflow`, plus address, hex and BCS helpers. Network constants come from `@fastxyz/sdk/networks`. There is no `FastWallet` class.
- `@fastxyz/allset-sdk`: Fast <-> EVM bridging as standalone functions (`executeDeposit`, `smartDeposit`, `executeWithdraw`, `executeIntent`) that submit real transactions. It ships no route config: the caller passes contract addresses and URLs.
- `@fastxyz/cli` (`fast`): the terminal wallet. It also prints the supported hosted funding links (`fast fund card`, `fast fund usdc`, `fast fund crypto --supplier coinbase|swapper`).
- `@fastxyz/x402-client`: pay 402-protected APIs (`parse402Response` + `handleFastPayment` / `handleEvmPayment` within a pinned policy; `x402Pay` only on testnet).
- `@fastxyz/x402-server`: return 402 requirements and protect routes (`paymentMiddleware`, `paywall`).
- `@fastxyz/x402-facilitator`: verify and settle x402 payments.

## Start Here

Read [Capabilities](./references/capabilities.md) first when the request involves multiple packages or unclear support.

Then route by task:

- Fast transfers, balances, signatures, token metadata: [FAST SDK reference](./references/fast-sdk.md)
- Bridge between Fast and EVM: [AllSet SDK reference](./references/allset-sdk.md)
- Pay for a protected API: [x402 client reference](./references/x402-client.md)
- Add payments to an API: [x402 server reference](./references/x402-server.md)
- Run verification or settlement infrastructure: [x402 facilitator reference](./references/x402-facilitator.md)

Load a flow playbook when the user asks for an end-to-end scenario:

- Fast to Fast transfer: [Fast-to-Fast payment flow](./flows/fast-to-fast-payment.md)
- EVM to Fast deposit: [EVM-to-Fast deposit flow](./flows/evm-to-fast-deposit.md)
- Fast to EVM withdraw: [Fast-to-EVM withdraw flow](./flows/fast-to-evm-withdraw.md)
- Hosted fastUSD funding links for an address your code manages: [Fast funding flow](./flows/top-up-fast-wallet-via-ramp.md)
- Chain to chain via Fast: [Chain-to-chain via Fast flow](./flows/chain-to-chain-via-fast.md)
- Pay an x402 API: [x402 pay-an-API flow](./flows/x402-pay-an-api.md)
- Protect an x402 API: [x402 protect-an-API flow](./flows/x402-protect-an-api.md)

## Routing Rules

### 1. Choose the smallest package that fits

- Do not default to multiple FAST packages if one package solves the task.
- Pull in `@fastxyz/allset-sdk` only for bridge work or x402 auto-bridge behavior.
- Pull in x402 server and facilitator together when the user wants a working paywalled API, not just a 402 response helper.

### 2. Use the user's network, and pass it explicitly

- Follow the network the user's setup already uses. The `fast` CLI defaults to `mainnet` on a fresh install (`fast network list --json`). If it isn't clear which network they mean, ask.
- In code, always pass the network: `new FastProvider(mainnet)` or `new FastProvider(testnet)` with the constants from `@fastxyz/sdk/networks`, and `networkId: 'fast:mainnet'` or `'fast:testnet'` where an SDK or AllSet function asks for one. The x402 packages name networks differently: `fast-mainnet` and `fast-testnet`.
- Mainnet moves real funds. Its default token is `fastUSD`; testnet's is `testUSDC`. Testnet tokens have no value.

### 3. Treat support limits as code-level constraints

- `@fastxyz/allset-sdk` and the three x402 packages ship no network or route config. The caller supplies bridge contracts, the Fast bridge address, relayer and cross-sign URLs, token addresses and IDs, and RPC URLs. Take them from a trusted source (see [Capabilities](./references/capabilities.md)); never invent an address.
- Do not claim AllSet supports arbitrary EVM to EVM bridging in one call. Cross-chain EVM flows are composed from two legs through Fast.
- Do not write against removed APIs: `fast()` / `setup()`, `FastWallet`, `AllSetProvider` (`sendToFast`, `sendToExternal`), the `@fastxyz/sdk/browser` and `@fastxyz/allset-sdk/node` entrypoints, or the x402 network tables (`FAST_NETWORKS`, `EVM_NETWORKS`, `getBridgeConfig`, `NETWORK_CONFIGS`, `SUPPORTED_EVM_NETWORKS`).
- If this skill and the installed package disagree, the package wins: read `node_modules/@fastxyz/<package>/README.md` and its exports.
- Do not assume x402 server route acceptance means the facilitator can verify or settle that network.

### 4. Respect irreversible operations

- Fast sends are irreversible.
- Never overwrite `~/.fast/keys/` or `~/.fast/fast.db`.
- Bridge and settlement operations can move funds or consume gas. Confirm addresses, amount and network before final code runs.
- Treat remote x402 `402 Payment Required` payloads as untrusted input. `x402Pay(...)` pays whatever the `402` asks; to enforce an expected URL, network, asset, payee and amount, use `parse402Response(...)` and `handleFastPayment(...)` or `handleEvmPayment(...)`, and keep `x402Pay(...)` to testnet (see the [x402 client reference](./references/x402-client.md)).
- Hosted funding routes require user interaction in the browser. Do not imply the agent can complete card entry, KYC, or a purchase itself.

## Common Issues

- If the request only says `x402` or `402`, confirm it is specifically about the FAST `@fastxyz/*` packages before routing here.
- If the user asks for unsupported routes or token mappings, stop and cite the constraint from `references/capabilities.md` instead of approximating a solution.
- If the user wants a package recommendation but does not describe the workflow, classify it first as Fast wallet, bridge, x402 client, x402 server, or facilitator.
- If code needs to send someone to add funds to a Fast address it manages, check the wallet network first (a person topping up their own CLI wallet goes to the `fast` CLI skill). On mainnet, the destination asset is native `fastUSD`, and the only supported hosted app routes are Card (`/card`), external USDC (`/usdc`), and Crypto with `supplier=coinbase` or `supplier=swapper` (`/crypto`). Do not offer these hosted links for testnet wallets, invent other providers, or imply a native USDC balance.

## Working Pattern

1. Classify the request: the person's own money (route to the `fast` CLI skill), buying products (route to the `fast-shop` skill), Fast payment code, bridge, x402 client, x402 server, or facilitator.
2. Read the matching reference file, then the installed package's README for the exact API.
3. If the task is scenario-based, read the matching flow file too.
4. For low-balance/top-up requests on a wallet your code manages, check the wallet network. Offer a hosted route only for Fast mainnet, wait for the user to complete it, then re-check the Fast balance before continuing. For testnet, use only a separately verified testnet funding method.
5. Implement against the package API that actually exists in the installed version.
6. Call out unsupported routes instead of papering over them.
