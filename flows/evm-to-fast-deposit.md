# EVM To Fast Deposit

This is an AllSet deposit flow using `@fastxyz/allset-sdk`. A person moving USDC from their own EVM address into their own Fast account can use the `fast` CLI skill (`fast fund usdc crypto <amount> --chain <chain> --token USDC`) instead.

## Preconditions

- a source chain with a deployed route (mainnet: `ethereum`, `arbitrum`, `base`, `polygon`, `arc`; testnet: `arbitrum-sepolia`, `ethereum-sepolia`)
- trusted route values for that chain: bridge contract and token address (`fast info bridge-chains --json`, `fast info bridge-tokens --json`)
- the EVM sender's private key and an RPC URL for the chain
- the Fast receiver address

## Example

```ts
import { createEvmExecutor, createEvmWallet, executeDeposit } from '@fastxyz/allset-sdk';

const account = createEvmWallet(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const evmClients = createEvmExecutor(account, process.env.BASE_RPC_URL!, 8453);

const result = await executeDeposit({
  chainId: 8453,
  bridgeContract: process.env.ALLSET_BRIDGE_CONTRACT as `0x${string}`,
  tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  amount: '1000000', // 1 USDC in base units
  receiverAddress: 'fast1yourfastaddress...',
  evmClients,
});

console.log(result.txHash, result.estimatedTime);
```

On mainnet the deposited USDC is credited on Fast as `fastUSD`.

## Checks

- `receiverAddress` must be `fast1...`
- `amount` is a base-unit string
- the sender needs the chain's native gas token, or use `smartDeposit(...)` (EIP-7702) to pay gas in USDC
- `executeDeposit` sends an ERC-20 `approve` before every deposit, so it's two EVM transactions and two gas fees
- on Arc, where gas is paid in USDC, `executeDeposit` throws `InsufficientBalanceError` when the balance can't cover the amount plus a gas reserve
- the deposit is not on Fast until the bridge settles: check the Fast balance before treating it as received
- unsupported chains or tokens should be called out before writing code
