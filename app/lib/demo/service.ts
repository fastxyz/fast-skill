import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPublicClient, formatUnits, http, parseAbiItem, parseUnits } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { createEvmAdapter } from '../../../dist/src/adapters/evm.js';
import { createFastAdapter, createFastTxExecutor } from '../../../dist/src/adapters/fast.js';
import { omnisetProvider } from '../../../dist/src/providers/omniset.js';
import {
  getPaymentLinkProvider,
} from './payment-links/registry';
import type { ProviderPaymentStatus } from './payment-links/types';
import { getDemoState } from './store';
import type {
  BuyerSessionRecord,
  BuyerSessionView,
  PaymentLinkProvider,
  PaymentIntentRecord,
  PaymentIntentView,
  ProofEvent,
  ReceiverAccountRecord,
  SettlementChain,
} from './types';

const FAST_DECIMALS = 18;
const DEFAULT_EXPIRY_MINUTES = 15;
const RECEIVER_COOLDOWN_MINUTES = 30;
const VERIFIER_INTERVAL_MS = 5_000;
const AUTO_DELIVER_ENABLED = (process.env.DEMO_AUTO_DELIVER ?? '1').trim() !== '0';
const AUTO_DELIVER_DELAY_MS = (() => {
  const parsed = Number(process.env.DEMO_AUTO_DELIVER_DELAY_MS ?? '0');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
})();
const FAST_RPC_URL = process.env.FAST_RPC_URL?.trim() || 'https://proxy.fastset.xyz';
const ARBITRUM_RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL?.trim() || 'https://sepolia-rollup.arbitrum.io/rpc';
const ARBITRUM_EXPLORER_URL =
  process.env.ARBITRUM_SEPOLIA_EXPLORER_URL?.trim() || 'https://sepolia.arbiscan.io';
const ARBITRUM_WSET_TOKEN = '0xA0431d49B71c6f07603272C6C580560AfF41598E';

const DEMO_ROOT_DIR = path.join(os.tmpdir(), 'money-demo-wallets');
const BUYER_DIR = path.join(DEMO_ROOT_DIR, 'buyers');
const RECEIVER_DIR = path.join(DEMO_ROOT_DIR, 'receivers');

const fastAdapter = createFastAdapter(FAST_RPC_URL, 'testnet');
const arbitrumAliases = {
  WSET: { address: ARBITRUM_WSET_TOKEN, decimals: 18 },
  SET: { address: ARBITRUM_WSET_TOKEN, decimals: 18 },
};
const arbitrumAdapter = createEvmAdapter(
  'arbitrum',
  ARBITRUM_RPC_URL,
  ARBITRUM_EXPLORER_URL,
  arbitrumAliases,
  arbitrumSepolia,
  'ETH',
);
const arbitrumPublicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(ARBITRUM_RPC_URL),
});
const erc20TransferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

export class DemoError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DemoError';
    this.status = status;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function keyfilePath(configDir: string, chain: SettlementChain): string {
  return path.join(configDir, chain === 'fast' ? 'fast.json' : 'evm.json');
}

function toOmnisetChain(chain: SettlementChain): 'fast' | 'arbitrum' {
  return chain === 'fast' ? 'fast' : 'arbitrum';
}

async function getBalanceForReceiver(
  receiverAddress: string,
  settlementChain: SettlementChain,
): Promise<{ amount: string; token: string }> {
  if (settlementChain === 'fast') {
    return fastAdapter.getBalance(receiverAddress, 'SET');
  }
  return arbitrumAdapter.getBalance(receiverAddress, ARBITRUM_WSET_TOKEN);
}

async function getSettlementTrackingStartBlock(settlementChain: SettlementChain): Promise<string | undefined> {
  if (settlementChain === 'fast') return undefined;
  try {
    const block = await arbitrumPublicClient.getBlockNumber();
    return block.toString();
  } catch {
    return undefined;
  }
}

function parseStartBlock(raw?: string): bigint {
  if (!raw) return BigInt(0);
  try {
    const parsed = BigInt(raw);
    return parsed >= BigInt(0) ? parsed : BigInt(0);
  } catch {
    return BigInt(0);
  }
}

async function findDestinationSettlementTxHash(
  intent: PaymentIntentRecord,
  minimumTotalRaw: bigint,
): Promise<string | undefined> {
  if (intent.settlementChain === 'fast') return undefined;

  const startBlock = parseStartBlock(intent.settlementTrackingStartBlock);
  const latestBlock = await arbitrumPublicClient.getBlockNumber();
  if (latestBlock <= startBlock) return undefined;

  const logs = await arbitrumPublicClient.getLogs({
    address: ARBITRUM_WSET_TOKEN as `0x${string}`,
    event: erc20TransferEvent,
    args: { to: intent.receiverAddress as `0x${string}` },
    fromBlock: startBlock + BigInt(1),
    toBlock: latestBlock,
  });

  let runningTotal = BigInt(0);
  let chosenHash: string | undefined;
  for (const log of logs) {
    const value = log.args.value;
    if (value === undefined || value <= BigInt(0)) continue;
    runningTotal += value;
    chosenHash = log.transactionHash;
    if (runningTotal >= minimumTotalRaw) {
      break;
    }
  }
  return chosenHash;
}

function parsePositiveAmount(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') {
    throw new DemoError('Amount is required.');
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new DemoError('Amount must be a positive number.');
  }
  return num.toString();
}

function toRawAmount(amount: string): bigint {
  return parseUnits(amount, FAST_DECIMALS);
}

function toAmount(rawAmount: bigint): string {
  return formatUnits(rawAmount, FAST_DECIMALS);
}

function getIntentEvents(intentId: string): ProofEvent[] {
  const state = getDemoState();
  return state.events.get(intentId) ?? [];
}

function appendEvent(intentId: string, event: Omit<ProofEvent, 'intentId' | 'timestamp'>): void {
  const state = getDemoState();
  const current = state.events.get(intentId) ?? [];
  current.push({
    intentId,
    kind: event.kind,
    details: event.details,
    timestamp: nowIso(),
  });
  state.events.set(intentId, current);
}

function providerStatusDetails(
  intent: PaymentIntentRecord,
  status: ProviderPaymentStatus,
  source: 'webhook' | 'status_poll',
): string {
  const ref = intent.paymentLinkProviderRef ? ` ref=${intent.paymentLinkProviderRef}` : '';
  return `Provider ${intent.paymentLinkProvider} reported "${status}" via ${source}.${ref}`;
}

function toSessionView(record: BuyerSessionRecord): BuyerSessionView {
  return {
    sessionId: record.sessionId,
    addressFast: record.addressFast,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
  };
}

function toIntentView(intent: PaymentIntentRecord): PaymentIntentView {
  return {
    intentId: intent.intentId,
    buyerSessionId: intent.buyerSessionId,
    serviceId: intent.serviceId,
    requestedAmount: intent.requestedAmount,
    tokenRequested: intent.tokenRequested,
    sourceChain: intent.sourceChain,
    settlementChain: intent.settlementChain,
    paymentLinkProvider: intent.paymentLinkProvider,
    paymentLinkProviderRef: intent.paymentLinkProviderRef,
    receiverAddress: intent.receiverAddress,
    paymentLink: intent.paymentLink,
    expiresAt: intent.expiresAt,
    status: intent.status,
    createdAt: intent.createdAt,
    settledAt: intent.settledAt,
    deliveredAt: intent.deliveredAt,
    sourceTxHash: intent.sourceTxHash,
    destinationTxHash: intent.destinationTxHash,
    overpaid: intent.overpaid,
    overpayAmount: intent.overpayAmountRaw ? toAmount(BigInt(intent.overpayAmountRaw)) : undefined,
    paidAmountSource: intent.paidAmountSourceRaw ? toAmount(BigInt(intent.paidAmountSourceRaw)) : undefined,
    events: getIntentEvents(intent.intentId),
  };
}

async function ensureDemoDirs(): Promise<void> {
  await mkdir(BUYER_DIR, { recursive: true, mode: 0o700 });
  await mkdir(RECEIVER_DIR, { recursive: true, mode: 0o700 });
}

async function createBuyerSession(): Promise<BuyerSessionRecord> {
  await ensureDemoDirs();
  const sessionId = makeId('buyer');
  const configDir = path.join(BUYER_DIR, sessionId);
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const wallet = await fastAdapter.setupWallet(keyfilePath(configDir, 'fast'));
  const ts = nowIso();
  return {
    sessionId,
    addressFast: wallet.address,
    configDir,
    createdAt: ts,
    lastSeenAt: ts,
  };
}

async function createReceiverAccount(chain: SettlementChain): Promise<ReceiverAccountRecord> {
  await ensureDemoDirs();
  const accountId = makeId(chain === 'fast' ? 'recv_fast' : 'recv_arb');
  const configDir = path.join(RECEIVER_DIR, accountId);
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const wallet = chain === 'fast'
    ? await fastAdapter.setupWallet(keyfilePath(configDir, 'fast'))
    : await arbitrumAdapter.setupWallet(keyfilePath(configDir, 'arbitrum-sepolia'));
  return {
    accountId,
    chain,
    address: wallet.address,
    configDir,
    state: 'available',
  };
}

function releaseReceiverToCooldown(receiver: ReceiverAccountRecord, nowMs: number): void {
  receiver.state = 'cooldown';
  receiver.leasedIntentId = undefined;
  receiver.leasedAt = undefined;
  receiver.leaseExpiresAt = undefined;
  receiver.lastReleasedAt = new Date(nowMs).toISOString();
  receiver.cooldownUntil = new Date(
    nowMs + RECEIVER_COOLDOWN_MINUTES * 60_000,
  ).toISOString();
}

function releaseIntentReceiver(intent: PaymentIntentRecord, nowMs: number): void {
  const receiver = getDemoState().receiverAccounts.get(intent.receiverAccountId);
  if (!receiver) return;
  if (receiver.state !== 'active') return;
  if (receiver.leasedIntentId && receiver.leasedIntentId !== intent.intentId) return;
  releaseReceiverToCooldown(receiver, nowMs);
}

async function acquireReceiverAccount(
  intentId: string,
  expiresAt: string,
  chain: SettlementChain,
): Promise<ReceiverAccountRecord> {
  const state = getDemoState();
  const nowMs = Date.now();

  for (const receiver of state.receiverAccounts.values()) {
    if (receiver.state === 'cooldown' && receiver.cooldownUntil) {
      if (Date.parse(receiver.cooldownUntil) <= nowMs) {
        receiver.state = 'available';
        receiver.cooldownUntil = undefined;
      }
    }
  }

  let selected = [...state.receiverAccounts.values()].find(
    (r) => r.state === 'available' && r.chain === chain,
  );
  if (!selected) {
    selected = await createReceiverAccount(chain);
    state.receiverAccounts.set(selected.accountId, selected);
  }

  selected.state = 'active';
  selected.leasedIntentId = intentId;
  selected.leasedAt = nowIso();
  selected.leaseExpiresAt = expiresAt;
  return selected;
}

async function receiverDeltaRaw(intent: PaymentIntentRecord): Promise<bigint> {
  const receiver = getDemoState().receiverAccounts.get(intent.receiverAccountId);
  if (!receiver) {
    throw new DemoError('Receiver account missing for intent.', 500);
  }
  const balance = await getBalanceForReceiver(receiver.address, intent.settlementChain);
  const currentRaw = toRawAmount(balance.amount);
  const initialRaw = BigInt(intent.initialReceiverBalanceRaw);
  return currentRaw > initialRaw ? currentRaw - initialRaw : BigInt(0);
}

function markIntentExpired(intent: PaymentIntentRecord, nowMs: number): void {
  if (intent.status === 'expired' || intent.status === 'delivered') return;
  intent.status = 'expired';
  appendEvent(intent.intentId, {
    kind: 'intent_expired',
    details: `Intent expired at ${new Date(nowMs).toISOString()}. Receiver enters cooldown for ${RECEIVER_COOLDOWN_MINUTES} minutes.`,
  });
  releaseIntentReceiver(intent, nowMs);
}

function markIntentFailed(intent: PaymentIntentRecord, reason: string, nowMs: number): void {
  if (intent.status === 'failed' || intent.status === 'delivered' || intent.status === 'settled') return;
  intent.status = 'failed';
  appendEvent(intent.intentId, {
    kind: 'intent_failed',
    details: reason,
  });
  releaseIntentReceiver(intent, nowMs);
}

function completeDelivery(intent: PaymentIntentRecord, nowMs: number, mode: 'auto' | 'manual'): void {
  if (intent.status === 'delivered') return;
  if (intent.status !== 'settled') {
    throw new DemoError('Intent must be settled before delivery.');
  }

  intent.status = 'delivered';
  intent.deliveredAt = new Date(nowMs).toISOString();
  appendEvent(intent.intentId, {
    kind: 'service_delivered',
    details: mode === 'auto'
      ? `Merchant auto-delivered service for intent ${intent.intentId}.`
      : `Merchant delivered service for intent ${intent.intentId}.`,
  });
  releaseIntentReceiver(intent, nowMs);
}

function maybeAutoDeliverIntent(intent: PaymentIntentRecord, nowMs: number): void {
  if (!AUTO_DELIVER_ENABLED) return;
  if (intent.status !== 'settled' || intent.deliveredAt) return;
  const settledAtMs = intent.settledAt ? Date.parse(intent.settledAt) : nowMs;
  if (Number.isFinite(settledAtMs) && nowMs < settledAtMs + AUTO_DELIVER_DELAY_MS) return;
  completeDelivery(intent, nowMs, 'auto');
}

function applyProviderStatusToIntent(
  intent: PaymentIntentRecord,
  status: ProviderPaymentStatus,
  source: 'webhook' | 'status_poll',
  nowMs: number,
): void {
  if (intent.status === 'delivered') return;

  if (status === 'paid') {
    if (intent.status === 'settled') return;
    intent.status = 'settled';
    intent.settledAt = new Date(nowMs).toISOString();
    if (!intent.paidAmountSourceRaw) {
      intent.paidAmountSourceRaw = intent.requestedAmountRaw;
    }
    appendEvent(intent.intentId, {
      kind: 'source_payment_verified',
      details: `${providerStatusDetails(intent, status, source)} Marked settled.`,
    });
    if (intent.settlementChain !== 'fast') {
      appendEvent(intent.intentId, {
        kind: 'destination_settlement_verified',
        details: `Settlement accepted from provider status for ${intent.settlementChain}.`,
      });
    }
    return;
  }

  if (status === 'expired') {
    markIntentExpired(intent, nowMs);
    return;
  }

  if (status === 'failed') {
    markIntentFailed(intent, providerStatusDetails(intent, status, source), nowMs);
  }
}

async function syncProviderStatus(intent: PaymentIntentRecord, nowMs: number): Promise<void> {
  if (intent.paymentLinkProvider === 'native') return;
  if (!intent.paymentLinkProviderRef) return;
  if (intent.status === 'settled' || intent.status === 'delivered' || intent.status === 'expired' || intent.status === 'failed') {
    return;
  }

  const provider = getPaymentLinkProvider(intent.paymentLinkProvider);
  if (!provider.getStatus) return;

  try {
    const result = await provider.getStatus(intent.paymentLinkProviderRef);
    applyProviderStatusToIntent(intent, result.status, 'status_poll', nowMs);
  } catch {
    // best-effort
  }
}

function isLikelyFundingError(message: string): boolean {
  return /UnknownSenderAccount|INSUFFICIENT_BALANCE|insufficient/i.test(message);
}

async function sendFastPayment(params: {
  from: string;
  to: string;
  amount: string;
  keyfile: string;
}): Promise<{ txHash: string }> {
  const sent = await fastAdapter.send({
    from: params.from,
    to: params.to,
    amount: params.amount,
    token: 'SET',
    keyfile: params.keyfile,
  });
  return { txHash: sent.txHash };
}

async function bridgeFastToArbitrum(params: {
  senderAddress: string;
  senderFastKeyfile: string;
  receiverAddress: string;
  amount: string;
}): Promise<{ txHash: string }> {
  const rawAmount = toRawAmount(params.amount).toString();
  const fastExecutor = createFastTxExecutor(
    params.senderFastKeyfile,
    FAST_RPC_URL,
    params.senderAddress,
  );

  const result = await omnisetProvider.bridge({
    fromChain: toOmnisetChain('fast'),
    toChain: toOmnisetChain('arbitrum-sepolia'),
    fromToken: 'SET',
    toToken: 'WSET',
    fromDecimals: FAST_DECIMALS,
    amount: rawAmount,
    senderAddress: params.senderAddress,
    receiverAddress: params.receiverAddress,
    fastExecutor,
  });
  return { txHash: result.txHash };
}

async function reconcileIntent(intent: PaymentIntentRecord, nowMs: number): Promise<void> {
  if (intent.status === 'expired' || intent.status === 'delivered' || intent.status === 'failed') {
    return;
  }

  await syncProviderStatus(intent, nowMs);
  if (intent.status !== 'created' && intent.status !== 'pending_payment' && intent.status !== 'source_paid') {
    return;
  }

  const expiresAtMs = Date.parse(intent.expiresAt);
  if (Number.isFinite(expiresAtMs) && nowMs > expiresAtMs) {
    markIntentExpired(intent, nowMs);
    return;
  }

  try {
    const paidRaw = await receiverDeltaRaw(intent);
    const requestedRaw = BigInt(intent.requestedAmountRaw);

    if (paidRaw > BigInt(0) && (intent.status === 'created' || intent.status === 'pending_payment')) {
      intent.status = 'source_paid';
    }

    if (paidRaw >= requestedRaw) {
      if (intent.settlementChain !== 'fast' && !intent.destinationTxHash) {
        try {
          intent.destinationTxHash = await findDestinationSettlementTxHash(intent, requestedRaw);
        } catch {
          // best-effort proof enrichment
        }
      }

      intent.status = 'settled';
      intent.settledAt = new Date(nowMs).toISOString();
      intent.paidAmountSourceRaw = paidRaw.toString();
      if (intent.settlementChain === 'fast') {
        appendEvent(intent.intentId, {
          kind: 'source_payment_verified',
          details: `Payment verified on Fast. Received ${toAmount(paidRaw)} SET.`,
        });
      } else {
        appendEvent(intent.intentId, {
          kind: 'destination_settlement_verified',
          details: intent.destinationTxHash
            ? `Destination settlement verified on Arbitrum Sepolia. Received ${toAmount(paidRaw)} WSET. tx=${intent.destinationTxHash}`
            : `Destination settlement verified on Arbitrum Sepolia. Received ${toAmount(paidRaw)} WSET.`,
        });
      }

      if (paidRaw > requestedRaw) {
        intent.overpaid = true;
        intent.overpayAmountRaw = (paidRaw - requestedRaw).toString();
        appendEvent(intent.intentId, {
          kind: 'overpayment_detected',
          details: intent.settlementChain === 'fast'
            ? `Overpayment detected: +${toAmount(paidRaw - requestedRaw)} SET.`
            : `Overpayment detected on destination: +${toAmount(paidRaw - requestedRaw)} WSET.`,
        });
      }
    }
  } catch {
    // Polling should be best-effort; keep intent active for retry on next tick.
  }
}

export async function runVerifierTick(): Promise<void> {
  const state = getDemoState();
  if (state.verifierActive) return;
  state.verifierActive = true;

  try {
    const nowMs = Date.now();
    const intents = [...state.intents.values()];
    for (const intent of intents) {
      await reconcileIntent(intent, nowMs);
      maybeAutoDeliverIntent(intent, nowMs);
    }
  } finally {
    state.verifierActive = false;
  }
}

export function ensureVerifierStarted(): void {
  const state = getDemoState();
  if (state.verifierTimer) return;

  state.verifierTimer = setInterval(() => {
    void runVerifierTick();
  }, VERIFIER_INTERVAL_MS);
}

export async function ensureBuyerSession(sessionId?: string): Promise<BuyerSessionView> {
  const state = getDemoState();
  if (sessionId) {
    const existing = state.sessions.get(sessionId);
    if (existing) {
      existing.lastSeenAt = nowIso();
      return toSessionView(existing);
    }
  }

  const created = await createBuyerSession();
  state.sessions.set(created.sessionId, created);
  return toSessionView(created);
}

export async function getBuyerSession(sessionId: string): Promise<BuyerSessionView | null> {
  const existing = getDemoState().sessions.get(sessionId);
  if (!existing) return null;
  existing.lastSeenAt = nowIso();
  return toSessionView(existing);
}

export async function createPaymentIntent(params: {
  buyerSessionId: string;
  serviceId?: string;
  amount: string | number;
  expiryMinutes?: number;
  settlementChain?: SettlementChain;
  baseUrl: string;
}): Promise<PaymentIntentView> {
  const state = getDemoState();
  const buyer = state.sessions.get(params.buyerSessionId);
  if (!buyer) {
    throw new DemoError('Buyer session not found. Create a session first.', 404);
  }

  const amount = parsePositiveAmount(params.amount);
  const settlementChain: SettlementChain = params.settlementChain ?? 'fast';
  const paymentLinkProvider = getPaymentLinkProvider('native');
  const expiryMinutes = params.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES;
  if (!Number.isFinite(expiryMinutes) || expiryMinutes <= 0) {
    throw new DemoError('Expiry minutes must be a positive number.');
  }

  const intentId = makeId('intent');
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + expiryMinutes * 60_000).toISOString();
  const receiver = await acquireReceiverAccount(intentId, expiresAt, settlementChain);

  let initialBalanceRaw = BigInt(0);
  try {
    const startingBalance = await getBalanceForReceiver(receiver.address, settlementChain);
    initialBalanceRaw = toRawAmount(startingBalance.amount);
  } catch {
    initialBalanceRaw = BigInt(0);
  }
  const settlementTrackingStartBlock = await getSettlementTrackingStartBlock(settlementChain);

  const paymentLink = await paymentLinkProvider.createLink({
    baseUrl: params.baseUrl,
    intentId,
    receiver: receiver.address,
    amount,
    settlementChain,
  });

  const intent: PaymentIntentRecord = {
    intentId,
    buyerSessionId: params.buyerSessionId,
    serviceId: params.serviceId ?? 'mock-service',
    requestedAmount: amount,
    requestedAmountRaw: toRawAmount(amount).toString(),
    tokenRequested: 'SET',
    sourceChain: 'fast',
    settlementChain,
    paymentLinkProvider: paymentLinkProvider.id,
    paymentLinkProviderRef: paymentLink.providerReference,
    receiverAddress: receiver.address,
    receiverAccountId: receiver.accountId,
    paymentLink: paymentLink.url,
    expiresAt,
    status: 'pending_payment',
    createdAt,
    overpaid: false,
    initialReceiverBalanceRaw: initialBalanceRaw.toString(),
    settlementTrackingStartBlock,
  };

  state.intents.set(intent.intentId, intent);
  appendEvent(intent.intentId, {
    kind: 'intent_created',
    details: settlementChain === 'fast'
      ? `Payment requested: ${intent.requestedAmount} SET on Fast. Expires in ${expiryMinutes} minutes.`
      : `Payment requested: ${intent.requestedAmount} SET via Fast->Arbitrum. Receiver expects WSET on Arbitrum Sepolia. Expires in ${expiryMinutes} minutes.`,
  });

  ensureVerifierStarted();
  return toIntentView(intent);
}

export async function listPaymentIntents(): Promise<PaymentIntentView[]> {
  ensureVerifierStarted();
  await runVerifierTick();
  const intents = [...getDemoState().intents.values()].sort((a, b) => {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  return intents.map(toIntentView);
}

export async function getPaymentIntent(intentId: string): Promise<PaymentIntentView | null> {
  ensureVerifierStarted();
  await runVerifierTick();
  const intent = getDemoState().intents.get(intentId);
  return intent ? toIntentView(intent) : null;
}

export async function payIntent(params: {
  intentId: string;
  buyerSessionId: string;
  amount?: string | number;
}): Promise<PaymentIntentView> {
  ensureVerifierStarted();
  await runVerifierTick();

  const state = getDemoState();
  const session = state.sessions.get(params.buyerSessionId);
  if (!session) {
    throw new DemoError('Buyer session not found.', 404);
  }

  const intent = state.intents.get(params.intentId);
  if (!intent) {
    throw new DemoError('Payment intent not found.', 404);
  }

  const nowMs = Date.now();
  if (Date.parse(intent.expiresAt) <= nowMs && intent.status !== 'settled') {
    markIntentExpired(intent, nowMs);
    throw new DemoError('Payment link expired.');
  }

  if (intent.status === 'expired') {
    throw new DemoError('Payment intent already expired.');
  }
  if (intent.status === 'delivered') {
    throw new DemoError('Service already delivered for this intent.');
  }

  const payAmount = params.amount !== undefined
    ? parsePositiveAmount(params.amount)
    : intent.requestedAmount;

  let usedFaucetRetry = false;
  let txHash: string;
  try {
    const sent = intent.settlementChain === 'fast'
      ? await sendFastPayment({
          from: session.addressFast,
          to: intent.receiverAddress,
          amount: payAmount,
          keyfile: keyfilePath(session.configDir, 'fast'),
        })
      : await bridgeFastToArbitrum({
          senderAddress: session.addressFast,
          senderFastKeyfile: keyfilePath(session.configDir, 'fast'),
          receiverAddress: intent.receiverAddress,
          amount: payAmount,
        });
    txHash = sent.txHash;
  } catch (err: unknown) {
    const firstMessage = err instanceof Error ? err.message : String(err);
    if (!isLikelyFundingError(firstMessage)) {
      throw new DemoError(`Payment failed: ${firstMessage}`, 500);
    }

    try {
      await fastAdapter.faucet(session.addressFast);
      const retried = intent.settlementChain === 'fast'
        ? await sendFastPayment({
            from: session.addressFast,
            to: intent.receiverAddress,
            amount: payAmount,
            keyfile: keyfilePath(session.configDir, 'fast'),
          })
        : await bridgeFastToArbitrum({
            senderAddress: session.addressFast,
            senderFastKeyfile: keyfilePath(session.configDir, 'fast'),
            receiverAddress: intent.receiverAddress,
            amount: payAmount,
          });
      txHash = retried.txHash;
      usedFaucetRetry = true;
    } catch (retryErr: unknown) {
      const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new DemoError(`Payment failed after faucet retry: ${message}`, 500);
    }
  }

  intent.status = 'source_paid';
  intent.sourceTxHash = txHash;
  appendEvent(intent.intentId, {
    kind: 'buyer_payment_submitted',
    details: usedFaucetRetry
      ? (
          intent.settlementChain === 'fast'
            ? `Buyer wallet auto-funded from faucet, then submitted ${payAmount} SET. tx=${txHash}`
            : `Buyer wallet auto-funded from faucet, then submitted Fast payment + OmniSet bridge for ${payAmount} SET. source_tx=${txHash}`
        )
      : (
          intent.settlementChain === 'fast'
            ? `Buyer submitted payment of ${payAmount} SET. tx=${txHash}`
            : `Buyer submitted Fast payment + OmniSet bridge for ${payAmount} SET. source_tx=${txHash}`
        ),
  });
  if (intent.settlementChain !== 'fast') {
    appendEvent(intent.intentId, {
      kind: 'source_payment_verified',
      details: `Source proof accepted on Fast (tx=${txHash}). Waiting for destination settlement on Arbitrum Sepolia.`,
    });
    appendEvent(intent.intentId, {
      kind: 'destination_settlement_pending',
      details: 'OmniSet relay submitted. Polling destination receiver balance on Arbitrum Sepolia.',
    });
  }

  await runVerifierTick();
  return toIntentView(intent);
}

export async function deliverIntent(intentId: string): Promise<PaymentIntentView> {
  ensureVerifierStarted();
  await runVerifierTick();

  const intent = getDemoState().intents.get(intentId);
  if (!intent) {
    throw new DemoError('Payment intent not found.', 404);
  }
  completeDelivery(intent, Date.now(), 'manual');
  return toIntentView(intent);
}

export async function handlePaymentLinkWebhook(params: {
  provider: PaymentLinkProvider;
  providerReference?: string;
  status: ProviderPaymentStatus;
}): Promise<{ matched: boolean; intent?: PaymentIntentView; message: string }> {
  if (!params.providerReference) {
    return {
      matched: false,
      message: 'Provider reference missing from webhook payload.',
    };
  }

  const state = getDemoState();
  const intent = [...state.intents.values()].find((entry) =>
    entry.paymentLinkProvider === params.provider
    && entry.paymentLinkProviderRef === params.providerReference
  );

  if (!intent) {
    return {
      matched: false,
      message: `No demo intent found for ${params.provider}:${params.providerReference}`,
    };
  }

  const nowMs = Date.now();
  applyProviderStatusToIntent(intent, params.status, 'webhook', nowMs);
  await runVerifierTick();

  return {
    matched: true,
    intent: toIntentView(intent),
    message: `Applied provider status "${params.status}" to intent ${intent.intentId}.`,
  };
}

export const DEMO_DEFAULTS = {
  expiryMinutes: DEFAULT_EXPIRY_MINUTES,
  receiverCooldownMinutes: RECEIVER_COOLDOWN_MINUTES,
  verifierIntervalMs: VERIFIER_INTERVAL_MS,
  autoDeliveryEnabled: AUTO_DELIVER_ENABLED,
  autoDeliveryDelayMs: AUTO_DELIVER_DELAY_MS,
};
