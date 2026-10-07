/**
 * Setup Test Data Script
 * Creates test facility, admin account, and player account for development
 */

import dotenv from 'dotenv';
import { query } from '../src/database/connection';
import * as bcrypt from 'bcrypt';

// Load environment variables
dotenv.config();

const SALT_ROUNDS = 10;

async function setupTestData() {
  try {
    console.log('🚀 Setting up test data...\n');

    // Apply migration for is_facility_admin field
    console.log('📝 Applying migration for facility admin support...');
    await query(`
      ALTER TABLE facility_memberships
      ADD COLUMN IF NOT EXISTS is_facility_admin BOOLEAN DEFAULT false;
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_facility_memberships_admin
      ON facility_memberships(facility_id, is_facility_admin)
      WHERE is_facility_admin = true;
    `);

    console.log('✅ Migration applied successfully\n');

    // 1. Create Test Facility
    console.log('🏢 Creating test facility...');
    const facilityId = 'test-tennis-club';

    await query(`
      INSERT INTO facilities (id, name, type, description, address, phone, email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email
    `, [
      facilityId,
      'Test Tennis Club',
      'Tennis Club',
      'A premier tennis facility for testing member management features',
      '123 Tennis Lane, Test City, TC 12345',
      '(555) 123-4567',
      'admin@testtennisclub.com'
    ]);

    console.log('✅ Facility created: Test Tennis Club (ID: test-tennis-club)\n');

    // 2. Create Admin User Account
    console.log('👤 Creating admin account...');
    const adminEmail = 'admin@test.com';
    const adminPassword = await bcrypt.hash('admin123', SALT_ROUNDS);

    const adminResult = await query(`
      INSERT INTO users (email, password_hash, full_name, user_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        user_type = EXCLUDED.user_type
      RETURNING id, email, full_name as "fullName", user_type as "userType"
    `, [adminEmail, adminPassword, 'Admin User', 'admin']);

    const adminUser = adminResult.rows[0];
    console.log(`✅ Admin user created: ${adminUser.fullName} (${adminUser.email})`);
    console.log(`   Password: admin123`);
    console.log(`   User ID: ${adminUser.id}\n`);

    // Create user preferences for admin
    await query(`
      INSERT INTO user_preferences (user_id, notifications, timezone, theme)
      VALUES ($1, true, 'America/New_York', 'light')
      ON CONFLICT (user_id) DO NOTHING
    `, [adminUser.id]);

    // 3. Create Player User Account
    console.log('👤 Creating player account...');
    const playerEmail = 'player@test.com';
    const playerPassword = await bcrypt.hash('player123', SALT_ROUNDS);

    const playerResult = await query(`
      INSERT INTO users (email, password_hash, full_name, user_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        user_type = EXCLUDED.user_type
      RETURNING id, email, full_name as "fullName", user_type as "userType"
    `, [playerEmail, playerPassword, 'Player User', 'player']);

    const playerUser = playerResult.rows[0];
    console.log(`✅ Player user created: ${playerUser.fullName} (${playerUser.email})`);
    console.log(`   Password: player123`);
    console.log(`   User ID: ${playerUser.id}\n`);

    // Create user preferences and player profile
    await query(`
      INSERT INTO user_preferences (user_id, notifications, timezone, theme)
      VALUES ($1, true, 'America/New_York', 'light')
      ON CONFLICT (user_id) DO NOTHING
    `, [playerUser.id]);

    await query(`
      INSERT INTO player_profiles (user_id, skill_level, ntrp_rating, playing_hand, bio)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        skill_level = EXCLUDED.skill_level,
        ntrp_rating = EXCLUDED.ntrp_rating,
        playing_hand = EXCLUDED.playing_hand,
        bio = EXCLUDED.bio
    `, [
      playerUser.id,
      'Intermediate',
      4.0,
      'Right',
      'Enthusiastic tennis player looking to improve my game!'
    ]);

    // 4. Add Admin to Facility with Admin Privileges
    console.log('🔐 Adding admin user to facility with admin privileges...');
    await query(`
      INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
      VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
      ON CONFLICT (user_id, facility_id) DO UPDATE SET
        is_facility_admin = EXCLUDED.is_facility_admin,
        status = EXCLUDED.status,
        membership_type = EXCLUDED.membership_type
    `, [adminUser.id, facilityId, 'Full', true, 'active']);

    console.log('✅ Admin user granted facility admin privileges\n');

    // 5. Add Player to Facility as Regular Member
    console.log('👥 Adding player user to facility as regular member...');
    await query(`
      INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
      VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
      ON CONFLICT (user_id, facility_id) DO UPDATE SET
        is_facility_admin = EXCLUDED.is_facility_admin,
        status = EXCLUDED.status,
        membership_type = EXCLUDED.membership_type
    `, [playerUser.id, facilityId, 'Full', false, 'active']);

    console.log('✅ Player user added as regular member\n');

    // 6. Create a few courts for the facility
    console.log('🎾 Creating courts for the facility...');
    for (let i = 1; i <= 4; i++) {
      await query(`
        INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
      `, [
        facilityId,
        `Court ${i}`,
        i,
        'Hard',
        'Tennis',
        false,
        true,
        'available'
      ]);
    }
    console.log('✅ Created 4 courts\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Test data setup complete!\n');
    console.log('📋 Summary:');
    console.log('   Facility: Test Tennis Club (ID: test-tennis-club)');
    console.log('   Admin Account: admin@test.com / admin123');
    console.log('   Player Account: player@test.com / player123');
    console.log('   Courts: 4 courts created\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Start the server: npm run server');
    console.log('   2. Login with admin@test.com to test admin features');
    console.log('   3. Login with player@test.com to test player features');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    process.exit(1);
  }
}

// Run the setup
setupTestData()
  .then(() => {
    console.log('👋 Setup complete! Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
