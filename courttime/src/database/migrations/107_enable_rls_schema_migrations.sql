-- schema_migrations (scripts/run-migration.js) is created directly by the migration
-- runner via `CREATE TABLE IF NOT EXISTS`, outside the migration file sequence, so it
-- was never covered by 070/082/104. Same rationale: the app only connects via
-- DATABASE_URL as the `postgres` role (BYPASSRLS), so enabling RLS with no policies
-- just closes the unused public PostgREST API surface (flagged by Supabase's
-- rls_disabled_in_public lint).

ALTER TABLE IF EXISTS public.schema_migrations ENABLE ROW LEVEL SECURITY;
