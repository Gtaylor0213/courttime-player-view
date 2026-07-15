import { query, transaction } from '../database/connection';
import { sortCourtsForDisplay } from '../../shared/utils/courtDisplayOrder';
import { facilityOperatingHoursScheduleFingerprint } from '../../shared/utils/operatingHours';
import { replaceAllCourtOperatingConfigsForFacility } from './courtOperatingConfigSync';
import { getAmountForCourts } from './subscriptionPricing';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Dashboard ──────────────────────────────────────────────

export interface DashboardAlert {
  id: string;
  type: 'payment' | 'subscription' | 'signup' | 'warning';
  title: string;
  description: string;
  facilityId?: string;
  userId?: string;
  severity: 'high' | 'medium' | 'low';
}

export interface RecentActivityItem {
  id: string;
  type: 'facility' | 'user' | 'payment' | 'subscription';
  title: string;
  description: string;
  timestamp: string;
  facilityId?: string;
  userId?: string;
}

export interface DashboardStats {
  totalFacilities: number;
  totalUsers: number;
  totalActiveMembers: number;
  bookingsThisMonth: number;
  activeSubscriptions: number;
  revenueThisMonthCents: number;
  newUsersThisWeek: number;
  newFacilitiesThisWeek: number;
  subscriptionsNeedingAttention: number;
  alerts: DashboardAlert[];
  recentActivity: RecentActivityItem[];
  facilities: FacilitySummary[];
}

export interface FacilitySummary {
  id: string;
  name: string;
  type: string;
  status: string;
  city: string;
  state: string;
  activeMemberCount: number;
  courtCount: number;
  bookingsThisMonth: number;
  subscriptionStatus?: string | null;
  subscriptionEnd?: string | null;
  paymentStatus?: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Total facilities
  const facResult = await query('SELECT COUNT(*) as count FROM facilities');
  const totalFacilities = parseInt(facResult.rows[0]?.count || '0', 10);

  // Total users
  const userResult = await query('SELECT COUNT(*) as count FROM users');
  const totalUsers = parseInt(userResult.rows[0]?.count || '0', 10);

  // Total active members
  const memberResult = await query(
    "SELECT COUNT(*) as count FROM facility_memberships WHERE status = 'active'"
  );
  const totalActiveMembers = parseInt(memberResult.rows[0]?.count || '0', 10);

  // Bookings this month
  const bookingResult = await query(
    `SELECT COUNT(*) as count FROM bookings
     WHERE booking_date >= date_trunc('month', CURRENT_DATE)
       AND booking_date < date_trunc('month', CURRENT_DATE) + interval '1 month'`
  );
  const bookingsThisMonth = parseInt(bookingResult.rows[0]?.count || '0', 10);

  const [activeSubResult, revenueResult, newUsersResult, newFacResult, attentionResult, facilitiesResult, recentFacilities, recentUsers, recentPayments, attentionSubs] =
    await Promise.all([
      query(`SELECT COUNT(*) as count FROM facility_subscriptions WHERE status IN ('active', 'trialing', 'waived')`),
      query(`SELECT COALESCE(SUM(amount_cents), 0)::int as total FROM payment_history
             WHERE status = 'succeeded' AND created_at >= date_trunc('month', CURRENT_DATE)`),
      query(`SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - interval '7 days'`),
      query(`SELECT COUNT(*) as count FROM facilities WHERE created_at >= NOW() - interval '7 days'`),
      query(`SELECT COUNT(*) as count FROM facility_subscriptions
             WHERE status IN ('pending_payment', 'pending', 'past_due', 'custom_pending')
                OR cancel_at_period_end = true
                OR (current_period_end IS NOT NULL AND current_period_end <= NOW() + interval '30 days'
                    AND status IN ('active', 'trialing'))`),
      query(`
        SELECT
          f.id, f.name, f.type, f.status, f.city, f.state, f.payment_status,
          COALESCE(m.active_count, 0)::int as active_member_count,
          COALESCE(c.court_count, 0)::int as court_count,
          COALESCE(b.booking_count, 0)::int as bookings_this_month,
          fs.status as subscription_status,
          COALESCE(fs.current_period_end, fs.billing_period_end) as subscription_end
        FROM facilities f
        LEFT JOIN facility_subscriptions fs ON f.id = fs.facility_id
        LEFT JOIN (
          SELECT facility_id, COUNT(*) as active_count
          FROM facility_memberships WHERE status = 'active'
          GROUP BY facility_id
        ) m ON f.id = m.facility_id
        LEFT JOIN (
          SELECT facility_id, COUNT(*) as court_count
          FROM courts
          GROUP BY facility_id
        ) c ON f.id = c.facility_id
        LEFT JOIN (
          SELECT facility_id, COUNT(*) as booking_count
          FROM bookings
          WHERE booking_date >= date_trunc('month', CURRENT_DATE)
            AND booking_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          GROUP BY facility_id
        ) b ON f.id = b.facility_id
        ORDER BY f.name
      `),
      query(`SELECT f.id, f.name, f.created_at FROM facilities f
             WHERE f.created_at >= NOW() - interval '14 days' ORDER BY f.created_at DESC LIMIT 10`),
      query(`SELECT u.id, u.full_name, u.email, u.created_at FROM users u
             WHERE u.created_at >= NOW() - interval '14 days' ORDER BY u.created_at DESC LIMIT 10`),
      query(`SELECT ph.id, ph.facility_id, ph.amount_cents, ph.status, ph.created_at, f.name as facility_name
             FROM payment_history ph JOIN facilities f ON ph.facility_id = f.id
             ORDER BY ph.created_at DESC LIMIT 10`),
      query(`
        SELECT fs.facility_id, fs.status, fs.cancel_at_period_end,
               COALESCE(fs.current_period_end, fs.billing_period_end) as period_end,
               f.name as facility_name
        FROM facility_subscriptions fs
        JOIN facilities f ON fs.facility_id = f.id
        WHERE fs.status IN ('pending_payment', 'pending', 'past_due', 'custom_pending')
           OR fs.cancel_at_period_end = true
           OR (COALESCE(fs.current_period_end, fs.billing_period_end) IS NOT NULL
               AND COALESCE(fs.current_period_end, fs.billing_period_end) <= NOW() + interval '30 days'
               AND fs.status IN ('active', 'trialing'))
        ORDER BY period_end NULLS LAST
        LIMIT 20
      `),
    ]);

  const activeSubscriptions = parseInt(activeSubResult.rows[0]?.count || '0', 10);
  const revenueThisMonthCents = parseInt(revenueResult.rows[0]?.total || '0', 10);
  const newUsersThisWeek = parseInt(newUsersResult.rows[0]?.count || '0', 10);
  const newFacilitiesThisWeek = parseInt(newFacResult.rows[0]?.count || '0', 10);
  const subscriptionsNeedingAttention = parseInt(attentionResult.rows[0]?.count || '0', 10);

  const alerts: DashboardAlert[] = [];
  for (const sub of attentionSubs.rows) {
    if (['pending_payment', 'pending', 'past_due', 'custom_pending'].includes(sub.status)) {
      alerts.push({
        id: `sub-${sub.facility_id}-${sub.status}`,
        type: 'payment',
        title: `${sub.facility_name}: payment needed`,
        description: `Subscription status is ${sub.status.replace(/_/g, ' ')}`,
        facilityId: sub.facility_id,
        severity: sub.status === 'past_due' ? 'high' : 'medium',
      });
    } else if (sub.cancel_at_period_end) {
      alerts.push({
        id: `sub-cancel-${sub.facility_id}`,
        type: 'subscription',
        title: `${sub.facility_name}: cancelling at period end`,
        description: sub.period_end
          ? `Access ends ${new Date(sub.period_end).toLocaleDateString()}`
          : 'Scheduled to cancel at period end',
        facilityId: sub.facility_id,
        severity: 'medium',
      });
    } else if (sub.period_end) {
      alerts.push({
        id: `sub-expire-${sub.facility_id}`,
        type: 'subscription',
        title: `${sub.facility_name}: renewal soon`,
        description: `Period ends ${new Date(sub.period_end).toLocaleDateString()}`,
        facilityId: sub.facility_id,
        severity: 'low',
      });
    }
  }

  const recentActivity: RecentActivityItem[] = [
    ...recentFacilities.rows.map((r: any) => ({
      id: `fac-${r.id}`,
      type: 'facility' as const,
      title: 'New facility registered',
      description: r.name,
      timestamp: r.created_at,
      facilityId: r.id,
    })),
    ...recentUsers.rows.map((r: any) => ({
      id: `user-${r.id}`,
      type: 'user' as const,
      title: 'New user signed up',
      description: `${r.full_name} (${r.email})`,
      timestamp: r.created_at,
      userId: r.id,
    })),
    ...recentPayments.rows.map((r: any) => ({
      id: `pay-${r.id}`,
      type: 'payment' as const,
      title: `Payment ${r.status}`,
      description: `${r.facility_name} — $${(r.amount_cents / 100).toFixed(2)}`,
      timestamp: r.created_at,
      facilityId: r.facility_id,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);

  return {
    totalFacilities,
    totalUsers,
    totalActiveMembers,
    bookingsThisMonth,
    activeSubscriptions,
    revenueThisMonthCents,
    newUsersThisWeek,
    newFacilitiesThisWeek,
    subscriptionsNeedingAttention,
    alerts,
    recentActivity,
    facilities: facilitiesResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      city: r.city,
      state: r.state,
      activeMemberCount: r.active_member_count,
      courtCount: r.court_count,
      bookingsThisMonth: r.bookings_this_month,
      subscriptionStatus: r.subscription_status,
      subscriptionEnd: r.subscription_end,
      paymentStatus: r.payment_status,
    })),
  };
}

// ── User Search & Profile ──────────────────────────────────

export interface UserSearchResult {
  id: string;
  email: string;
  fullName: string;
  userType: string;
  createdAt: string;
  facilityCount: number;
}

export async function searchUsers(searchTerm: string): Promise<UserSearchResult[]> {
  const result = await query(`
    SELECT
      u.id, u.email, u.full_name as "fullName", u.user_type as "userType",
      u.created_at as "createdAt",
      COALESCE(m.fac_count, 0)::int as "facilityCount"
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as fac_count
      FROM facility_memberships
      GROUP BY user_id
    ) m ON u.id = m.user_id
    WHERE u.full_name ILIKE $1 OR u.email ILIKE $1
    ORDER BY u.full_name
    LIMIT 50
  `, [`%${searchTerm}%`]);

  return result.rows;
}

export interface UserFullProfile {
  id: string;
  email: string;
  fullName: string;
  userType: string;
  phone: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  createdAt: string;
  memberships: UserMembership[];
}

export interface UserMembership {
  membershipId: string;
  facilityId: string;
  facilityName: string;
  membershipType: string;
  status: string;
  isFacilityAdmin: boolean;
  startDate: string;
  endDate: string | null;
  suspendedUntil: string | null;
}

export async function getUserFullProfile(userId: string): Promise<UserFullProfile | null> {
  const userResult = await query(`
    SELECT
      u.id, u.email, u.full_name as "fullName", u.user_type as "userType",
      u.phone, u.street_address as "streetAddress", u.city, u.state,
      u.zip_code as "zipCode", u.created_at as "createdAt"
    FROM users u
    WHERE u.id = $1
  `, [userId]);

  if (userResult.rows.length === 0) return null;
  const user = userResult.rows[0];

  const membershipsResult = await query(`
    SELECT
      fm.id as "membershipId", fm.facility_id as "facilityId",
      f.name as "facilityName", fm.membership_type as "membershipType",
      fm.status, fm.is_facility_admin as "isFacilityAdmin",
      fm.start_date as "startDate", fm.end_date as "endDate",
      fm.suspended_until as "suspendedUntil"
    FROM facility_memberships fm
    JOIN facilities f ON fm.facility_id = f.id
    WHERE fm.user_id = $1
    ORDER BY f.name
  `, [userId]);

  return {
    ...user,
    memberships: membershipsResult.rows,
  };
}

// ── Password Management ────────────────────────────────────

export async function setUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const result = await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
    [passwordHash, userId]
  );
  return result.rows.length > 0;
}

// ── Facility Detail ────────────────────────────────────────

export async function getFacilityDetail(facilityId: string): Promise<any> {
  const facResult = await query('SELECT * FROM facilities WHERE id = $1', [facilityId]);
  if (facResult.rows.length === 0) return null;

  const contactsResult = await query(
    'SELECT * FROM facility_contacts WHERE facility_id = $1 ORDER BY created_at',
    [facilityId]
  );

  const courtsResult = await query(
    'SELECT * FROM courts WHERE facility_id = $1 ORDER BY name',
    [facilityId]
  );

  return {
    ...facResult.rows[0],
    contacts: contactsResult.rows,
    courts: courtsResult.rows,
  };
}

// ── Booking Violations ─────────────────────────────────────

export async function getFacilityViolations(facilityId: string): Promise<any[]> {
  const result = await query(`
    SELECT
      bv.*,
      u.full_name as user_name,
      u.email as user_email
    FROM booking_violations bv
    JOIN users u ON bv.user_id = u.id
    WHERE bv.facility_id = $1
    ORDER BY bv.created_at DESC
    LIMIT 100
  `, [facilityId]);
  return result.rows;
}

// ── Bookings ───────────────────────────────────────────────

export async function getFacilityBookings(
  facilityId: string,
  status?: string,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  let sql = `
    SELECT
      b.id, b.booking_date, b.start_time, b.end_time, b.status,
      b.created_at, b.court_id,
      c.name as court_name,
      u.full_name as player_name, u.email as player_email
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    JOIN users u ON b.user_id = u.id
    WHERE b.facility_id = $1
  `;
  const params: any[] = [facilityId];

  if (status && status !== 'all') {
    params.push(status);
    sql += ` AND b.status = $${params.length}`;
  }
  if (startDate) {
    params.push(startDate);
    sql += ` AND b.booking_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    sql += ` AND b.booking_date <= $${params.length}`;
  }

  sql += ' ORDER BY b.booking_date DESC, b.start_time DESC LIMIT 200';

  const result = await query(sql, params);
  return result.rows;
}

export async function updateBookingStatus(bookingId: string, status: string): Promise<any> {
  const result = await query(
    'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, bookingId]
  );
  return result.rows[0] || null;
}

// ── Members ────────────────────────────────────────────────

export async function getFacilityMembers(
  facilityId: string,
  search?: string,
  status?: string
): Promise<any[]> {
  let sql = `
    SELECT
      fm.id as membership_id, fm.user_id, fm.membership_type, fm.status,
      fm.is_facility_admin, fm.start_date, fm.end_date, fm.suspended_until,
      u.full_name, u.email, u.phone
    FROM facility_memberships fm
    JOIN users u ON fm.user_id = u.id
    WHERE fm.facility_id = $1
  `;
  const params: any[] = [facilityId];

  if (status && status !== 'all') {
    params.push(status);
    sql += ` AND fm.status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }

  sql += ' ORDER BY u.full_name';

  const result = await query(sql, params);
  return result.rows;
}

export async function updateMember(
  facilityId: string,
  userId: string,
  data: { status?: string; membershipType?: string; suspendedUntil?: string | null }
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.status !== undefined) {
    params.push(data.status);
    sets.push(`status = $${params.length}`);
  }
  if (data.membershipType !== undefined) {
    params.push(data.membershipType);
    sets.push(`membership_type = $${params.length}`);
  }
  if (data.suspendedUntil !== undefined) {
    params.push(data.suspendedUntil);
    sets.push(`suspended_until = $${params.length}`);
  }

  if (sets.length === 0) throw new Error('No fields to update');

  sets.push('updated_at = NOW()');
  params.push(facilityId, userId);

  const result = await query(
    `UPDATE facility_memberships SET ${sets.join(', ')}
     WHERE facility_id = $${params.length - 1} AND user_id = $${params.length}
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function toggleMemberAdmin(
  facilityId: string,
  userId: string,
  isAdmin: boolean
): Promise<any> {
  const result = await query(
    `UPDATE facility_memberships SET is_facility_admin = $1, updated_at = NOW()
     WHERE facility_id = $2 AND user_id = $3 RETURNING *`,
    [isAdmin, facilityId, userId]
  );
  return result.rows[0] || null;
}

// ── Courts ─────────────────────────────────────────────────

export async function getFacilityCourts(facilityId: string): Promise<any[]> {
  const result = await query(
    'SELECT * FROM courts WHERE facility_id = $1',
    [facilityId]
  );
  return sortCourtsForDisplay(result.rows);
}

export async function updateCourt(courtId: string, data: Record<string, any>): Promise<any> {
  const allowedFields = ['name', 'type', 'surface_type', 'status', 'is_indoor', 'has_lights'];
  const sets: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (sets.length === 0) throw new Error('No valid fields to update');

  sets.push('updated_at = NOW()');
  params.push(courtId);

  const result = await query(
    `UPDATE courts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

// ── Facility Update ────────────────────────────────────────

export async function updateFacility(facilityId: string, data: Record<string, any>): Promise<any> {
  const allowedFields = [
    'name', 'type', 'description', 'street_address', 'city', 'state', 'zip_code',
    'phone', 'email', 'operating_hours', 'general_rules',
    'booking_rules', 'status'
  ];
  const sets: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (sets.length === 0) throw new Error('No valid fields to update');

  let priorOperatingHoursFingerprint: string | undefined;
  if (data.operating_hours !== undefined) {
    const prior = await query(
      `SELECT operating_hours FROM facilities WHERE id = $1`,
      [facilityId]
    );
    priorOperatingHoursFingerprint = facilityOperatingHoursScheduleFingerprint(
      prior.rows[0]?.operating_hours
    );
  }

  sets.push('updated_at = NOW()');
  params.push(facilityId);

  const result = await query(
    `UPDATE facilities SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  const updated = result.rows[0] || null;

  // Mirror the admin facility route: changed weekly hours must reach every
  // court's schedule or the calendar keeps showing the old times.
  if (updated && data.operating_hours !== undefined) {
    const nextFingerprint = facilityOperatingHoursScheduleFingerprint(data.operating_hours);
    if (nextFingerprint !== priorOperatingHoursFingerprint) {
      await replaceAllCourtOperatingConfigsForFacility(facilityId, data.operating_hours);
    }
  }

  return updated;
}

// ── Facility Delete ────────────────────────────────────────

export interface FacilityDeletePreview {
  facilityId: string;
  facilityName: string;
  memberCount: number;
  courtCount: number;
  bookingCount: number;
  hasStripeSubscription: boolean;
}

export async function getFacilityDeletePreview(facilityId: string): Promise<FacilityDeletePreview | null> {
  const facResult = await query('SELECT id, name FROM facilities WHERE id = $1', [facilityId]);
  if (facResult.rows.length === 0) return null;

  const [members, courts, bookings, sub] = await Promise.all([
    query('SELECT COUNT(*)::int as count FROM facility_memberships WHERE facility_id = $1', [facilityId]),
    query('SELECT COUNT(*)::int as count FROM courts WHERE facility_id = $1', [facilityId]),
    query('SELECT COUNT(*)::int as count FROM bookings WHERE facility_id = $1', [facilityId]),
    query(
      'SELECT stripe_subscription_id FROM facility_subscriptions WHERE facility_id = $1',
      [facilityId]
    ),
  ]);

  return {
    facilityId,
    facilityName: facResult.rows[0].name,
    memberCount: members.rows[0]?.count || 0,
    courtCount: courts.rows[0]?.count || 0,
    bookingCount: bookings.rows[0]?.count || 0,
    hasStripeSubscription: !!sub.rows[0]?.stripe_subscription_id,
  };
}

export async function deleteFacility(
  facilityId: string
): Promise<{ facilityId: string; facilityName: string } | null> {
  return transaction(async (client) => {
    const facResult = await client.query('SELECT id, name FROM facilities WHERE id = $1', [facilityId]);
    if (facResult.rows.length === 0) return null;

    // member_subscriptions.home_facility_id uses ON DELETE RESTRICT
    await client.query('DELETE FROM member_subscriptions WHERE home_facility_id = $1', [facilityId]);

    const deleted = await client.query(
      'DELETE FROM facilities WHERE id = $1 RETURNING id, name',
      [facilityId]
    );

    return {
      facilityId: deleted.rows[0].id,
      facilityName: deleted.rows[0].name,
    };
  });
}

export interface SubscriptionListItem {
  facilityId: string;
  facilityName: string;
  facilityStatus: string;
  paymentStatus: string | null;
  subscriptionId: string;
  status: string;
  planType: string;
  amountCents: number;
  courtCount: number;
  promoCodeUsed: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  cancelAtPeriodEnd: boolean;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getAllSubscriptions(filters?: {
  status?: string;
  search?: string;
}): Promise<SubscriptionListItem[]> {
  let sql = `
    SELECT
      fs.id as subscription_id, fs.facility_id, f.name as facility_name, f.status as facility_status,
      f.payment_status, fs.status, fs.plan_type, fs.amount_cents, fs.court_count,
      fs.promo_code_used, fs.stripe_subscription_id, fs.stripe_customer_id,
      fs.cancel_at_period_end, fs.billing_period_start, fs.billing_period_end,
      fs.current_period_start, fs.current_period_end, fs.created_at, fs.updated_at
    FROM facility_subscriptions fs
    JOIN facilities f ON fs.facility_id = f.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.status && filters.status !== 'all') {
    if (filters.status === 'attention') {
      sql += ` AND (
        fs.status IN ('pending_payment', 'pending', 'past_due', 'custom_pending')
        OR fs.cancel_at_period_end = true
        OR (COALESCE(fs.current_period_end, fs.billing_period_end) IS NOT NULL
            AND COALESCE(fs.current_period_end, fs.billing_period_end) <= NOW() + interval '30 days'
            AND fs.status IN ('active', 'trialing'))
      )`;
    } else {
      params.push(filters.status);
      sql += ` AND fs.status = $${params.length}`;
    }
  }

  if (filters?.search) {
    params.push(`%${filters.search}%`);
    sql += ` AND (f.name ILIKE $${params.length} OR f.id ILIKE $${params.length})`;
  }

  sql += ' ORDER BY f.name';

  const result = await query(sql, params);
  return result.rows.map(r => ({
    subscriptionId: r.subscription_id,
    facilityId: r.facility_id,
    facilityName: r.facility_name,
    facilityStatus: r.facility_status,
    paymentStatus: r.payment_status,
    status: r.status,
    planType: r.plan_type,
    amountCents: r.amount_cents,
    courtCount: r.court_count,
    promoCodeUsed: r.promo_code_used,
    stripeSubscriptionId: r.stripe_subscription_id,
    stripeCustomerId: r.stripe_customer_id,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    billingPeriodStart: r.billing_period_start,
    billingPeriodEnd: r.billing_period_end,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function updateSubscription(
  facilityId: string,
  data: {
    status?: string;
    amountCents?: number;
    courtCount?: number;
    billingPeriodEnd?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    promoCodeUsed?: string | null;
  }
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.status !== undefined) {
    params.push(data.status);
    sets.push(`status = $${params.length}`);
  }
  if (data.amountCents !== undefined) {
    params.push(data.amountCents);
    sets.push(`amount_cents = $${params.length}`);
  }
  if (data.courtCount !== undefined) {
    params.push(data.courtCount);
    sets.push(`court_count = $${params.length}`);
    if (data.amountCents === undefined) {
      params.push(getAmountForCourts(data.courtCount));
      sets.push(`amount_cents = $${params.length}`);
    }
  }
  if (data.billingPeriodEnd !== undefined) {
    params.push(data.billingPeriodEnd);
    sets.push(`billing_period_end = $${params.length}`);
  }
  if (data.currentPeriodEnd !== undefined) {
    params.push(data.currentPeriodEnd);
    sets.push(`current_period_end = $${params.length}`);
  }
  if (data.cancelAtPeriodEnd !== undefined) {
    params.push(data.cancelAtPeriodEnd);
    sets.push(`cancel_at_period_end = $${params.length}`);
  }
  if (data.promoCodeUsed !== undefined) {
    params.push(data.promoCodeUsed);
    sets.push(`promo_code_used = $${params.length}`);
  }

  if (sets.length === 0) throw new Error('No fields to update');

  sets.push('updated_at = NOW()');
  params.push(facilityId);

  const result = await query(
    `UPDATE facility_subscriptions SET ${sets.join(', ')} WHERE facility_id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;

  if (data.status !== undefined) {
    const paymentStatusMap: Record<string, string> = {
      active: 'paid',
      trialing: 'paid',
      waived: 'paid',
      pending_payment: 'pending',
      past_due: 'past_due',
      canceled: 'suspended',
    };
    const paymentStatus = paymentStatusMap[data.status] || 'pending';
    await query('UPDATE facilities SET payment_status = $1, updated_at = NOW() WHERE id = $2', [
      paymentStatus,
      facilityId,
    ]);
  }

  return result.rows[0];
}

export async function getSubscriptionPayments(facilityId: string): Promise<any[]> {
  const result = await query(
    `SELECT id, amount_cents, currency, status, description, payment_method_type,
            promo_code_used, stripe_payment_intent_id, created_at
     FROM payment_history WHERE facility_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [facilityId]
  );
  return result.rows;
}

// ── Promo Codes ────────────────────────────────────────────

export async function getPromoCodes(): Promise<any[]> {
  const result = await query(
    `SELECT id, code, description, discount_type, discount_value, trial_months,
            max_uses, current_uses, is_active, is_internal, valid_from, valid_until,
            created_at, updated_at
     FROM promo_codes ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function createPromoCode(data: {
  code: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  trialMonths?: number | null;
  maxUses?: number | null;
  isInternal?: boolean;
}): Promise<any> {
  const result = await query(
    `INSERT INTO promo_codes (code, description, discount_type, discount_value, trial_months, max_uses, is_internal)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.code.toUpperCase().trim(),
      data.description || null,
      data.discountType || 'full',
      data.discountValue ?? 0,
      data.trialMonths ?? null,
      data.maxUses ?? null,
      data.isInternal ?? false,
    ]
  );
  return result.rows[0];
}

export async function updatePromoCode(
  id: string,
  data: { isActive?: boolean; maxUses?: number | null; validUntil?: string | null; description?: string }
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.isActive !== undefined) {
    params.push(data.isActive);
    sets.push(`is_active = $${params.length}`);
  }
  if (data.maxUses !== undefined) {
    params.push(data.maxUses);
    sets.push(`max_uses = $${params.length}`);
  }
  if (data.validUntil !== undefined) {
    params.push(data.validUntil);
    sets.push(`valid_until = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    sets.push(`description = $${params.length}`);
  }

  if (sets.length === 0) throw new Error('No fields to update');

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE promo_codes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

// ── Global Search ──────────────────────────────────────────

export interface GlobalSearchResult {
  users: UserSearchResult[];
  facilities: { id: string; name: string; city: string; state: string; status: string }[];
}

export async function globalSearch(searchTerm: string): Promise<GlobalSearchResult> {
  if (searchTerm.length < 2) return { users: [], facilities: [] };

  const [users, facilities] = await Promise.all([
    searchUsers(searchTerm),
    query(
      `SELECT id, name, city, state, status FROM facilities
       WHERE name ILIKE $1 OR id ILIKE $1 OR city ILIKE $1 OR email ILIKE $1
       ORDER BY name LIMIT 20`,
      [`%${searchTerm}%`]
    ),
  ]);

  return { users, facilities: facilities.rows };
}

// ── User Account Update ────────────────────────────────────

export async function updateUserAccount(
  userId: string,
  data: { email?: string; fullName?: string; phone?: string; userType?: string }
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.email !== undefined) {
    params.push(data.email);
    sets.push(`email = $${params.length}`);
  }
  if (data.fullName !== undefined) {
    params.push(data.fullName);
    sets.push(`full_name = $${params.length}`);
  }
  if (data.phone !== undefined) {
    params.push(data.phone);
    sets.push(`phone = $${params.length}`);
  }
  if (data.userType !== undefined) {
    params.push(data.userType);
    sets.push(`user_type = $${params.length}`);
  }

  if (sets.length === 0) throw new Error('No fields to update');

  sets.push('updated_at = NOW()');
  params.push(userId);

  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, email, full_name, phone, user_type, created_at`,
    params
  );
  return result.rows[0] || null;
}
