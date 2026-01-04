import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

if (!PLAID_CLIENT_ID) {
  console.warn('PLAID_CLIENT_ID is not set');
}

if (!PLAID_SECRET) {
  console.warn('PLAID_SECRET is not set');
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

// Singleton Plaid client
export const plaidClient = new PlaidApi(configuration);

// Environment helpers
export const isPlaidConfigured = () => {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
};

export const getPlaidEnv = () => PLAID_ENV;
