-- Pin search_path on every function flagged by the Supabase Security Advisor
-- (function_search_path_mutable lint). Without a fixed search_path, a function
-- resolves unqualified relation names against whatever search_path the calling
-- session has, which lets a privileged function be tricked into operating on
-- attacker-controlled objects (schema/search_path hijacking).
--
-- All of these functions reference tables unqualified (e.g. "FROM bookings"),
-- so we pin search_path to 'public' rather than '' -- that preserves existing
-- behavior while removing the mutability the lint flags.
--
-- update_address_whitelist_updated_at is not defined anywhere in this
-- migrations folder (created directly via the Supabase SQL editor at some
-- point), but it is a zero-argument updated_at trigger function like its
-- siblings below, so the ALTER FUNCTION signature here is unambiguous.

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.expire_old_hitting_partner_posts() SET search_path = public;
ALTER FUNCTION public.check_split_court_availability(uuid, date, time, time) SET search_path = public;
ALTER FUNCTION public.update_address_whitelist_updated_at() SET search_path = public;
ALTER FUNCTION public.cleanup_old_rate_limits() SET search_path = public;
ALTER FUNCTION public.get_active_strike_count(uuid, character varying, integer) SET search_path = public;
ALTER FUNCTION public.is_user_locked_out(uuid, character varying) SET search_path = public;
ALTER FUNCTION public.get_user_tier(uuid, character varying) SET search_path = public;
ALTER FUNCTION public.is_prime_time(uuid, date, time, time) SET search_path = public;
ALTER FUNCTION public.update_promo_codes_updated_at() SET search_path = public;
ALTER FUNCTION public.update_facility_subscriptions_updated_at() SET search_path = public;
ALTER FUNCTION public.seed_pickle_membership_products(character varying) SET search_path = public;
