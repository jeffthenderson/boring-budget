/**
 * Maps Plaid personal finance categories to Boring Budget categories
 *
 * Plaid categories: https://plaid.com/docs/api/products/transactions/#transactionspersonal_finance_category
 *
 * Boring Budget categories:
 * - "Recurring - Essential"
 * - "Recurring - Non-Essential"
 * - "Auto"
 * - "Grocery"
 * - "Dining"
 * - "Entertainment"
 * - "Other - Fun"
 * - "Other - Responsible"
 * - "Income"
 * - "Uncategorized"
 */

// Plaid primary categories to Boring Budget categories
const CATEGORY_MAP: Record<string, string> = {
  // Income
  'INCOME': 'Income',

  // Transportation
  'TRANSPORTATION': 'Auto',

  // Food & Drink
  'FOOD_AND_DRINK': 'Dining', // Default, will be overridden by detailed below

  // Entertainment
  'ENTERTAINMENT': 'Entertainment',

  // Personal Care
  'PERSONAL_CARE': 'Other - Fun',

  // General Merchandise
  'GENERAL_MERCHANDISE': 'Other - Fun',

  // Home Improvement
  'HOME_IMPROVEMENT': 'Other - Responsible',

  // Medical
  'MEDICAL': 'Other - Responsible',

  // Rent and Utilities
  'RENT_AND_UTILITIES': 'Recurring - Essential',

  // Loan Payments
  'LOAN_PAYMENTS': 'Recurring - Essential',

  // Bank Fees
  'BANK_FEES': 'Other - Responsible',

  // Government and Non-Profit
  'GOVERNMENT_AND_NON_PROFIT': 'Other - Responsible',

  // Travel
  'TRAVEL': 'Other - Fun',

  // General Services
  'GENERAL_SERVICES': 'Other - Responsible',

  // Transfers (handled specially - usually ignored)
  'TRANSFER_IN': 'Income',
  'TRANSFER_OUT': 'Uncategorized', // Will be detected as transfer
};

// Plaid detailed categories (primary.detailed) for finer control
const DETAILED_CATEGORY_MAP: Record<string, string> = {
  // Groceries specifically
  'FOOD_AND_DRINK.GROCERIES': 'Grocery',
  'FOOD_AND_DRINK.SUPERMARKETS_AND_GROCERIES': 'Grocery',

  // Restaurants/Dining
  'FOOD_AND_DRINK.RESTAURANT': 'Dining',
  'FOOD_AND_DRINK.RESTAURANTS': 'Dining',
  'FOOD_AND_DRINK.FAST_FOOD': 'Dining',
  'FOOD_AND_DRINK.COFFEE': 'Dining',
  'FOOD_AND_DRINK.COFFEE_SHOPS': 'Dining',
  'FOOD_AND_DRINK.BARS': 'Dining',

  // Subscriptions
  'GENERAL_SERVICES.SUBSCRIPTION': 'Recurring - Non-Essential',
  'ENTERTAINMENT.STREAMING': 'Recurring - Non-Essential',

  // Utilities (essential recurring)
  'RENT_AND_UTILITIES.UTILITIES': 'Recurring - Essential',
  'RENT_AND_UTILITIES.ELECTRIC': 'Recurring - Essential',
  'RENT_AND_UTILITIES.GAS': 'Recurring - Essential',
  'RENT_AND_UTILITIES.WATER': 'Recurring - Essential',
  'RENT_AND_UTILITIES.INTERNET': 'Recurring - Essential',
  'RENT_AND_UTILITIES.PHONE': 'Recurring - Essential',
  'RENT_AND_UTILITIES.RENT': 'Recurring - Essential',

  // Insurance (essential recurring)
  'LOAN_PAYMENTS.INSURANCE': 'Recurring - Essential',
  'GENERAL_SERVICES.INSURANCE': 'Recurring - Essential',

  // Gas for car
  'TRANSPORTATION.GAS': 'Auto',
  'TRANSPORTATION.GAS_STATIONS': 'Auto',
  'TRANSPORTATION.PARKING': 'Auto',
  'TRANSPORTATION.PUBLIC_TRANSIT': 'Auto',
  'TRANSPORTATION.TAXI': 'Auto',
  'TRANSPORTATION.RIDESHARE': 'Auto',

  // Entertainment specifics
  'ENTERTAINMENT.MUSIC': 'Entertainment',
  'ENTERTAINMENT.MOVIES': 'Entertainment',
  'ENTERTAINMENT.GAMES': 'Entertainment',
  'ENTERTAINMENT.SPORTS': 'Entertainment',
};

export interface PlaidCategory {
  primary: string;
  detailed?: string;
}

/**
 * Maps a Plaid category to a Boring Budget category
 */
export function mapPlaidCategory(category: PlaidCategory | null): string {
  if (!category) {
    return 'Uncategorized';
  }

  // Try detailed category first
  if (category.detailed) {
    const detailedKey = `${category.primary}.${category.detailed}`;
    if (DETAILED_CATEGORY_MAP[detailedKey]) {
      return DETAILED_CATEGORY_MAP[detailedKey];
    }
  }

  // Fall back to primary category
  if (CATEGORY_MAP[category.primary]) {
    return CATEGORY_MAP[category.primary];
  }

  return 'Uncategorized';
}

/**
 * Check if a Plaid category represents a transfer (should be ignored)
 */
export function isTransferCategory(category: PlaidCategory | null): boolean {
  if (!category) return false;

  // Direct transfer categories
  if (category.primary === 'TRANSFER_IN' ||
      category.primary === 'TRANSFER_OUT') {
    return true;
  }

  // Check detailed category for transfer-related keywords
  if (category.detailed) {
    const detailed = category.detailed.toUpperCase();
    if (detailed.includes('TRANSFER') ||
        detailed.includes('CREDIT_CARD') ||  // Credit card payments are internal transfers
        detailed === 'CREDIT CARD') {
      return true;
    }
  }

  return false;
}

/**
 * Check if a transaction description indicates an internal transfer
 * (used as fallback when Plaid category doesn't catch it)
 */
export function isTransferDescription(description: string): boolean {
  const normalized = description.toUpperCase();

  // Credit card payment patterns
  if (normalized.includes('CREDIT CARD') && normalized.includes('PAYMENT')) {
    return true;
  }

  // Common transfer patterns
  const transferPatterns = [
    /^TRANSFER\s+(TO|FROM)/i,
    /^(TO|FROM)\s+.*\d{4}$/i,  // "TO CHECKING ...1234"
    /^ONLINE\s+TRANSFER/i,
    /^INTERNET\s+TRANSFER/i,
    /^PAYMENT\s+-\s+THANK\s+YOU/i,  // Credit card payment confirmations
  ];

  return transferPatterns.some(pattern => pattern.test(description));
}
