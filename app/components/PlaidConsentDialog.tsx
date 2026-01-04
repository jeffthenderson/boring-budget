'use client'

import { Button } from './Button'

interface PlaidConsentDialogProps {
  onConfirm: () => void
  onCancel: () => void
}

export function PlaidConsentDialog({ onConfirm, onCancel }: PlaidConsentDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-md rounded-lg border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Connect Your Bank Account
        </h2>

        <div className="space-y-4 text-sm text-monday-3pm">
          <p>
            We use <strong className="text-foreground">Plaid</strong> to securely connect to your
            bank. Plaid is a trusted service used by thousands of financial apps.
          </p>

          <div>
            <p className="font-medium text-foreground mb-2">What we access:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account names and balances</li>
              <li>Transaction history (up to 90 days initially)</li>
              <li>Ongoing transaction updates</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground mb-2">How we use your data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Import transactions for budgeting</li>
              <li>Categorize and track spending</li>
              <li>Detect recurring expenses</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground mb-2">Your control:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You can disconnect at any time</li>
              <li>We never store your bank login credentials</li>
              <li>We don&apos;t share your data with third parties</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Continue to Bank Login
          </Button>
        </div>
      </div>
    </div>
  )
}
