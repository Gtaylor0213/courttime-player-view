-- Migration 109: ACC-005 (days in advance) now opens hour by hour
--
-- The window is no longer whole calendar days: the cutoff is the current hour plus the
-- club's number of days, and a reservation must end by it. The engine builds the player
-- message itself (shared/utils/bookingWindow.ts), including "1 day" vs "N days" and
-- midnight cutoffs, which a placeholder template can't express. A template only overrides
-- that message, so clear it and keep one source of wording.

UPDATE booking_rule_definitions
SET failure_message_template = NULL
WHERE rule_code = 'ACC-005';
