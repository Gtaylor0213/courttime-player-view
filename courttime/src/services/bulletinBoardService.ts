import { query, transaction } from '../database/connection';
import { notificationService } from './notificationService';
import { sendBulletinMinParticipantsNotMetEmail } from './emailService';
import { refundBulletinSignupPaymentsForPost } from './stripeConnectService';
import { createBooking } from './bookingService';
import { minutesToTime } from './rulesEngine/utils/timeUtils';

const SIGNUP_CATEGORIES = ['event', 'drill', 'social', 'clinic', 'tournament'] as const;

// Lessons tab (lessons_tab feature flag): lesson posts are regular bulletin
// posts whose lesson_type records which Lessons-tab option created them.
export const LESSON_TYPES = ['private_lesson', 'group_clinic', 'drill', 'custom'] as const;
export type LessonType = (typeof LESSON_TYPES)[number];
const LESSON_CATEGORIES = ['clinic', 'drill'] as const;

function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Bulletin Board Service
 * Handles bulletin board post CRUD operations
 */

export interface BulletinPost {
  id: string;
  facilityId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isAdminPost: boolean;
  postedDate: string;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  drillStartAt?: string | null;
  drillDurationMinutes?: number | null;
  drillCourtId?: string | null;
  drillCourtName?: string | null;
  bookingId?: string | null;
  drillMaxParticipants?: number | null;
  minParticipants?: number | null;
  cancelIfMinNotMet?: boolean;
  drillGenderRestriction?: 'any' | 'male_only' | 'female_only' | null;
  drillShowParticipants?: boolean;
  drillConfirmedCount?: number;
  drillWaitlistCount?: number;
  currentUserSignupStatus?: 'confirmed' | 'waitlist' | null;
  currentUserWaitlistPosition?: number | null;
  currentUserCanSignup?: boolean;
  signupBlockedReason?: string | null;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
  lessonType?: LessonType | null;
  lessonTypeLabel?: string | null;
  participants?: Array<{ userId: string; fullName: string; status: 'confirmed' | 'waitlist'; waitlistPosition: number | null }>;
}

export interface CreateBulletinPost {
  facilityId: string;
  authorId: string;
  title: string;
  content: string;
  category: string;
  isAdminPost?: boolean;
  expiresInDays?: number;
  expiresAfterEvent?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'biweekly';
    endDate?: string;
    occurrenceCount?: number;
  };
  drillStartAt?: string;
  drillDurationMinutes?: number;
  drillCourtId?: string;
  drillMaxParticipants?: number;
  drillGenderRestriction?: 'any' | 'male_only' | 'female_only';
  drillShowParticipants?: boolean;
  minParticipants?: number;
  cancelIfMinNotMet?: boolean;
  requirePayment?: boolean;
  signupAmountCents?: number;
  lessonType?: LessonType;
  lessonTypeLabel?: string;
}

interface DrillPostContext {
  id: string;
  title: string;
  category: string;
  facility_id: string;
  facility_name: string;
  drill_start_at: string;
  drill_court_name: string;
  drill_max_participants: number;
  drill_gender_restriction: 'any' | 'male_only' | 'female_only';
  require_payment?: boolean;
  signup_amount_cents?: number | null;
}

/**
 * Get bulletin posts for a facility
 */
export async function getFacilityBulletinPosts(facilityId: string, requesterUserId?: string): Promise<BulletinPost[]> {
  try {
    // Lazy expiration: mark expired posts before fetching
    await query(
      `UPDATE bulletin_posts SET status = 'expired'
       WHERE facility_id = $1 AND expires_at IS NOT NULL
         AND expires_at < CURRENT_TIMESTAMP AND status = 'active'`,
      [facilityId]
    );

    const result = await query(
      `SELECT
        bp.id,
        bp.facility_id as "facilityId",
        bp.author_id as "authorId",
        u.full_name as "authorName",
        bp.title,
        bp.content,
        bp.category,
        bp.is_pinned as "isPinned",
        bp.is_admin_post as "isAdminPost",
        bp.posted_date as "postedDate",
        bp.expires_at as "expiresAt",
        bp.status,
        bp.created_at as "createdAt",
        bp.drill_start_at as "drillStartAt",
        bp.drill_court_id as "drillCourtId",
        c.name as "drillCourtName",
        bp.drill_max_participants as "drillMaxParticipants",
        bp.min_participants as "minParticipants",
        COALESCE(bp.cancel_if_min_not_met, false) as "cancelIfMinNotMet",
        bp.drill_gender_restriction as "drillGenderRestriction",
        COALESCE(bp.drill_show_participants, false) as "drillShowParticipants",
        COALESCE(bp.require_payment, false) as "requirePayment",
        bp.signup_amount_cents as "signupAmountCents",
        bp.lesson_type as "lessonType",
        bp.lesson_type_label as "lessonTypeLabel",
        COUNT(*) FILTER (WHERE bds.status = 'confirmed')::int as "drillConfirmedCount",
        COUNT(*) FILTER (WHERE bds.status = 'waitlist')::int as "drillWaitlistCount"
       FROM bulletin_posts bp
       JOIN users u ON bp.author_id = u.id
       LEFT JOIN courts c ON bp.drill_court_id = c.id
       LEFT JOIN bulletin_drill_signups bds ON bp.id = bds.bulletin_post_id
       WHERE bp.facility_id = $1 AND (bp.status = 'active' OR bp.status IS NULL)
       GROUP BY bp.id, u.full_name, c.name
       ORDER BY bp.is_pinned DESC, bp.posted_date DESC
       LIMIT 50`,
      [facilityId]
    );
    const posts: BulletinPost[] = result.rows;
    if (!requesterUserId || posts.length === 0) {
      return posts;
    }

    await enrichBulletinPostsWithSignupContext(posts, facilityId, requesterUserId);
    return posts;
  } catch (error) {
    console.error('Get bulletin posts error:', error);
    throw new Error('Failed to fetch bulletin posts');
  }
}

async function enrichBulletinPostsWithSignupContext(
  posts: BulletinPost[],
  facilityId: string,
  requesterUserId: string
): Promise<void> {
  const isAdminResult = await query(
    `SELECT 1
     FROM facility_admins
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [requesterUserId, facilityId]
  );
  const isFacilityAdmin = isAdminResult.rows.length > 0;

  const drillPostIds = posts
    .filter((p) => SIGNUP_CATEGORIES.includes(p.category as (typeof SIGNUP_CATEGORIES)[number]))
    .map((p) => p.id);
  if (drillPostIds.length === 0) {
    return;
  }

  const signupResult = await query(
    `SELECT
       bds.bulletin_post_id as "postId",
       bds.user_id as "userId",
       u.full_name as "fullName",
       bds.status,
       bds.waitlist_position as "waitlistPosition",
       bds.created_at as "createdAt"
     FROM bulletin_drill_signups bds
     JOIN users u ON bds.user_id = u.id
     WHERE bds.bulletin_post_id = ANY($1::uuid[])
     ORDER BY bds.bulletin_post_id, bds.created_at ASC`,
    [drillPostIds]
  );

  const participantsByPost = new Map<string, BulletinPost['participants']>();
  for (const row of signupResult.rows) {
    const existing = participantsByPost.get(row.postId) || [];
    existing.push({
      userId: row.userId,
      fullName: row.fullName,
      status: row.status,
      waitlistPosition: row.waitlistPosition,
    });
    participantsByPost.set(row.postId, existing);
  }

  const userResult = await query(`SELECT gender FROM users WHERE id = $1`, [requesterUserId]);
  const requesterGender = userResult.rows[0]?.gender || null;

  for (const post of posts) {
    if (!SIGNUP_CATEGORIES.includes(post.category as (typeof SIGNUP_CATEGORIES)[number])) continue;
    const participants = participantsByPost.get(post.id) || [];
    const currentSignup = participants.find((p) => sameUserId(p.userId, requesterUserId));
    post.currentUserSignupStatus = currentSignup?.status || null;
    post.currentUserWaitlistPosition = currentSignup?.waitlistPosition || null;

    const isFull =
      typeof post.drillMaxParticipants === 'number' &&
      (post.drillConfirmedCount || 0) >= post.drillMaxParticipants;
    if (currentSignup) {
      post.currentUserCanSignup = false;
    } else if (post.drillGenderRestriction && post.drillGenderRestriction !== 'any') {
      const required = post.drillGenderRestriction === 'male_only' ? 'male' : 'female';
      const canByGender = requesterGender && requesterGender.toLowerCase() === required;
      post.currentUserCanSignup = Boolean(canByGender);
      if (!canByGender) {
        post.signupBlockedReason =
          'This event has a gender restriction that your profile does not meet.';
      }
    } else {
      post.currentUserCanSignup = true;
    }

    if (post.drillShowParticipants || isFacilityAdmin) {
      post.participants = participants;
    } else {
      post.participants = [];
    }

    if (isFull && !currentSignup && post.currentUserCanSignup) {
      post.signupBlockedReason = null;
    }
  }
}

/**
 * Get a single bulletin post with signup context for the requester.
 */
export async function getBulletinPostById(
  postId: string,
  requesterUserId?: string
): Promise<BulletinPost | null> {
  const result = await query(
    `SELECT
      bp.id,
      bp.facility_id as "facilityId",
      bp.author_id as "authorId",
      u.full_name as "authorName",
      bp.title,
      bp.content,
      bp.category,
      bp.is_pinned as "isPinned",
      bp.is_admin_post as "isAdminPost",
      bp.posted_date as "postedDate",
      bp.expires_at as "expiresAt",
      bp.status,
      bp.created_at as "createdAt",
      bp.drill_start_at as "drillStartAt",
      bp.drill_court_id as "drillCourtId",
      c.name as "drillCourtName",
      bp.drill_max_participants as "drillMaxParticipants",
      bp.min_participants as "minParticipants",
      COALESCE(bp.cancel_if_min_not_met, false) as "cancelIfMinNotMet",
      bp.drill_gender_restriction as "drillGenderRestriction",
      COALESCE(bp.drill_show_participants, false) as "drillShowParticipants",
      COALESCE(bp.require_payment, false) as "requirePayment",
      bp.signup_amount_cents as "signupAmountCents",
      bp.lesson_type as "lessonType",
      bp.lesson_type_label as "lessonTypeLabel",
      COUNT(*) FILTER (WHERE bds.status = 'confirmed')::int as "drillConfirmedCount",
      COUNT(*) FILTER (WHERE bds.status = 'waitlist')::int as "drillWaitlistCount",
      f.name as "facilityName"
     FROM bulletin_posts bp
     JOIN users u ON bp.author_id = u.id
     JOIN facilities f ON f.id = bp.facility_id
     LEFT JOIN courts c ON bp.drill_court_id = c.id
     LEFT JOIN bulletin_drill_signups bds ON bp.id = bds.bulletin_post_id
     WHERE bp.id = $1 AND (bp.status = 'active' OR bp.status IS NULL)
     GROUP BY bp.id, u.full_name, c.name, f.name`,
    [postId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const post: BulletinPost = result.rows[0];
  if (requesterUserId) {
    await enrichBulletinPostsWithSignupContext([post], post.facilityId, requesterUserId);
  }
  return post;
}

/**
 * Lesson posts for the Lessons tab (lessons_tab feature flag). Same rows the
 * bulletin board serves, filtered to scheduled clinic/drill/lesson posts.
 * 'upcoming' mirrors bulletin board visibility (active posts only);
 * 'past' is for the admin management view and includes cancelled/expired.
 */
export async function getFacilityLessonPosts(
  facilityId: string,
  requesterUserId: string | undefined,
  scope: 'upcoming' | 'past'
): Promise<BulletinPost[]> {
  const scopeClause =
    scope === 'upcoming'
      ? `AND (bp.status = 'active' OR bp.status IS NULL)
         AND bp.drill_start_at + make_interval(mins => COALESCE(bp.drill_duration_minutes, 60)) >= CURRENT_TIMESTAMP`
      : `AND bp.drill_start_at + make_interval(mins => COALESCE(bp.drill_duration_minutes, 60)) < CURRENT_TIMESTAMP`;

  const result = await query(
    `SELECT
      bp.id,
      bp.facility_id as "facilityId",
      bp.author_id as "authorId",
      u.full_name as "authorName",
      bp.title,
      bp.content,
      bp.category,
      bp.is_pinned as "isPinned",
      bp.is_admin_post as "isAdminPost",
      bp.posted_date as "postedDate",
      bp.expires_at as "expiresAt",
      bp.status,
      bp.created_at as "createdAt",
      bp.drill_start_at as "drillStartAt",
      bp.drill_duration_minutes as "drillDurationMinutes",
      bp.drill_court_id as "drillCourtId",
      c.name as "drillCourtName",
      bp.drill_max_participants as "drillMaxParticipants",
      bp.min_participants as "minParticipants",
      COALESCE(bp.cancel_if_min_not_met, false) as "cancelIfMinNotMet",
      bp.drill_gender_restriction as "drillGenderRestriction",
      COALESCE(bp.drill_show_participants, false) as "drillShowParticipants",
      COALESCE(bp.require_payment, false) as "requirePayment",
      bp.signup_amount_cents as "signupAmountCents",
      bp.lesson_type as "lessonType",
      bp.lesson_type_label as "lessonTypeLabel",
      COUNT(*) FILTER (WHERE bds.status = 'confirmed')::int as "drillConfirmedCount",
      COUNT(*) FILTER (WHERE bds.status = 'waitlist')::int as "drillWaitlistCount"
     FROM bulletin_posts bp
     JOIN users u ON bp.author_id = u.id
     LEFT JOIN courts c ON bp.drill_court_id = c.id
     LEFT JOIN bulletin_drill_signups bds ON bp.id = bds.bulletin_post_id
     WHERE bp.facility_id = $1
       AND (bp.category = ANY($2::text[]) OR bp.lesson_type IS NOT NULL)
       AND bp.drill_start_at IS NOT NULL
       ${scopeClause}
     GROUP BY bp.id, u.full_name, c.name
     ORDER BY bp.drill_start_at ${scope === 'upcoming' ? 'ASC' : 'DESC'}
     LIMIT 200`,
    [facilityId, LESSON_CATEGORIES]
  );

  const posts: BulletinPost[] = result.rows;
  if (requesterUserId && posts.length > 0) {
    await enrichBulletinPostsWithSignupContext(posts, facilityId, requesterUserId);
  }
  return posts;
}

const DEFAULT_DRILL_DURATION_MINUTES = 60;

function resolveDrillDurationMinutes(value?: number): number {
  const n = value != null ? Number(value) : DEFAULT_DRILL_DURATION_MINUTES;
  if (!Number.isFinite(n) || n < 15 || n > 480) {
    return DEFAULT_DRILL_DURATION_MINUTES;
  }
  return Math.round(n);
}

function drillStartAtToBookingFields(
  drillStartAt: string,
  durationMinutes: number,
  timeZone: string
): { bookingDate: string; startTime: string; endTime: string } {
  const instant = new Date(drillStartAt);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Invalid event start time');
  }

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
  const endMinutes = startMinutes + durationMinutes;

  return {
    bookingDate,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
}

async function reserveCourtForBulletinPost(params: {
  postId: string;
  facilityId: string;
  authorId: string;
  courtId: string;
  drillStartAt: string;
  durationMinutes: number;
  category: string;
  title: string;
}): Promise<string> {
  const tzResult = await query(`SELECT timezone FROM facilities WHERE id = $1`, [params.facilityId]);
  const timeZone = tzResult.rows[0]?.timezone || 'America/New_York';
  const { bookingDate, startTime, endTime } = drillStartAtToBookingFields(
    params.drillStartAt,
    params.durationMinutes,
    timeZone
  );

  const bookingResult = await createBooking({
    courtId: params.courtId,
    userId: params.authorId,
    facilityId: params.facilityId,
    bookingDate,
    startTime,
    endTime,
    durationMinutes: params.durationMinutes,
    bookingType: params.category,
    notes: `${toEventTypeLabel(params.category)}: ${params.title}`,
    bulletinPostId: params.postId,
    skipRulesValidation: true,
    skipPaymentCheck: true,
  });

  if (!bookingResult.success || !bookingResult.booking?.id) {
    throw new Error(bookingResult.error || 'Court is not available for this event time');
  }

  await query(`UPDATE bulletin_posts SET booking_id = $1 WHERE id = $2`, [
    bookingResult.booking.id,
    params.postId,
  ]);

  return bookingResult.booking.id;
}

async function cancelBulletinCourtBooking(postId: string): Promise<void> {
  const row = await query(
    `SELECT booking_id as "bookingId" FROM bulletin_posts WHERE id = $1`,
    [postId]
  );
  const bookingId = row.rows[0]?.bookingId;
  if (!bookingId) return;

  await query(
    `UPDATE bookings
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status != 'cancelled'`,
    [bookingId]
  );
}

/**
 * Create a bulletin post
 */
export async function createBulletinPost(data: CreateBulletinPost): Promise<string> {
  try {
    if (SIGNUP_CATEGORIES.includes(data.category as (typeof SIGNUP_CATEGORIES)[number])) {
      if (!data.drillStartAt || !data.drillCourtId) {
        throw new Error('Event posts require date/time and court');
      }
      if (
        typeof data.minParticipants === 'number' &&
        typeof data.drillMaxParticipants === 'number' &&
        data.minParticipants > data.drillMaxParticipants
      ) {
        throw new Error('Minimum participants cannot exceed maximum participants');
      }
    }

    if (data.minParticipants && data.minParticipants < 1) {
      throw new Error('Minimum participants must be at least 1');
    }
    if (data.cancelIfMinNotMet && !data.minParticipants) {
      throw new Error('Minimum participants is required when auto-cancel is enabled');
    }
    let lessonType: LessonType | null = null;
    let lessonTypeLabel: string | null = null;
    if (data.lessonType != null) {
      if (!LESSON_TYPES.includes(data.lessonType)) {
        throw new Error('Invalid lesson type');
      }
      if (!LESSON_CATEGORIES.includes(data.category as (typeof LESSON_CATEGORIES)[number])) {
        throw new Error('Lesson posts must use the clinic or drill category');
      }
      lessonType = data.lessonType;
      const trimmedLabel = data.lessonTypeLabel?.trim() || '';
      if (lessonType === 'custom') {
        if (!trimmedLabel) {
          throw new Error('Custom lesson type requires a name');
        }
        lessonTypeLabel = trimmedLabel.slice(0, 60);
      }
    }

    const requirePayment = Boolean(data.requirePayment);
    const signupAmountCents =
      data.signupAmountCents != null ? Number(data.signupAmountCents) : undefined;

    if (requirePayment) {
      if (!signupAmountCents || signupAmountCents <= 0) {
        throw new Error('Signup fee is required when card payment is enabled');
      }
      const { syncConnectOnboardingStatus } = await import('./stripeConnectService');
      const stripeStatus = await syncConnectOnboardingStatus(data.facilityId);
      if (!stripeStatus.onboarded) {
        throw new Error('Complete Stripe Connect setup in Member Payments before requiring card payment');
      }
    }
    if (data.recurrence) {
      if (!['drill', 'clinic'].includes(data.category)) {
        throw new Error('Recurring bulletin posts are only supported for drills and clinics');
      }
      if (!data.drillStartAt) {
        throw new Error('Event datetime is required for recurring posts');
      }
      if (!data.recurrence.endDate && !data.recurrence.occurrenceCount) {
        throw new Error('Recurring posts require an end date or number of occurrences');
      }
    }

    const drillDurationMinutes = resolveDrillDurationMinutes(data.drillDurationMinutes);
    const needsCourtHold = SIGNUP_CATEGORIES.includes(
      data.category as (typeof SIGNUP_CATEGORIES)[number]
    );
    const recurrenceStartTimes = buildRecurringStartTimes(data.drillStartAt || null, data.recurrence);
    const createdPosts: Array<{ id: string; startAt: string | null }> = [];

    try {
      for (const startAt of recurrenceStartTimes) {
        const params: any[] = [
          data.facilityId,
          data.authorId,
          data.title,
          data.content,
          data.category,
          data.isAdminPost || false,
          startAt,
          data.drillCourtId || null,
          drillDurationMinutes,
          data.drillMaxParticipants || null,
          data.drillGenderRestriction || 'any',
          data.drillShowParticipants ?? false,
          data.minParticipants || null,
          data.cancelIfMinNotMet ?? false,
          requirePayment,
          requirePayment ? signupAmountCents : null,
          lessonType,
          lessonTypeLabel,
        ];

        let expiresAtExpr = 'NULL';
        if (data.expiresAfterEvent) {
          if (!startAt) {
            throw new Error('Event datetime is required for "after event" expiration');
          }
          expiresAtExpr = '$7';
        } else if (data.expiresInDays) {
          params.push(parseInt(String(data.expiresInDays)));
          expiresAtExpr = `CURRENT_TIMESTAMP + make_interval(days => $${params.length})`;
        }

        const result = await query(
          `INSERT INTO bulletin_posts (
            facility_id,
            author_id,
            title,
            content,
            category,
            is_admin_post,
            drill_start_at,
            drill_court_id,
            drill_duration_minutes,
            drill_max_participants,
            drill_gender_restriction,
            drill_show_participants,
            min_participants,
            cancel_if_min_not_met,
            require_payment,
            signup_amount_cents,
            lesson_type,
            lesson_type_label,
            expires_at,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, ${expiresAtExpr}, 'active')
          RETURNING id`,
          params
        );
        createdPosts.push({ id: result.rows[0].id, startAt });
      }

      if (needsCourtHold && data.drillCourtId) {
        for (const post of createdPosts) {
          if (!post.startAt) continue;
          await reserveCourtForBulletinPost({
            postId: post.id,
            facilityId: data.facilityId,
            authorId: data.authorId,
            courtId: data.drillCourtId,
            drillStartAt: post.startAt,
            durationMinutes: drillDurationMinutes,
            category: data.category,
            title: data.title,
          });
        }
      }

      return createdPosts[0].id;
    } catch (error: any) {
      for (const post of createdPosts) {
        await cancelBulletinCourtBooking(post.id).catch(() => undefined);
        await query(`DELETE FROM bulletin_posts WHERE id = $1`, [post.id]).catch(() => undefined);
      }
      const message = error?.message || 'Failed to create bulletin post';
      console.error('Create bulletin post error:', error);
      throw new Error(message);
    }
  } catch (error: any) {
    console.error('Create bulletin post error:', error);
    throw error instanceof Error ? error : new Error('Failed to create bulletin post');
  }
}

function buildRecurringStartTimes(
  initialStartAt: string | null,
  recurrence?: CreateBulletinPost['recurrence']
): Array<string | null> {
  if (!recurrence || !initialStartAt) return [initialStartAt];
  const stepDaysByFrequency = { daily: 1, weekly: 7, biweekly: 14 } as const;
  const stepDays = stepDaysByFrequency[recurrence.frequency];
  const start = new Date(initialStartAt);
  if (Number.isNaN(start.getTime())) return [initialStartAt];

  const maxOccurrences = Math.min(
    recurrence.occurrenceCount || 365,
    365
  );
  const untilDate = recurrence.endDate ? new Date(`${recurrence.endDate}T23:59:59.999`) : null;
  const occurrences: string[] = [];

  for (let i = 0; i < maxOccurrences; i++) {
    const next = new Date(start);
    next.setUTCDate(start.getUTCDate() + (stepDays * i));
    if (untilDate && next.getTime() > untilDate.getTime()) break;
    occurrences.push(next.toISOString());
  }

  return occurrences.length > 0 ? occurrences : [initialStartAt];
}

/**
 * Update a bulletin post
 */
export async function updateBulletinPost(
  postId: string,
  authorId: string,
  updates: { title?: string; content?: string; category?: string }
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(postId, authorId);

    const result = await query(
      `UPDATE bulletin_posts
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND author_id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Update bulletin post error:', error);
    throw new Error('Failed to update bulletin post');
  }
}

/**
 * Delete a bulletin post
 */
export async function deleteBulletinPost(postId: string, authorId: string, isAdmin?: boolean): Promise<boolean> {
  try {
    await cancelBulletinCourtBooking(postId);
    const result = isAdmin
      ? await query(`DELETE FROM bulletin_posts WHERE id = $1`, [postId])
      : await query(`DELETE FROM bulletin_posts WHERE id = $1 AND author_id = $2`, [postId, authorId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Delete bulletin post error:', error);
    throw new Error('Failed to delete bulletin post');
  }
}

/**
 * Pin/unpin a bulletin post (admin only)
 */
export async function togglePinBulletinPost(
  postId: string,
  facilityId: string,
  isPinned: boolean
): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE bulletin_posts
       SET is_pinned = $1
       WHERE id = $2 AND facility_id = $3`,
      [isPinned, postId, facilityId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Toggle pin bulletin post error:', error);
    throw new Error('Failed to toggle pin bulletin post');
  }
}

async function getDrillPostContext(postId: string): Promise<DrillPostContext | null> {
  const postResult = await query(
    `SELECT
       bp.id,
       bp.title,
       bp.category,
       bp.facility_id,
       f.name as facility_name,
       bp.drill_start_at,
       c.name as drill_court_name,
       bp.drill_max_participants,
       bp.drill_gender_restriction,
       COALESCE(bp.require_payment, false) as require_payment,
       bp.signup_amount_cents
     FROM bulletin_posts bp
     JOIN facilities f ON bp.facility_id = f.id
     LEFT JOIN courts c ON bp.drill_court_id = c.id
     WHERE bp.id = $1
       AND bp.category = ANY($2::text[])
       AND (bp.status = 'active' OR bp.status IS NULL)
     LIMIT 1`,
    [postId, SIGNUP_CATEGORIES]
  );
  return postResult.rows[0] || null;
}

async function assertSignupEligibility(post: DrillPostContext, userId: string): Promise<void> {
  const userRow = await query(`SELECT gender FROM users WHERE id = $1`, [userId]);
  const gender = userRow.rows[0]?.gender?.toLowerCase() || null;
  if (post.drill_gender_restriction === 'male_only' && gender !== 'male') {
    throw new Error('This event is restricted to male members only');
  }
  if (post.drill_gender_restriction === 'female_only' && gender !== 'female') {
    throw new Error('This event is restricted to female members only');
  }

  const membershipResult = await query(
    `SELECT 1
     FROM facility_memberships
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [userId, post.facility_id]
  );
  if (membershipResult.rows.length === 0) {
    throw new Error('You must be an active member of this facility to sign up');
  }

  const existing = await query(
    `SELECT 1 FROM bulletin_drill_signups WHERE bulletin_post_id = $1 AND user_id = $2`,
    [post.id, userId]
  );
  if (existing.rows.length > 0) {
    throw new Error('You are already signed up for this event');
  }
}

export type DrillSignupResult =
  | { status: 'confirmed' | 'waitlist'; waitlistPosition: number | null; requiresPayment?: false }
  | { requiresPayment: true; checkoutUrl: string; status: null; waitlistPosition: null };

export async function signupForDrill(
  postId: string,
  userId: string,
  options?: { successUrl?: string; cancelUrl?: string }
): Promise<DrillSignupResult> {
  const post = await getDrillPostContext(postId);
  if (!post) throw new Error('Event post not found');

  if (post.require_payment && post.signup_amount_cents) {
    await assertSignupEligibility(post, userId);
    const base = process.env.APP_URL || 'http://localhost:5173';
    const { createBulletinSignupCheckoutSession } = await import('./stripeConnectService');
    const { url } = await createBulletinSignupCheckoutSession({
      bulletinPostId: postId,
      memberId: userId,
      successUrl:
        options?.successUrl ||
        `${base}/bulletin-board?signupSuccess=1&postId=${encodeURIComponent(postId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: options?.cancelUrl || `${base}/bulletin-board?postId=${encodeURIComponent(postId)}`,
    });
    return { requiresPayment: true, checkoutUrl: url, status: null, waitlistPosition: null };
  }

  const userRow = await query(`SELECT gender FROM users WHERE id = $1`, [userId]);
  const gender = userRow.rows[0]?.gender?.toLowerCase() || null;
  if (post.drill_gender_restriction === 'male_only' && gender !== 'male') {
    throw new Error('This event is restricted to male members only');
  }
  if (post.drill_gender_restriction === 'female_only' && gender !== 'female') {
    throw new Error('This event is restricted to female members only');
  }

  const membershipResult = await query(
    `SELECT 1
     FROM facility_memberships
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [userId, post.facility_id]
  );
  if (membershipResult.rows.length === 0) {
    throw new Error('You must be an active member of this facility to sign up');
  }

  const result = await transaction(async (client) => {
    await client.query(
      `SELECT id FROM bulletin_posts WHERE id = $1 FOR UPDATE`,
      [postId]
    );

    const existing = await client.query(
      `SELECT status FROM bulletin_drill_signups WHERE bulletin_post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    if (existing.rows.length > 0) {
      throw new Error('You are already signed up for this event');
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM bulletin_drill_signups
       WHERE bulletin_post_id = $1 AND status = 'confirmed'`,
      [postId]
    );
    const confirmedCount = countResult.rows[0].count;
    const isFull =
      typeof post.drill_max_participants === 'number'
        ? confirmedCount >= post.drill_max_participants
        : false;

    if (!isFull) {
      await client.query(
        `INSERT INTO bulletin_drill_signups (bulletin_post_id, user_id, status)
         VALUES ($1, $2, 'confirmed')`,
        [postId, userId]
      );
      return { status: 'confirmed' as const, waitlistPosition: null };
    }

    const waitlistCountResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM bulletin_drill_signups
       WHERE bulletin_post_id = $1 AND status = 'waitlist'`,
      [postId]
    );
    const waitlistPosition = waitlistCountResult.rows[0].count + 1;
    await client.query(
      `INSERT INTO bulletin_drill_signups (bulletin_post_id, user_id, status, waitlist_position)
       VALUES ($1, $2, 'waitlist', $3)`,
      [postId, userId, waitlistPosition]
    );
    return { status: 'waitlist' as const, waitlistPosition };
  });
  const eventType = toEventTypeLabel(post.category);

  const dateLabel = new Date(post.drill_start_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  if (result.status === 'confirmed') {
    await notificationService.createNotification(
      userId,
      `${eventType} Signup Confirmed`,
      `You are confirmed for "${post.title}" on ${dateLabel} at ${post.drill_court_name || 'the assigned court'}.`,
      'drill_signup_confirmed',
      { actionUrl: '/bulletin-board' }
    );
  } else {
    await notificationService.createNotification(
      userId,
      `Added to ${eventType} Waitlist`,
      `You are waitlisted for "${post.title}" (position #${result.waitlistPosition}).`,
      'drill_waitlist',
      { actionUrl: '/bulletin-board' }
    );
  }

  return result;
}

/**
 * Called after Stripe Connect checkout completes for a paid bulletin signup.
 */
export async function finalizeBulletinSignupAfterPayment(params: {
  bulletinPostId: string | null;
  memberId: string | null;
  connectPaymentId: string;
}): Promise<void> {
  if (!params.bulletinPostId || !params.memberId) return;

  const post = await getDrillPostContext(params.bulletinPostId);
  if (!post) return;

  const existing = await query(
    `SELECT id FROM bulletin_drill_signups WHERE bulletin_post_id = $1 AND user_id = $2`,
    [params.bulletinPostId, params.memberId]
  );
  if (existing.rows.length > 0) {
    await query(
      `UPDATE bulletin_drill_signups SET connect_payment_id = $1 WHERE bulletin_post_id = $2 AND user_id = $3`,
      [params.connectPaymentId, params.bulletinPostId, params.memberId]
    );
    return;
  }

  const result = await transaction(async (client) => {
    await client.query(`SELECT id FROM bulletin_posts WHERE id = $1 FOR UPDATE`, [params.bulletinPostId]);

    const countResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM bulletin_drill_signups
       WHERE bulletin_post_id = $1 AND status = 'confirmed'`,
      [params.bulletinPostId]
    );
    const confirmedCount = countResult.rows[0].count;
    const isFull =
      typeof post.drill_max_participants === 'number'
        ? confirmedCount >= post.drill_max_participants
        : false;

    if (!isFull) {
      await client.query(
        `INSERT INTO bulletin_drill_signups (bulletin_post_id, user_id, status, connect_payment_id)
         VALUES ($1, $2, 'confirmed', $3)`,
        [params.bulletinPostId, params.memberId, params.connectPaymentId]
      );
      return { status: 'confirmed' as const, waitlistPosition: null };
    }

    const waitlistCountResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM bulletin_drill_signups
       WHERE bulletin_post_id = $1 AND status = 'waitlist'`,
      [params.bulletinPostId]
    );
    const waitlistPosition = waitlistCountResult.rows[0].count + 1;
    await client.query(
      `INSERT INTO bulletin_drill_signups (bulletin_post_id, user_id, status, waitlist_position, connect_payment_id)
       VALUES ($1, $2, 'waitlist', $3, $4)`,
      [params.bulletinPostId, params.memberId, waitlistPosition, params.connectPaymentId]
    );
    return { status: 'waitlist' as const, waitlistPosition };
  });

  const eventType = toEventTypeLabel(post.category);
  const dateLabel = new Date(post.drill_start_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (result.status === 'confirmed') {
    await notificationService.createNotification(
      params.memberId,
      `${eventType} Signup Confirmed`,
      `Your payment was received. You are confirmed for "${post.title}" on ${dateLabel} at ${post.drill_court_name || 'the assigned court'}.`,
      'drill_signup_confirmed',
      { actionUrl: '/bulletin-board' }
    );
  } else {
    await notificationService.createNotification(
      params.memberId,
      `Added to ${eventType} Waitlist`,
      `Your payment was received. You are waitlisted for "${post.title}" (position #${result.waitlistPosition}).`,
      'drill_waitlist',
      { actionUrl: '/bulletin-board' }
    );
  }
}

export async function cancelDrillSignup(postId: string, userId: string): Promise<{ cancelledStatus: 'confirmed' | 'waitlist' }> {
  const signupResult = await query(
    `SELECT status FROM bulletin_drill_signups WHERE bulletin_post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  if (signupResult.rows.length === 0) {
    throw new Error('You are not signed up for this event');
  }
  const cancelledStatus = signupResult.rows[0].status as 'confirmed' | 'waitlist';

  const post = await getDrillPostContext(postId);
  if (!post) throw new Error('Event post not found');

  await transaction(async (client) => {
    await client.query(
      `DELETE FROM bulletin_drill_signups WHERE bulletin_post_id = $1 AND user_id = $2`,
      [postId, userId]
    );

    if (cancelledStatus === 'waitlist') {
      await client.query(
        `WITH ordered AS (
           SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, created_at ASC) as new_position
           FROM bulletin_drill_signups
           WHERE bulletin_post_id = $1 AND status = 'waitlist'
         )
         UPDATE bulletin_drill_signups bds
         SET waitlist_position = ordered.new_position
         FROM ordered
         WHERE bds.id = ordered.id`,
        [postId]
      );
      return;
    }

    const firstWaitlist = await client.query(
      `SELECT id, user_id
       FROM bulletin_drill_signups
       WHERE bulletin_post_id = $1 AND status = 'waitlist'
       ORDER BY waitlist_position ASC, created_at ASC
       LIMIT 1`,
      [postId]
    );

    if (firstWaitlist.rows.length > 0) {
      const promoted = firstWaitlist.rows[0];
      await client.query(
        `UPDATE bulletin_drill_signups
         SET status = 'confirmed', waitlist_position = NULL
         WHERE id = $1`,
        [promoted.id]
      );

      await client.query(
        `WITH ordered AS (
           SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, created_at ASC) as new_position
           FROM bulletin_drill_signups
           WHERE bulletin_post_id = $1 AND status = 'waitlist'
         )
         UPDATE bulletin_drill_signups bds
         SET waitlist_position = ordered.new_position
         FROM ordered
         WHERE bds.id = ordered.id`,
        [postId]
      );

      const dateLabel = new Date(post.drill_start_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      const eventType = toEventTypeLabel(post.category);
      await notificationService.createNotification(
        promoted.user_id,
        `${eventType} Waitlist Promotion`,
        `A spot opened up and you are now confirmed for "${post.title}" on ${dateLabel} at ${post.drill_court_name || 'the assigned court'}.`,
        'drill_waitlist_promoted',
        { actionUrl: '/bulletin-board' }
      );
    }
  });

  return { cancelledStatus };
}

export async function removeDrillSignupByAdmin(postId: string, memberUserId: string): Promise<void> {
  await cancelDrillSignup(postId, memberUserId);
}

function toEventTypeLabel(category: string): string {
  switch (category) {
    case 'event':
      return 'Event';
    case 'drill':
      return 'Drill';
    case 'social':
      return 'Social';
    case 'clinic':
      return 'Clinic';
    case 'tournament':
      return 'Tournament';
    default:
      return 'Event';
  }
}

export async function processBulletinMinParticipantCancellations(): Promise<number> {
  const dueResult = await query(
    `SELECT
       bp.id,
       bp.title,
       bp.category,
       bp.facility_id as "facilityId",
       f.name as "facilityName",
       bp.drill_start_at as "drillStartAt",
       bp.min_participants as "minParticipants",
       COUNT(bds.id)::int as "registeredParticipants"
     FROM bulletin_posts bp
     JOIN facilities f ON f.id = bp.facility_id
     LEFT JOIN bulletin_drill_signups bds
       ON bds.bulletin_post_id = bp.id AND bds.status = 'confirmed'
     WHERE bp.status = 'active'
       AND bp.min_participants IS NOT NULL
       AND COALESCE(bp.cancel_if_min_not_met, false) = true
       AND bp.drill_start_at IS NOT NULL
       AND bp.drill_start_at <= CURRENT_TIMESTAMP
       AND bp.category IN ('event', 'drill', 'social', 'clinic', 'tournament')
       AND bp.cancellation_notified_at IS NULL
     GROUP BY bp.id, bp.title, bp.category, bp.facility_id, f.name, bp.drill_start_at, bp.min_participants
     HAVING COUNT(bds.id) < bp.min_participants`,
    []
  );

  let cancelledCount = 0;
  for (const post of dueResult.rows) {
    const participantsResult = await query(
      `SELECT u.id as "userId", u.email, u.full_name as "fullName"
       FROM bulletin_drill_signups bds
       JOIN users u ON u.id = bds.user_id
       WHERE bds.bulletin_post_id = $1 AND bds.status = 'confirmed'`,
      [post.id]
    );

    const eventDateTimeLabel = new Date(post.drillStartAt).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const eventType = toEventTypeLabel(post.category);

    for (const participant of participantsResult.rows) {
      await sendBulletinMinParticipantsNotMetEmail(
        participant.email,
        participant.fullName,
        post.facilityName,
        post.title,
        eventType,
        eventDateTimeLabel,
        post.minParticipants,
        post.registeredParticipants,
        participant.userId
      );
    }

    const refundSummary = await refundBulletinSignupPaymentsForPost(post.id);
    if (refundSummary.refunded > 0 || refundSummary.failed > 0) {
      console.log(
        `[bulletin-cancel] post ${post.id} signup refunds: refunded=${refundSummary.refunded} skipped=${refundSummary.skipped} failed=${refundSummary.failed}`
      );
    }

    await cancelBulletinCourtBooking(post.id);

    await query(
      `UPDATE bulletin_posts
       SET status = 'cancelled',
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_notified_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [post.id]
    );
    cancelledCount += 1;
  }

  return cancelledCount;
}
