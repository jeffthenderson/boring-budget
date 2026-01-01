# Agent Notes

- Prisma loads `.env` by default; for staging, either copy the staging `DATABASE_URL` + `DIRECT_URL` into `.env` or run commands with `.env.local` sourced: `set -a; source .env.local; set +a; npx prisma migrate deploy`.
- Use the Vercel CLI for deployment management and status checks.
