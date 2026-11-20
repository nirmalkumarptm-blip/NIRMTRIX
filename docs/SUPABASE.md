# Pairing + sync setup (Supabase)

STATUS: SQL and client code written; the sync ENGINE is tested locally against an in-memory stand-in server. The SQL, RLS and pairing have NOT been run against Postgres/Supabase.

## Why this design
Each device signs in with Supabase anonymous auth, so each has its own revocable identity and Supabase issues/refreshes the JWT. `devices` maps that identity to an account. No service-role key, no custom JWT secret and no email/password exist in the app. The app ships only the project URL and the public anon key (public by design; RLS is the protection).

## Setup (your account)
1. Create a Supabase project. Auth > Providers: enable **Anonymous sign-ins**. Enable CAPTCHA (Turnstile/hCaptcha) for sign-ups to limit device-farm guessing; keep the default per-IP anonymous sign-in rate limit.
2. Run `supabase/migrations/001_pairing_sync.sql`, then `supabase/tests/rls_isolation.sql` on a scratch project. All assertions must pass.
3. Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the app config. Never add the service-role key to any app package.

## Pairing flow
Device 1: sign in anonymously, `bootstrap_device`. To add a device: `pair_create` shows an 8-character code (5 min, single use, hash stored only).
Device 2: sign in anonymously, `pair_redeem(code, name)`. It becomes PENDING and sees no data. Device 1 shows "Approve <name>?" and calls `pair_approve`. Revoke/unpair: `revoke_device` (effective immediately). Wrong codes: 5 per user / 60 per minute globally then rate-limited.

## Sync behaviour (tested with a stand-in server)
Push-then-pull, optimistic versions. Edits on both devices: server version wins and the other edit is saved as a "(conflict copy)" task plus a row in `sync_conflicts`. Edit beats delete. Retried pushes are idempotent. Offline edits stay queued.

## Known gaps
- Photo attachments, recurring-task completions (`completions` table) and settings are not synced yet.
- Reminders on two devices may both ring before they sync.
- Conflict copies are created silently; a review screen is not built.
- Pending devices are never auto-expired; add a cleanup job.
- Verify against current Supabase docs: anonymous-auth limits and `auth.uid()` behaviour.
