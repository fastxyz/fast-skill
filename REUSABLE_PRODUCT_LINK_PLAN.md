# Reusable Product Payment Link Plan

## Goal
Turn payment links from one-time invoice links into reusable product links:
- Stable product URL (`/merchant/p/:slug`) shareable with users and agents.
- Every buyer session creates a fresh payment intent with a unique receiver address.
- Merchant can track all purchases per product and per intent.

## Current Behavior (Gap)
- Merchant dashboard creates one intent at a time.
- Checkout URL is bound to a single `intentId`.
- Not suitable for repeated sales of the same product through one link.

## Target UX
1. Merchant creates a product once (name, price, settlement chain, active status).
2. Merchant gets one reusable link per product.
3. Buyer opens product link.
4. Backend creates (or resumes) a buyer-scoped intent for that product with:
   - unique receiver account,
   - expiry timer,
   - payment status timeline.
5. Buyer pays via checkout (human or agent path).
6. Merchant sees conversion/status grouped by product.

## Data Model Changes
Add product-level entities alongside existing intent records:

### ProductRecord
- `productId`
- `slug` (unique)
- `title` / `serviceId` display label
- `priceAmount`
- `tokenRequested` (demo: `SET`)
- `settlementChain` (`fast` or `arbitrum-sepolia`)
- `isActive`
- `createdAt`, `updatedAt`

### ProductPurchaseSession (optional helper in-memory map)
- `productId`
- `buyerSessionId`
- `intentId`
- `expiresAt`

Intent model remains mostly unchanged, but add:
- `productId?: string`
- `origin: 'direct_intent' | 'product_link'`

## API Plan
Add product APIs:

1. `POST /api/demo/products`
- Create reusable product.
- Input: `title`, `amount`, `settlementChain`, optional `slug`.
- Output: `product`, `productLink`.

2. `GET /api/demo/products`
- List products and summary stats (optional).

3. `GET /api/demo/products/[productId]`
- Product detail for dashboard.

4. `POST /api/demo/products/[productId]/activate`
5. `POST /api/demo/products/[productId]/deactivate`

6. `POST /api/demo/products/[productId]/intent`
- Called by product page load.
- Creates or reuses a pending intent for current buyer session (cookie-based).
- Returns checkout intent payload.

## UI Plan
### Merchant Dashboard (`/merchant`)
- Add “Products” section:
  - Create product form.
  - Product list with reusable link copy/open actions.
  - Quick stats: total intents, settled, delivered, revenue.
- Keep existing intent list, but group/filter by product.

### Product Checkout Entry (`/merchant/p/[slug]`)
- Public/shareable product landing page.
- On load:
  - ensure buyer session,
  - create/reuse product intent,
  - route to embedded checkout state (or render directly on same page).
- Show:
  - product info,
  - current price,
  - expiry countdown for current intent,
  - pay action + agent link.

### Existing Intent Checkout (`/merchant/checkout`)
- Keep for backward compatibility and direct intent debugging.
- Product page can either redirect to this route with `intentId`, or subsume it.

## Service-Layer Plan
1. Add product store maps in `DemoState`.
2. Add CRUD helpers for products.
3. Add “create intent for product” helper:
   - validates product active,
   - parses amount/chain from product,
   - creates fresh receiver intent using existing flow.
4. Reuse existing verifier and delivery logic unchanged.
5. Add product-aware query helpers for dashboard aggregation.

## Receiver/Attribution Rules
- Keep current invariant: one active receiver per intent.
- Buyer attribution = (`productId`, `intentId`, `buyerSessionId`).
- Receiver reuse still allowed only after expiry/settled + cooldown.

## Security/Operational Notes (Demo vs Real)
Demo phase:
- Keep in-memory persistence.
- Keep polling-based verification.

Production path (follow-up issues):
- Durable DB.
- Signed checkout tokens on public product URLs.
- Custody-backed signing and treasury sweep (already tracked in issues #9 and #8).

## Rollout Phases
### Phase 1: Core Product Links
- Product model + APIs.
- Product page generating buyer-scoped intent.
- Merchant dashboard product creation/listing.

### Phase 2: UX + Metrics
- Product-level analytics (paid count, conversion).
- Better session resume behavior.
- Cleaner buyer/agent split on product page.

### Phase 3: Hardening
- Durable persistence.
- Webhook signature validation (if external provider mode returns).
- Idempotency keys for product intent creation.

## Acceptance Criteria
1. Merchant can create one product and reuse one URL for multiple buyers.
2. Each buyer visit produces a unique receiver-bound payment intent.
3. Merchant can distinguish who paid a fixed price product via per-intent attribution.
4. Existing direct-intent demo flow still works.
5. Fast and Fast->Arbitrum (OmniSet) both work under product links.
