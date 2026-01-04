# Plaid Production Onboarding Checklist (from Dashboard)

You've been approved for Production. Use this checklist to finish your integration.

---

## Quick links

- Plaid Quickstart: https://plaid.com/docs/quickstart/
- API Reference (all endpoints): https://plaid.com/docs/api/
- Link (front-end): https://plaid.com/docs/link/
- Webhooks: https://plaid.com/docs/webhooks/
- Errors: https://plaid.com/docs/errors/
- Sandbox: https://plaid.com/docs/sandbox/

---

## Basic setup (4 of 4 complete)

- [x] **Complete your account setup** — Set up your account with Plaid.
  ✅ Account approved for Production.

- [x] **Run the Quickstart app** — Use Plaid Quickstart to get up and running with the API.
  ✅ Plaid SDK integrated and tested in sandbox.

- [x] **Set up front-end integration** — Configure Link, including required OAuth support.
  ✅ `PlaidConnectBankButton` component with `react-plaid-link`.
  ✅ OAuth supported via Plaid Link.

- [x] **Call endpoints** — Test requests/responses and set up webhooks.
  ✅ `/link/token/create` via `createLinkToken()`
  ✅ `/item/public_token/exchange` via `createAccountsFromPlaid()`
  ✅ `/transactions/sync` via `syncPlaidTransactions()`
  ✅ Webhook handler at `/api/plaid/webhook`

---

## Production readiness (4 of 4 complete)

- [x] **Build product-specific core workflows** — Implement core workflows for your selected Plaid products.
  ✅ Transactions sync with category mapping
  ✅ Transfer detection and filtering
  ✅ Recurring transaction matching
  ✅ Multi-account support from single Link session

- [x] **Build update mode** — Fix connected Items that need end-user interaction.
  ✅ `createUpdateModeLinkToken()` for re-authentication flow
  ✅ PlaidLinkButton shows "Fix Connection" when account has error
  ✅ Webhook handler sets `plaidError` on `ITEM_LOGIN_REQUIRED` and `PENDING_EXPIRATION`
  ✅ `clearAccountError()` clears errors for all accounts sharing same Item ID

- [x] **User offboarding** — Handle users unlinking accounts / closing their account with you.
  ✅ `unlinkPlaidAccount()` calls `/item/remove`
  ✅ Clears all Plaid data from account record
  ✅ Webhook handler for `USER_PERMISSION_REVOKED`

- [x] **Port to production** — Migration steps to be reliable and secure.

  ### Port to production — step-by-step

  - [x] **Store Production access tokens** — Securely store tokens and associate them to the correct user.
    ✅ Access tokens encrypted with AES-256-GCM before storage
    ✅ Tokens associated with user via Account model

  - [x] **Provide required notices and obtain consent** — Ensure you show required disclosures and get user permission.
    ✅ MFA required before connecting bank (configurable via `REQUIRE_MFA_FOR_PLAID`)
    ✅ PlaidConsentDialog shows data disclosure before initiating Link flow
    ✅ Explains what data is accessed and how it's used

  - [x] **Store sensitive user data appropriately** — Secure storage, least privilege, encryption, access controls.
    ✅ Access tokens encrypted at rest
    ✅ Server actions verify user ownership before operations
    ✅ Webhook verifies item ownership

  - [x] **Remove Sandbox calls** — Ensure you're not calling Sandbox endpoints/keys in production.
    ✅ `PLAID_ENV=production` set in Vercel production environment

  - [x] **Switch to the Production server and API keys** — Use Production keys + Production environment everywhere.
    ✅ All production credentials configured in Vercel:
    - `PLAID_ENV=production`
    - `PLAID_CLIENT_ID` (production)
    - `PLAID_SECRET` (production)
    - `PLAID_WEBHOOK_URL=https://boring-budget.vercel.app/api/plaid/webhook`
    - `PLAID_TOKEN_ENCRYPTION_KEY` (for access token encryption)

---

## Optimize integration (2 of 3 complete)

- [x] **Duplicate Items** — Reduce user confusion and manage costs by detecting duplicate Items.
  ✅ `createAccountsFromPlaid()` checks for existing accounts with same Plaid account IDs
  ✅ Returns clear error message listing already-connected account names
  ✅ Database has unique constraint on `plaidItemId` + `plaidAccountId`

- [ ] **Link conversion optimizations** — Improve Link completion/conversion.
  ⚠️ Low priority for MVP. Consider later:
  - Pre-select institution
  - Remember last used institution
  - Handle OAuth redirect properly

- [x] **Logging** — Add logs for troubleshooting.
  ✅ Webhook events logged to `PlaidWebhookLog` table
  ✅ Sync results logged with counts (added, skipped, errors)
  ✅ Console errors for failed operations

---

## Environment Variables Required for Production

```bash
# Plaid credentials (from Plaid Dashboard)
PLAID_CLIENT_ID=your_production_client_id
PLAID_SECRET=your_production_secret
PLAID_ENV=production

# Webhook URL (your deployed domain)
PLAID_WEBHOOK_URL=https://your-domain.com/api/plaid/webhook

# Encryption key for access tokens (generate secure 32+ char key)
PLAID_ENCRYPTION_KEY=your_secure_encryption_key

# MFA requirement (defaults to true if not set)
REQUIRE_MFA_FOR_PLAID=true
```

---

## ✅ Production Launch Complete

All required items completed:

1. ~~**Link Update Mode**~~ ✅ Implemented
2. ~~**Duplicate Item Detection**~~ ✅ Implemented
3. ~~**Data Disclosure**~~ ✅ Implemented (PlaidConsentDialog)
4. ~~**Switch Environment**~~ ✅ Production credentials configured in Vercel
5. ~~**MFA Enforcement**~~ ✅ Login requires MFA verification when enrolled
