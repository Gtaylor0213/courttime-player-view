/**
 * Create Admin User Script
 * Creates an admin user for a facility
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createAdmin() {
  console.log('🚀 Creating admin user for Sunrise Valley HOA...\n');

  try {
    // Test connection
    console.log('🔌 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database\n');

    // Admin user details
    const email = 'admin@sunrisevalley.com';
    const password = 'admin123'; // Simple password for testing
    const fullName = 'Sunrise Valley Admin';
    const facilityId = 'sunrise-valley';

    // Hash the password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed\n');

    // Check if user already exists
    console.log('🔍 Checking if user already exists...');
    const existingUser = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    let userId;

    if (existingUser.rows.length > 0) {
      console.log('⚠️  User already exists with email:', email);
      userId = existingUser.rows[0].id;
      console.log('   User ID:', userId);

      // Update password
      console.log('🔄 Updating password...');
      await pool.query(
        'UPDATE users SET password_hash = $1, user_type = $2 WHERE id = $3',
        [passwordHash, 'admin', userId]
      );
      console.log('✅ Password updated\n');
    } else {
      // Create new user
      console.log('👤 Creating new admin user...');
      const userResult = await pool.query(
        `INSERT INTO users (
          email,
          password_hash,
          full_name,
          first_name,
          last_name,
          user_type
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, full_name`,
        [
          email,
          passwordHash,
          fullName,
          'Sunrise Valley',
          'Admin',
          'admin'
        ]
      );

      userId = userResult.rows[0].id;
      console.log('✅ User created:');
      console.log('   ID:', userResult.rows[0].id);
      console.log('   Email:', userResult.rows[0].email);
      console.log('   Name:', userResult.rows[0].full_name);
      console.log('');
    }

    // Check if facility membership exists
    console.log('🔍 Checking facility membership...');
    const existingMembership = await pool.query(
      'SELECT * FROM facility_memberships WHERE user_id = $1 AND facility_id = $2',
      [userId, facilityId]
    );

    if (existingMembership.rows.length > 0) {
      console.log('⚠️  Facility membership already exists');

      // Update to make sure user is facility admin
      console.log('🔄 Updating facility admin status...');
      await pool.query(
        `UPDATE facility_memberships
         SET is_facility_admin = true, status = 'active'
         WHERE user_id = $1 AND facility_id = $2`,
        [userId, facilityId]
      );
      console.log('✅ Updated to facility admin\n');
    } else {
      // Create facility membership
      console.log('🏢 Adding facility admin membership...');
      await pool.query(
        `INSERT INTO facility_memberships (
          user_id,
          facility_id,
          membership_type,
          status,
          is_facility_admin,
          start_date
        )
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
        [userId, facilityId, 'premium', 'active', true]
      );
      console.log('✅ Facility admin membership created\n');
    }

    // Verify the setup
    console.log('🔍 Verifying admin setup...');
    const verification = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        u.user_type,
        fm.facility_id,
        fm.is_facility_admin,
        f.name as facility_name
      FROM users u
      JOIN facility_memberships fm ON u.id = fm.user_id
      JOIN facilities f ON fm.facility_id = f.id
      WHERE u.email = $1`,
      [email]
    );

    if (verification.rows.length > 0) {
      const admin = verification.rows[0];
      console.log('✅ Admin setup verified:');
      console.log('   Email:', admin.email);
      console.log('   Name:', admin.full_name);
      console.log('   User Type:', admin.user_type);
      console.log('   Facility:', admin.facility_name);
      console.log('   Is Facility Admin:', admin.is_facility_admin);
      console.log('');
    }

    console.log('🎉 Admin user created successfully!\n');
    console.log('📝 Login credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('');

  } catch (error) {
    console.error('\n❌ Failed to create admin user:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
createAdmin()
  .then(() => {
    console.log('Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
