/**
 * Run contact and address fields migration
 */

import { promises as fs } from 'fs';
import { query } from '../src/database/connection';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function runMigration() {
  try {
    console.log('🔄 Running contact and address migration...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../src/database/migrations/003_add_user_contact_and_address.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.includes('ALTER TABLE') || statement.includes('CREATE INDEX') || statement.includes('COMMENT')) {
        try {
          await query(statement);
          console.log(`✅ Executed: ${statement.substring(0, 60)}...`);
        } catch (error: any) {
          // Ignore "already exists" errors and column not found (for COMMENT statements)
          if (error.message?.includes('already exists') ||
              error.message?.includes('duplicate') ||
              error.message?.includes('does not exist')) {
            console.log(`⏭️  Skipped: ${statement.substring(0, 60)}...`);
          } else {
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nAdded fields:');
    console.log('  - users.phone');
    console.log('  - user_preferences.street_address');
    console.log('  - user_preferences.city');
    console.log('  - user_preferences.state');
    console.log('  - user_preferences.zip_code');
    console.log('  - user_preferences.email_booking_confirmations');
    console.log('  - user_preferences.sms_reminders');
    console.log('  - user_preferences.promotional_emails');
    console.log('  - user_preferences.weekly_digest');
    console.log('  - user_preferences.maintenance_updates');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
