export type ChainOption = {
  name: string;
  value: string;
  token: string;
  placeholder: string;
  sampleReceiver: string;
};

export const CHAINS: ChainOption[] = [
  {
    name: 'Fast',
    value: 'fast',
    token: 'SET',
    placeholder: 'set1...',
    sampleReceiver: 'set1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  },
  {
    name: 'Base',
    value: 'base',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Ethereum',
    value: 'ethereum',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Arbitrum',
    value: 'arbitrum',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Polygon',
    value: 'polygon',
    token: 'POL',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Optimism',
    value: 'optimism',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'BSC',
    value: 'bsc',
    token: 'BNB',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Avalanche',
    value: 'avalanche',
    token: 'AVAX',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Fantom',
    value: 'fantom',
    token: 'FTM',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'zkSync',
    value: 'zksync',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Linea',
    value: 'linea',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Scroll',
    value: 'scroll',
    token: 'ETH',
    placeholder: '0x...',
    sampleReceiver: '0x1111111111111111111111111111111111111111',
  },
  {
    name: 'Solana',
    value: 'solana',
    token: 'SOL',
    placeholder: 'base58 address...',
    sampleReceiver: '11111111111111111111111111111111',
  },
];

export const ADDRESS_PATTERNS: Record<string, RegExp> = {
  fast: /^set1[a-z0-9]{38,}$/,
  base: /^0x[0-9a-fA-F]{40}$/,
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  arbitrum: /^0x[0-9a-fA-F]{40}$/,
  polygon: /^0x[0-9a-fA-F]{40}$/,
  optimism: /^0x[0-9a-fA-F]{40}$/,
  bsc: /^0x[0-9a-fA-F]{40}$/,
  avalanche: /^0x[0-9a-fA-F]{40}$/,
  fantom: /^0x[0-9a-fA-F]{40}$/,
  zksync: /^0x[0-9a-fA-F]{40}$/,
  linea: /^0x[0-9a-fA-F]{40}$/,
  scroll: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export function isValidAddress(address: string, chain: string): boolean {
  const pattern = ADDRESS_PATTERNS[chain];
  if (!pattern) return false;
  return pattern.test(address);
}
