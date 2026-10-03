# Fast To EVM Withdraw

This is an AllSet withdrawal flow using `@fastxyz/allset-sdk` and `@fastxyz/sdk`. A person withdrawing from their own wallet can use the `fast` CLI skill (`fast send <0x...> <amount> --token USDC --to-chain <chain>`) instead.

## Preconditions

- a destination chain with a deployed route
- trusted route values: Fast bridge address, relayer URL, cross-sign URL, token EVM address and Fast token ID (`app/cli/src/config/networks.ts` in fastxyz/fast-sdk has all of them)
- the Fast sender's private key
- the EVM receiver address, confirmed with the user

## Example

```ts
import { FastProvider, Signer } from '@fastxyz/sdk';
import { mainnet } from '@fastxyz/sdk/networks';
import { executeWithdraw } from '@fastxyz/allset-sdk';

const signer = new Signer(process.env.FAST_PRIVATE_KEY!);
const provider = new FastProvider(mainnet);

const result = await executeWithdraw({
  fastBridgeAddress: process.env.ALLSET_FAST_BRIDGE_ADDRESS!,
  relayerUrl: process.env.ALLSET_RELAYER_URL!,
  crossSignUrl: process.env.ALLSET_CROSS_SIGN_URL!,
  tokenEvmAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  tokenFastTokenId: mainnet.defaultToken!.tokenId.replace(/^0x/, ''), // fastUSD
  amount: '1000000',
  receiverEvmAddress: '0xYourEvmAddress',
  networkId: 'fast:mainnet',
  signer,
  provider,
});

console.log(result.txHash, result.estimatedTime);
```

## Checks

- `receiverEvmAddress` must be `0x...` and confirmed with the user: withdrawals are irreversible
- `amount` is a base-unit string; `tokenFastTokenId` is hex without `0x`
- the relayer leg can fail after the Fast-side transfer succeeded: on `PostPaymentRecoveryError` or `IndeterminateTransactionError`, reconcile instead of retrying
- the funds are not on the EVM chain until the relayer executes: check the destination balance before treating it as received
