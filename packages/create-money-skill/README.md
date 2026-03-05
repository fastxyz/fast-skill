# create-money-skill

Install the Money skill for AI agents with a single command.

## Usage

```bash
npx create-money-skill
```

That's it! The skill files are installed to `~/.money/`.

## What gets installed

- `~/.money/SKILL.md` — Full documentation for AI agents
- `~/.money/money.bundle.js` — The SDK bundle (no dependencies)

## Quickstart

```js
const { money } = await import(`${process.env.HOME}/.money/money.bundle.js`);

await money.setup({ chain: "fast" });           // Create wallet
await money.balance({ chain: "fast" });         // Check balance
await money.send({ to: "fast1...", amount: 10, chain: "fast" }); // Send tokens
```

## Features

- 🌐 **13 chains** — Fast, Base, Ethereum, Arbitrum, Polygon, Optimism, BSC, Avalanche, Fantom, zkSync, Linea, Scroll, Solana
- 💸 **x402 payments** — Pay for protected content automatically
- 🌉 **Auto-bridge** — SETUSDC → USDC bridging for EVM payments
- 🔄 **Swaps & bridges** — Cross-chain operations built in
- 📦 **Zero dependencies** — Just Node.js 18+

## Links

- [Full Documentation](https://fast-api-xi-seven.vercel.app/skill.md)
- [GitHub](https://github.com/Pi-Squared-Inc/fast-api)
