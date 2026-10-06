/**
 * Migration Runner
 * Applies database migration files to the PostgreSQL database.
 *
 * Tracks applied migrations in a `schema_migrations` table so re-runs are
 * safe. With no argument (or `--pending`), applies every migration file
 * that isn't recorded yet, in filename order - this is what Render's
 * pre-deploy command runs, so schema changes land before the new code that
 * depends on them starts serving traffic.
 *
 * `--on-deploy` is the same as `--pending` but only on Render (it is a no-op
 * elsewhere). `npm start` runs it, so a deploy still gets its migrations when
 * the pre-deploy command isn't configured on the service - a deploy that went
 * live ahead of its schema is what broke every booking on 2026-10-06. It does
 * nothing on a laptop, where DATABASE_URL may point at production.
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

// Arbitrary constant; serializes runners so two instances starting together
// can't both apply the same file.
const MIGRATION_LOCK_KEY = 727001;

async function runPending(client) {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    await applyPending(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}

async function applyPending(client) {
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
  if (process.argv[2] === '--on-deploy' && !process.env.RENDER) {
    await pool.end();
    return;
  }

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

    if (!arg || arg === '--pending' || arg === '--on-deploy') {
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
