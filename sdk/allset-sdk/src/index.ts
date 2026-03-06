/**
 * @pi2labs/allset-sdk — OmniSet bridge SDK
 *
 * Bridges assets between Fast chain and EVM chains (Arbitrum Sepolia, Ethereum Sepolia).
 */

// Bridge
export { omnisetProvider } from './bridge.js';

// EVM executor
export { createEvmExecutor } from './evm-executor.js';

// Types
export type {
  EvmTxExecutor,
  BridgeProvider,
  OmnisetChainConfig,
  OmnisetTokenInfo,
  FastClient,
} from './types.js';
