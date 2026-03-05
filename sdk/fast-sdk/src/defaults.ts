/**
 * defaults.ts — Default Fast chain configuration
 */

import type { NetworkType, ChainConfig } from './types.js';

/** Default Fast chain configs */
export const FAST_CHAIN_CONFIGS: Record<NetworkType, ChainConfig> = {
  testnet: {
    rpc: 'https://api.fast.xyz/proxy',
    keyfile: '~/.fast/keys/fast.json',
    network: 'testnet',
    defaultToken: 'SET',
  },
  mainnet: {
    rpc: 'https://api.fast.xyz/proxy',
    keyfile: '~/.fast/keys/fast.json',
    network: 'mainnet',
    defaultToken: 'SET',
  },
};

/** Default RPC URL */
export const DEFAULT_RPC_URL = 'https://api.fast.xyz/proxy';

/**
 * Derive the config storage key from network.
 * Testnet uses bare 'fast', mainnet uses 'fast:mainnet'.
 */
export function configKey(network: NetworkType): string {
  return network === 'mainnet' ? 'fast:mainnet' : 'fast';
}

/**
 * Parse a config key back to network.
 */
export function parseConfigKey(key: string): NetworkType {
  if (key.endsWith(':mainnet')) return 'mainnet';
  return 'testnet';
}
