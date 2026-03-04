/**
 * index.ts — Main entry point for the money SDK
 */

import { loadConfig, saveConfig, setChainConfig, getChainConfig, getCustomChain, setCustomChain } from './config.js';
import { expandHome, compareDecimalStrings, toRaw } from './utils.js';
import { loadKeyfile, withKey } from './keys.js';
import { identifyChains, isValidAddress } from './detect.js';
import { MoneyError } from './errors.js';
import { getAdapter, evictAdapter, _resetAdapterCache } from './registry.js';
import { DEFAULT_CHAIN_CONFIGS, configKey, parseConfigKey, supportedChains, BUILT_IN_CHAIN_IDS } from './defaults.js';
import { getAlias, setAlias, getAliases } from './aliases.js';
import { appendHistory, readHistory } from './history.js';
import {
  generatePaymentId,
  buildPaymentUrl,
  appendPaymentLink,
  readPaymentLinks,
  findPaidLink,
} from './payment-links.js';
import {
  registerSwapProvider,
  registerBridgeProvider,
  registerPriceProvider,
  getSwapProvider,
  getBridgeProvider,
  getPriceProvider,
  listSwapProviders,
  listBridgeProviders,
  listPriceProviders,
} from './providers/registry.js';
import { resolveTokenAddress } from './providers/tokens.js';
import { jupiterProvider } from './providers/jupiter.js';
import { paraswapProvider } from './providers/paraswap.js';
import { dexscreenerProvider } from './providers/dexscreener.js';
import { debridgeProvider } from './providers/debridge.js';
import { fastTokenProvider } from './providers/fasttoken.js';
import { omnisetProvider } from './providers/omniset.js';
import { createFastTxExecutor } from './adapters/fast.js';
import { METHOD_SCHEMAS, schemaToParamString, schemaToParamDetails, schemaToResultString } from './schemas.js';
import type {
  NetworkType,
  MoneyConfig,
  SetupParams,
  BalanceParams,
  SendParams,
  FaucetParams,
  IdentifyChainsParams,
  GetTokenParams,
  RegisterTokenParams,
  TokensParams,
  HistoryParams,
  TokenConfig,
  TokenInfo,
  SetupResult,
  ChainStatus,
  StatusResult,
  BalanceResult,
  SendResult,
  FaucetResult,
  IdentifyChainsResult,
  TokensResult,
  OwnedToken,
  HistoryResult,
  HistoryEntry,
  ChainConfig,
  RegisterEvmChainParams,
  ParseUnitsParams,
  FormatUnitsParams,
  CustomChainDef,
  ExportKeysParams,
  ExportKeysResult,
  SignParams,
  SignResult,
  VerifySignParams,
  VerifySignResult,
  SwapParams,
  QuoteResult,
  SwapResult,
  PriceParams,
  PriceResult,
  TokenInfoParams,
  TokenInfoResult,
  BridgeParams,
  BridgeResult,
  SetApiKeyParams,
  HelpEntry,
  DescribeResult,
  ProvidersResult,
  PaymentLinkParams,
  PaymentLinkResult,
  PaymentLinksParams,
  PaymentLinksResult,
} from './types.js';

import { parseUnits, formatUnits } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import type { Chain, WalletClient, PublicClient, Transport, Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { EvmTxExecutor, SolanaTxExecutor, FastTxExecutor } from './providers/types.js';

// ─── Register built-in providers ──────────────────────────────────────────────

registerSwapProvider(jupiterProvider);
registerSwapProvider(paraswapProvider);
registerBridgeProvider(debridgeProvider);
registerBridgeProvider(omnisetProvider);
registerPriceProvider(dexscreenerProvider);
registerPriceProvider(fastTokenProvider);

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type {
  NetworkType,
  SetupParams,
  BalanceParams,
  SendParams,
  FaucetParams,
  IdentifyChainsParams,
  GetTokenParams,
  RegisterTokenParams,
  TokensParams,
  HistoryParams,
  TokenInfo,
  SetupResult,
  ChainStatus,
  StatusResult,
  BalanceResult,
  SendResult,
  FaucetResult,
  IdentifyChainsResult,
  TokensResult,
  OwnedToken,
  HistoryResult,
  HistoryEntry,
  ChainConfig,
  ParseUnitsParams,
  FormatUnitsParams,
  RegisterEvmChainParams,
  ExportKeysParams,
  ExportKeysResult,
  SignParams,
  SignResult,
  VerifySignParams,
  VerifySignResult,
  SwapParams,
  HelpEntry,
  DescribeResult,
  PaymentLinkParams,
  PaymentLinkResult,
  PaymentLinksParams,
  PaymentLinksResult,
  PaymentLinkEntry,
} from './types.js';

export type {
  MoneyConfig,
  ChainName,
  TokenConfig,
  SetApiKeyParams,
} from './types.js';

export type {
  SwapProvider,
  BridgeProvider,
  PriceProvider,
} from './providers/types.js';

export { MoneyError } from './errors.js';
export type { MoneyErrorCode } from './errors.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Assert a required parameter is present, or throw INVALID_PARAMS.
 */
function requireParam<T>(
  value: T | undefined | null,
  name: string,
  note: string,
): NonNullable<T> {
  if (value === undefined || value === null || value === '') {
    throw new MoneyError('INVALID_PARAMS', `Missing required param: ${name}`, { note });
  }
  return value as NonNullable<T>;
}

/**
 * Resolve a bare chain name to its config key and ChainConfig.
 * If network is provided, builds exact key via configKey(). Otherwise uses bare chain name.
 */
function resolveChainKey(
  chain: string,
  chains: Record<string, ChainConfig>,
  network?: NetworkType,
): { key: string; chainConfig: ChainConfig } | null {
  const key = network ? configKey(chain, network) : chain;
  if (chains[key]) return { key, chainConfig: chains[key]! };
  return null;
}

/**
 * Load config and resolve chain, or throw CHAIN_NOT_CONFIGURED.
 */
async function requireChainConfig(
  chain: string,
  network?: NetworkType,
): Promise<{ config: MoneyConfig; key: string; chainConfig: ChainConfig }> {
  const config = await loadConfig();
  const resolved = resolveChainKey(chain, config.chains, network);
  if (!resolved) {
    throw new MoneyError('CHAIN_NOT_CONFIGURED', `Chain "${chain}" is not configured.`, {
      chain,
      note: `Run setup first:\n  await money.setup({ chain: "${chain}" })`,
    });
  }
  return { config, ...resolved };
}



/**
 * Get the wallet address for a given chain config without exposing keys.
 * Loads the keyfile, derives the address via the adapter's setupWallet, and returns it.
 */
async function getAddressForChain(chainConfig: ChainConfig): Promise<string> {
  const keyfilePath = expandHome(chainConfig.keyfile);
  // Determine which adapter type to use based on the keyfile path
  // We need the adapter, but we don't have a key — use withKey to just read the public key
  const kp = await loadKeyfile(keyfilePath);

  if (chainConfig.keyfile.includes('evm')) {
    // EVM: derive address from private key via viem
    const account = privateKeyToAccount(`0x${kp.privateKey}` as `0x${string}`);
    return account.address;
  } else if (chainConfig.keyfile.includes('solana')) {
    // Solana: derive address from public key (base58)
    const { PublicKey } = await import('@solana/web3.js');
    const pubKeyBytes = Buffer.from(kp.publicKey, 'hex');
    const pubKey = new PublicKey(pubKeyBytes);
    return pubKey.toBase58();
  } else {
    // Fast / other ed25519: derive bech32m address from public key
    // Use the adapter's setupWallet which handles this
    // Fall back to loading via adapter
    const { bech32m } = await import('bech32');
    const pubKeyBytes = Buffer.from(kp.publicKey, 'hex');
    const words = bech32m.toWords(pubKeyBytes);
    return bech32m.encode('set', words);
  }
}

/**
 * Resolve a token symbol or raw address for use in swap/bridge.
 * Returns { address, decimals }.
 */
function resolveSwapToken(token: string, chain: string): { address: string; decimals: number } {
  // Try well-known resolution first
  const resolved = resolveTokenAddress(token, chain);
  if (resolved) return resolved;

  // If it looks like an address, pass through with default decimals
  if (token.startsWith('0x')) {
    return { address: token, decimals: 18 };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) {
    return { address: token, decimals: chain === 'solana' ? 9 : 18 };
  }

  // Unknown symbol — throw helpful error
  throw new MoneyError('TOKEN_NOT_FOUND', `Cannot resolve token "${token}" on chain "${chain}".`, {
    chain,
    note: `Use a known symbol (USDC, USDT, WETH, WBTC, DAI) or pass a contract address directly.`,
  });
}


/**
 * Get the EVM chain ID for a built-in chain.
 * Uses network to pick mainnet or testnet chain ID.
 * Falls back to 1 (ethereum mainnet) if chain is unknown.
 */
function getBuiltInChainId(chain: string, network: string): number {
  const ids = BUILT_IN_CHAIN_IDS[chain];
  if (!ids) return 1;
  return network === 'mainnet' ? ids.mainnet : ids.testnet;
}


/**
 * Create an EvmTxExecutor for a given chain config.
 * Lazily initializes wallet+public clients on first use.
 */
type EvmClients = {
  walletClient: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient<Transport, Chain>;
  account: ReturnType<typeof privateKeyToAccount>;
  viemChain: Chain;
};

function createEvmExecutor(keyfilePath: string, chainConfig: ChainConfig, chain: string): EvmTxExecutor {
  let _clients: EvmClients | null = null;

  async function getClients(): Promise<EvmClients> {
    if (_clients) return _clients;

    const kp = await loadKeyfile(keyfilePath);
    const account = privateKeyToAccount(`0x${kp.privateKey}` as `0x${string}`);
    const customChain = await getCustomChain(chain);
    const networkType = chainConfig.network === 'mainnet' ? 'mainnet' : 'testnet';
    const chainId = customChain?.chainId ?? getBuiltInChainId(chain, networkType);
    const { defineChain } = await import('viem');
    const viemChain = defineChain({
      id: chainId,
      name: chain,
      nativeCurrency: { name: chainConfig.defaultToken, symbol: chainConfig.defaultToken, decimals: 18 },
      rpcUrls: { default: { http: [chainConfig.rpc] } },
    });
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(chainConfig.rpc),
    });
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(chainConfig.rpc),
    });
    _clients = { walletClient, publicClient, account, viemChain };
    return _clients;
  }

  const executor: EvmTxExecutor = {
    async sendTx(tx) {
      if (!tx.to) throw new MoneyError('INVALID_PARAMS', 'Transaction target (to) is empty', { note: 'The provider returned an invalid transaction with no target address.' });
      const { walletClient, publicClient, viemChain } = await getClients();
      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value || '0'),
        ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
        chain: viemChain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        txHash: hash,
        status: receipt.status === 'success' ? 'success' as const : 'reverted' as const,
      };
    },

    async checkAllowance(token, spender, owner) {
      const { publicClient } = await getClients();
      // allowance(address,address) selector = 0xdd62ed3e
      const ownerPadded = owner.toLowerCase().replace('0x', '').padStart(64, '0');
      const spenderPadded = spender.toLowerCase().replace('0x', '').padStart(64, '0');
      const data = `0xdd62ed3e${ownerPadded}${spenderPadded}` as `0x${string}`;
      const result = await publicClient.call({ to: token as `0x${string}`, data });
      if (!result.data) return 0n;
      return BigInt(result.data);
    },

    async approveErc20(token, spender, amount) {
      // approve(address,uint256) selector = 0x095ea7b3
      const spenderPadded = spender.toLowerCase().replace('0x', '').padStart(64, '0');
      const amountHex = BigInt(amount).toString(16).padStart(64, '0');
      const calldata = `0x095ea7b3${spenderPadded}${amountHex}` as `0x${string}`;
      const receipt = await executor.sendTx({ to: token, data: calldata, value: '0' });
      if (receipt.status === 'reverted') {
        throw new MoneyError('TX_FAILED', `ERC-20 approval reverted for token ${token}`, { note: 'The approval transaction was reverted. Check that you have sufficient balance.' });
      }
      return receipt.txHash;
    },
  };

  return executor;
}

/**
 * Create a SolanaTxExecutor for a given keyfile and RPC endpoint.
 */
function createSolanaExecutor(keyfilePath: string, rpc: string): SolanaTxExecutor {
  return {
    async signAndSend(txBytes) {
      return await withKey(keyfilePath, async (kp) => {
        const { VersionedTransaction, Keypair, Connection } = await import('@solana/web3.js');
        const vtx = VersionedTransaction.deserialize(txBytes);
        const secretKey = Buffer.concat([
          Buffer.from(kp.privateKey, 'hex'),
          Buffer.from(kp.publicKey, 'hex'),
        ]);
        vtx.sign([Keypair.fromSecretKey(secretKey)]);

        const connection = new Connection(rpc, 'confirmed');
        const signature = await connection.sendRawTransaction(vtx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation
        const latestBlockhash = await connection.getLatestBlockhash();
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

        const status = confirmation.value.err ? 'failed' as const : 'success' as const;
        return { txHash: signature, status };
      });
    },
  };
}

// ─── SDK Object ───────────────────────────────────────────────────────────────

export const money = {

  async setup(params: SetupParams): Promise<SetupResult> {
    const { chain, network: networkOpt, rpc: rpcOpt } = params;
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.setup({ chain: "fast" })');

    const network: NetworkType = networkOpt ?? 'testnet';
    const chainDefaults = DEFAULT_CHAIN_CONFIGS[chain];
    let defaults: ChainConfig | undefined;

    if (chainDefaults) {
      defaults = chainDefaults[network];
      if (!defaults) {
        throw new MoneyError(
          'CHAIN_NOT_CONFIGURED',
          `No config for chain "${chain}" on network "${network}".`,
          { chain, note: `Use network "testnet" or "mainnet":\n  await money.setup({ chain: "${chain}", network: "testnet" })` },
        );
      }
    } else {
      // Check if this is a registered custom chain
      const customDef: CustomChainDef | null = await getCustomChain(chain);
      if (!customDef) {
        throw new MoneyError(
          'CHAIN_NOT_CONFIGURED',
          `No default config for chain "${chain}". Supported chains: ${supportedChains().join(', ')}. Or register a custom chain:\n  await money.registerEvmChain({ chain: "${chain}", chainId: ..., rpc: "..." })`,
          { chain, note: `Supported chains: ${supportedChains().join(', ')}.\n  await money.registerEvmChain({ chain: "${chain}", chainId: ..., rpc: "..." })` },
        );
      }
      // For custom chains, the config was already written by registerEvmChain — load it
      const key = configKey(chain, network);
      const existing = await getChainConfig(key);
      if (!existing) {
        throw new MoneyError(
          'CHAIN_NOT_CONFIGURED',
          `Custom chain "${chain}" is registered but not configured for network "${network}". Register it for this network first.`,
          { chain, note: `Register for ${network}:\n  await money.registerEvmChain({ chain: "${chain}", chainId: ${customDef.chainId}, rpc: "...", network: "${network}" })` },
        );
      }
      defaults = existing;
    }

    const key = configKey(chain, network);
    const existing = await getChainConfig(key);
    const rpc = rpcOpt ?? existing?.rpc ?? defaults.rpc;
    const chainConfig: ChainConfig = existing
      ? { ...existing, rpc, network: defaults.network }
      : { ...defaults, rpc };

    await setChainConfig(key, chainConfig);
    evictAdapter(key);

    const adapter = await getAdapter(key);
    const keyfilePath = expandHome(chainConfig.keyfile);

    let address: string;
    try {
      const result = await adapter.setupWallet(keyfilePath);
      address = result.address;
    } catch (err: unknown) {
      throw err;
    }

    const note = network === 'testnet'
      ? `Fund this wallet:\n  await money.faucet({ chain: "${chain}" })`
      : '';

    return { chain, address, network: chainConfig.network, note };
  },

  async status(): Promise<StatusResult> {
    const config = await loadConfig();
    const results: ChainStatus[] = [];

    for (const [key, chainConfig] of Object.entries(config.chains)) {
      const { chain } = parseConfigKey(key);
      const keyfilePath = expandHome(chainConfig.keyfile);

      let keyfileExists = false;
      try {
        await loadKeyfile(keyfilePath);
        keyfileExists = true;
      } catch { /* Keyfile missing or unreadable */ }

      if (!keyfileExists) {
        results.push({ chain, address: '', network: chainConfig.network, defaultToken: chainConfig.defaultToken, status: 'no-key' });
        continue;
      }

      let address = '';
      let status: ChainStatus['status'] = 'ready';
      try {
        const adapter = await getAdapter(key);
        const result = await adapter.setupWallet(keyfilePath);
        address = result.address;
      } catch (err: unknown) {
        status = (err instanceof MoneyError && err.code === 'CHAIN_NOT_CONFIGURED')
          ? 'no-rpc'
          : 'error';
      }

      let balance: string | undefined;
      if (status === 'ready' && address) {
        try {
          const adapter = await getAdapter(key);
          const bal = await adapter.getBalance(address, chainConfig.defaultToken);
          balance = bal.amount;
        } catch { /* best-effort — ignore RPC errors */ }
      }

      results.push({ chain, address, network: chainConfig.network, defaultToken: chainConfig.defaultToken, status, balance });
    }

    return { entries: results, note: '' };
  },

  async balance(params: BalanceParams): Promise<BalanceResult> {
    const { chain, network, token: tokenOpt } = params;
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.balance({ chain: "fast" })');

    const { key, chainConfig } = await requireChainConfig(chain, network);
    const adapter = await getAdapter(key);
    const keyfilePath = expandHome(chainConfig.keyfile);
    const { address } = await adapter.setupWallet(keyfilePath);
    const token = (!tokenOpt || tokenOpt === 'native') ? chainConfig.defaultToken : tokenOpt;
    const bal = await adapter.getBalance(address, token);
    const { chain: balChain, network: balNetwork } = parseConfigKey(key);

    let note = '';
    if (bal.amount === '0' && chainConfig.network === 'testnet') {
      note = `Balance is 0. Get testnet tokens:\n  await money.faucet({ chain: "${chain}" })`;
    }

    return { chain: balChain, network: balNetwork as NetworkType, address, amount: bal.amount, token: bal.token, note };
  },

  async send(params: SendParams): Promise<SendResult> {
    const { to, amount: amountRaw, chain, network, token: tokenOpt, payment_id } = params;

    requireParam(to, 'to', 'Provide a recipient address:\n  await money.send({ to: "set1...", amount: "1", chain: "fast" })');
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.send({ to, amount, chain: "fast" })');
    if (!amountRaw) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', {
        note: 'Provide an amount:\n  await money.send({ to, amount: "1", chain: "fast" })',
      });
    }

    const amountStr = String(amountRaw);
    const amountNum = parseFloat(amountStr);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new MoneyError('TX_FAILED', `Invalid amount: "${amountStr}". Must be a positive number.`, { chain, note: `Amount must be a positive number:\n  await money.send({ to, amount: "1", chain: "${chain}" })` });
    }

    if (!await isValidAddress(to, chain)) {
      throw new MoneyError('INVALID_ADDRESS', `Address "${to}" is not valid for chain "${chain}".`, { chain, details: { address: to }, note: `Verify the address format. Use identifyChains to check:\n  money.identifyChains({ address: "${to}" })` });
    }

    // Check for duplicate payment link
    let duplicateWarning = '';
    if (payment_id) {
      const existing = await findPaidLink(payment_id);
      if (existing) {
        duplicateWarning = `Warning: payment link ${payment_id} was already paid (txHash: ${existing.txHash}). Proceeding anyway.`;
      }
    }

    const { key, chainConfig } = await requireChainConfig(chain, network);

    const adapter = await getAdapter(key);
    const keyfilePath = expandHome(chainConfig.keyfile);
    const { address: from } = await adapter.setupWallet(keyfilePath);
    const token = (!tokenOpt || tokenOpt === 'native') ? chainConfig.defaultToken : tokenOpt;

    // Best-effort pre-flight balance check.
    try {
      const bal = await adapter.getBalance(from, token);
      if (compareDecimalStrings(bal.amount, amountStr) < 0) {
        const insufficientNote = chainConfig.network === 'testnet'
          ? `Testnet: await money.faucet({ chain: "${chain}" })\nOr reduce the amount.`
          : 'Fund the wallet or reduce the amount.';
        throw new MoneyError('INSUFFICIENT_BALANCE', `Need ${amountRaw} ${token}, have ${bal.amount}`, {
          chain,
          details: { have: bal.amount, need: amountStr, token },
          note: insufficientNote,
        });
      }
    } catch (err: unknown) {
      if (err instanceof MoneyError) throw err;
    }

    let result: { txHash: string; explorerUrl: string; fee: string };
    try {
      result = await adapter.send({ from, to, amount: amountStr, token, keyfile: keyfilePath });
    } catch (err: unknown) {
      if (err instanceof MoneyError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new MoneyError('TX_FAILED', msg, { chain, note: `Wait 5 seconds, then retry:\n  await money.send({ to: "${to}", amount: "${amountStr}", chain: "${chain}" })` });
    }

    // Record successful send in history.csv
    const { chain: sentChain, network: sentNetwork } = parseConfigKey(key);
    await appendHistory({
      ts: new Date().toISOString(),
      chain: sentChain,
      network: sentNetwork,
      to,
      amount: amountStr,
      token,
      txHash: result.txHash,
    });

    // Record payment link fulfillment if payment_id was provided
    if (payment_id) {
      await appendPaymentLink({
        ts: new Date().toISOString(),
        payment_id,
        direction: 'paid',
        chain: sentChain,
        network: sentNetwork,
        receiver: to,
        amount: amountStr,
        token,
        memo: '',
        url: '',
        txHash: result.txHash,
      });
    }

    return { ...result, chain: sentChain, network: sentNetwork as NetworkType, note: duplicateWarning };
  },

  async faucet(params: FaucetParams): Promise<FaucetResult> {
    const { chain, network } = params;
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.faucet({ chain: "fast" })');

    const { key, chainConfig } = await requireChainConfig(chain, network);
    const adapter = await getAdapter(key);
    const keyfilePath = expandHome(chainConfig.keyfile);
    const { address } = await adapter.setupWallet(keyfilePath);
    const result = await adapter.faucet(address);
    const { chain: faucetChain, network: faucetNetwork } = parseConfigKey(key);
    return {
      chain: faucetChain,
      network: faucetNetwork as NetworkType,
      amount: result.amount,
      token: result.token,
      txHash: result.txHash,
      note: `Check balance:\n  await money.balance({ chain: "${chain}" })`,
    };
  },

  async getToken(params: GetTokenParams): Promise<TokenInfo | null> {
    const { chain, network, name } = params;
    requireParam(chain, 'chain', 'Provide chain and name:\n  await money.getToken({ chain: "fast", name: "MYTOKEN" })');
    requireParam(name, 'name', 'Provide chain and name:\n  await money.getToken({ chain: "fast", name: "MYTOKEN" })');
    const { key } = await requireChainConfig(chain, network);
    return getAlias(key, name);
  },

  async registerToken(params: RegisterTokenParams): Promise<void> {
    const { chain, network, name, ...tokenConfig } = params;
    requireParam(chain, 'chain', 'Provide chain and name:\n  await money.registerToken({ chain: "fast", name: "MYTOKEN", address: "0x...", decimals: 18 })');
    requireParam(name, 'name', 'Provide chain and name:\n  await money.registerToken({ chain: "fast", name: "MYTOKEN", address: "0x...", decimals: 18 })');
    const { key } = await requireChainConfig(chain, network);
    await setAlias(key, name, tokenConfig as TokenConfig);
  },

  async tokens(params: TokensParams): Promise<TokensResult> {
    const { chain, network } = params;
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.tokens({ chain: "fast" })');
    const config = await loadConfig();
    const resolved = resolveChainKey(chain, config.chains, network);
    if (!resolved) {
      return {
        chain,
        network: network ?? 'testnet',
        owned: [],
        note: `Chain "${chain}" is not configured. Run setup first:\n  await money.setup({ chain: "${chain}" })`,
      };
    }

    const { key, chainConfig } = resolved;
    const { chain: resolvedChain, network: resolvedNetwork } = parseConfigKey(key);

    // Attempt on-chain token discovery
    let owned: OwnedToken[] = [];
    try {
      const adapter = await getAdapter(key);
      if (adapter.ownedTokens) {
        const keyfilePath = expandHome(chainConfig.keyfile);
        const { address } = await adapter.setupWallet(keyfilePath);
        owned = await adapter.ownedTokens(address);
      }
    } catch {
      // On-chain discovery failed — return empty
    }

    // Auto-cache discovered tokens as aliases for name resolution
    // This lets money.balance({ token: "USDC" }) work after a tokens() call
    const isHexLike = (s: string): boolean => /^0x[0-9a-fA-F]+$/.test(s) || /^[0-9a-fA-F]{40,}$/.test(s);
    for (const tok of owned) {
      if (tok.symbol && !isHexLike(tok.symbol)) {
        try {
          // Determine the right token config shape based on chain type
          if (resolvedChain === 'solana') {
            await setAlias(key, tok.symbol, { mint: tok.address, decimals: tok.decimals });
          } else {
            await setAlias(key, tok.symbol, { address: tok.address, decimals: tok.decimals });
          }
        } catch {
          // Non-critical — skip if alias write fails
        }
      }
    }

    // Evict adapter cache so next getBalance()/send() picks up new aliases
    if (owned.length > 0) {
      evictAdapter(key);
    }

    // Merge registered aliases — fetch balance for any not already discovered on-chain
    try {
      const aliases = await getAliases(key);
      const knownAddrs = new Set(owned.map((t) => t.address.toLowerCase()));
      const adapter = await getAdapter(key);
      const keyfilePath = expandHome(chainConfig.keyfile);
      const { address: walletAddr } = await adapter.setupWallet(keyfilePath);
      for (const alias of aliases) {
        const addr = (alias.address ?? alias.mint ?? '').toLowerCase();
        if (!addr || knownAddrs.has(addr)) continue;
        let balance = '0';
        try {
          const bal = await adapter.getBalance(walletAddr, alias.name);
          balance = bal.amount;
        } catch {
          // balance fetch failed — still include with "0"
        }
        owned.push({
          symbol: alias.name,
          address: alias.address ?? alias.mint ?? '',
          balance,
          rawBalance: '',
          decimals: alias.decimals,
        });
      }
    } catch {
      // alias lookup failed — non-critical
    }

    return {
      chain: resolvedChain,
      network: resolvedNetwork as NetworkType,
      owned,
      note: owned.length > 0
        ? ''
        : 'No tokens found. Use money.registerToken() to register tokens manually.',
    };
  },

  async history(params?: HistoryParams): Promise<HistoryResult> {
    const results = await readHistory(params);
    return { entries: results, note: '' };
  },

  async identifyChains(params: IdentifyChainsParams): Promise<IdentifyChainsResult> {
    const { address } = params;
    const chains = await identifyChains(address);

    let note: string;
    if (chains.length > 1) {
      note = 'Multiple chains use this address format. Specify chain explicitly.';
    } else if (chains.length === 0) {
      note = 'Address format not recognized. Supported formats:\n  Fast: set1... (bech32m)\n  EVM: 0x... (40 hex chars)\n  Solana: base58 (32-44 chars)';
    } else {
      note = '';
    }

    return { chains, note };
  },

  async registerEvmChain(params: RegisterEvmChainParams): Promise<void> {
    const { chain, chainId, rpc, explorer, defaultToken, network: networkOpt } = params;

    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.registerEvmChain({ chain: "polygon", chainId: 137, rpc: "https://polygon-rpc.com" })');
    requireParam(chainId, 'chainId', 'Provide the EVM chain ID:\n  await money.registerEvmChain({ chain: "polygon", chainId: 137, rpc: "https://polygon-rpc.com" })');
    requireParam(rpc, 'rpc', 'Provide an RPC URL:\n  await money.registerEvmChain({ chain: "polygon", chainId: 137, rpc: "https://polygon-rpc.com" })');

    // Reject built-in chain names
    if (supportedChains().includes(chain)) {
      throw new MoneyError('INVALID_PARAMS', `"${chain}" is a built-in chain and cannot be overridden. Use money.setup({ chain: "${chain}" }) instead.`, {
        chain,
        note: `Built-in chains: ${supportedChains().join(', ')}. Use setup() for these.`,
      });
    }

    const network: NetworkType = networkOpt ?? 'testnet';

    // Persist custom chain definition
    const def: CustomChainDef = {
      type: 'evm',
      chainId,
      ...(explorer ? { explorer } : {}),
    };
    await setCustomChain(chain, def);

    // Build and persist the chain config so setup() can find it
    const key = configKey(chain, network);
    const chainConfig: ChainConfig = {
      rpc,
      keyfile: '~/.money/keys/evm.json',
      network: network === 'mainnet' ? 'mainnet' : 'testnet',
      defaultToken: defaultToken ?? 'ETH',
    };
    await setChainConfig(key, chainConfig);
  },

  // ─── setApiKey ─────────────────────────────────────────────────────────────

  async setApiKey(params: SetApiKeyParams): Promise<void> {
    requireParam(params.provider, 'provider', 'await money.setApiKey({ provider: "jupiter", apiKey: "your-key" })');
    requireParam(params.apiKey, 'apiKey', 'await money.setApiKey({ provider: "jupiter", apiKey: "your-key" })');
    const config = await loadConfig();
    config.apiKeys = config.apiKeys ?? {};
    config.apiKeys[params.provider] = params.apiKey;
    await saveConfig(config);
  },

  // ─── exportKeys ────────────────────────────────────────────────────────────

  async exportKeys(params: ExportKeysParams): Promise<ExportKeysResult> {
    const { chain, network } = params;

    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.exportKeys({ chain: "base" })');

    const { chainConfig } = await requireChainConfig(chain, network);
    const keyfilePath = expandHome(chainConfig.keyfile);

    // Determine chain type from keyfile path
    let chainType: 'evm' | 'solana' | 'fast';
    if (chainConfig.keyfile.includes('solana')) {
      chainType = 'solana';
    } else if (chainConfig.keyfile.includes('fast') || chainConfig.keyfile.includes('ed25519')) {
      chainType = 'fast';
    } else {
      chainType = 'evm';
    }

    const kp = await loadKeyfile(keyfilePath);
    const address = await getAddressForChain(chainConfig);

    let privateKey: string;
    if (chainType === 'evm') {
      privateKey = `0x${kp.privateKey}`;
    } else {
      privateKey = kp.privateKey;
    }

    return {
      address,
      privateKey,
      keyfile: keyfilePath,
      chain,
      chainType,
      note: 'WARNING: This private key controls all funds on this wallet. Never share it. Store securely.',
    };
  },

  // ─── sign ──────────────────────────────────────────────────────────────────

  async sign(params: SignParams): Promise<SignResult> {
    const { chain, message, network } = params;

    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.sign({ chain: "base", message: "Hello" })');
    if (message === undefined || message === null) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: message', {
        note: 'Provide a message to sign:\n  await money.sign({ chain: "base", message: "Sign in to MyApp" })',
      });
    }

    const { key, chainConfig } = await requireChainConfig(chain, network);
    const adapter = await getAdapter(key);
    const keyfilePath = expandHome(chainConfig.keyfile);

    const result = await adapter.sign({ message, keyfile: keyfilePath });
    const { chain: resolvedChain, network: resolvedNetwork } = parseConfigKey(key);

    return {
      ...result,
      chain: resolvedChain,
      network: resolvedNetwork as NetworkType,
      note: '',
    };
  },

  // ─── verifySign ────────────────────────────────────────────────────────────

  async verifySign(params: VerifySignParams): Promise<VerifySignResult> {
    const { chain, message, signature, address, network } = params;
    requireParam(chain, 'chain', 'Provide a chain name:\n  await money.verifySign({ chain: "base", message: "hello", signature: "0x...", address: "0x..." })');
    if (message === undefined || message === null) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: message', {
        note: 'Provide the original message that was signed.',
      });
    }
    requireParam(signature, 'signature', 'Provide the signature to verify.');
    requireParam(address, 'address', 'Provide the address of the expected signer.');

    const { key } = await requireChainConfig(chain, network);
    const { chain: resolvedChain, network: resolvedNetwork } = parseConfigKey(key);
    const adapter = await getAdapter(key);

    if (!adapter.verifySign) {
      throw new MoneyError('UNSUPPORTED_OPERATION', `Signature verification is not supported on chain "${resolvedChain}".`, {
        chain: resolvedChain,
        note: 'This chain adapter does not implement verifySign.',
      });
    }

    const result = await adapter.verifySign({ message, signature, address });

    return {
      valid: result.valid,
      address,
      chain: resolvedChain,
      network: resolvedNetwork as NetworkType,
      note: result.valid
        ? ''
        : 'Signature verification failed. The signature does not match the provided address and message.',
    };
  },

  // ─── quote ────────────────────────────────────────────────────────────────

  async quote(params: SwapParams): Promise<QuoteResult> {
    const { chain, from, to, amount, network, slippageBps = 50, provider: providerName } = params;

    requireParam(chain, 'chain', 'await money.quote({ chain: "solana", from: "SOL", to: "USDC", amount: 1 })');
    requireParam(from, 'from', 'await money.quote({ chain: "solana", from: "SOL", to: "USDC", amount: 1 })');
    requireParam(to, 'to', 'await money.quote({ chain: "solana", from: "SOL", to: "USDC", amount: 1 })');
    if (amount === undefined || amount === null) throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', { note: 'await money.quote({ chain: "solana", from: "SOL", to: "USDC", amount: 1 })' });

    const resolvedNetwork = network ?? 'testnet';
    if (resolvedNetwork !== 'mainnet') {
      throw new MoneyError('UNSUPPORTED_OPERATION', 'Swap/quote requires mainnet. Testnet DEXes have no liquidity.', {
        chain,
        note: `Pass network: "mainnet" explicitly:\n  await money.quote({ chain: "${chain}", from: "${from}", to: "${to}", amount: ${String(amount)}, network: "mainnet" })`,
      });
    }

    const provider = getSwapProvider(chain, providerName);
    if (!provider) {
      throw new MoneyError('UNSUPPORTED_OPERATION', `No swap provider available for chain "${chain}".`, {
        chain,
        note: `Supported chains for swap: solana (Jupiter), EVM chains (Paraswap).`,
      });
    }

    // Resolve token addresses
    const config = await loadConfig();
    const resolved = resolveChainKey(chain, config.chains, network);
    const userAddress = resolved ? await getAddressForChain(resolved.chainConfig) : '';

    const apiKey = config.apiKeys?.[provider.name];

    const fromResolved = resolveSwapToken(from, chain);
    const toResolved = resolveSwapToken(to, chain);

    const fromRaw = toRaw(String(amount), fromResolved.decimals).toString();

    const quote = await provider.quote({
      chain,
      fromToken: fromResolved.address,
      toToken: toResolved.address,
      fromDecimals: fromResolved.decimals,
      toDecimals: toResolved.decimals,
      amount: fromRaw,
      slippageBps,
      userAddress,
      apiKey,
    });

    const rate = Number(quote.toAmountHuman) / Number(quote.fromAmountHuman);
    const rateStr = `1 ${from.toUpperCase()} = ${rate.toFixed(6)} ${to.toUpperCase()}`;

    return {
      fromToken: from,
      toToken: to,
      fromAmount: quote.fromAmountHuman,
      toAmount: quote.toAmountHuman,
      rate: rateStr,
      priceImpact: quote.priceImpact,
      provider: quote.provider,
      chain,
      network: resolvedNetwork,
      note: '',
    };
  },

  // ─── swap ─────────────────────────────────────────────────────────────────

  async swap(params: SwapParams): Promise<SwapResult> {
    const { chain, from, to, amount, network, slippageBps = 50, provider: providerName } = params;

    requireParam(chain, 'chain', 'await money.swap({ chain: "solana", from: "SOL", to: "USDC", amount: 1, network: "mainnet" })');
    requireParam(from, 'from', 'await money.swap({ chain: "solana", from: "SOL", to: "USDC", amount: 1, network: "mainnet" })');
    requireParam(to, 'to', 'await money.swap({ chain: "solana", from: "SOL", to: "USDC", amount: 1, network: "mainnet" })');
    if (amount === undefined || amount === null) throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', { note: 'await money.swap({ chain: "solana", from: "SOL", to: "USDC", amount: 1, network: "mainnet" })' });

    const resolvedNetwork = network ?? 'testnet';
    if (resolvedNetwork !== 'mainnet') {
      throw new MoneyError('UNSUPPORTED_OPERATION', 'Swap requires mainnet. Testnet DEXes have no liquidity.', {
        chain,
        note: `Pass network: "mainnet" explicitly:\n  await money.swap({ chain: "${chain}", from: "${from}", to: "${to}", amount: ${String(amount)}, network: "mainnet" })`,
      });
    }

    const provider = getSwapProvider(chain, providerName);
    if (!provider) {
      throw new MoneyError('UNSUPPORTED_OPERATION', `No swap provider available for chain "${chain}".`, {
        chain,
        note: `Supported chains for swap: solana (Jupiter), EVM chains (Paraswap).`,
      });
    }

    const config = await loadConfig();
    const resolved = resolveChainKey(chain, config.chains, network);
    if (!resolved) {
      throw new MoneyError('CHAIN_NOT_CONFIGURED', `Chain "${chain}" is not configured for mainnet.`, {
        chain,
        note: `Run setup first:\n  await money.setup({ chain: "${chain}", network: "mainnet" })`,
      });
    }
    const { key, chainConfig } = resolved;
    const keyfilePath = expandHome(chainConfig.keyfile);
    const userAddress = await getAddressForChain(chainConfig);

    const apiKey = config.apiKeys?.[provider.name];

    const fromResolved = resolveSwapToken(from, chain);
    const toResolved = resolveSwapToken(to, chain);
    const fromRaw = toRaw(String(amount), fromResolved.decimals).toString();

    // Get quote first
    const quote = await provider.quote({
      chain,
      fromToken: fromResolved.address,
      toToken: toResolved.address,
      fromDecimals: fromResolved.decimals,
      toDecimals: toResolved.decimals,
      amount: fromRaw,
      slippageBps,
      userAddress,
      apiKey,
    });

    // Build executors based on chain type
    const isSolana = chain === 'solana';
    const evmExecutor = isSolana ? undefined : createEvmExecutor(keyfilePath, chainConfig, chain);
    const solanaExecutor = isSolana ? createSolanaExecutor(keyfilePath, chainConfig.rpc) : undefined;

    // Execute swap
    const result = await provider.swap({
      chain,
      chainId: getBuiltInChainId(chain, 'mainnet'),
      fromToken: fromResolved.address,
      toToken: toResolved.address,
      fromDecimals: fromResolved.decimals,
      toDecimals: toResolved.decimals,
      amount: fromRaw,
      slippageBps,
      userAddress,
      route: quote.route,
      evmExecutor,
      solanaExecutor,
      apiKey,
    });

    // Build explorer URL from the chain adapter
    const adapter = await getAdapter(key);
    const explorerUrl = adapter.explorerUrl(result.txHash);

    // Record in history
    const { chain: sentChain, network: sentNetwork } = parseConfigKey(key);
    await appendHistory({
      ts: new Date().toISOString(),
      chain: sentChain,
      network: sentNetwork,
      to: `swap:${from}->${to}`,
      amount: String(amount),
      token: from,
      txHash: result.txHash,
    });

    // Auto-register token alias for the destination token after swap
    try {
      const existingAlias = await getAlias(key, to.toUpperCase());
      if (!existingAlias) {
        await setAlias(key, to.toUpperCase(), {
          address: toResolved.address,
          decimals: toResolved.decimals,
        });
      }
    } catch {
      // Non-critical — don't fail the swap if alias registration fails
    }

    return {
      txHash: result.txHash,
      explorerUrl,
      fromToken: from,
      toToken: to,
      fromAmount: quote.fromAmountHuman,
      toAmount: quote.toAmountHuman,
      provider: quote.provider,
      chain,
      network: resolvedNetwork,
      note: '',
    };
  },

  // ─── price ────────────────────────────────────────────────────────────────

  async price(params: PriceParams): Promise<PriceResult> {
    const { token, chain, provider: providerName } = params;

    requireParam(token, 'token', 'Provide a token symbol or address:\n  await money.price({ token: "ETH" })');

    const provider = getPriceProvider(providerName, chain);
    if (!provider) {
      throw new MoneyError('UNSUPPORTED_OPERATION', `No price provider available${providerName ? ` with name "${providerName}"` : ''}.`, {
        note: providerName
          ? `Provider "${providerName}" is not registered. Check the name or omit provider to use the default.`
          : 'A price provider should be registered automatically.',
      });
    }

    const config = await loadConfig();
    const apiKey = config.apiKeys?.[provider.name];

    try {
      const result = await provider.getPrice({ token, chain, apiKey });
      const chainHint = chain ? `chain: "${chain}"` : `chain: "ethereum"`;
      return {
        ...result,
        chain,
        note: `To use this token in balance/send, register it:\n  await money.registerToken({ ${chainHint}, name: "${result.symbol}", address: "${token}", decimals: 18 })`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new MoneyError('TX_FAILED', `Price lookup failed: ${msg}`, {
        note: `Check the token symbol or try with a contract address:\n  await money.price({ token: "0x...", chain: "${chain ?? 'ethereum'}" })`,
      });
    }
  },

  // ─── tokenInfo ────────────────────────────────────────────────────────────

  async tokenInfo(params: TokenInfoParams): Promise<TokenInfoResult> {
    const { token, chain, provider: providerName } = params;

    requireParam(token, 'token', 'Provide a token symbol or address:\n  await money.tokenInfo({ token: "USDC", chain: "ethereum" })');

    const provider = getPriceProvider(providerName, chain);
    if (!provider || !provider.getTokenInfo) {
      throw new MoneyError('UNSUPPORTED_OPERATION', `No token info provider available${providerName ? ` with name "${providerName}"` : ''}.`, {
        note: providerName
          ? `Provider "${providerName}" is not registered or does not support getTokenInfo.`
          : 'A price provider with getTokenInfo should be registered automatically.',
      });
    }

    const config = await loadConfig();
    const apiKey = config.apiKeys?.[provider.name];

    try {
      const result = await provider.getTokenInfo({ token, chain, apiKey });
      const chainHint = chain ? `chain: "${chain}"` : `chain: "ethereum"`;
      const decimalsHint = result.decimals !== undefined ? result.decimals : 18;
      return {
        ...result,
        chain,
        note: `To use this token in balance/send, register it:\n  await money.registerToken({ ${chainHint}, name: "${result.symbol}", address: "${result.address}", decimals: ${decimalsHint} })`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new MoneyError('TX_FAILED', `Token info lookup failed: ${msg}`, {
        note: `Check the token symbol or try with a contract address:\n  await money.tokenInfo({ token: "0x...", chain: "${chain ?? 'ethereum'}" })`,
      });
    }
  },

  // ─── bridge ───────────────────────────────────────────────────────────────

  async bridge(params: BridgeParams): Promise<BridgeResult> {
    const { from, to, amount, network, receiver, provider: providerName } = params;

    if (!from?.chain || !from?.token) throw new MoneyError('INVALID_PARAMS', 'Missing from.chain and from.token', { note: 'await money.bridge({ from: { chain: "ethereum", token: "USDC" }, to: { chain: "base" }, amount: 100, network: "mainnet" })' });
    if (!to?.chain) throw new MoneyError('INVALID_PARAMS', 'Missing to.chain', { note: 'await money.bridge({ from: { chain: "ethereum", token: "USDC" }, to: { chain: "base" }, amount: 100, network: "mainnet" })' });
    if (amount === undefined || amount === null) throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', { note: 'await money.bridge({ from: { chain: "ethereum", token: "USDC" }, to: { chain: "base" }, amount: 100, network: "mainnet" })' });

    const resolvedNetwork = network ?? 'testnet';

    // Get provider early to check network support
    const provider = getBridgeProvider(providerName, from.chain, to.chain, resolvedNetwork);
    if (!provider) {
      throw new MoneyError('UNSUPPORTED_OPERATION', 'No bridge provider available.', {
        note: 'A bridge provider should be registered automatically.',
      });
    }

    // Check network compatibility: providers with `networks` field declare supported networks.
    // Providers without `networks` field default to mainnet-only.
    const providerNetworks = (provider as { networks?: string[] }).networks;
    const supportsNetwork = providerNetworks
      ? providerNetworks.includes(resolvedNetwork)
      : resolvedNetwork === 'mainnet';
    if (!supportsNetwork) {
      const supportedStr = providerNetworks ? providerNetworks.join(', ') : 'mainnet';
      throw new MoneyError('UNSUPPORTED_OPERATION', `Bridge provider "${provider.name}" does not support network "${resolvedNetwork}".`, {
        note: `This provider supports: ${supportedStr}.\n  await money.bridge({ from: { chain: "${from.chain}", token: "${from.token}" }, to: { chain: "${to.chain}" }, amount: ${String(amount)}, network: "${providerNetworks?.[0] ?? 'mainnet'}" })`,
      });
    }

    // Resolve source chain config
    const config = await loadConfig();
    const srcResolved = resolveChainKey(from.chain, config.chains, network);
    if (!srcResolved) {
      throw new MoneyError('CHAIN_NOT_CONFIGURED', `Source chain "${from.chain}" is not configured for ${resolvedNetwork}.`, {
        chain: from.chain,
        note: `Run setup first:\n  await money.setup({ chain: "${from.chain}", network: "${resolvedNetwork}" })`,
      });
    }

    const senderAddress = await getAddressForChain(srcResolved.chainConfig);
    const keyfilePath = expandHome(srcResolved.chainConfig.keyfile);

    // Resolve receiver address on destination chain
    let receiverAddress = receiver;
    if (!receiverAddress) {
      const dstResolved = resolveChainKey(to.chain, config.chains, network);
      if (!dstResolved) {
        throw new MoneyError('CHAIN_NOT_CONFIGURED', `Destination chain "${to.chain}" is not configured. Provide a receiver address or setup the destination chain.`, {
          chain: to.chain,
          note: `Either:\n  await money.setup({ chain: "${to.chain}", network: "${resolvedNetwork}" })\nOr pass receiver address:\n  await money.bridge({ ..., receiver: "0x..." })`,
        });
      }
      receiverAddress = await getAddressForChain(dstResolved.chainConfig);
    }

    const fromTokenResolved = resolveSwapToken(from.token, from.chain);
    const toToken = to.token ?? from.token;
    let toTokenResolved: { address: string; decimals: number };
    try {
      toTokenResolved = resolveSwapToken(toToken, to.chain);
    } catch {
      // Destination token resolution may fail for cross-chain bridges (e.g., SET on Fast → WSET on EVM).
      // Try well-known token lookup before falling back to raw string.
      const wellKnown = resolveTokenAddress(toToken, to.chain)
        ?? resolveTokenAddress('W' + toToken, to.chain);
      if (wellKnown) {
        toTokenResolved = wellKnown;
      } else {
        // Pass the raw token name — the bridge provider handles its own token resolution.
        toTokenResolved = { address: toToken, decimals: fromTokenResolved.decimals };
      }
    }
    const fromRaw = toRaw(String(amount), fromTokenResolved.decimals).toString();

    // Build executors based on source chain type
    const isFastSource = from.chain === 'fast';
    const isSolanaSource = from.chain === 'solana';
    const evmExecutor = (isSolanaSource || isFastSource) ? undefined : createEvmExecutor(keyfilePath, srcResolved.chainConfig, from.chain);
    const solanaExecutor = isSolanaSource ? createSolanaExecutor(keyfilePath, srcResolved.chainConfig.rpc) : undefined;
    const fastExecutor = isFastSource ? createFastTxExecutor(keyfilePath, srcResolved.chainConfig.rpc, senderAddress) : undefined;

    const apiKey = config.apiKeys?.[provider.name];

    const result = await provider.bridge({
      fromChain: from.chain,
      toChain: to.chain,
      fromChainId: getBuiltInChainId(from.chain, resolvedNetwork),
      toChainId: getBuiltInChainId(to.chain, resolvedNetwork),
      fromToken: fromTokenResolved.address,
      toToken: toTokenResolved.address,
      fromDecimals: fromTokenResolved.decimals,
      amount: fromRaw,
      senderAddress,
      receiverAddress,
      evmExecutor,
      solanaExecutor,
      fastExecutor,
      apiKey,
    });

    // Build explorer URL from the source chain adapter
    const srcAdapter = await getAdapter(srcResolved.key);
    const explorerUrl = srcAdapter.explorerUrl(result.txHash);

    // Record in history
    const { chain: sentChain, network: sentNetwork } = parseConfigKey(srcResolved.key);
    await appendHistory({
      ts: new Date().toISOString(),
      chain: sentChain,
      network: sentNetwork,
      to: `bridge:${from.chain}->${to.chain}`,
      amount: String(amount),
      token: from.token,
      txHash: result.txHash,
    });

    // Auto-register destination token so balance()/tokens() can find it.
    // Guard: only register if the resolved address looks like a real on-chain address,
    // not a raw symbol string from the catch fallback.
    try {
      const dstResolved = resolveChainKey(to.chain, config.chains, network);
      const dstAddr = toTokenResolved.address;
      const isValidTokenAddr = dstAddr.startsWith('0x') && dstAddr.length === 42
        || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(dstAddr);
      if (dstResolved && dstAddr && isValidTokenAddr && dstAddr !== '0x0000000000000000000000000000000000000000') {
        // Use the explicit destination token name if provided, otherwise derive from
        // well-known tokens. E.g. bridging SET from Fast → Ethereum should register as
        // "WSET" (the wrapped form), not "SET".
        let tokenName = to.token ?? from.token;
        // Look up the well-known symbol for this address on the destination chain
        const wellKnown = resolveTokenAddress(tokenName, to.chain);
        if (!wellKnown || wellKnown.address !== dstAddr) {
          // The name didn't resolve to the same address — try to find the correct name
          // by checking common wrapped mappings
          const wrappedName = 'W' + tokenName;
          const wrappedResolved = resolveTokenAddress(wrappedName, to.chain);
          if (wrappedResolved && wrappedResolved.address === dstAddr) {
            tokenName = wrappedName;
          }
        }
        if (to.chain === 'solana') {
          await setAlias(dstResolved.key, tokenName, { mint: dstAddr, decimals: toTokenResolved.decimals });
        } else {
          await setAlias(dstResolved.key, tokenName, { address: dstAddr, decimals: toTokenResolved.decimals });
        }
        evictAdapter(dstResolved.key);
      }
    } catch {
      // Best-effort — don't fail the bridge
    }

    return {
      txHash: result.txHash,
      explorerUrl,
      fromChain: from.chain,
      toChain: to.chain,
      fromAmount: String(amount),
      toAmount: '',
      orderId: result.orderId ?? result.txHash,
      estimatedTime: result.estimatedTime,
      note: '',
    };
  },

  // ─── payment links ──────────────────────────────────────────────────────────

  async createPaymentLink(params: PaymentLinkParams): Promise<PaymentLinkResult> {
    if (!params.chain) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: chain', {
        note: 'Provide a chain name:\n  await money.createPaymentLink({ receiver: "set1...", amount: 10, chain: "fast" })',
      });
    }
    if (!params.receiver) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: receiver', {
        note: 'Provide the recipient address:\n  await money.createPaymentLink({ receiver: "set1...", amount: 10, chain: "fast" })',
      });
    }

    const amountNum = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
    if (!amountNum || amountNum <= 0 || isNaN(amountNum)) {
      throw new MoneyError('INVALID_PARAMS', 'Amount must be a positive number', {
        note: 'Provide a positive amount:\n  await money.createPaymentLink({ receiver: "set1...", amount: 10, chain: "fast" })',
      });
    }
    const amountStr = String(amountNum);

    const chain = params.chain;
    const network = params.network ?? 'testnet';

    // Validate chain is known
    const allChains = supportedChains();
    if (!allChains.includes(chain)) {
      // Check custom chains
      const config = await loadConfig();
      if (!config.customChains?.[chain]) {
        throw new MoneyError('INVALID_PARAMS', `Unknown chain: ${chain}`, {
          note: `Supported chains: ${allChains.join(', ')}.\n  Or register a custom chain: await money.registerEvmChain({ chain: "${chain}", chainId: 1, rpc: "https://..." })`,
        });
      }
    }

    // Validate receiver address format
    const valid = await isValidAddress(params.receiver, chain);
    if (!valid) {
      throw new MoneyError('INVALID_ADDRESS', `Invalid address for chain ${chain}: ${params.receiver}`, {
        note: `Check the address format for ${chain}.`,
      });
    }

    // Resolve token — default to chain's native token
    let token = params.token;
    if (!token) {
      const defaults = DEFAULT_CHAIN_CONFIGS[chain];
      if (defaults) {
        token = defaults[network as 'testnet' | 'mainnet']?.defaultToken ?? defaults.testnet.defaultToken;
      } else {
        const config = await loadConfig();
        const chainConf = config.chains[configKey(chain, network as 'testnet' | 'mainnet')];
        token = chainConf?.defaultToken ?? 'native';
      }
    }

    const payment_id = generatePaymentId();
    const created_at = new Date().toISOString();

    // Build URL — use MONEY_HOST env or default
    const baseUrl = process.env.MONEY_HOST ?? 'https://money-alpha-khaki.vercel.app';
    const url = buildPaymentUrl({
      receiver: params.receiver,
      amount: amountStr,
      chain,
      token,
      network,
      memo: params.memo,
    }, baseUrl);

    // Track locally
    await appendPaymentLink({
      ts: created_at,
      payment_id,
      direction: 'created',
      chain,
      network,
      receiver: params.receiver,
      amount: amountStr,
      token,
      memo: params.memo ?? '',
      url,
      txHash: '',
    });

    return {
      url,
      payment_id,
      receiver: params.receiver,
      amount: amountStr,
      chain,
      token,
      network,
      note: `Share this URL with the payer. They can fetch it to get payment instructions.\nTrack status: await money.listPaymentLinks({ payment_id: "${payment_id}" })`,
    };
  },

  async listPaymentLinks(params?: PaymentLinksParams): Promise<PaymentLinksResult> {
    const entries = await readPaymentLinks({
      payment_id: params?.payment_id,
      direction: params?.direction,
      chain: params?.chain,
      limit: params?.limit,
    });
    return {
      entries,
      note: entries.length === 0
        ? 'No payment links found. Create one: await money.createPaymentLink({ receiver: "...", amount: 10, chain: "fast" })'
        : `Found ${entries.length} payment link(s).`,
    };
  },

  // ─── x402 payment ───────────────────────────────────────────────────────────

  /**
   * Pay for x402-protected content on FastSet or EVM networks.
   * Automatically handles 402 Payment Required responses by:
   * 1. Making initial request to get payment requirements
   * 2. Creating and signing payment (TokenTransfer on FastSet, EIP-3009 on EVM)
   * 3. Retrying the request with X-PAYMENT header
   * 
   * For EVM networks (arbitrum-sepolia, base-sepolia), uses EIP-3009 transferWithAuthorization.
   * For FastSet networks, uses TokenTransfer with transaction certificate.
   */
  async x402Pay(params: { url: string; method?: string; headers?: Record<string, string>; body?: string; verbose?: boolean }): Promise<{
    success: boolean;
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    payment?: {
      network: string;
      amount: string;
      recipient: string;
      txHash: string;
    };
    note: string;
    logs?: string[];
  }> {
    const { url, method = 'GET', headers: customHeaders = {}, body: requestBody, verbose = false } = params;
    const logs: string[] = [];
    const log = (msg: string) => { if (verbose) { logs.push(`[${new Date().toISOString()}] ${msg}`); logs.push(''); } };

    log(`━━━ x402Pay START ━━━`);
    log(`URL: ${url}`);
    log(`Method: ${method}`);
    if (Object.keys(customHeaders).length > 0) log(`Custom Headers: ${JSON.stringify(customHeaders)}`);

    // Step 1: Make initial request to get 402 response
    log(`[Step 1] Making initial request to check for 402...`);
    log(`  → fetch(${url}, { method: "${method}" })`);
    const initialRes = await fetch(url, {
      method,
      headers: customHeaders,
      body: requestBody,
    });
    log(`  ← Response: ${initialRes.status} ${initialRes.statusText}`);

    if (initialRes.status !== 402) {
      // Not a 402, return the response as-is
      log(`  ✓ Not a 402 response, returning as-is`);
      const resHeaders: Record<string, string> = {};
      initialRes.headers.forEach((v, k) => { resHeaders[k] = v; });
      let resBody: unknown;
      try {
        resBody = await initialRes.json();
      } catch {
        resBody = await initialRes.text();
      }
      log(`━━━ x402Pay END (no payment needed) ━━━`);
      return {
        success: initialRes.ok,
        statusCode: initialRes.status,
        headers: resHeaders,
        body: resBody,
        note: initialRes.ok ? 'Request succeeded without payment.' : `Request failed with status ${initialRes.status}.`,
        logs: verbose ? logs : undefined,
      };
    }

    // Step 2: Parse 402 response to get payment requirements
    log(`[Step 2] Parsing 402 payment requirements...`);
    const paymentRequired = await initialRes.json() as {
      x402Version?: number;
      accepts?: Array<{
        scheme: string;
        network: string;
        maxAmountRequired: string;
        payTo: string;
        asset?: string;
        extra?: { name?: string; version?: string };
      }>;
    };
    log(`  ← Payment Required: ${JSON.stringify(paymentRequired, null, 2)}`);

    if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
      log(`  ✗ ERROR: No payment requirements found`);
      throw new MoneyError('INVALID_PARAMS', 'No payment requirements in 402 response', {
        note: 'The server returned 402 but did not include payment requirements.',
      });
    }

    // Check for supported networks - prioritize FastSet, then EVM
    const FASTSET_NETWORKS = ['fastset-devnet', 'fastset-mainnet', 'fast'];
    const EVM_NETWORKS = ['arbitrum-sepolia', 'arbitrum', 'base-sepolia', 'base'];

    const fastsetReq = paymentRequired.accepts.find(r => FASTSET_NETWORKS.includes(r.network));
    const evmReq = paymentRequired.accepts.find(r => EVM_NETWORKS.includes(r.network));

    log(`[Step 3] Selecting payment network...`);
    log(`  Available networks: ${paymentRequired.accepts.map(r => r.network).join(', ')}`);
    log(`  FastSet match: ${fastsetReq ? fastsetReq.network : 'none'}`);
    log(`  EVM match: ${evmReq ? evmReq.network : 'none'}`);

    if (fastsetReq) {
      // Use FastSet payment path
      log(`  → Using FastSet payment path (${fastsetReq.network})`);
      return this._x402PayFastSet(url, method, customHeaders, requestBody, paymentRequired, fastsetReq, verbose, logs);
    } else if (evmReq) {
      // Use EVM payment path (EIP-3009)
      log(`  → Using EVM payment path (${evmReq.network})`);
      return this._x402PayEvm(url, method, customHeaders, requestBody, paymentRequired, evmReq, verbose, logs);
    } else {
      log(`  ✗ ERROR: No supported network found`);
      throw new MoneyError('UNSUPPORTED_OPERATION', 'No supported payment network available', {
        note: `Available networks: ${paymentRequired.accepts.map(r => r.network).join(', ')}. Supported: FastSet (fastset-devnet, fastset-mainnet) and EVM (arbitrum-sepolia, base-sepolia).`,
      });
    }
  },

  /**
   * Internal: FastSet payment path for x402
   */
  async _x402PayFastSet(
    url: string,
    method: string,
    customHeaders: Record<string, string>,
    requestBody: string | undefined,
    paymentRequired: { x402Version?: number },
    fastsetReq: { network: string; maxAmountRequired: string; payTo: string; asset?: string },
    verbose: boolean = false,
    logs: string[] = []
  ): Promise<{
    success: boolean;
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    payment?: { network: string; amount: string; recipient: string; txHash: string };
    note: string;
    logs?: string[];
  }> {
    const log = (msg: string) => { if (verbose) { logs.push(`[${new Date().toISOString()}] ${msg}`); logs.push(''); } };

    log(`━━━ _x402PayFastSet START ━━━`);
    log(`  Network: ${fastsetReq.network}`);
    log(`  Amount: ${fastsetReq.maxAmountRequired} (raw)`);
    log(`  Recipient: ${fastsetReq.payTo}`);

    // Ensure Fast chain is set up
    log(`[FastSet Step 1] Loading Fast chain config...`);
    const config = await loadConfig();
    const fastKey = configKey('fast', 'testnet');
    const fastConfig = config.chains[fastKey];
    if (!fastConfig) {
      log(`  ✗ ERROR: Fast chain not configured`);
      throw new MoneyError('CHAIN_NOT_CONFIGURED', 'Fast chain not configured', {
        note: 'Set up Fast chain first:\n  await money.setup({ chain: "fast" })',
      });
    }
    log(`  ✓ Config found: ${fastKey}`);
    log(`  Keyfile: ${fastConfig.keyfile}`);
    log(`  RPC: ${fastConfig.rpc}`);

    // Get buyer wallet address and create tx executor
    log(`[FastSet Step 2] Creating tx executor...`);
    const keyfilePath = expandHome(fastConfig.keyfile);
    const kp = await loadKeyfile(keyfilePath);
    const { bech32m } = await import('bech32');
    const pubKeyBytes = Buffer.from(kp.publicKey, 'hex');
    const words = bech32m.toWords(pubKeyBytes);
    const buyerAddress = bech32m.encode('fast', words, 90);
    log(`  Buyer address: ${buyerAddress}`);

    const rpcUrl = fastConfig.rpc;
    const txExecutor = createFastTxExecutor(keyfilePath, rpcUrl, buyerAddress);
    log(`  ✓ TxExecutor created`);

    // Determine token ID from asset (if provided)
    log(`[FastSet Step 3] Determining token ID...`);
    let tokenId: Uint8Array;
    if (fastsetReq.asset) {
      tokenId = new Uint8Array(Buffer.from(fastsetReq.asset, 'base64'));
      log(`  Token from asset (base64): ${fastsetReq.asset}`);
    } else {
      tokenId = new Uint8Array(32);
      tokenId.set([0xfa, 0x57, 0x5e, 0x70], 0);
      log(`  Using default token ID`);
    }
    log(`  Token ID (hex): ${Buffer.from(tokenId).toString('hex')}`);

    // Create and submit TokenTransfer transaction
    log(`[FastSet Step 4] Sending TokenTransfer transaction...`);
    log(`  → txExecutor.sendTokenTransfer(${fastsetReq.payTo}, ${fastsetReq.maxAmountRequired}, tokenId)`);
    const txStartTime = Date.now();
    const { txHash, certificate } = await txExecutor.sendTokenTransfer(
      fastsetReq.payTo,
      fastsetReq.maxAmountRequired,
      tokenId
    );
    const txDuration = Date.now() - txStartTime;
    log(`  ← Transaction complete in ${txDuration}ms`);
    log(`  txHash: ${txHash}`);
    log(`  Certificate signatures: ${(certificate as { signatures?: unknown[] })?.signatures?.length ?? 0}`);

    // Build x402 payment payload
    log(`[FastSet Step 5] Building x402 payment payload...`);
    const paymentPayload = {
      x402Version: paymentRequired.x402Version ?? 1,
      scheme: 'exact',
      network: fastsetReq.network,
      payload: {
        type: 'signAndSendTransaction',
        transactionCertificate: certificate,
      },
    };
    log(`  Payload (JSON):`);
    log(`  ${JSON.stringify(paymentPayload, null, 2).split('\n').join('\n  ')}`);

    const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    log(`  Payload base64 (${payloadBase64.length} chars):`);
    log(`  ${payloadBase64.slice(0, 200)}...${payloadBase64.slice(-50)}`);

    // Retry request with X-PAYMENT header
    log(`[FastSet Step 6] Sending paid request with X-PAYMENT header...`);
    log(`  Command: fetch("${url}", {`);
    log(`    method: "${method}",`);
    log(`    headers: { "X-PAYMENT": "<base64 payload>" }`);
    log(`  })`);
    const paidStartTime = Date.now();
    const paidRes = await fetch(url, {
      method,
      headers: { ...customHeaders, 'X-PAYMENT': payloadBase64 },
      body: requestBody,
    });
    const paidDuration = Date.now() - paidStartTime;
    log(`  ← Response: ${paidRes.status} ${paidRes.statusText} (${paidDuration}ms)`);

    const resHeaders: Record<string, string> = {};
    paidRes.headers.forEach((v, k) => { resHeaders[k] = v; });
    log(`  Response headers: ${JSON.stringify(resHeaders)}`);

    let resBody: unknown;
    try { resBody = await paidRes.json(); } catch { resBody = await paidRes.text(); }
    log(`  Response body: ${JSON.stringify(resBody)}`);

    const amountRaw = BigInt(fastsetReq.maxAmountRequired);
    const decimals = 6;
    const amountHuman = (Number(amountRaw) / Math.pow(10, decimals)).toString();

    log(`━━━ _x402PayFastSet END ━━━`);
    log(`  Success: ${paidRes.ok}`);
    log(`  Amount paid: ${amountHuman} USDC`);
    log(`  Explorer: https://explorer.fast.xyz/tx/${txHash}`);

    return {
      success: paidRes.ok,
      statusCode: paidRes.status,
      headers: resHeaders,
      body: resBody,
      payment: { network: fastsetReq.network, amount: amountHuman, recipient: fastsetReq.payTo, txHash },
      note: paidRes.ok
        ? `Payment of ${amountHuman} USDC successful. Content delivered.`
        : `Payment submitted (tx: ${txHash}) but server returned ${paidRes.status}.`,
      logs: verbose ? logs : undefined,
    };
  },

  /**
   * Internal: EVM payment path for x402 using EIP-3009 transferWithAuthorization
   */
  async _x402PayEvm(
    url: string,
    method: string,
    customHeaders: Record<string, string>,
    requestBody: string | undefined,
    paymentRequired: { x402Version?: number },
    evmReq: { network: string; maxAmountRequired: string; payTo: string; asset?: string; extra?: { name?: string; version?: string } },
    verbose: boolean = false,
    logs: string[] = []
  ): Promise<{
    success: boolean;
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    payment?: { network: string; amount: string; recipient: string; txHash: string; bridged?: boolean; bridgeTxHash?: string };
    note: string;
    logs?: string[];
  }> {
    const log = (msg: string) => { if (verbose) { logs.push(`[${new Date().toISOString()}] ${msg}`); logs.push(''); } };

    log(`━━━ _x402PayEvm START ━━━`);
    log(`  Network: ${evmReq.network}`);
    log(`  Amount: ${evmReq.maxAmountRequired} (raw) = ${Number(evmReq.maxAmountRequired) / 1e6} USDC`);
    log(`  Recipient: ${evmReq.payTo}`);
    log(`  Asset (USDC): ${evmReq.asset}`);
    log(`  Extra: ${JSON.stringify(evmReq.extra)}`);

    // Map x402 network to our chain config
    log(`[EVM Step 1] Mapping network to chain config...`);
    const networkToChain: Record<string, { chain: string; network: NetworkType; chainId: number }> = {
      'arbitrum-sepolia': { chain: 'arbitrum', network: 'testnet', chainId: 421614 },
      'arbitrum': { chain: 'arbitrum', network: 'mainnet', chainId: 42161 },
      'base-sepolia': { chain: 'base', network: 'testnet', chainId: 84532 },
      'base': { chain: 'base', network: 'mainnet', chainId: 8453 },
    };

    const chainInfo = networkToChain[evmReq.network];
    if (!chainInfo) {
      log(`  ✗ ERROR: Unsupported EVM network: ${evmReq.network}`);
      throw new MoneyError('UNSUPPORTED_OPERATION', `Unsupported EVM network: ${evmReq.network}`, {
        note: `Supported EVM networks: ${Object.keys(networkToChain).join(', ')}`,
      });
    }
    log(`  ✓ Mapped to: chain=${chainInfo.chain}, network=${chainInfo.network}, chainId=${chainInfo.chainId}`);

    // Load EVM wallet
    log(`[EVM Step 2] Loading EVM wallet config...`);
    const config = await loadConfig();
    const evmKey = configKey(chainInfo.chain, chainInfo.network);
    let evmConfig = config.chains[evmKey];
    log(`  Config key: ${evmKey}`);
    
    // If chain not configured, try to set it up using the EVM keyfile
    if (!evmConfig) {
      log(`  Chain not configured, attempting auto-setup...`);
      const evmKeyfilePath = expandHome('~/.money/keys/evm.json');
      const fs = await import('fs/promises');
      try {
        await fs.access(evmKeyfilePath);
        log(`  → Found EVM keyfile at ${evmKeyfilePath}`);
        // Auto-configure the EVM chain
        log(`  → Running: money.setup({ chain: "${chainInfo.chain}", network: "${chainInfo.network}" })`);
        await this.setup({ chain: chainInfo.chain as any, network: chainInfo.network });
        const updatedConfig = await loadConfig();
        evmConfig = updatedConfig.chains[evmKey];
        log(`  ✓ Auto-setup complete`);
      } catch {
        log(`  ✗ ERROR: No EVM keyfile found and chain not configured`);
        throw new MoneyError('CHAIN_NOT_CONFIGURED', `${chainInfo.chain} chain not configured`, {
          note: `Set up ${chainInfo.chain} chain first:\n  await money.setup({ chain: "${chainInfo.chain}", network: "${chainInfo.network}" })`,
        });
      }
    }
    log(`  Keyfile: ${evmConfig.keyfile}`);

    // Load private key and create wallet
    log(`[EVM Step 3] Loading wallet and creating account...`);
    const keyfilePath = expandHome(evmConfig.keyfile);
    const keyfileData = JSON.parse(await (await import('fs/promises')).readFile(keyfilePath, 'utf-8'));
    // Ensure private key has 0x prefix
    let privateKey = keyfileData.privateKey as string;
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    log(`  ✓ Account address: ${account.address}`);

    // Get the USDC contract address (from 402 response or use default)
    const usdcAddress = evmReq.asset as `0x${string}`;
    if (!usdcAddress) {
      log(`  ✗ ERROR: No USDC asset address in payment requirements`);
      throw new MoneyError('INVALID_PARAMS', 'No USDC asset address in payment requirements', {
        note: 'The server must provide the USDC contract address in the asset field.',
      });
    }
    log(`  USDC contract: ${usdcAddress}`);
    log(`  USDC name (for EIP-712): ${evmReq.extra?.name ?? 'USDC'}`);
    log(`  USDC version: ${evmReq.extra?.version ?? '2'}`);
  

    // ─── Auto-Bridge Logic ────────────────────────────────────────────────────
    log(`[EVM Step 4] Checking USDC balance and auto-bridge need...`);
    // Check USDC balance and auto-bridge from FastSet if insufficient
    const requiredAmount = BigInt(evmReq.maxAmountRequired);
    const usdcDecimals = 6;
    let bridged = false;
    let bridgeTxHash: string | undefined;
    log(`  Required: ${Number(requiredAmount) / 1e6} USDC (${requiredAmount} raw)`);

    // Get current USDC balance on EVM chain using the specific asset address from 402 response
    log(`  Checking USDC balance on ${evmReq.network}...`);
    log(`  → getAdapter(${evmKey}).getBalance(${account.address}, ${usdcAddress})`);
    let currentBalance = 0n;
    try {
      // Use the adapter directly to check balance of the specific token address
      const evmAdapter = await getAdapter(evmKey);
      const balResult = await evmAdapter.getBalance(account.address, usdcAddress);
      // Balance is returned as formatted amount (e.g., "0.1"), convert to raw
      currentBalance = BigInt(Math.floor(parseFloat(balResult.amount) * Math.pow(10, usdcDecimals)));
      log(`  ← Balance: ${balResult.amount} USDC (${currentBalance} raw)`);
    } catch (err) {
      // Balance check failed, assume 0
      log(`  ← Balance check failed: ${err instanceof Error ? err.message : String(err)}, assuming 0`);
      currentBalance = 0n;
    }

    // If insufficient balance, attempt to bridge from FastSet
    if (currentBalance < requiredAmount) {
      const shortfall = requiredAmount - currentBalance;
      // Bridge exactly the required amount (no buffer)
      const amountToBridge = shortfall;
      const amountToBridgeHuman = Number(amountToBridge) / Math.pow(10, usdcDecimals);
      log(`  ⚠ Insufficient balance! Need to bridge ${amountToBridgeHuman} USDC`);
      log(`    Current: ${Number(currentBalance) / 1e6} USDC`);
      log(`    Required: ${Number(requiredAmount) / 1e6} USDC`);
      log(`    Shortfall: ${amountToBridgeHuman} USDC`);

      // Check if Fast chain is configured
      const fastKey = configKey('fast', chainInfo.network);
      const fastConfig = config.chains[fastKey];
      if (!fastConfig) {
        log(`  ✗ ERROR: Fast chain not configured for auto-bridge`);
        throw new MoneyError('INSUFFICIENT_BALANCE', `Need ${Number(requiredAmount) / 1e6} USDC, have ${Number(currentBalance) / 1e6}. Fast chain not configured for auto-bridge.`, {
          note: `Set up Fast chain first:\n  await money.setup({ chain: "fast", network: "${chainInfo.network}" })\nThen bridge manually:\n  await money.bridge({ from: { chain: "fast", token: "SETUSDC" }, to: { chain: "${chainInfo.chain}" }, amount: ${amountToBridgeHuman} })`,
        });
      }
      log(`  ✓ Fast chain configured, checking SETUSDC balance...`);

      // Check SETUSDC balance on Fast using direct RPC (adapter has decimals issue)
      log(`  → money.balance({ chain: "fast", token: "SETUSDC" })`);
      let fastBalance = 0n;
      try {
        // SETUSDC token ID
        const SETUSDC_HEX = '1e744900021182b293538bb6685b77df095e351364d550021614ce90c8ab9e0a';
        const fastBalResult = await this.balance({ chain: 'fast', network: chainInfo.network, token: SETUSDC_HEX });
        // The adapter returns amount with 18 decimals, but SETUSDC has 6
        // Multiply back by 10^18, then divide by 10^6 to get correct raw amount
        const reportedAmount = parseFloat(fastBalResult.amount);
        fastBalance = BigInt(Math.floor(reportedAmount * Math.pow(10, 18)));
        log(`  ← FastSet SETUSDC balance: ${reportedAmount} (reported) → ${Number(fastBalance) / 1e6} (adjusted)`);
      } catch (err) {
        log(`  ← FastSet balance check failed: ${err instanceof Error ? err.message : String(err)}`);
        fastBalance = 0n;
      }

      if (fastBalance < amountToBridge) {
        log(`  ✗ ERROR: Insufficient FastSet SETUSDC for auto-bridge`);
        throw new MoneyError('INSUFFICIENT_BALANCE', `Need ${Number(requiredAmount) / 1e6} USDC, have ${Number(currentBalance) / 1e6}. FastSet SETUSDC balance (${Number(fastBalance) / 1e6}) is also insufficient for auto-bridge.`, {
          note: `Fund your FastSet wallet with SETUSDC first.`,
        });
      }

      // Bridge SETUSDC → USDC (destination is the specific asset address)
      log(`[EVM Step 4b] Auto-bridging SETUSDC → USDC...`);
      log(`  → money.bridge({ from: { chain: "fast", token: "SETUSDC" }, to: { chain: "${chainInfo.chain}" }, amount: ${amountToBridgeHuman} })`);
      const bridgeStartTime = Date.now();
      try {
        const bridgeResult = await this.bridge({
          from: { chain: 'fast', token: 'SETUSDC' },
          to: { chain: chainInfo.chain as 'arbitrum' | 'base', token: 'SETUSDC' },
          amount: amountToBridgeHuman,
          network: chainInfo.network,
        });
        bridged = true;
        bridgeTxHash = bridgeResult.txHash;
        const bridgeDuration = Date.now() - bridgeStartTime;
        log(`  ← Bridge tx submitted in ${bridgeDuration}ms`);
        log(`    txHash: ${bridgeTxHash}`);
        log(`    Explorer: https://explorer.fast.xyz/tx/${bridgeTxHash}`);

        // Wait for USDC to arrive (poll with timeout)
        log(`  Waiting for USDC to arrive on ${evmReq.network}...`);
        const maxWaitMs = 120000; // 2 minutes
        const pollIntervalMs = 2000; // 2 seconds
        const startTime = Date.now();
        let arrived = false;
        let pollCount = 0;

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          pollCount++;
          try {
            const evmAdapter = await getAdapter(evmKey);
            const newBalResult = await evmAdapter.getBalance(account.address, usdcAddress);
            // Balance is returned as formatted amount (e.g., "0.1"), convert to raw
            const newBalance = BigInt(Math.floor(parseFloat(newBalResult.amount) * Math.pow(10, usdcDecimals)));
            log(`  [Poll ${pollCount}] Balance: ${Number(newBalance) / 1e6} USDC (need ${Number(requiredAmount) / 1e6})`);
            if (newBalance >= requiredAmount) {
              arrived = true;
              currentBalance = newBalance;
              break;
            }
          } catch {
            log(`  [Poll ${pollCount}] Balance check failed, continuing...`);
            // Continue polling
          }
        }

        if (!arrived) {
          log(`  ✗ ERROR: Bridge timeout after ${maxWaitMs / 1000}s`);
          throw new MoneyError('TX_FAILED', `Bridge transaction submitted (${bridgeTxHash}) but USDC has not arrived after ${maxWaitMs / 1000}s.`, {
            note: `The bridge may still be processing. Check your balance later and retry:\n  await money.balance({ chain: "${chainInfo.chain}", token: "SETUSDC" })`,
          });
        }
        const totalBridgeTime = Date.now() - bridgeStartTime;
        log(`  ✓ Bridge complete! USDC arrived in ${totalBridgeTime}ms (${pollCount} polls)`);
        log(`    New balance: ${Number(currentBalance) / 1e6} USDC`);
      } catch (err) {
        if (err instanceof MoneyError) throw err;
        log(`  ✗ ERROR: Auto-bridge failed: ${err instanceof Error ? err.message : String(err)}`);
        throw new MoneyError('TX_FAILED', `Auto-bridge failed: ${err instanceof Error ? err.message : String(err)}`, {
          note: `Bridge manually:\n  await money.bridge({ from: { chain: "fast", token: "SETUSDC" }, to: { chain: "${chainInfo.chain}" }, amount: ${amountToBridgeHuman} })`,
        });
      }
    } else {
      log(`  ✓ Sufficient balance: ${Number(currentBalance) / 1e6} USDC >= ${Number(requiredAmount) / 1e6} required`);
    }

    // ─── EIP-3009 Authorization ───────────────────────────────────────────────
    log(`[EVM Step 5] Building EIP-3009 transferWithAuthorization...`);
    // EIP-3009 authorization parameters
    const authorization = {
      from: account.address,
      to: evmReq.payTo as `0x${string}`,
      value: evmReq.maxAmountRequired,
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      nonce: ('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')) as `0x${string}`,
    };
    log(`  Authorization params:`);
    log(`    from: ${authorization.from}`);
    log(`    to: ${authorization.to}`);
    log(`    value: ${authorization.value} (${Number(authorization.value) / 1e6} USDC)`);
    log(`    validAfter: ${authorization.validAfter}`);
    log(`    validBefore: ${authorization.validBefore}`);
    log(`    nonce: ${authorization.nonce}`);

    // EIP-712 typed data for TransferWithAuthorization
    const authorizationTypes = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    // Use name/version from payment requirements or defaults
    const usdcName = evmReq.extra?.name ?? 'USDC';
    const usdcVersion = evmReq.extra?.version ?? '2';

    const domain = {
      name: usdcName,
      version: usdcVersion,
      chainId: chainInfo.chainId,
      verifyingContract: usdcAddress,
    };
    log(`  EIP-712 Domain:`);
    log(`    name: "${domain.name}"`);
    log(`    version: "${domain.version}"`);
    log(`    chainId: ${domain.chainId}`);
    log(`    verifyingContract: ${domain.verifyingContract}`);

    // Sign the authorization
    log(`[EVM Step 6] Signing EIP-712 typed data...`);
    log(`  Command: account.signTypedData({`);
    log(`    domain: ${JSON.stringify(domain)},`);
    log(`    types: { TransferWithAuthorization: [...] },`);
    log(`    primaryType: "TransferWithAuthorization",`);
    log(`    message: {`);
    log(`      from: "${authorization.from}",`);
    log(`      to: "${authorization.to}",`);
    log(`      value: ${authorization.value}n,`);
    log(`      validAfter: ${authorization.validAfter}n,`);
    log(`      validBefore: ${authorization.validBefore}n,`);
    log(`      nonce: "${authorization.nonce}"`);
    log(`    }`);
    log(`  })`);
    const signStartTime = Date.now();
    const signature = await account.signTypedData({
      domain,
      types: authorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });
    const signDuration = Date.now() - signStartTime;
    log(`  Response: Signature generated in ${signDuration}ms`);
    log(`    Signature (full): ${signature}`);

    // Build x402 EVM payment payload
    log(`[EVM Step 7] Building x402 payment payload...`);
    const paymentPayload = {
      x402Version: paymentRequired.x402Version ?? 1,
      scheme: 'exact',
      network: evmReq.network,
      payload: {
        signature,
        authorization,
      },
    };
    log(`  Payload (JSON):`);
    log(`  ${JSON.stringify(paymentPayload, null, 2).split('\n').join('\n  ')}`);

    const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    log(`  Payload base64 (${payloadBase64.length} chars):`);
    log(`  ${payloadBase64}`);

    // Retry request with X-PAYMENT header
    log(`[EVM Step 8] Sending paid request with X-PAYMENT header...`);
    log(`  Command: fetch("${url}", {`);
    log(`    method: "${method}",`);
    log(`    headers: { "X-PAYMENT": "<base64 payload above>" }`);
    log(`  })`);
    const paidStartTime = Date.now();
    const paidRes = await fetch(url, {
      method,
      headers: { ...customHeaders, 'X-PAYMENT': payloadBase64 },
      body: requestBody,
    });
    const paidDuration = Date.now() - paidStartTime;
    log(`  ← Response: ${paidRes.status} ${paidRes.statusText} (${paidDuration}ms)`);

    const resHeaders: Record<string, string> = {};
    paidRes.headers.forEach((v, k) => { resHeaders[k] = v; });
    log(`  Response headers: ${JSON.stringify(resHeaders)}`);

    let resBody: unknown;
    try { resBody = await paidRes.json(); } catch { resBody = await paidRes.text(); }
    log(`  Response body: ${JSON.stringify(resBody)}`);

    // Extract settlement txHash from response if available
    let settleTxHash = signature.slice(0, 66); // Default to signature prefix
    if (typeof resBody === 'object' && resBody !== null) {
      const rb = resBody as Record<string, unknown>;
      if (typeof rb.txHash === 'string') {
        settleTxHash = rb.txHash;
        log(`  Settlement txHash from response: ${settleTxHash}`);
      }
    }

    const amountRaw = BigInt(evmReq.maxAmountRequired);
    const amountHuman = (Number(amountRaw) / Math.pow(10, usdcDecimals)).toString();

    log(`━━━ _x402PayEvm END ━━━`);
    log(`  Success: ${paidRes.ok}`);
    log(`  Amount paid: ${amountHuman} USDC`);
    log(`  Bridged: ${bridged}${bridgeTxHash ? ` (${bridgeTxHash})` : ''}`);
    if (settleTxHash.startsWith('0x') && settleTxHash.length === 66) {
      log(`  Settlement explorer: https://sepolia.arbiscan.io/tx/${settleTxHash}`);
    }

    const bridgeNote = bridged ? ` (auto-bridged ${bridgeTxHash?.slice(0, 10)}...)` : '';
    return {
      success: paidRes.ok,
      statusCode: paidRes.status,
      headers: resHeaders,
      body: resBody,
      payment: { 
        network: evmReq.network, 
        amount: amountHuman, 
        recipient: evmReq.payTo, 
        txHash: settleTxHash,
        bridged,
        bridgeTxHash,
      },
      note: paidRes.ok
        ? `EVM payment of ${amountHuman} USDC successful${bridgeNote}. Content delivered.`
        : `Payment signed but server returned ${paidRes.status}. The facilitator will submit the transaction.`,
      logs: verbose ? logs : undefined,
    };
  },

  // ─── discovery ──────────────────────────────────────────────────────────────

  help(): HelpEntry[] {
    return Object.entries(METHOD_SCHEMAS).map(([name, entry]) => ({
      name,
      params: entry.params ? schemaToParamString(entry.params) : '(none)',
      description: entry.description,
    }));
  },

  describe(methodName: string): DescribeResult | null {
    const entry = METHOD_SCHEMAS[methodName];
    if (!entry) return null;
    return {
      name: methodName,
      description: entry.description,
      params: entry.params ? schemaToParamString(entry.params) : '(none)',
      paramDetails: entry.params ? schemaToParamDetails(entry.params) : {},
      result: entry.result ? schemaToResultString(entry.result) : 'void',
      examples: [...entry.examples],
      notes: entry.notes,
    };
  },

  // ─── providers ────────────────────────────────────────────────────────────

  providers(): ProvidersResult {
    return {
      swap: listSwapProviders(),
      bridge: listBridgeProviders(),
      price: listPriceProviders().map((p) => ({ name: p.name, chains: p.chains ?? [] })),
      note: 'Use registerSwapProvider/registerBridgeProvider/registerPriceProvider to add custom providers.',
    };
  },

  // ─── provider registration ────────────────────────────────────────────────

  registerSwapProvider,
  registerBridgeProvider,
  registerPriceProvider,

  // ─── unit conversion ──────────────────────────────────────────────────────

  async toRawUnits(params: ParseUnitsParams): Promise<bigint> {
    const { amount, chain, network, token, decimals: explicitDecimals } = params;

    if (amount === undefined || amount === null) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', {
        note: 'Provide an amount:\n  await money.toRawUnits({ amount: 25, token: "USDC", chain: "base" })',
      });
    }

    const dec = await resolveDecimals({ chain, network, token, decimals: explicitDecimals });
    return parseUnits(String(amount), dec);
  },

  async toHumanUnits(params: FormatUnitsParams): Promise<string> {
    const { amount, chain, network, token, decimals: explicitDecimals } = params;

    if (amount === undefined || amount === null) {
      throw new MoneyError('INVALID_PARAMS', 'Missing required param: amount', {
        note: 'Provide an amount:\n  await money.toHumanUnits({ amount: 25000000n, token: "USDC", chain: "base" })',
      });
    }

    const dec = await resolveDecimals({ chain, network, token, decimals: explicitDecimals });
    return formatUnits(BigInt(amount), dec);
  },
};

// ─── Decimals resolution helper ───────────────────────────────────────────────

/** Known native token decimals */
const NATIVE_DECIMALS: Record<string, number> = {
  SET: 18,
  ETH: 18,
  SOL: 9,
  POL: 18,
  BNB: 18,
  AVAX: 18,
  FTM: 18,
};

/**
 * Resolve decimals from explicit value, token alias lookup, or native token defaults.
 */
async function resolveDecimals(opts: {
  chain?: string;
  network?: NetworkType;
  token?: string;
  decimals?: number;
}): Promise<number> {
  // Explicit decimals always wins
  if (opts.decimals !== undefined) return opts.decimals;

  // Need chain to look up token
  if (!opts.chain) {
    throw new MoneyError('INVALID_PARAMS', 'Provide either "decimals" or "chain" (to look up token decimals)', {
      note: 'Either pass decimals explicitly:\n  await money.toRawUnits({ amount: 25, decimals: 6 })\nOr pass chain + token:\n  await money.toRawUnits({ amount: 25, token: "USDC", chain: "base" })',
    });
  }

  const { key, chainConfig } = await requireChainConfig(opts.chain, opts.network);
  const tokenName = opts.token ?? chainConfig.defaultToken;

  // Check native token defaults first
  const nativeDec = NATIVE_DECIMALS[tokenName];
  if (tokenName === chainConfig.defaultToken && nativeDec !== undefined) {
    return nativeDec;
  }

  // Look up from aliases
  const alias = await getAlias(key, tokenName);
  if (alias) return alias.decimals;

  // If it's the native token but not in our known list, default to 18
  if (tokenName === chainConfig.defaultToken) return 18;

  throw new MoneyError('TOKEN_NOT_FOUND', `Cannot resolve decimals for token "${tokenName}" on chain "${opts.chain}".`, {
    chain: opts.chain,
    note: `Register the token first:\n  await money.registerToken({ chain: "${opts.chain}", name: "${tokenName}", address: "0x...", decimals: 6 })`,
  });
}
