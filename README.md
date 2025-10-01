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
- **Reset Everything**: Nuclear option to start completely fresh

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Database**: SQLite with Prisma ORM
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

The app uses SQLite with the following models:

- **User**: Single user configuration
- **PreallocationSettings**: Charity %, retirement, savings amounts
- **BudgetPeriod**: Monthly budget periods
- **IncomeItem**: Anticipated income sources
- **CategoryBudget**: Budget amounts per category per month
- **RecurringDefinition**: Recurring expense templates
- **Transaction**: All transactions (manual + recurring projections)

## Project Structure

```
boring-budget/
├── app/
│   ├── components/       # Reusable UI components
│   ├── api/             # API routes
│   ├── settings/        # Settings page
│   ├── recurring/       # Recurring definitions
│   ├── admin/           # Admin/reset page
│   └── page.tsx         # Main budget page
├── lib/
│   ├── actions/         # Server actions
│   ├── constants/       # Categories, messages
│   ├── utils/           # Currency, calculations, scheduling
│   └── db.ts            # Prisma client
├── prisma/
│   └── schema.prisma    # Database schema
└── public/              # Static assets
```

## Test Cases

The app handles these key scenarios:

1. **Pre-allocation math**: Income $5,732.15, charity 10%, retirement $500, savings $359.82 → Goal Budget $4,299.12
2. **Projected recurring**: Automatically creates projected transactions from active definitions
3. **Posting with delta**: Update projected amount when posting (e.g., $100 → $102.19)
4. **Manual transactions**: Add/delete updates category actuals immediately
5. **Lock/unlock**: Prevent edits to finished months

## Development Notes

- All currency values are stored as Float and rounded half-away-from-zero to 2 decimal places
- Recurring schedules support monthly, weekly, biweekly, and twice-monthly patterns
- Each month is isolated - no carryover between periods
- Projected transactions count as "already spent" immediately

## License

MIT

## Acknowledgments

Inspired by the unremarkable nature of responsible budgeting.

Built with professional boredom.

---

*Version 1.0.0 (Unremarkable Edition)*
