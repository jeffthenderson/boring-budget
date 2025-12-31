# Boring Budget

> Budget like nobody's watching. (They're not.)

A single-user budgeting web app that's thrillingly tedious and professionally boring. Built with enthusiasm for monotony.

## Features

- **Monthly Budgets**: Non-rolling periods that start fresh each month
- **Pre-allocations**: Automatically subtract charity, retirement, and savings
- **Fixed Categories**: 8 categories including recurring essentials and discretionary spending
- **Recurring Expenses**: Define items that auto-insert as projected transactions
- **Manual Transactions**: Track one-off expenses across all categories
- **Budget vs Actual**: Real-time tracking of over/under budget at category and total levels
- **CSV Import**: Multi-file uploads with auto account detection, ignore rules, transfer detection, and deduplication (current or cross-month)
- **Reset Everything**: Nuclear option to start completely fresh

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Database**: Postgres (Neon) with Prisma ORM
- **Styling**: Tailwind CSS with custom Boring Budget brand
- **Runtime**: Node.js

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client and create database
npx prisma generate
npx prisma db push
```

### Development

```bash
# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Authentication (Passcode Gate)

Set `BB_PASSCODE` in your `.env`. If `BB_PASSCODE` is not set, the app is unlocked (useful for local dev but not recommended for production).

Visit `/login` to unlock. A secure HTTP-only cookie is set and required for all routes.

### Environment Variables

Minimum required values:

```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
BB_PASSCODE=your-long-passphrase
```

### Vercel

Add the same env vars (`DATABASE_URL`, `DIRECT_URL`, `BB_PASSCODE`) in Vercel and deploy.

### First Run

1. Navigate to **Settings** to configure your pre-allocations:
   - Charity percentage
   - Retirement amount
   - Other savings amount

2. Return to the **Budget** page to start using the app.

## Usage

### Budget Page

The main page shows your current month's budget with:

- **Income Section**: Add anticipated income sources
- **Pre-allocations**: Auto-calculated charity, retirement, and savings
- **Category Budgets**: Set budget amounts for each category
- **Dashboard**: View budgeted vs actual vs difference
- **Transactions**: Add manual transactions, post recurring ones

### Recurring Page

Define recurring expenses like:
- Netflix, rent, utilities (Recurring - Essential)
- Subscriptions (Recurring - Non-Essential)

These automatically appear as "projected" transactions each month.

### Accounts Page

Manage bank and credit card accounts for CSV imports:
- Add accounts with type (bank or credit card)
- Set display alias for transfer detection
- Configure last 4 digits for matching

### Import Page

Upload CSV files from your bank or credit card:
- Auto-detects column mapping (Date, Description, Amount)
- Normalizes signs based on account type
- Filters to current month only
- Skips duplicates automatically
- Detects and ignores transfers
- Suggests matches to recurring expenses

### Settings Page

Configure your monthly pre-allocations. Changes apply to the current open month.

### Admin Page

**Danger Zone**: Reset all data with the confirmation phrase "RESET MY BUDGET"

## Core Calculations

### Goal Budget
```
Goal Budget = Anticipated Income - Charity - Retirement - Other Savings
```

### Charity
```
Charity = Anticipated Income × (Charity Percent / 100)
```

### Category Actual
```
Actual = Sum of all transactions (posted + projected) in that category
```

### Difference
```
Difference = Actual - Budgeted
```

- **Positive** = Over budget
- **Negative** = Under budget (money left)

## Categories

1. Recurring - Essential
2. Recurring - Non-Essential
3. Auto
4. Grocery
5. Dining
6. Entertainment
7. Other - Fun
8. Other - Responsible

## Brand Voice

Boring Budget celebrates mundane financial responsibility with:
- Deadpan humor
- Corporate melancholy aesthetics
- Self-aware monotony
- Delightfully tedious copy

See the full brand guide in the project documentation.

## Database Schema

The app uses Postgres with the following models:

- **User**: Single user configuration
- **PreallocationSettings**: Charity %, retirement, savings amounts
- **BudgetPeriod**: Monthly budget periods
- **IncomeItem**: Anticipated income sources
- **CategoryBudget**: Budget amounts per category per month
- **RecurringDefinition**: Recurring expense templates
- **Transaction**: All transactions (manual + recurring projections + imports)
- **Account**: Bank and credit card accounts for CSV imports
- **ImportBatch**: Tracks each CSV import with summary counts
- **RawImportRow**: Stores parsed and normalized CSV rows
- **TransferGroup**: Pairs transfer transactions to ignore from budget

## Project Structure

```
boring-budget/
├── app/
│   ├── components/       # Reusable UI components
│   ├── api/             # API routes
│   ├── settings/        # Settings page
│   ├── recurring/       # Recurring definitions
│   ├── accounts/        # Account management
│   ├── import/          # CSV import wizard
│   ├── admin/           # Admin/reset page
│   └── page.tsx         # Main budget page
├── docs/                # Vision, progress, and implementation docs
├── lib/
│   ├── actions/         # Server actions
│   ├── constants/       # Categories, messages
│   ├── utils/           # Currency, calculations, scheduling
│   │   └── import/      # CSV parsing, normalization, transfer detection
│   └── db.ts            # Prisma client
├── prisma/
│   └── schema.prisma    # Database schema
├── samples/             # Example CSV/XLSX files
└── public/              # Static assets
```

## Test Cases

The app handles these key scenarios:

1. **Pre-allocation math**: Income $5,732.15, charity 10%, retirement $500, savings $359.82 → Goal Budget $4,299.12
2. **Projected recurring**: Automatically creates projected transactions from active definitions
3. **Posting with delta**: Update projected amount when posting (e.g., $100 → $102.19)
4. **Manual transactions**: Add/delete updates category actuals immediately
5. **Lock/unlock**: Prevent edits to finished months
6. **CSV Import**:
   - Credit card +$125.90 becomes expense $125.90
   - Bank -$1,234.56 "visa payment" + card -$1,234.56 both ignored as transfer
   - Duplicate CSV import creates 0 new transactions
   - Imported Netflix $19.94 matches recurring "Netflix" definition (pending confirmation)

## Development Notes

- All currency values are stored as Float and rounded half-even (bankers rounding) to 2 decimal places
- Recurring schedules support monthly, weekly, biweekly, and twice-monthly patterns
- Each month is isolated - no carryover between periods
- Projected transactions count as "already spent" immediately
- CSV imports use SHA-256 hashing for deduplication
- Transfer detection pairs transactions across accounts within 1-3 days
- Import batches can be undone to remove all created transactions

## License

MIT

## Acknowledgments

Inspired by the unremarkable nature of responsible budgeting.

Built with professional boredom.

---

*Version 1.0.0 (Unremarkable Edition)*
