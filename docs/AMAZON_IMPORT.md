# Amazon Order Import

## What this does
- Scrapes Amazon.ca order history list pages (current view only).
- Imports order id, order date, order total, and item titles.
- Matches to existing Amazon transactions by amount and date window.
- Never creates new transactions.
- Optionally runs LLM categorization for matched Amazon transactions.

## Quick start
1. Open `/amazon` in the app.
2. Set the base URL (local dev or Vercel) and copy the bookmarklet.
3. Open your Amazon orders page with the filter you want.
4. Run the bookmarklet and enter your passcode (or paste a token).
5. Return to `/amazon` and refresh to review matches.

## Notes
- Pagination is handled automatically for the current view.
- Duplicates are deduped by order id.
- Ambiguous matches show candidate transactions; pick the right one.
- Unmatched orders stay unmatched until you import the bank/credit CSV and re-run matching.
- The importer does not read invoices or shipping addresses.
- If your app is running on `http://localhost`, Amazon (HTTPS) will block the request. Use your Vercel URL or HTTPS locally.
- Import tokens expire after about an hour.
- Matching uses the order placed date with a +/- window (default 5 days, configurable via `AMAZON_MATCH_WINDOW_DAYS`).

## Troubleshooting
- If the bookmarklet says it cannot get a token, confirm your passcode and that the app URL is correct.
- If nothing imports, confirm you are on an Amazon orders page and that order cards are visible.
