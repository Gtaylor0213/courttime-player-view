-- facility_general_rules_versions and member_general_rules_acceptances (100_general_rules.sql)
-- were created after 082_enable_rls_missed_tables.sql ran, so they were never covered.
-- Same rationale as 070/082: the app only connects via DATABASE_URL as the `postgres`
-- role (BYPASSRLS), so enabling RLS with no policies just closes the unused public
-- PostgREST API surface (flagged by Supabase's rls_disabled_in_public lint).

ALTER TABLE IF EXISTS public.facility_general_rules_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_general_rules_acceptances ENABLE ROW LEVEL SECURITY;
