# Agent Notes

- Prisma loads `.env` by default; for staging, either copy the staging `DATABASE_URL` + `DIRECT_URL` into `.env` or run commands with `.env.local` sourced: `set -a; source .env.local; set +a; npx prisma migrate deploy`.
- Use the Vercel CLI for deployment management and status checks.
- Keep `.env` and `.env.local` pointing at Supabase (no Neon leftovers).
- Point Vercel Preview/Development env vars at staging Supabase to avoid prod access.
- Treat `docs/PROJECT_PROGRESS.md` as the running backlog; update it (and relevant docs) whenever scope or rollout steps change.
- Follow the UI design bible in `docs/DESIGN_BIBLE.md` for any visual or interaction changes.
