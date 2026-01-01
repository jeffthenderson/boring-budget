# Boring Budget - Quick Start Guide

## Installation (30 seconds. Maybe 45.)

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Visit: http://localhost:3000

Make sure `.env.local` (or `.env`) contains your Supabase and database env vars.
Invite your email in Supabase Auth, then sign in at `/login`.

## First-Time Setup

1. **Settings Page**: Set your pre-allocations
   - Charity: 10% (or whatever)
   - Retirement: $500/month (or whatever)
   - Other Savings: $359.82 (or whatever)

2. **Budget Page**: Add your income
   - Source: "Paycheck"
   - Amount: $5,732.15
   - Click: ADD INCOME

3. **Set Category Budgets**
   - Scroll to "Category Budgets"
   - Enter amounts for each category
   - Watch the Goal Budget comparison

4. **Optional: Add Recurring Items**
   - Go to Recurring page
   - Add Netflix, rent, etc.
   - They'll auto-appear as projected transactions

## Example Budget (from spec)

### Income
- Total: $5,732.15

### Pre-allocations
- Charity (10%): $573.22
- Retirement: $500.00
- Other Savings: $359.82
- **Goal Budget: $4,299.12**

### Category Budgets
- Recurring - Essential: $3,097.59
- Recurring - Non-Essential: $83.41
- Auto: $170.00
- Grocery: $950.00
- Dining: $100.00
- Entertainment: $25.00
- Other - Fun: $95.00
- Other - Responsible: $0.00
- **Total: $4,521.00**

Difference: $222 over Goal Budget (oops)

## Key Features

### Adding Transactions
1. Fill in description, amount, category, date
2. Click ADD
3. Watch your Actual update

### Posting Recurring Charges
1. Find the projected transaction
2. Click POST
3. Optionally update the amount if it differs

### Resetting Everything
1. Go to Admin page
2. Type: `RESET MY BUDGET`
3. Confirm
4. Start fresh

## Tips

- Projected transactions count as spent immediately
- You can edit amounts when posting recurring items
- Lock months when done to prevent accidents
- The app auto-creates the current month on first load

## Troubleshooting

**Database errors?**
```bash
npx prisma migrate deploy
```

**Module not found?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Prisma client issues?**
```bash
npx prisma generate
```

## Roadmap

See `docs/PROJECT_PROGRESS.md` for current status and deferred work.

Need help? The app probably won't provide it. (Check the README.)
