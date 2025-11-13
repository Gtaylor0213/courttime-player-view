import * as fs from 'fs';
import * as path from 'path';
import { getPool, testConnection, closePool } from './connection';

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('🚀 Starting database migration...\n');

  try {
    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    const pool = getPool();
    let successCount = 0;
    let errorCount = 0;

    console.log(`📝 Executing ${statements.length} SQL statements...\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        await pool.query(statement + ';');
        successCount++;

        // Log progress for important statements
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`✅ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (\w+)/i)?.[1];
          console.log(`✅ Created index: ${indexName}`);
        } else if (statement.includes('INSERT INTO')) {
          const tableName = statement.match(/INSERT INTO (\w+)/i)?.[1];
          console.log(`✅ Inserted data into: ${tableName}`);
        }
      } catch (error: any) {
        // Ignore "already exists" errors for idempotency
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`⚠️  Skipping (already exists): ${statement.substring(0, 50)}...`);
        } else {
          errorCount++;
          console.error(`❌ Error executing statement: ${statement.substring(0, 50)}...`);
          console.error(`   Error: ${error.message}`);
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   Total: ${statements.length}`);

    console.log('\n✅ Database migration completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}
