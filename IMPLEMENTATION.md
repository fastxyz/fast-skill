# Implementation Plan: Merchant/Buyer Demo (`feat/demo`)

Date: 2026-03-02

## 1. Objective

Build a working web demo of a merchant payment flow:

1. Buyer requests service.
2. Merchant returns a payment link with expiry.
3. Buyer pays.
4. Merchant verifies on-chain payment.
5. Merchant delivers service.

Implement in two stages:

- Stage A (first): Fast-only merchant/buyer web demo.
- Stage B (next): Merchant settlement on Arbitrum Sepolia while buyer still pays on Fast via OmniSet.

## 2. Confirmed Product Decisions

- Fresh receiver model: one unique Fast receiving address per payment intent.
- Buyer wallet model: one persistent buyer wallet per browser session.
- Link expiry default: 15 minutes.
- Receiver reuse cooldown after expiry: 30 minutes.
- Payment acceptance: `paid_amount >= requested_amount`.
- Overpay handling: mark `overpaid=true` and record overpay amount.
- Verification method: on-chain polling only.
- Fast -> Arb bridging: use existing OmniSet integration in repo.
- Proof UX for cross-chain flow: show both source proof and destination proof.
- Delivery gate for cross-chain flow: destination-chain settlement only.
- Persistence for demo: in-memory only.

## 3. Scope

### In scope

- Merchant and buyer demo web UI.
- Merchant intent creation and payment link generation.
- Fast chain payment verification.
- Expiry and receiver lease cooldown logic.
- Cross-chain extension plan and framework hooks.

### Out of scope (for now)

- Durable DB (SQLite/Postgres).
- External indexers/watchers/webhooks.
- Coinbase Pay / Stripe integration implementation (only framework prep).

## 4. Architecture

Single Next.js app with demo modules:

- UI pages (merchant + buyer views).
- API routes for demo actions.
- In-memory stores for sessions/intents/leases/events.
- Background pollers for payment verification.

Suggested folders:

- `app/demo/page.tsx` (or split merchant/buyer pages)
- `app/api/demo/*` for merchant/buyer APIs
- `app/lib/demo/store.ts` (in-memory state)
- `app/lib/demo/merchant.ts` (intent/lease/state machine)
- `app/lib/demo/verifier.ts` (on-chain polling/proofs)
- `app/lib/demo/types.ts` (demo models)

## 5. Core Data Model

## `BuyerSession`

- `session_id`
- `buyer_address_fast`
- `created_at`
- `last_seen_at`

## `PaymentIntent`

- `intent_id`
- `buyer_session_id`
- `service_id`
- `amount_requested`
- `token_requested`
- `source_chain` (`fast`)
- `settlement_chain` (`fast` for Stage A, `arbitrum-sepolia` for Stage B)
- `receiver_address`
- `payment_link`
- `expires_at`
- `status` (`created|pending_payment|source_paid|settled|expired|delivered|failed`)
- `paid_amount_source` (optional)
- `overpaid` (bool)
- `overpay_amount` (optional)
- `source_tx_hash` (optional)
- `destination_tx_hash` (optional)
- `delivered_at` (optional)

## `AddressLease`

- `address`
- `leased_to_intent_id`
- `leased_at`
- `expires_at`
- `released_at` (optional)
- `cooldown_until` (optional)

## `ProofEvent`

- `intent_id`
- `kind` (`source_detected|destination_detected|expired|delivered|...`)
- `timestamp`
- `details`

## 6. State Machine

## Stage A (Fast-only)

- `created -> pending_payment -> settled -> delivered`
- `created|pending_payment -> expired`

## Stage B (Fast->Arb)

- `created -> pending_payment -> source_paid -> settled -> delivered`
- `created|pending_payment|source_paid -> expired|failed`

Rule: For Stage B, `delivered` only after `settled` on destination chain.

## 7. Stage A Implementation (Fast-only First)

## Backend/API

1. `POST /api/demo/session`
- Create/return buyer session.
- Ensure one persistent buyer wallet per browser session.

2. `POST /api/demo/intents`
- Merchant creates intent.
- Allocate fresh Fast receiver address.
- Build payment link with `expires_at`.
- Start tracking in verifier.

3. `GET /api/demo/intents/:id`
- Return intent details + timeline/proofs.

4. `POST /api/demo/intents/:id/pay`
- Buyer action endpoint for demo UI.
- Uses SDK to pay on Fast from session wallet.
- Records tx hash if send succeeds.

5. `POST /api/demo/intents/:id/deliver`
- Merchant manual/auto delivery trigger (auto by default after settlement).

## Verifier

- Poll interval (e.g., 5s).
- For each active intent, monitor receiver payment state on Fast.
- If paid and `>= amount_requested`: mark `settled`.
- If paid `>` requested: mark `overpaid`.
- If now > `expires_at` and not paid: mark `expired`.
- On expiry, schedule lease release after 30-minute cooldown.

## UI

- Merchant panel:
  - Create service request (fixed amount)
  - See generated payment link and expiry countdown
  - See intent status and payment proof
  - See service delivered marker
- Buyer panel:
  - Session wallet shown
  - Pay selected intent on Fast
  - View tx hash and payment result
- Shared timeline:
  - intent created
  - payment detected
  - settled
  - delivered (or expired)

## 8. Stage B Extension (Fast Pay -> Arb Settlement via OmniSet)

Extend intent schema/logic:

- `source_chain=fast`, `settlement_chain=arbitrum-sepolia`
- Default token path: `SET` (Fast) -> `WSET` (Arb Sepolia)

Flow:

1. Buyer pays on Fast and bridges via OmniSet.
2. Merchant verifier tracks:
  - Source proof (Fast tx/certificate observed)
  - Destination proof (Arb settlement tx observed)
3. Merchant delivers service only after destination proof.

UI updates:

- Show dual-proof timeline:
  - Source detected
  - Bridge pending
  - Destination settled
  - Delivered

## 9. Payment Link Provider Framework (Prep for Coinbase/Stripe)

Define abstraction now (no external integration yet):

- `PaymentLinkProvider` interface:
  - `createLink(intent) -> url`
  - `normalizeStatus(payload) -> internal status`
  - `extractProof(payload) -> proof event`

Initial provider:

- `money-link` (current native payment link flow)

Future providers:

- `coinbase-pay`
- `stripe-billing`

## 10. Milestones

## M1: Fast-only backend

- session/intent APIs
- in-memory stores
- receiver lease + expiry + cooldown
- Fast verifier poller

## M2: Fast-only UI

- merchant and buyer panels
- timeline and status UX

## M3: Fast-only end-to-end demo polish

- complete happy path
- expiry path
- overpay path

## M4: Cross-chain extension scaffold

- intent model extension
- source+destination proof UI model
- OmniSet integration path in demo actions

## 11. Test Plan (Demo-Level)

- Fast-only happy path:
  - create intent -> buyer pays -> merchant settles -> delivers
- Expiry path:
  - unpaid intent expires at 15m
  - lease enters 30m cooldown then reusable
- Overpay path:
  - paid amount > requested marks `overpaid`
- Session behavior:
  - buyer wallet persists for same browser session
- Cross-chain (when Stage B starts):
  - source proof appears before destination proof
  - delivery blocked until destination settlement

