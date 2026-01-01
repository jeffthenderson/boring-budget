# Boring Budget Progress

Scope reference: `docs/original_vision.md`

Legend: [x] done  [~] partial  [ ] not started

## Core budgeting
- [x] Monthly, non-rolling budget periods
- [x] Pre-allocations (charity, retirement, other savings) and goal budget math
- [x] Fixed 8-category budget setup
- [x] Recurring definitions with projected transactions counted as spent
- [x] Manual add/delete transactions
- [x] Budget vs actual (overall + category)
- [x] Sortable transactions list (default date sort)
- [x] Category/status filters (including Uncategorized)
- [x] Full reset (clears budgets, imports, and accounts)

## CSV import
- [x] Account management, import wizard, column mapping, summary counts
- [x] Deduplication + transfer detection
- [x] Sign normalization across bank vs credit card (supports debit/credit column)
- [x] Ignored imports still appear (grayed out) with unignore option
- [x] Ignore rules (create, list in settings, apply on import)
- [x] Auto-detect account type from file (no manual selection)
- [x] Multi-file drag/drop import
- [x] Cross-month import or import range selection

## Recurring detection + suggestions
- [x] Auto-detect recurring from history and show suggestions
- [x] Suggestion UX: months seen, dates, amount range, sub-description
- [x] Hide/do-not-add suggestions and remove after adding
- [x] Avoid suggesting canceled or non-monthly patterns
- [ ] Maybe: add explicit "lock" on transactions to prevent auto-recurring backfill

## Budget setup improvements
- [x] Suggest category budgets based on history
- [x] Show balance vs "available after recurring" (goal budget + recurring committed)
- [x] Enforce/setup flow to configure recurring before category budgets (with override)

## Data hygiene + parsing
- [x] Amount parsing supports $ and commas in amount inputs (parseCurrency)
- [x] Bankers rounding for all amount inputs
- [x] Date handling issue: transaction list starts one day early in some months

## Income, refunds, reimbursements
- [x] Income category with projected income transactions (matched to imports)
- [x] Refund/reimbursement linking model + UI (links both directions)
- [ ] Auto-link refunds/reimbursements from history (conservative heuristics)

## Mobile UX
- [x] Responsive padding/layout on core pages
- [x] Budget table horizontal scroll on small screens
- [x] Transaction list readable on mobile (stacked cells + wrapped actions)

## Amazon order import + categorization (plan)
- [x] Target amazon.ca order history pages (support URLs like `/your-orders/orders?...` and `/gp/your-account/order-history`)
- [x] Add data model: AmazonOrder + AmazonOrderItem with dedupe on orderId and userId
- [x] Add secure ingest endpoint `/api/amazon/import` that accepts payload from a bookmarklet
  - Allow CORS only for Amazon domains
  - Auth via passcode prompt that mints a short-lived import token (avoid storing passcode in the page)
- [x] Build bookmarklet to scrape orders page:
  - Use the current view URL (timeFilter, startIndex) and follow pagination to collect all orders for that view
  - Collect order id, date, total, and visible item list from the list page
  - Optional later: fetch each order detail page for full item list
- [x] Duplicate detection:
  - Unique constraint on (userId, orderId)
  - Import uses upsert/skip duplicates and returns counts (created, skipped)
- [x] Add UI for Amazon orders:
  - Import status, counts, last import time
  - List orders with items, matched transaction, category
  - Manual link to a transaction when auto match fails
- [x] Build matching pipeline:
  - Match Amazon orders to existing transactions by date window and amount
  - Never create new transactions from Amazon orders
  - Flag unmatched or ambiguous matches for manual review
- [x] Add LLM categorizer for Amazon orders:
  - Prompt from item list and totals, output category + confidence
  - Reuse OPENAI_MODEL and OPENAI_CATEGORY_CONFIDENCE
  - Apply category to matched transactions and store on order
- [x] Add split-charge matching (1 order -> 2-3 transactions) with combo matching + uniqueness checks
- [x] Link Amazon orders to transactions via join table (support multiple transactions per order)
- [x] Show linked Amazon order details (order id, items, Amazon link) on the budget transactions list
- [x] Use the budget-page LLM categorizer to categorize linked Amazon orders
- [ ] Add cleanup + privacy controls:
  - Clear Amazon orders data
  - Store minimal raw data needed for recategorization
- [ ] Tests: order parsing, matching heuristics, and LLM response validation

## Someday / Maybe
- Auto-categorize transactions (history first, LLM fallback)

## Ops + doc follow-ups
- [ ] Verify production auth flows end-to-end (invite, password reset, MFA enrollment)
- [ ] Add tests or manual smoke checks for CSV import dedupe + recurring match linking
- [ ] Type `Period` and `Settings` in `app/components/BudgetDashboard.tsx`
