/**
 * Shared pieces of the CourtTime Demo Club seed scripts:
 *   scripts/seed-review-account.ts   (store-reviewer accounts + a light club)
 *   scripts/seed-marketing-demo.ts   (fills the same club for screenshots)
 *
 * Both write to DATABASE_URL from .env, which in this project is production.
 */

import * as bcrypt from 'bcrypt';
import { query } from '../../src/database/connection';

export const FACILITY_ID = 'courttime-demo-club';
export const FACILITY_NAME = 'CourtTime Demo Club';

export const REVIEWER_EMAIL = 'appreview@courttimeapp.com';
export const ADMIN_EMAIL = 'appreview-admin@courttimeapp.com';

/** Display names for the two reviewer logins (also what marketing screenshots show). */
export const REVIEWER_NAME = 'Alex Rivera';
export const ADMIN_NAME = 'Casey Morgan';

/** Fictional club-mates created by the reviewer seed. */
export const EXTRAS = [
  { email: 'demo.jordan@courttimeapp.com', name: 'Jordan Ellis', skill: '4.0' },
  { email: 'demo.sam@courttimeapp.com', name: 'Sam Whitfield', skill: '3.5' },
  { email: 'demo.riley@courttimeapp.com', name: 'Riley Nakamura', skill: '3.0' },
];

const SALT_ROUNDS = 10;

/** Local calendar date `daysFromToday` away, as YYYY-MM-DD. */
export function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Create the account, or refresh its name/type if it exists. With
 * `resetPassword: false` an existing account keeps its password.
 */
export async function upsertUser(
  email: string,
  fullName: string,
  password: string,
  userType: 'player' | 'admin' = 'player',
  { resetPassword = true }: { resetPassword?: boolean } = {}
): Promise<string> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = CASE WHEN $7 THEN EXCLUDED.password_hash ELSE users.password_hash END,
           full_name = EXCLUDED.full_name,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           user_type = EXCLUDED.user_type,
           deleted_at = NULL
     RETURNING id`,
    [
      email.toLowerCase(),
      hash,
      fullName,
      fullName.split(' ')[0] ?? fullName,
      fullName.split(' ').slice(1).join(' ') || null,
      userType,
      resetPassword,
    ]
  );
  return result.rows[0].id as string;
}

/**
 * Delete the demo facility (facility-scoped rows cascade from it) and then the
 * given demo accounts by email (their remaining rows cascade from users).
 */
export async function removeDemoClub(emails: string[]): Promise<number> {
  await query(`DELETE FROM facilities WHERE id = $1`, [FACILITY_ID]);
  const result = await query(`DELETE FROM users WHERE email = ANY($1::text[]) RETURNING id`, [
    emails.map((e) => e.toLowerCase()),
  ]);
  return result.rowCount ?? 0;
}
