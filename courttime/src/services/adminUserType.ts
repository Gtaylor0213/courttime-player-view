import { query } from '../database/connection';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> };

/**
 * Keep `users.user_type` in step with club admin rights.
 *
 * The website and server gate admin features (admin-only reservation types,
 * booking for others, lockout bypass) on `user_type = 'admin'`, while the
 * club admin list lives in `facility_admins`. Call this after any change to a
 * user's `facility_admins` rows: an active row anywhere makes them 'admin';
 * losing their last one makes them 'player' again. Platform super admins are
 * never demoted here.
 */
export async function syncAdminUserType(userId: string | null | undefined, db: Queryable = { query }): Promise<void> {
  if (!userId) return;
  await db.query(
    `UPDATE users u
     SET user_type = x.next_type
     FROM (
       SELECT CASE WHEN EXISTS (
         SELECT 1 FROM facility_admins WHERE user_id = $1 AND status = 'active'
       ) THEN 'admin' ELSE 'player' END AS next_type
     ) x
     WHERE u.id = $1
       AND u.user_type IS DISTINCT FROM x.next_type
       AND (x.next_type = 'admin' OR COALESCE(u.is_super_admin, false) = false)`,
    [userId],
  );
}
