-- conversation_participants (077_group_messages.sql) and booking_payment_shares
-- (080_split_court_payments.sql) were created after 070_enable_rls.sql ran, so
-- they were never covered by it. Same rationale as 070: the app only connects
-- via DATABASE_URL as the `postgres` role (BYPASSRLS), so enabling RLS with no
-- policies just closes the unused public PostgREST API surface.

ALTER TABLE IF EXISTS public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.booking_payment_shares ENABLE ROW LEVEL SECURITY;
