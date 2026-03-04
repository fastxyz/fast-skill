export type PaywallIntentStatus =
  | 'pending_payment'
  | 'settled'
  | 'expired'
  | 'failed'
  | 'delivered';

export type PaywallEventKind =
  | 'intent_created'
  | 'transfer_seen'
  | 'settled'
  | 'expired'
  | 'failed'
  | 'unlock_issued'
  | 'unlock_used';

export interface PaywallProductRecord {
  product_id: string;
  slug: string;
  title: string;
  description: string;
  asset_id: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  token_address: string;
  token_symbol: string;
  decimals: number;
  amount_raw: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaywallAssetRecord {
  asset_id: string;
  content_type: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

export interface PaywallReceiverAccountRecord {
  receiver_account_id: string;
  address: string;
  private_key_ref?: string;
  created_at: string;
}

export interface PaywallIntentRecord {
  intent_id: string;
  product_id: string;
  buyer_id: string;
  status: PaywallIntentStatus;
  receiver_address: string;
  receiver_account_id: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  token_address: string;
  token_symbol: string;
  decimals: number;
  requested_amount_raw: string;
  paid_amount_raw: string;
  created_at: string;
  expires_at: string;
  settled_at?: string;
  delivered_at?: string;
  failed_reason?: string;
  verifier_error_count?: number;
  last_verifier_error_at?: string;
  start_block: string;
  last_scanned_block: string;
}

export interface PaywallPaymentEventRecord {
  event_id: string;
  intent_id: string;
  kind: PaywallEventKind;
  tx_hash?: string;
  log_index?: number;
  block_number?: string;
  amount_raw?: string;
  details_json?: string;
  created_at: string;
}

export interface PaywallUnlockGrantRecord {
  grant_id: string;
  intent_id: string;
  asset_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface PaywallStoreData {
  version: 1;
  products: Record<string, PaywallProductRecord>;
  products_by_slug: Record<string, string>;
  assets: Record<string, PaywallAssetRecord>;
  receiver_accounts: Record<string, PaywallReceiverAccountRecord>;
  intents: Record<string, PaywallIntentRecord>;
  payment_events: Record<string, PaywallPaymentEventRecord>;
  unlock_grants: Record<string, PaywallUnlockGrantRecord>;
  seen_transfers: Record<string, true>;
}

export interface PaywallProductView {
  productId: string;
  slug: string;
  title: string;
  description: string;
  assetId: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  amountRaw: string;
  amount: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaywallIntentView {
  intentId: string;
  productId: string;
  buyerId: string;
  status: PaywallIntentStatus;
  receiverAddress: string;
  chain: string;
  network: 'testnet' | 'mainnet';
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  requestedAmountRaw: string;
  requestedAmount: string;
  paidAmountRaw: string;
  paidAmount: string;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  startBlock: string;
  lastScannedBlock: string;
}
