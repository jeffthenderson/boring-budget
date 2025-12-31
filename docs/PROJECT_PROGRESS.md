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
- [x] Full reset (clears budgets, imports, and accounts)

## CSV import
- [x] Account management, import wizard, column mapping, summary counts
- [x] Deduplication + transfer detection
- [x] Sign normalization across bank vs credit card (supports debit/credit column)
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

## Notes / next focus
- Clarify expected sign conventions for imported bank/credit card CSVs

## Someday / Maybe
- Auto-categorize transactions (history first, LLM fallback)
