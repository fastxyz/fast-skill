export type SettlementChain = 'fast' | 'arbitrum-sepolia';
export type PaymentLinkProvider = 'native' | 'coinbase' | 'stripe';

export type DemoIntentStatus =
  | 'created'
  | 'pending_payment'
  | 'source_paid'
  | 'settled'
  | 'delivered'
  | 'expired'
  | 'failed';

export interface BuyerSessionRecord {
  sessionId: string;
  addressFast: string;
  configDir: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface ReceiverAccountRecord {
  accountId: string;
  chain: SettlementChain;
  address: string;
  configDir: string;
  state: 'available' | 'active' | 'cooldown';
  leasedIntentId?: string;
  leasedAt?: string;
  leaseExpiresAt?: string;
  cooldownUntil?: string;
  lastReleasedAt?: string;
}

export interface PaymentIntentRecord {
  intentId: string;
  buyerSessionId: string;
  serviceId: string;
  requestedAmount: string;
  requestedAmountRaw: string;
  tokenRequested: 'SET';
  sourceChain: 'fast';
  settlementChain: SettlementChain;
  paymentLinkProvider: PaymentLinkProvider;
  paymentLinkProviderRef?: string;
  receiverAddress: string;
  receiverAccountId: string;
  paymentLink: string;
  expiresAt: string;
  status: DemoIntentStatus;
  createdAt: string;
  settledAt?: string;
  deliveredAt?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  overpaid: boolean;
  overpayAmountRaw?: string;
  paidAmountSourceRaw?: string;
  initialReceiverBalanceRaw: string;
  settlementTrackingStartBlock?: string;
}

export interface ProofEvent {
  intentId: string;
  kind:
    | 'intent_created'
    | 'buyer_payment_submitted'
    | 'source_payment_verified'
    | 'destination_settlement_pending'
    | 'destination_settlement_verified'
    | 'overpayment_detected'
    | 'intent_expired'
    | 'service_delivered'
    | 'intent_failed';
  timestamp: string;
  details: string;
}

export interface DemoState {
  sessions: Map<string, BuyerSessionRecord>;
  receiverAccounts: Map<string, ReceiverAccountRecord>;
  intents: Map<string, PaymentIntentRecord>;
  events: Map<string, ProofEvent[]>;
  verifierTimer: NodeJS.Timeout | null;
  verifierActive: boolean;
}

export interface BuyerSessionView {
  sessionId: string;
  addressFast: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface PaymentIntentView {
  intentId: string;
  buyerSessionId: string;
  serviceId: string;
  requestedAmount: string;
  tokenRequested: 'SET';
  sourceChain: 'fast';
  settlementChain: SettlementChain;
  paymentLinkProvider: PaymentLinkProvider;
  paymentLinkProviderRef?: string;
  receiverAddress: string;
  paymentLink: string;
  expiresAt: string;
  status: DemoIntentStatus;
  createdAt: string;
  settledAt?: string;
  deliveredAt?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  overpaid: boolean;
  overpayAmount?: string;
  paidAmountSource?: string;
  events: ProofEvent[];
}
