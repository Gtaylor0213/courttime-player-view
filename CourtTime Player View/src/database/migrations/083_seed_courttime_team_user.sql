-- Seeds a platform-level "CourtTime Team" user that the /developer console uses
-- as the sender identity for admin broadcast messages (see
-- src/services/developerMessagingService.ts). The password hash is bcrypt of a
-- random value that was never stored anywhere, so this account cannot practically
-- be logged into through the normal auth flow.

INSERT INTO users (id, email, password_hash, full_name, user_type)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'team@courttimeapp.com',
    '$2b$10$GAwndcqIdW9YkGzXbCsCM.qk/U9LsVPiSgqlLEJrthBrBWkkeABZO',
    'CourtTime Team',
    'admin'
)
ON CONFLICT (id) DO NOTHING;
