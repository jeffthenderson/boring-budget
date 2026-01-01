# Staging Rollout & RLS Verification

Keep production untouched. Everything below is for local or staging environments.

## Staging Setup

1. Create or pick a staging Supabase project.
2. Supabase Auth settings:
   - Disable email signups (invite-only).
   - Decide whether MFA is optional or required.
3. Configure staging env vars:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `AMAZON_IMPORT_SECRET`
4. Deploy or run the app against staging.
5. Apply migrations to staging only:

```bash
npx prisma migrate deploy
```

## Invite-Only + MFA Flow Check

- Set Supabase Auth → URL Configuration **Site URL** to `http://localhost:3001/login` (or your staging domain `/login`) so invite links land on a public page that can capture the session.
- Invite users from Supabase Dashboard → Auth → Users.
- Have the user set a password and sign in at `/login`.
- Enable MFA in `/settings` → Security.
- If you enforce MFA in Supabase, make sure users enroll first or new accounts will be blocked at login.

## RLS Verification (Staging)

Run these in Supabase SQL editor or `psql` against staging (not prod). Make sure RLS is active by using the `authenticated` role.

```sql
set role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<user-a-uuid>', 'role', 'authenticated')::text,
  true
);
select auth.uid();
select count(*) from "Account";
select count(*) from "BudgetPeriod";

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<user-b-uuid>', 'role', 'authenticated')::text,
  true
);
select auth.uid();
select count(*) from "Account";
```

Expect each user to see only their own rows. If you see cross-user data, re-check RLS policies and any service-role credentials.

## Smoke Checks

- Login with password + MFA challenge (if factor exists).
- MFA enroll/unenroll in `/settings`.
- Amazon import token endpoint and import flow.
