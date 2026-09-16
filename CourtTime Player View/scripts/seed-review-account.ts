/**
 * Seed the App Store / Play Store reviewer demo account.
 *
 * Every meaningful screen in CourtTime needs a facility membership, so a
 * reviewer signing up fresh sees empty screens and rejects the app as
 * incomplete. This creates an account that lands on a club with real-looking
 * content.
 *
 * **It builds a dedicated demo facility, not a membership at one of your real
 * clubs.** A reviewer placed in a live club would see your actual members'
 * names, reservations and messages — a privacy problem, and Apple would be
 * looking at other people's data.
 *
 * Safe to re-run: every write is keyed and upserted, and bookings are re-dated
 * relative to today so the demo never goes stale. Run it again before each
 * submission.
 *
 *   npm run seed:review              # create / refresh
 *   npm run seed:review -- --remove  # delete the demo facility and its accounts
 *
 * Reads DATABASE_URL from .env. Note that in this project that is production.
 */

import dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { query } from '../src/database/connection';

dotenv.config();

const FACILITY_ID = 'courttime-demo-club';
const FACILITY_NAME = 'CourtTime Demo Club';

/** Credentials to paste into App Review notes. Password is intentionally simple. */
const REVIEWER_EMAIL = 'appreview@courttimeapp.com';
const REVIEWER_PASSWORD = 'CourtTimeReview1!';
const REVIEWER_NAME = 'Alex Reviewer';

/** Fictional club-mates, so the reviewer sees a populated club. */
const EXTRAS = [
  { email: 'demo.jordan@courttimeapp.com', name: 'Jordan Ellis', skill: '4.0' },
  { email: 'demo.sam@courttimeapp.com', name: 'Sam Whitfield', skill: '3.5' },
  { email: 'demo.riley@courttimeapp.com', name: 'Riley Nakamura', skill: '3.0' },
];

const SALT_ROUNDS = 10;

function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function upsertUser(email: string, fullName: string, password: string): Promise<string> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type)
     VALUES ($1, $2, $3, $4, $5, 'player')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           deleted_at = NULL
     RETURNING id`,
    [
      email.toLowerCase(),
      hash,
      fullName,
      fullName.split(' ')[0] ?? fullName,
      fullName.split(' ').slice(1).join(' ') || null,
    ]
  );
  return result.rows[0].id as string;
}

async function seed() {
  console.log(`\n🎾 Seeding the reviewer demo club (${FACILITY_ID})\n`);

  // ── Facility ──
  await query(
    `INSERT INTO facilities (id, name, type, address, phone, email, description, operating_hours, timezone)
     VALUES ($1, $2, 'Tennis Club', '4239 Allenhurst Dr, Norcross, GA 30092',
             '(770) 555-0134', 'demo@courttimeapp.com',
             'A demonstration club used for app review. Not a real facility.',
             $3, 'America/New_York')
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           operating_hours = EXCLUDED.operating_hours`,
    [
      FACILITY_ID,
      FACILITY_NAME,
      JSON.stringify({
        monday: { open: '07:00', close: '22:00' },
        tuesday: { open: '07:00', close: '22:00' },
        wednesday: { open: '07:00', close: '22:00' },
        thursday: { open: '07:00', close: '22:00' },
        friday: { open: '07:00', close: '22:00' },
        saturday: { open: '08:00', close: '20:00' },
        sunday: { open: '08:00', close: '20:00' },
      }),
    ]
  );
  console.log(`  ✓ facility ${FACILITY_NAME}`);

  // ── Courts ──
  const courtIds: string[] = [];
  const courts = [
    { name: 'Court 1', number: 1, surface: 'Hard', type: 'Tennis', lights: true },
    { name: 'Court 2', number: 2, surface: 'Hard', type: 'Tennis', lights: true },
    { name: 'Court 3', number: 3, surface: 'Clay', type: 'Tennis', lights: false },
    { name: 'Pickleball 1', number: 4, surface: 'Hard', type: 'Pickleball', lights: true },
  ];
  for (const court of courts) {
    const existing = await query(
      `SELECT id FROM courts WHERE facility_id = $1 AND name = $2`,
      [FACILITY_ID, court.name]
    );
    if (existing.rows.length > 0) {
      courtIds.push(existing.rows[0].id);
      continue;
    }
    const created = await query(
      `INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, has_lights, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'available') RETURNING id`,
      [FACILITY_ID, court.name, court.number, court.surface, court.type, court.lights]
    );
    courtIds.push(created.rows[0].id);
  }
  console.log(`  ✓ ${courtIds.length} courts`);

  // ── People ──
  const reviewerId = await upsertUser(REVIEWER_EMAIL, REVIEWER_NAME, REVIEWER_PASSWORD);
  const extraIds: string[] = [];
  for (const person of EXTRAS) {
    const id = await upsertUser(person.email, person.name, `${REVIEWER_PASSWORD}x`);
    extraIds.push(id);
    await query(
      `INSERT INTO player_profiles (user_id, skill_level, bio)
       VALUES ($1, $2, 'Demo member at the CourtTime Demo Club.')
       ON CONFLICT (user_id) DO UPDATE SET skill_level = EXCLUDED.skill_level`,
      [id, person.skill]
    );
  }

  for (const userId of [reviewerId, ...extraIds]) {
    await query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, 'Full', 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE
         SET status = 'active', end_date = NULL`,
      [userId, FACILITY_ID]
    );
  }
  await query(
    `INSERT INTO player_profiles (user_id, skill_level, bio)
     VALUES ($1, '3.5', 'Reviewing the CourtTime app.')
     ON CONFLICT (user_id) DO UPDATE SET skill_level = EXCLUDED.skill_level`,
    [reviewerId]
  );
  console.log(`  ✓ ${1 + extraIds.length} members (1 reviewer, ${extraIds.length} club-mates)`);

  // ── Bookings: re-dated on every run so the demo is never stale ──
  await query(`DELETE FROM bookings WHERE facility_id = $1`, [FACILITY_ID]);
  const bookings = [
    { userId: reviewerId, court: 0, day: 2, start: '18:00', end: '20:00', type: 'match' },
    { userId: reviewerId, court: 2, day: 5, start: '09:00', end: '11:00', type: 'lesson' },
    { userId: extraIds[0]!, court: 1, day: 1, start: '17:00', end: '19:00', type: 'match' },
    { userId: extraIds[1]!, court: 1, day: 2, start: '08:00', end: '09:30', type: 'match' },
    { userId: extraIds[2]!, court: 3, day: 3, start: '12:00', end: '13:00', type: 'match' },
    // A past booking, so the reviewer's history is not empty.
    { userId: reviewerId, court: 0, day: -6, start: '18:00', end: '20:00', type: 'match' },
  ];
  for (const b of bookings) {
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    const duration = (eh! * 60 + em!) - (sh! * 60 + sm!);
    await query(
      `INSERT INTO bookings (court_id, user_id, facility_id, booking_date, start_time, end_time,
                             duration_minutes, status, booking_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        courtIds[b.court],
        b.userId,
        FACILITY_ID,
        ymd(b.day),
        `${b.start}:00`,
        `${b.end}:00`,
        duration,
        b.day < 0 ? 'completed' : 'confirmed',
        b.type,
      ]
    );
  }
  console.log(`  ✓ ${bookings.length} bookings (5 upcoming, 1 past)`);

  // ── A conversation, so Messages is not empty ──
  const convo = await query(
    `INSERT INTO conversations (participant1_id, participant2_id, facility_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (participant1_id, participant2_id) DO UPDATE SET facility_id = EXCLUDED.facility_id
     RETURNING id`,
    [reviewerId, extraIds[0], FACILITY_ID]
  );
  const conversationId = convo.rows[0].id;
  await query(`DELETE FROM messages WHERE conversation_id = $1`, [conversationId]);
  const thread = [
    { from: extraIds[0]!, text: 'Hi! Are you free for doubles on Saturday morning?' },
    { from: reviewerId, text: 'Saturday works — I have Court 3 booked at 9.' },
    { from: extraIds[0]!, text: 'Perfect, see you there.' },
  ];
  for (const m of thread) {
    await query(
      `INSERT INTO messages (conversation_id, sender_id, message_text, is_read)
       VALUES ($1, $2, $3, true)`,
      [conversationId, m.from, m.text]
    );
  }
  console.log(`  ✓ conversation with ${thread.length} messages`);

  // ── A bulletin post with an upcoming clinic ──
  await query(`DELETE FROM bulletin_posts WHERE facility_id = $1`, [FACILITY_ID]);
  await query(
    `INSERT INTO bulletin_posts (facility_id, author_id, title, content, category,
                                 drill_start_at, drill_court_id, drill_max_participants,
                                 min_participants, is_admin_post)
     VALUES ($1, $2, 'Saturday Morning Clinic',
             'Doubles strategy and net play. All levels welcome — bring water.',
             'clinic', $3::date + TIME '09:00', $4, 8, 4, true)`,
    [FACILITY_ID, extraIds[0], ymd(5), courtIds[2]]
  );
  await query(
    `INSERT INTO bulletin_posts (facility_id, author_id, title, content, category, is_admin_post, is_pinned)
     VALUES ($1, $2, 'Welcome to the CourtTime Demo Club',
             'This club exists so the CourtTime app can be reviewed. Everything here is fictional.',
             'announcement', true, true)`,
    [FACILITY_ID, extraIds[0]]
  );
  console.log('  ✓ 2 bulletin posts');

  console.log(`
────────────────────────────────────────────────
  App Review credentials — paste into the notes
────────────────────────────────────────────────
  Email:    ${REVIEWER_EMAIL}
  Password: ${REVIEWER_PASSWORD}
  Club:     ${FACILITY_NAME}

  Re-run before each submission so the bookings
  stay in the future.
────────────────────────────────────────────────
`);
}

async function remove() {
  console.log(`\n🧹 Removing the reviewer demo club (${FACILITY_ID})\n`);
  // Facility-scoped rows cascade from facilities; the demo users do not, so
  // they are removed by email.
  await query(`DELETE FROM facilities WHERE id = $1`, [FACILITY_ID]);
  const emails = [REVIEWER_EMAIL, ...EXTRAS.map((e) => e.email)];
  const result = await query(`DELETE FROM users WHERE email = ANY($1::text[]) RETURNING id`, [emails]);
  console.log(`  ✓ facility removed, ${result.rowCount} demo accounts removed\n`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env first.');
    process.exit(1);
  }
  if (process.argv.includes('--remove')) {
    await remove();
  } else {
    await seed();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
