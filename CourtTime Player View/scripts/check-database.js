/**
 * Database Check Script
 * Verify database connection and list all tables
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkDatabase() {
  console.log('🔍 Checking database...\n');

  try {
    // Test connection
    const connectionTest = await pool.query('SELECT NOW() as time, current_database() as db, version()');
    console.log('✅ Connection successful!');
    console.log('   Database:', connectionTest.rows[0].db);
    console.log('   Server time:', connectionTest.rows[0].time);
    console.log('   PostgreSQL version:', connectionTest.rows[0].version.split(' ')[0] + ' ' + connectionTest.rows[0].version.split(' ')[1]);
    console.log('');

    // List all tables
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`📋 Tables in database (${tablesResult.rows.length}):`);
    if (tablesResult.rows.length === 0) {
      console.log('   ⚠️  No tables found. Run setup-database.js to create tables.');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.tablename}`);
      });
    }
    console.log('');

    // Check sample data in facilities
    const facilitiesResult = await pool.query('SELECT id, name, type FROM facilities ORDER BY name');
    console.log(`🏢 Facilities (${facilitiesResult.rows.length}):`);
    if (facilitiesResult.rows.length === 0) {
      console.log('   ⚠️  No facilities found.');
    } else {
      facilitiesResult.rows.forEach(row => {
        console.log(`   - ${row.id}: ${row.name} (${row.type || 'N/A'})`);
      });
    }
    console.log('');

    // Check courts
    const courtsResult = await pool.query('SELECT COUNT(*) as count FROM courts');
    console.log(`🎾 Courts: ${courtsResult.rows[0].count}`);
    console.log('');

    // Check users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`👥 Users: ${usersResult.rows[0].count}`);
    console.log('');

    console.log('✅ Database check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

// Run check
checkDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
