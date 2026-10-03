# AllSet SDK

Use this when the user wants to move value between Fast and an EVM chain in code. For a person bridging their own funds from the terminal, use the `fast` CLI skill (`fast fund usdc crypto`, `fast send --to-chain`) instead.

The package README is the full reference: `node_modules/@fastxyz/allset-sdk/README.md` after install.

## Install

```bash
npm install @fastxyz/allset-sdk @fastxyz/sdk
```

Requires Node.js 20+. `@fastxyz/sdk` provides the `Signer` and `FastProvider` that withdrawals need.

## What The Package Is

- One root entrypoint, `@fastxyz/allset-sdk`, of standalone functions: the `execute*` and `smartDeposit` functions submit real transactions, while the builders and encoders only compute. There is no `AllSetProvider` and no `/node`, `/browser` or `/core` subpath.
- No embedded route config: every call takes the bridge contract, Fast bridge address, relayer and cross-sign URLs, and token addresses explicitly.

## Supported Directions

- EVM -> Fast deposit: `executeDeposit(...)` (it sends an ERC-20 `approve` before every deposit), or `smartDeposit(...)` with EIP-7702 so gas is paid in USDC
- Fast -> EVM withdraw: `executeWithdraw(...)`
- Fast -> EVM intent execution: `executeIntent(...)` with `buildTransferIntent`, `buildExecuteIntent`, `buildDepositBackIntent`, `buildRevokeIntent`

This SDK does not expose a single EVM -> EVM bridge call. Cross-chain EVM movement is composed from two legs through Fast.

## Chains And Route Values

- `createEvmExecutor(account, rpcUrl, chainId)` accepts `1` (Ethereum), `137` (Polygon), `42161` (Arbitrum One), `8453` (Base), `5042` (Arc), `11155111` (Sepolia) and `421614` (Arbitrum Sepolia).
- Deployed routes: mainnet `ethereum`, `arbitrum`, `base`, `polygon`, `arc` carry USDC, credited on Fast as `fastUSD`; testnet `arbitrum-sepolia` and `ethereum-sepolia` carry `testUSDC`.
- Get route values from a trusted source, never by guessing:
  - `fast info bridge-chains --json`: chain IDs and bridge contracts
  - `fast info bridge-tokens --json`: token EVM addresses and Fast token IDs per chain
  - `app/cli/src/config/networks.ts` in fastxyz/fast-sdk: the same plus the relayer URLs, cross-sign URL and Fast bridge addresses

## EVM To Fast Deposit

```ts
import { createEvmExecutor, createEvmWallet, executeDeposit } from '@fastxyz/allset-sdk';

const account = createEvmWallet(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const evmClients = createEvmExecutor(account, process.env.BASE_RPC_URL!, 8453);

const result = await executeDeposit({
  chainId: 8453,
  bridgeContract: process.env.ALLSET_BRIDGE_CONTRACT as `0x${string}`, // from `fast info bridge-chains --json`
  tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  amount: '1000000', // 1 USDC in base units
  receiverAddress: 'fast1yourfastaddress...',
  evmClients,
});

console.log(result.txHash);
```

## Fast To EVM Withdraw

```ts
import { FastProvider, Signer } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';
import { executeWithdraw } from '@fastxyz/allset-sdk';

const signer = new Signer(process.env.FAST_PRIVATE_KEY!);
const provider = new FastProvider(mainnet);

const result = await executeWithdraw({
  fastBridgeAddress: process.env.ALLSET_FAST_BRIDGE_ADDRESS!, // fast1...
  relayerUrl: process.env.ALLSET_RELAYER_URL!,
  crossSignUrl: process.env.ALLSET_CROSS_SIGN_URL!,
  tokenEvmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  tokenFastTokenId: mainnet.defaultToken!.tokenId.replace(/^0x/, ''), // fastUSD, hex without 0x
  amount: '1000000',
  receiverEvmAddress: '0xYourEvmAddress',
  networkId: 'fast:mainnet',
  signer,
  provider,
});

console.log(result.txHash);
```

## Failure Modes To Watch

- `FastError` codes: `INVALID_PARAMS`, `INVALID_ADDRESS`, `TOKEN_NOT_FOUND`, `UNSUPPORTED_OPERATION`, `INSUFFICIENT_BALANCE`, `TX_FAILED`, `TX_INDETERMINATE`, `POST_PAYMENT_INCOMPLETE`
- `IndeterminateTransactionError`: the submit result couldn't be correlated; inspect `txHash` and `recoveryEnvelope`, don't retry blindly
- `PostPaymentRecoveryError`: the Fast transfer already succeeded and a later stage failed; reconcile before continuing
- `InsufficientBalanceError` (`required` vs `balance`): from `smartDeposit`, and from `executeDeposit` on Arc, where the deposit must also leave a USDC gas reserve

## Use This Instead Of Other FAST Packages When

- the user explicitly wants bridging in code
- the workflow crosses Fast and an EVM chain
- x402 auto-bridge behavior needs to be explained or debugged
