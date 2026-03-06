import path from 'node:path';

type NetworkType = 'testnet' | 'mainnet';

export type WalletEnvSelection = {
  source: string | null;
  configDir: string | null;
};

function runtimeDir(network: NetworkType, scope: 'scoped' | 'shared'): string {
  return path.join(process.cwd(), '.fast-runtime-env', scope, network);
}

export function applyFastServerWalletEnv(network: NetworkType): WalletEnvSelection {
  const scopedName = network === 'mainnet'
    ? 'MONEY_FAST_MAINNET_PRIVATE_KEY'
    : 'MONEY_FAST_TESTNET_PRIVATE_KEY';
  const scopedValue = process.env[scopedName]?.trim();

  if (scopedValue) {
    process.env.MONEY_FAST_PRIVATE_KEY = scopedValue;
    process.env.FAST_CONFIG_DIR = runtimeDir(network, 'scoped');
    return { source: scopedName, configDir: process.env.FAST_CONFIG_DIR };
  }

  const sharedValue = process.env.MONEY_FAST_PRIVATE_KEY?.trim();
  if (sharedValue) {
    process.env.FAST_CONFIG_DIR = runtimeDir(network, 'shared');
    return { source: 'MONEY_FAST_PRIVATE_KEY', configDir: process.env.FAST_CONFIG_DIR };
  }

  return { source: null, configDir: process.env.FAST_CONFIG_DIR?.trim() || null };
}
