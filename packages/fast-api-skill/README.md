# fast-api-skill

Payment SDK for AI agents. One command to install.

## Install

```bash
npx fast-api-skill
```

## What it does

Downloads two files to `~/.money/`:

- `SKILL.md` — Full API documentation
- `money.bundle.js` — Zero-dependency ES module

## Usage

```javascript
const { money } = await import(`${process.env.HOME}/.money/money.bundle.js`);

// Setup wallet
await money.setup({ chain: "fast" });

// Check balance  
await money.balance({ chain: "fast" });

// Send payment
await money.send({ to: "fast1...", amount: 10, chain: "fast" });
```

## Features

- **13 chains**: Fast, Base, Ethereum, Arbitrum, Polygon, Optimism, BSC, Avalanche, Fantom, zkSync, Linea, Scroll, Solana
- **x402 payments**: HTTP-native payment protocol
- **Bridging**: Cross-chain via OmniSet (Fast ↔ EVM)
- **Swaps**: Jupiter (Solana) and Paraswap (EVM)

## Links

- [Documentation](https://fast-api-xi-seven.vercel.app/skill.md)
- [GitHub](https://github.com/Pi-Squared-Inc/fast-api)
