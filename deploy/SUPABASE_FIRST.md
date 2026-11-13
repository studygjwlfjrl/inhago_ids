# Supabase-first deployment

## Architecture
- Static frontend: Render Static Site, Vercel, or GitHub Pages.
- Supabase: Auth, Postgres/RLS, Realtime, and meeting RPC.
- Google Maps remains unchanged; Google API quota and billing are separate.

## Database steps (required before switching frontend)
1. Back up your Supabase database.
2. In Supabase SQL Editor, review and apply `supabase/supabase_first_meetings.sql`.
3. Check `pg_policies` for all existing policies; confirm the expected schema, constraints, grants, and `join_meeting_safe` behavior. Existing broad policies may require tightening. RLS policy additions do not automatically secure every table.
4. Test two authenticated accounts: meeting create/read/update, join, leave, cancel, completion before/after scheduled time, and unauthorized updates.
5. Verify `join_meeting_safe` prevents over-capacity concurrent joins. This migration does NOT replace or audit its definition.
6. Review RLS on friendships, chat_messages, profiles, and manner_reviews before inviting public users.

## Frontend deployment
- Build with `GOOGLE_MAPS_API_KEY=<browser-restricted-key> bash deploy/build-frontend.sh` (no FastAPI URL required).
- Publish `dist/` as the static root. It includes `/map` and `/InhaGo_Design/frontend` with their relative paths intact.
- The generated `map/config.js` contains a **public browser key**, not a secret. Restrict it by HTTP referrer to the deployed domain. Never use a server key or Supabase service-role key.
- In Supabase Auth > URL Configuration, add the deployed URL and allowed redirect URLs; confirm Google OAuth settings.
- Do not publish until the database SQL migration is applied and multi-user/RLS checks pass.
- Supabase and static hosting free tiers have usage limits. Google Maps demo quota is not solved by this migration.

## Local development
- `bash start-dev.sh` still starts the optional legacy FastAPI server for compatibility, but the migrated frontend calls Supabase directly.
- `backend/` is retained for reference and rollback; it is not required for the new frontend.
