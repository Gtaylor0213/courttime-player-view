import { query } from '../database/connection';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Dashboard ──────────────────────────────────────────────

export interface DashboardStats {
  totalFacilities: number;
  totalUsers: number;
  totalActiveMembers: number;
  bookingsThisMonth: number;
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

  // Per-facility summaries
  const facilitiesResult = await query(`
    SELECT
      f.id, f.name, f.type, f.status, f.city, f.state,
      COALESCE(m.active_count, 0)::int as active_member_count,
      COALESCE(c.court_count, 0)::int as court_count,
      COALESCE(b.booking_count, 0)::int as bookings_this_month
    FROM facilities f
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
  `);

  return {
    totalFacilities,
    totalUsers,
    totalActiveMembers,
    bookingsThisMonth,
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
    'SELECT * FROM courts WHERE facility_id = $1 ORDER BY name',
    [facilityId]
  );
  return result.rows;
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
    'phone', 'email', 'operating_hours', 'general_rules', 'cancellation_policy',
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

  sets.push('updated_at = NOW()');
  params.push(facilityId);

  const result = await query(
    `UPDATE facilities SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}
