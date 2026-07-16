/**
 * Grant platform super-admin to a user by email.
 *
 * A super admin implicitly administers every facility (see
 * isFacilityAdmin / isFacilityAdminUser / getUserWithMemberships).
 *
 * Usage:
 *   node scripts/make-super-admin.js reidbissell23@gmail.com
 *   node scripts/make-super-admin.js reidbissell23@gmail.com --revoke
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node scripts/make-super-admin.js <email> [--revoke]');
    process.exit(1);
  }

  try {
    const result = await pool.query(
      `UPDATE users
          SET is_super_admin = $2
        WHERE lower(email) = lower($1)
      RETURNING id, email, is_super_admin AS "isSuperAdmin"`,
      [email, !revoke]
    );

    if (result.rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    const u = result.rows[0];
    console.log(
      `${revoke ? 'Revoked' : 'Granted'} super admin for ${u.email} (id ${u.id}) -> is_super_admin=${u.isSuperAdmin}`
    );
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
