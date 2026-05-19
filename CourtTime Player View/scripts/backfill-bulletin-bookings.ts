/**
 * Create missing court bookings for bulletin posts that have court/time but no booking_id.
 * Run: npx tsx scripts/backfill-bulletin-bookings.ts
 */
import 'dotenv/config';
import { query } from '../src/database/connection';
import { createBooking } from '../src/services/bookingService';
import { minutesToTime } from '../src/services/rulesEngine/utils/timeUtils';

const SIGNUP_CATEGORIES = ['event', 'drill', 'social', 'clinic', 'tournament'];

function drillStartAtToBookingFields(
  drillStartAt: string,
  durationMinutes: number,
  timeZone: string
): { bookingDate: string; startTime: string; endTime: string } {
  const instant = new Date(drillStartAt);
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const getPart = (type: string) => dateParts.find((p) => p.type === type)?.value ?? '01';
  const bookingDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const hour = parseInt(timeParts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10);
  const startMinutes = hour * 60 + minute;
  return {
    bookingDate,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(startMinutes + durationMinutes),
  };
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'drill':
      return 'Drill';
    case 'clinic':
      return 'Clinic';
    case 'tournament':
      return 'Tournament';
    case 'social':
      return 'Social';
    default:
      return 'Event';
  }
}

async function main() {
  const posts = await query(
    `SELECT id, facility_id, author_id, title, category, drill_start_at, drill_court_id,
            COALESCE(drill_duration_minutes, 60) as duration_minutes
     FROM bulletin_posts
     WHERE booking_id IS NULL
       AND drill_start_at IS NOT NULL
       AND drill_court_id IS NOT NULL
       AND category = ANY($1::text[])
       AND status = 'active'`,
    [SIGNUP_CATEGORIES]
  );

  console.log(`Found ${posts.rows.length} posts to backfill`);
  let ok = 0;
  let fail = 0;

  for (const post of posts.rows) {
    const tzRow = await query(`SELECT timezone FROM facilities WHERE id = $1`, [post.facility_id]);
    const timeZone = tzRow.rows[0]?.timezone || 'America/New_York';
    const duration = Number(post.duration_minutes) || 60;
    const { bookingDate, startTime, endTime } = drillStartAtToBookingFields(
      post.drill_start_at,
      duration,
      timeZone
    );

    const result = await createBooking({
      courtId: post.drill_court_id,
      userId: post.author_id,
      facilityId: post.facility_id,
      bookingDate,
      startTime,
      endTime,
      durationMinutes: duration,
      bookingType: post.category,
      notes: `${categoryLabel(post.category)}: ${post.title}`,
      bulletinPostId: post.id,
      skipRulesValidation: true,
      skipPaymentCheck: true,
    });

    if (result.success && result.booking?.id) {
      await query(`UPDATE bulletin_posts SET booking_id = $1 WHERE id = $2`, [
        result.booking.id,
        post.id,
      ]);
      console.log(`✅ ${post.title} (${post.id}) → booking ${result.booking.id} on ${bookingDate} ${startTime}`);
      ok += 1;
    } else {
      console.error(`❌ ${post.title} (${post.id}): ${result.error || 'unknown error'}`);
      fail += 1;
    }
  }

  console.log(`Done: ${ok} created, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
