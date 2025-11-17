import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function verifyUserData() {
  try {
    // Get user data
    const userResult = await pool.query(
      `SELECT id, email, full_name, user_type, phone, street_address, city, state, zip_code
       FROM users
       WHERE email = $1`,
      ['tom.davis@example.com']
    );

    console.log('\n📋 User Data:');
    console.log(userResult.rows[0]);

    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;

      // Get player profile
      const profileResult = await pool.query(
        `SELECT skill_level, ntrp_rating, playing_hand, playing_style
         FROM player_profiles
         WHERE user_id = $1`,
        [userId]
      );

      console.log('\n🎾 Player Profile:');
      console.log(profileResult.rows[0]);

      // Get user preferences
      const prefsResult = await pool.query(
        `SELECT notifications, timezone, theme,
                email_booking_confirmations, sms_reminders,
                promotional_emails, weekly_digest, maintenance_updates
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      console.log('\n⚙️  User Preferences:');
      console.log(prefsResult.rows[0]);
    }

    console.log('\n✅ Verification complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

verifyUserData();
