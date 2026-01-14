# Plaid Transactions Integration Plan

Status update: integration is live in production; use `docs/Plaid Production Onboarding Checklist.md` for current state.

This document outlines the plan to integrate Plaid's Transactions API into Boring Budget, enabling users to sync transactions directly from their bank accounts instead of manually uploading CSV files.

## Overview

### Current State
- Users upload CSV files exported from their banks
- CSV data is parsed, normalized, deduplicated, and stored as Transactions
- Existing infrastructure handles transfer detection, recurring matching, and categorization

### Target State
- Users can link bank accounts via Plaid Link
- Transactions sync automatically via webhooks
- Manual sync available on-demand
- CSV import remains as a fallback option

---

## Architecture

### Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PLAID INTEGRATION FLOW                         │
└─────────────────────────────────────────────────────────────────────────┘

1. LINK ACCOUNT
   User clicks "Link Bank" → Create Link Token → Open Plaid Link UI
                                    ↓
   User authenticates with bank → Plaid returns public_token
                                    ↓
   Exchange public_token → Store access_token + item_id in Account

2. INITIAL SYNC
   After linking → Call /transactions/sync (no cursor)
                                    ↓
   Process all historical transactions → Store cursor for future syncs

3. ONGOING SYNC (Webhook-driven)
   Plaid sends SYNC_UPDATES_AVAILABLE webhook → Verify webhook
                                    ↓
   Call /transactions/sync with stored cursor → Process new/modified/removed
                                    ↓
   Store new cursor → Repeat if has_more=true

4. MANUAL SYNC (User-triggered)
   User clicks "Sync Now" → Call /transactions/sync with cursor
                                    ↓
   Process updates → Update UI
```

---

## Database Schema Changes

### New Fields on Account Model

```prisma
model Account {
  // ... existing fields ...

  // Plaid Integration
  plaidItemId         String?   @unique  // Plaid Item ID
  plaidAccessToken    String?            // Encrypted access token
  plaidAccountId      String?            // Specific account ID within the Item
  plaidSyncCursor     String?            // Cursor for incremental sync
  plaidLastSyncAt     DateTime?          // Last successful sync timestamp
  plaidInstitutionId  String?            // Bank institution ID
  plaidInstitutionName String?           // Bank name for display
  plaidConsentExpiresAt DateTime?        // When re-auth may be needed
}
```

### New PlaidWebhookLog Model (for debugging/auditing)

```prisma
model PlaidWebhookLog {
  id            String   @id @default(cuid())
  userId        String
  itemId        String
  webhookType   String   // TRANSACTIONS, ITEM, etc.
  webhookCode   String   // SYNC_UPDATES_AVAILABLE, ERROR, etc.
  payload       Json     // Full webhook payload
  processedAt   DateTime?
  error         String?
  createdAt     DateTime @default(now())

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([itemId])
}
```

---

## Implementation Phases

### Phase 1: Foundation & Setup ✅ COMPLETE

**1.1 Environment & Dependencies**
- [x] Add `plaid` npm package (`plaid@^29.0.0`, `react-plaid-link@^3.6.0`)
- [x] Add environment variables (documented below)
- [x] Create Plaid client singleton (`lib/plaid/client.ts`)

**1.2 Database Schema**
- [x] Add Plaid fields to Account model (schema updated)
- [x] Create PlaidWebhookLog model (schema updated)
- [x] Run Prisma migration (`npx prisma db push` ✅)
- [x] Add encryption utility for access tokens (`lib/plaid/encryption.ts`)

**1.3 Security Considerations**
- [x] Encrypt access tokens at rest (AES-256-GCM encryption)
- [x] Implement webhook signature verification (Plaid-Verification JWT + body hash)
- [ ] Add rate limiting to webhook endpoint (TODO)

---

### Phase 2: Plaid Link Integration ✅ COMPLETE

**2.1 Link Token API**
- [x] Create `POST /api/plaid/link-token` endpoint
  - Calls Plaid `/link/token/create`
  - Products: `['transactions']`
  - Country codes: `['US']`
  - Requests 90 days of history

**2.2 Token Exchange API**
- [x] Create `POST /api/plaid/exchange-token` endpoint
  - Receives `public_token` from frontend
  - Exchanges for `access_token` and `item_id`
  - Encrypts and stores credentials

**2.3 Frontend Link Component**
- [x] Create `PlaidLinkButton` component (`app/components/PlaidLinkButton.tsx`)
  - Uses `react-plaid-link`
  - Handles Link flow callbacks
  - Shows loading state during token exchange
  - Supports manual sync and disconnect

**2.4 Account Linking UI**
- [x] Add "Link Bank" button to Accounts page
- [x] Show Plaid institution name for linked accounts
- [x] Show last sync time
- [x] Add "Disconnect" option
- [x] Create `POST /api/plaid/unlink` endpoint

---

### Phase 3: Transaction Sync ✅ COMPLETE

**3.1 Sync Engine**
- [x] Create `lib/plaid/sync.ts` with core sync logic
- [x] Implement cursor-based pagination
- [x] Handle all three transaction arrays:
  - `added` → Create new transactions
  - `modified` → Update existing transactions
  - `removed` → Delete transactions

**3.2 Transaction Mapping**
- [x] Map Plaid transaction fields to existing Transaction model

| Plaid Field | Transaction Field |
|-------------|-------------------|
| `transaction_id` | `externalId` |
| `date` | `date` |
| `amount` | `amount` |
| `name` | `description` |
| `merchant_name` | `subDescription` |
| `personal_finance_category` | `category` (with mapping) |
| `pending` | `status` |

**3.3 Category Mapping**
- [x] Create category mapping (`lib/plaid/category-map.ts`)
- [x] Map primary and detailed Plaid categories
- [x] Handle transfer detection via category

**3.4 Reuse Existing Logic**
- [x] Apply existing recurring matching logic
- [x] Apply existing deduplication via `sourceImportHash`
- [x] Apply category mapping rules (user overrides Plaid)
- [x] Auto-create periods as needed

**3.5 Sync API Endpoints**
- [x] Create `POST /api/plaid/sync` for manual sync trigger
- [ ] Create `GET /api/plaid/sync-status` for sync progress/status (TODO)

---

### Phase 4: Webhooks ✅ COMPLETE

**4.1 Webhook Endpoint**
- [x] Create `POST /api/plaid/webhook` endpoint
- [x] Handle webhook types:
  - `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` → Trigger sync
  - `TRANSACTIONS.INITIAL_UPDATE` → Log completion
  - `TRANSACTIONS.HISTORICAL_UPDATE` → Trigger sync
  - `ITEM.ERROR` → Log error
  - `ITEM.PENDING_EXPIRATION` → Log warning
  - `ITEM.USER_PERMISSION_REVOKED` → Clear credentials
- [x] Implement webhook signature verification (Plaid-Verification JWT + body hash)

**4.2 Webhook Processing**
- [x] Log all webhooks to PlaidWebhookLog
- [x] Update webhook log with processing status
- [ ] Queue webhook processing for long-running syncs (TODO)

**4.3 Error Handling**
- [x] Handle `USER_PERMISSION_REVOKED` (clears credentials)
- [ ] Implement re-authentication flow via Link update mode (TODO)
- [ ] Surface errors to user in UI (TODO)

---

### Phase 5: User Experience ✅ MOSTLY COMPLETE

**5.1 Account Connection Flow**
- [x] Update Accounts page with Plaid linking UI
- [x] Show connection status (connected indicator)
- [x] Display last sync time
- [x] Add manual "Sync Now" button

**5.2 Import Page Integration**
- [ ] Add "Sync from Bank" option alongside CSV upload (TODO)
- [ ] Show which accounts are Plaid-linked (TODO)

**5.3 Transaction Source Indicator**
- [ ] Update Transaction table to show source icon (TODO)
- [ ] Show pending status for pending transactions (TODO)

**5.4 Notifications**
- [ ] Toast notifications for sync completion (TODO)
- [ ] Error alerts for connection issues (TODO)
- [ ] Prompt when re-authentication needed (TODO)

---

### Phase 6: Production Readiness 🔜 NOT STARTED

**6.1 Testing**
- [ ] Unit tests for sync logic
- [ ] Integration tests with Plaid sandbox
- [ ] Test various sandbox personas

**6.2 Monitoring**
- [ ] Log sync metrics (duration, transaction counts)
- [ ] Monitor webhook processing times
- [ ] Alert on repeated sync failures

**6.3 Plaid Dashboard Setup**
- [ ] Configure webhook URL
- [ ] Set up development and production environments
- [ ] Apply for production access (requires Plaid approval)

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plaid/link-token` | POST | Generate Plaid Link token |
| `/api/plaid/exchange-token` | POST | Exchange public token for access token |
| `/api/plaid/sync` | POST | Trigger manual transaction sync |
| `/api/plaid/sync-status` | GET | Get sync status for an account |
| `/api/plaid/webhook` | POST | Receive Plaid webhooks |
| `/api/plaid/unlink` | POST | Disconnect Plaid from account |

---

## File Structure

```
lib/
├── plaid/
│   ├── client.ts           # Plaid client singleton
│   ├── sync.ts             # Transaction sync logic
│   ├── category-map.ts     # Plaid → Boring Budget category mapping
│   ├── webhook-handler.ts  # Webhook processing logic
│   └── encryption.ts       # Access token encryption

app/
├── api/
│   └── plaid/
│       ├── link-token/route.ts
│       ├── exchange-token/route.ts
│       ├── sync/route.ts
│       ├── sync-status/route.ts
│       ├── webhook/route.ts
│       └── unlink/route.ts
├── components/
│   ├── PlaidLinkButton.tsx
│   └── PlaidSyncStatus.tsx
```

---

## Data Flow: Plaid Sync to Storage

```
Webhook: SYNC_UPDATES_AVAILABLE
         ↓
POST /api/plaid/webhook
  - Verify signature
  - Log to PlaidWebhookLog
  - Lookup Account by item_id
         ↓
lib/plaid/sync.ts
  - Call /transactions/sync with cursor
  - Loop while has_more
         ↓
For each transaction in 'added':
  ├─ Map Plaid fields → Transaction fields
  ├─ Determine period from date
  ├─ Compute sourceImportHash
  ├─ Check for duplicates
  ├─ Detect transfers (TRANSFER_IN/OUT)
  ├─ Match recurring definitions
  ├─ Map category (Plaid → existing categories)
  └─ Create Transaction record
         ↓
For each transaction in 'modified':
  └─ Update existing Transaction by externalId
         ↓
For each transaction in 'removed':
  └─ Delete or mark Transaction as removed
         ↓
Update Account.plaidSyncCursor
Update Account.plaidLastSyncAt
         ↓
Revalidate cache: /, /import
```

---

## Security Checklist

- [x] Access tokens encrypted at rest (AES-256-GCM)
- [x] Webhook signature verification
- [ ] Rate limiting on webhook endpoint
- [ ] HTTPS only for webhook URL
- [x] Audit logging for all Plaid operations (PlaidWebhookLog)
- [x] Secure storage of Plaid credentials (env vars)
- [x] No access tokens in logs or error messages

---

## Rollout Strategy

1. **Sandbox Testing**: Full integration testing with Plaid sandbox
2. **Development Environment**: Test with real banks (limited access)
3. **Beta Users**: Invite small group to test
4. **Production**: Full rollout after Plaid production approval

---

## Dependencies

```json
{
  "plaid": "^26.0.0",
  "react-plaid-link": "^3.5.0"
}
```

---

## Environment Variables

```env
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret_key
PLAID_ENV=sandbox  # sandbox | development | production
PLAID_WEBHOOK_URL=https://your-domain.com/api/plaid/webhook

# Encryption (for access tokens)
PLAID_TOKEN_ENCRYPTION_KEY=32-byte-hex-key
```

---

## Open Questions

1. **Historical Data**: How many days of history to request on initial link? (Default: 90, Max: 730)
2. **Multiple Accounts per Item**: Plaid Items can have multiple accounts - allow user to select which to sync?
3. **Pending Transactions**: Show pending transactions or wait until posted?
4. **Sync Frequency**: Rely solely on webhooks or also poll periodically as backup?
5. **Migration**: Auto-link existing accounts if user re-links same bank?

---

## Estimated Scope

| Phase | Description |
|-------|-------------|
| Phase 1 | Foundation & Setup |
| Phase 2 | Plaid Link Integration |
| Phase 3 | Transaction Sync |
| Phase 4 | Webhooks |
| Phase 5 | User Experience |
| Phase 6 | Production Readiness |

---

## What's Been Implemented

The following files have been created/modified:

### New Files
- `lib/plaid/client.ts` - Plaid API client singleton
- `lib/plaid/encryption.ts` - AES-256-GCM encryption for access tokens
- `lib/plaid/category-map.ts` - Plaid to Boring Budget category mapping
- `lib/plaid/sync.ts` - Transaction sync engine
- `lib/actions/plaid.ts` - Server actions for Plaid operations
- `app/api/plaid/link-token/route.ts` - Link token creation endpoint
- `app/api/plaid/exchange-token/route.ts` - Token exchange endpoint
- `app/api/plaid/sync/route.ts` - Manual sync endpoint
- `app/api/plaid/unlink/route.ts` - Account unlinking endpoint
- `app/api/plaid/webhook/route.ts` - Webhook receiver
- `app/components/PlaidLinkButton.tsx` - Plaid Link UI component

### Modified Files
- `package.json` - Added `plaid` and `react-plaid-link` dependencies
- `prisma/schema.prisma` - Added Plaid fields to Account, PlaidWebhookLog model
- `lib/actions/period.ts` - Added `getOrCreatePeriodForDate` helper
- `app/accounts/page.tsx` - Integrated PlaidLinkButton component

---

## Next Steps to Complete Integration

1. **Run the migration**: `npx prisma migrate dev --name add_plaid_integration`

2. **Configure environment variables**:
   ```env
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret_key
   PLAID_ENV=sandbox
   PLAID_WEBHOOK_URL=https://your-domain.com/api/plaid/webhook
   PLAID_TOKEN_ENCRYPTION_KEY=your-32-byte-encryption-key
   ```

3. **Install new dependencies**: `npm install`

4. **Test in sandbox**:
   - Use Plaid sandbox credentials
   - Test user: `user_good` / password: `pass_good`
   - Link an account and verify sync works

5. **Set up ngrok or similar** for webhook testing locally

6. **Optional improvements** (marked TODO in phases above):
   - Sync status endpoint
   - Toast notifications
   - Re-authentication flow

---

## References

- [Plaid Transactions Documentation](https://plaid.com/docs/transactions/)
- [Plaid Link Documentation](https://plaid.com/docs/link/)
- [Plaid Webhooks](https://plaid.com/docs/api/webhooks/)
- [react-plaid-link](https://github.com/plaid/react-plaid-link)
