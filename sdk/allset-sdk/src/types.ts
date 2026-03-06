/**
 * types.ts — AllSet SDK types
 */

import type { FastClient } from '@pi2labs/fast-sdk';

/** Transaction executor for EVM chains */
export interface EvmTxExecutor {
  /** Send a transaction, wait for confirmation, return receipt */
  sendTx(tx: {
    to: string;
    data: string;
    value: string;
    gas?: string;
  }): Promise<{ txHash: string; status: 'success' | 'reverted' }>;
  /** Check current ERC-20 allowance for spender */
  checkAllowance(token: string, spender: string, owner: string): Promise<bigint>;
  /** Approve ERC-20 spending, wait for confirmation */
  approveErc20(token: string, spender: string, amount: string): Promise<string>;
}

/** Bridge provider interface */
export interface BridgeProvider {
  name: string;
  chains: string[];
  networks?: Array<'testnet' | 'mainnet'>;
  bridge(params: {
    fromChain: string;
    fromChainId?: number;
    toChain: string;
    toChainId?: number;
    fromToken: string;
    toToken: string;
    fromDecimals: number;
    amount: string;
    senderAddress: string;
    receiverAddress: string;
    evmExecutor?: EvmTxExecutor;
    fastClient?: FastClient;
  }): Promise<{
    txHash: string;
    orderId: string;
    estimatedTime?: string;
  }>;
}

/** Per-chain bridge configuration */
export interface OmnisetChainConfig {
  chainId: number;
  bridgeContract: string;
  fastsetBridgeAddress: string;
  relayerUrl: string;
}

/** Token info for resolution */
export interface OmnisetTokenInfo {
  evmAddress: string;
  fastsetTokenId: Uint8Array;
  decimals: number;
  isNative: boolean;
}

// Re-export types from fast-sdk that bridge users need
export type { FastClient };
