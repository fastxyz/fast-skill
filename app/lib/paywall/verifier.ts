import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
const DEFAULT_BASE_MAINNET_RPC = 'https://mainnet.base.org';

const erc20TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

type NetworkConfig = {
  chain: typeof base;
  rpcUrl: string;
  confirmations: number;
};

const networkConfigs: Record<string, NetworkConfig> = {
  'base:mainnet': {
    chain: base,
    rpcUrl: process.env.BASE_MAINNET_RPC_URL?.trim() || DEFAULT_BASE_MAINNET_RPC,
    confirmations: (() => {
      const n = Number(process.env.PAYWALL_BASE_MAINNET_CONFIRMATIONS ?? '3');
      return Number.isFinite(n) && n >= 0 ? n : 3;
    })(),
  },
};

const g = globalThis as typeof globalThis & {
  __moneyPaywallPublicClients?: Map<string, unknown>;
};

function configKey(chain: string, network: string): string {
  return `${chain}:${network}`;
}

function getNetworkConfig(chain: string, network: string): NetworkConfig {
  const cfg = networkConfigs[configKey(chain, network)];
  if (!cfg) {
    throw new Error(`Unsupported verification network: ${chain}:${network}`);
  }
  return cfg;
}

function getClient(chain: string, network: string) {
  const key = configKey(chain, network);
  if (!g.__moneyPaywallPublicClients) {
    g.__moneyPaywallPublicClients = new Map();
  }
  const existing = g.__moneyPaywallPublicClients.get(key);
  if (existing) return existing as ReturnType<typeof createPublicClient>;
  const cfg = getNetworkConfig(chain, network);
  const client = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
  g.__moneyPaywallPublicClients.set(key, client);
  return client;
}

export function assertAllowedPaymentConfig(params: {
  chain: string;
  network: string;
  tokenAddress: string;
}): void {
  if (params.chain !== 'base' || params.network !== 'mainnet') {
    throw new Error('MVP supports only base mainnet');
  }
  if (params.tokenAddress.toLowerCase() !== BASE_MAINNET_USDC) {
    throw new Error('MVP supports only Base mainnet USDC');
  }
}

export async function getCurrentBlockNumber(
  chain: string,
  network: string,
): Promise<bigint> {
  const client = getClient(chain, network);
  return client.getBlockNumber();
}

export interface DetectedTransfer {
  dedupeKey: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  amountRaw: string;
}

export async function scanIncomingTransfers(params: {
  chain: string;
  network: string;
  tokenAddress: string;
  receiverAddress: string;
  fromBlockInclusive: bigint;
}): Promise<{
  safeToBlock: bigint;
  transfers: DetectedTransfer[];
}> {
  assertAllowedPaymentConfig({
    chain: params.chain,
    network: params.network,
    tokenAddress: params.tokenAddress,
  });

  const cfg = getNetworkConfig(params.chain, params.network);
  const client = getClient(params.chain, params.network);
  const latest = await client.getBlockNumber();
  const conf = BigInt(cfg.confirmations);
  const safeToBlock = latest > conf ? latest - conf : BigInt(0);

  if (safeToBlock < params.fromBlockInclusive) {
    return { safeToBlock, transfers: [] };
  }

  const logs = await client.getLogs({
    address: params.tokenAddress as `0x${string}`,
    event: erc20TransferEvent,
    args: { to: params.receiverAddress as `0x${string}` },
    fromBlock: params.fromBlockInclusive,
    toBlock: safeToBlock,
  });

  const transfers: DetectedTransfer[] = [];
  for (const log of logs) {
    if (!log.transactionHash || log.logIndex === undefined || log.blockNumber === undefined) {
      continue;
    }
    const value = log.args.value;
    if (value === undefined || value <= BigInt(0)) continue;
    const dedupeKey = `${log.transactionHash}:${String(log.logIndex)}`;
    transfers.push({
      dedupeKey,
      txHash: log.transactionHash,
      logIndex: Number(log.logIndex),
      blockNumber: log.blockNumber.toString(),
      amountRaw: value.toString(),
    });
  }

  transfers.sort((a, b) => {
    const blockDelta = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (blockDelta !== BigInt(0)) return blockDelta < BigInt(0) ? -1 : 1;
    return a.logIndex - b.logIndex;
  });

  return {
    safeToBlock,
    transfers,
  };
}
