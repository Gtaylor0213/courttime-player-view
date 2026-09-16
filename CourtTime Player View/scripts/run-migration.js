/**
 * Migration Runner
 * Applies database migration files to the PostgreSQL database.
 *
 * Tracks applied migrations in a `schema_migrations` table so re-runs are
 * safe. With no argument (or `--pending`), applies every migration file
 * that isn't recorded yet, in filename order - this is what Render's
 * pre-deploy command runs, so schema changes land before the new code that
 * depends on them starts serving traffic.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'database', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function isApplied(client, filename) {
  const result = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
  return result.rows.length > 0;
}

async function runMigration(client, migrationFile) {
  console.log(`\n📂 Reading migration file: ${migrationFile}`);
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log(`🔄 Executing migration: ${migrationFile}`);
  console.log('─'.repeat(60));

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migrationFile]);
    await client.query('COMMIT');
    console.log(`✅ Migration completed successfully: ${migrationFile}`);
    console.log('─'.repeat(60));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`\n❌ Migration failed: ${migrationFile}`);
    console.error('Error:', error.message);
    throw error;
  }
}

async function runPending(client) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let ranCount = 0;

  for (const file of files) {
    if (await isApplied(client, file)) continue;
    await runMigration(client, file);
    ranCount++;
  }

  if (ranCount === 0) {
    console.log('\n✅ No pending migrations - database is already up to date.');
  } else {
    console.log(`\n🎉 Applied ${ranCount} pending migration(s)!`);
  }
}

async function main() {
  console.log('\n🚀 Database Migration Runner');
  console.log('════════════════════════════════════════════════════════════\n');

  const client = await pool.connect();

  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    const result = await pool.query('SELECT version()');
    console.log('✅ Connected to PostgreSQL:', result.rows[0].version.split(' ')[1]);

    await ensureMigrationsTable(client);

    const arg = process.argv[2];

    if (!arg || arg === '--pending') {
      await runPending(client);
    } else if (await isApplied(client, arg)) {
      console.log(`\n⏭️  ${arg} is already applied - skipping.`);
    } else {
      await runMigration(client, arg);
      console.log('\n🎉 Migration completed successfully!');
    }

  } catch (error) {
    console.error('\n💥 Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
