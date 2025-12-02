const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkMemberships() {
  try {
    console.log('=== Checking User Memberships ===\n');

    // Get all users and their memberships
    const usersResult = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.user_type,
        u.is_super_admin,
        fm.facility_id,
        fm.status as membership_status,
        fm.membership_type
      FROM users u
      LEFT JOIN facility_memberships fm ON u.id = fm.user_id
      ORDER BY u.created_at DESC
    `);

    console.log('Users and their memberships:\n');

    let currentUser = null;
    for (const row of usersResult.rows) {
      if (currentUser !== row.id) {
        currentUser = row.id;
        console.log(`\n👤 ${row.full_name || row.email}`);
        console.log(`   Email: ${row.email}`);
        console.log(`   Type: ${row.user_type} | Super Admin: ${row.is_super_admin ? 'Yes' : 'No'}`);
        console.log('   Memberships:');
      }

      if (row.facility_id) {
        console.log(`   - ${row.facility_id} (${row.membership_status || 'unknown status'}, ${row.membership_type || 'unknown type'})`);
      } else {
        console.log('   - No facility memberships');
      }
    }

    // Also check facility_admins table
    console.log('\n\n=== Facility Admins ===\n');
    const adminsResult = await pool.query(`
      SELECT
        fa.user_id,
        u.email,
        u.full_name,
        fa.facility_id,
        fa.is_super_admin,
        fa.status
      FROM facility_admins fa
      JOIN users u ON fa.user_id = u.id
      ORDER BY fa.facility_id
    `);

    for (const row of adminsResult.rows) {
      console.log(`Facility: ${row.facility_id}`);
      console.log(`  Admin: ${row.full_name || row.email} (${row.status})`);
      console.log(`  Super Admin: ${row.is_super_admin ? 'Yes' : 'No'}\n`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkMemberships();
