# Product Roadmap

Last updated: 2026-01-04

## Principles

1. **Fix broken things first** — Bugs erode trust faster than missing features
2. **Reduce friction on daily tasks** — Categorization and triage are core loops
3. **Don't over-build** — Some requests are preferences, not problems
4. **Say no to scope creep** — Features need clear use cases before building

---

## Completed

### Sprint 1: Bugs & Quick Wins ✅
- [x] Fix: Budget amount disappears on update (missing `router.refresh()`)
- [x] Fix: Amazon Order link is grey (changed to blue accent)
- [x] Fix: Recurring-essential budgets appear editable (disabled with helper text)

### Plaid Production Launch ✅
- [x] Production credentials configured
- [x] MFA enforcement on login
- [x] Link update mode for re-authentication
- [x] Duplicate item detection
- [x] Data disclosure consent dialog

---

## Up Next

### Sprint 2: Categorization Flow (3-4 days)

The LLM blocking issue is the biggest daily friction point.

| Item | Description |
|------|-------------|
| Background LLM categorization | Move to async processing with progress indicator near button |
| Rename button to "Auto-categorize" | Clear, actionable label |
| Manual choice always wins | If user picks category while LLM is running, user's choice takes precedence |
| Refund/reimbursement chips | Add visual badge to transactions that are linked as refunds/reimbursements |
| Manage categorization rules in Settings | List existing "always categorize X as Y" rules with delete option |

**Implementation notes:**
- Don't build a complex rule builder yet—just show existing rules with delete
- Progress indicator should be subtle, near the button
- Consider using a database queue or simple polling for background status

---

### Sprint 3: Mobile Nav + Account (2-3 days)

| Item | Description |
|------|-------------|
| Bottom navigation bar (mobile) | Icons for: Budget, Import, Recurring, Accounts, Settings |
| Account screen | Link from header, next to logout |
| → Reset password | Via Supabase |
| → MFA management | Enable/disable/re-enroll |
| → Delete account | With confirmation |

**Cut from scope:**
- Forgot password screen — Supabase email recovery works, not needed

---

### Sprint 4: Triage Queue — "Needs Attention" (3-4 days)

A single place for all "unfinished business."

| Item | Description |
|------|-------------|
| New "Needs Attention" section | Accessible from nav, shows count badge |
| → Uncategorized transactions | Quick-categorize interface |
| → Unmatched income | Likely refunds/reimbursements, one-tap link |
| → Accounts with errors | Plaid connection issues |
| Uncategorized row in Budget vs Actual | Tap row → filters to uncategorized transactions |

**Future iteration:**
- LLM suggests refund/reimbursement links automatically

---

### Sprint 5: Transaction Linking UX (2 days)

| Item | Description |
|------|-------------|
| Sort by date (newest first) | Fix the random sort in linking modal |
| Group by date | Match main transaction list visual style |
| Filter chips | "This month", "Similar amount", "Similar description" |

---

### Sprint 6: Recurring Enhancements (2 days)

| Item | Description |
|------|-------------|
| Annual recurring option | For yearly subscriptions (insurance, domains, etc.) |
| Charity/Retirement tracking | Ensure these work like other categories with dedicated pre-allocation math |

---

## Backlog

Items that need more definition or are lower priority.

| Item | Status | Notes |
|------|--------|-------|
| Savings tracking | Needs definition | What's the use case? Transfers to savings? Goals? |
| Budget vs actual as bars | Nice-to-have | Table works fine. Add to design refresh, not core roadmap. |
| Amazon Subscribe & Save projections | Cut | Too niche. Users can add as recurring manually. |
| Webhook signature verification | Security debt | Should do eventually, doesn't block users |
| Design refresh | Someday | See `docs/DESIGN_REFRESH_PLAN.md` |
| Optimistic UI / prefetch | Someday | Performance polish |
| Type `Period`/`Settings` in BudgetDashboard | Tech debt | Minor cleanup |

---

## Explicitly Not Doing

These were considered and rejected:

1. **Forgot password screen** — Supabase handles via email link. Over-engineering.
2. **Full rule builder for categorization** — Just show existing rules with delete. Don't build a complex engine.
3. **Subscribe & Save projections** — Niche Amazon feature. Manual recurring works.
4. **Budget visualization as bars** — Preference, not problem. Save for design refresh.

---

## Security/Ops (Parallel Track)

- [ ] Webhook signature verification
- [ ] E2E auth flow smoke test (invite, password reset, MFA enrollment)
- [ ] CSV import tests

---

## Timeline Estimate

| Sprint | Focus | Days |
|--------|-------|------|
| ~~1~~ | ~~Bug fixes~~ | ~~Done~~ |
| 2 | Categorization flow | 3-4 |
| 3 | Mobile nav + Account | 2-3 |
| 4 | Triage queue | 3-4 |
| 5 | Transaction linking UX | 2 |
| 6 | Recurring enhancements | 2 |

**Total remaining: ~12-15 days of focused work**

---

## User Feedback Log

Original feedback that informed this roadmap:

1. ~~Search for linking transactions sorts randomly~~ → Sprint 5
2. ~~"Unfinished business" view~~ → Sprint 4 (Triage Queue)
3. ~~View Amazon Order link is grey~~ → Sprint 1 ✅
4. ~~Manage "always categorize X as Y" rules~~ → Sprint 2
5. Charitable giving and Retirement tracking → Sprint 6
6. ~~Mobile menu position inconsistent~~ → Sprint 3 (Bottom nav)
7. ~~Account screen for password/MFA/delete~~ → Sprint 3
8. ~~Uncategorized in Budget vs Actual~~ → Sprint 4
9. Savings tracking → Backlog (needs definition)
10. ~~Refund/reimbursement chips~~ → Sprint 2
11. ~~LLM categorization slow/blocking~~ → Sprint 2
12. Budget vs actual as bars → Backlog (nice-to-have)
13. ~~Budget amount disappears on update~~ → Sprint 1 ✅
14. ~~Annual recurring option~~ → Sprint 6
15. ~~Recurring-essential budgets shouldn't be editable~~ → Sprint 1 ✅
16. Amazon Subscribe & Save → Cut (too niche)
