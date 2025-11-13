/**
 * Database Setup Script
 * Run this script to initialize the database with all tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // Test connection
    console.log('🔌 Testing database connection...');
    const testResult = await pool.query('SELECT NOW() as current_time, current_database() as database_name');
    console.log('✅ Connected to database:', testResult.rows[0].database_name);
    console.log('   Server time:', testResult.rows[0].current_time);
    console.log('');

    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'src', 'database', 'schema.sql');
    console.log('📝 Reading schema from:', schemaPath);

    if (!fs.existsSync(schemaPath)) {
      throw new Error('Schema file not found at: ' + schemaPath);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split into statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`   Found ${statements.length} SQL statements\n`);
    console.log('📊 Executing SQL statements...\n');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        await pool.query(statement + ';');
        successCount++;

        // Log progress for important statements
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`   ✅ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`   ✅ Created index: ${indexName}`);
        } else if (statement.includes('CREATE EXTENSION')) {
          console.log(`   ✅ Created extension: uuid-ossp`);
        } else if (statement.includes('INSERT INTO')) {
          const tableName = statement.match(/INSERT INTO (\w+)/i)?.[1];
          console.log(`   ✅ Inserted data into: ${tableName}`);
        } else if (statement.includes('CREATE TRIGGER')) {
          const triggerName = statement.match(/CREATE TRIGGER (\w+)/i)?.[1];
          console.log(`   ✅ Created trigger: ${triggerName}`);
        } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
          const funcName = statement.match(/CREATE OR REPLACE FUNCTION (\w+)/i)?.[1];
          console.log(`   ✅ Created function: ${funcName}`);
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.code === '42P07' || error.code === '42710' || error.message.includes('already exists')) {
          skipCount++;
          // Only show skipped messages for tables to reduce noise
          if (statement.includes('CREATE TABLE')) {
            const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
            console.log(`   ⚠️  Table already exists: ${tableName}`);
          }
        } else {
          errorCount++;
          console.error(`   ❌ Error: ${error.message}`);
          console.error(`      Statement: ${statement.substring(0, 60)}...`);
        }
      }
    }

    console.log('\n📊 Database Setup Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⚠️  Skipped (already exists): ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total statements: ${statements.length}`);

    if (errorCount === 0) {
      console.log('\n✅ Database setup completed successfully!\n');
    } else {
      console.log('\n⚠️  Database setup completed with errors.\n');
    }

    // List all tables
    console.log('📋 Listing all tables:');
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

    console.log('\n✨ Setup complete! Your database is ready to use.\n');

  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupDatabase()
  .then(() => {
    console.log('Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
