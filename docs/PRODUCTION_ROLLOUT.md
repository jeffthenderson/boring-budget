# Production Rollout (Supabase + Vercel)

This document captures the production setup for Supabase Auth + Supabase Postgres
and Vercel deployments.

## 1) Supabase Auth Configuration

- Disable email signups (invite-only) if you want gated access.
- Configure URL settings:
  - Site URL: `https://your-prod-domain`
  - Redirect URLs: `https://your-prod-domain/login`
- If MFA is required, make sure users enroll before enforcing it.

After changing the Site URL, resend invites or password reset emails so the
links point at the production domain.

## 2) Production Env Vars (Vercel)

Set these values from `.env.production.local`:

- `DATABASE_URL` (pooler/pgbouncer URL)
- `DIRECT_URL` (direct connection for migrations)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AMAZON_IMPORT_SECRET`
- `OPENAI_API_KEY` (if Amazon categorization is enabled)

CLI examples:

```bash
vercel env ls
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

## 3) Remove Legacy Neon Env Vars

If the project used Neon before, remove those integration vars to avoid
accidental usage:

- `NEON_PROJECT_ID`
- `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`,
  `POSTGRES_PRISMA_URL`
- `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`
- `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `DATABASE_URL_UNPOOLED`

```bash
vercel env rm NEON_PROJECT_ID -y
vercel env rm POSTGRES_URL -y
vercel env rm POSTGRES_PRISMA_URL -y
```

## 4) Deploy

```bash
vercel --prod
```

`npm run vercel-build` runs `prisma migrate deploy` during the build, so ensure
`DIRECT_URL` points to the Supabase database.

Check status:

```bash
vercel ls
vercel inspect <deployment-url> --logs
```

## 5) Optional Data Migration (Neon -> Supabase)

1) Dump data from Neon:

```bash
set -a; source .env; set +a
pg_dump "$DIRECT_URL" --data-only --no-owner --no-privileges \
  --exclude-table-data='_prisma_migrations' --schema=public \
  --file /tmp/boring-budget-neon-data.sql
```

2) Import into Supabase:

```bash
set -a; source .env.production.local; set +a
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f /tmp/boring-budget-neon-data.sql
```

3) Assign imported data to a Supabase Auth user:

```sql
BEGIN;

INSERT INTO "User" (id, timezone, currency, "createdAt", "updatedAt")
SELECT '<supabase-user-uuid>', timezone, currency, "createdAt", "updatedAt"
FROM "User"
WHERE id = '<old-neon-user-id>'
ON CONFLICT (id) DO UPDATE
SET timezone = EXCLUDED.timezone,
    currency = EXCLUDED.currency,
    "createdAt" = EXCLUDED."createdAt",
    "updatedAt" = EXCLUDED."updatedAt";

UPDATE "PreallocationSettings" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "BudgetPeriod" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "RecurringDefinition" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "Account" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "IgnoreRule" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "RecurringSuggestionDismissal" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "CategoryMappingRule" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "CategoryMappingDismissal" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';
UPDATE "AmazonOrder" SET "userId" = '<supabase-user-uuid>' WHERE "userId" = '<old-neon-user-id>';

DELETE FROM "User" WHERE id = '<old-neon-user-id>';

COMMIT;
```

## 6) Post-deploy Checks

- Login at `/login` and verify budgets, transactions, and imports.
- Re-send invites or password resets to ensure links point at the prod domain.
- Verify RLS policies in staging first (`docs/STAGING_ROLLOUT.md`).
