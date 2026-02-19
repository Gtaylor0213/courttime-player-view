import { query, transaction } from '../database/connection';
import { User, FacilityMembership } from '../types/database';

/**
 * Member Management Service
 * Handles CRUD operations for facility memberships
 */

export interface MemberWithProfile {
  userId: string;
  email: string;
  fullName: string;
  membershipId: string;
  membershipType: string;
  status: 'active' | 'pending' | 'expired' | 'suspended';
  isFacilityAdmin: boolean;
  startDate: string;
  endDate?: string;
  suspendedUntil?: string;
  skillLevel?: string;
  phone?: string;
  streetAddress?: string;
  createdAt: string;
}

export interface MemberUpdateData {
  membershipType?: string;
  status?: 'active' | 'pending' | 'expired' | 'suspended';
  isFacilityAdmin?: boolean;
  endDate?: string;
  suspendedUntil?: string | null;
}

/**
 * Get all members for a facility with their profiles
 */
export async function getFacilityMembers(facilityId: string, searchTerm?: string): Promise<MemberWithProfile[]> {
  try {
    // Auto-reactivate expired suspensions
    await query(
      `UPDATE facility_memberships
       SET status = 'active', suspended_until = NULL
       WHERE status = 'suspended'
         AND suspended_until IS NOT NULL
         AND suspended_until <= NOW()
         AND facility_id = $1`,
      [facilityId]
    );

    let queryText = `SELECT
        u.id as "userId",
        u.email,
        u.full_name as "fullName",
        u.phone,
        u.street_address as "streetAddress",
        fm.id as "membershipId",
        fm.membership_type as "membershipType",
        fm.status,
        CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as "isFacilityAdmin",
        TO_CHAR(fm.start_date, 'YYYY-MM-DD') as "startDate",
        TO_CHAR(fm.end_date, 'YYYY-MM-DD') as "endDate",
        TO_CHAR(fm.suspended_until, 'YYYY-MM-DD"T"HH24:MI:SS') as "suspendedUntil",
        fm.created_at as "createdAt",
        pp.skill_level as "skillLevel"
       FROM facility_memberships fm
       JOIN users u ON fm.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN facility_admins fa ON fa.user_id = fm.user_id AND fa.facility_id = fm.facility_id AND fa.status = 'active'
       WHERE fm.facility_id = $1`;

    const params: any[] = [facilityId];

    if (searchTerm) {
      queryText += ` AND (
        LOWER(u.full_name) LIKE LOWER($2)
        OR LOWER(u.email) LIKE LOWER($2)
        OR LOWER(u.street_address) LIKE LOWER($2)
      )`;
      params.push(`%${searchTerm}%`);
    }

    queryText += ` ORDER BY fm.created_at DESC`;

    const result = await query(queryText, params);

    return result.rows;
  } catch (error) {
    console.error('Get facility members error:', error);
    throw new Error('Failed to fetch facility members');
  }
}

/**
 * Get a specific member's details
 */
export async function getMemberDetails(facilityId: string, userId: string): Promise<MemberWithProfile | null> {
  try {
    const result = await query(
      `SELECT
        u.id as "userId",
        u.email,
        u.full_name as "fullName",
        u.phone,
        fm.id as "membershipId",
        fm.membership_type as "membershipType",
        fm.status,
        CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as "isFacilityAdmin",
        TO_CHAR(fm.start_date, 'YYYY-MM-DD') as "startDate",
        TO_CHAR(fm.end_date, 'YYYY-MM-DD') as "endDate",
        TO_CHAR(fm.suspended_until, 'YYYY-MM-DD"T"HH24:MI:SS') as "suspendedUntil",
        fm.created_at as "createdAt",
        pp.skill_level as "skillLevel"
       FROM facility_memberships fm
       JOIN users u ON fm.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN facility_admins fa ON fa.user_id = fm.user_id AND fa.facility_id = fm.facility_id AND fa.status = 'active'
       WHERE fm.facility_id = $1 AND u.id = $2`,
      [facilityId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Get member details error:', error);
    throw new Error('Failed to fetch member details');
  }
}

/**
 * Update a member's facility membership
 */
export async function updateMemberMembership(
  facilityId: string,
  userId: string,
  updates: MemberUpdateData
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.membershipType !== undefined) {
      fields.push(`membership_type = $${paramIndex++}`);
      values.push(updates.membershipType);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.isFacilityAdmin !== undefined) {
      fields.push(`is_facility_admin = $${paramIndex++}`);
      values.push(updates.isFacilityAdmin);
    }

    if (updates.endDate !== undefined) {
      fields.push(`end_date = $${paramIndex++}`);
      values.push(updates.endDate);
    }

    if (updates.suspendedUntil !== undefined) {
      fields.push(`suspended_until = $${paramIndex++}`);
      values.push(updates.suspendedUntil);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(facilityId, userId);

    const result = await query(
      `UPDATE facility_memberships
       SET ${fields.join(', ')}
       WHERE facility_id = $${paramIndex++} AND user_id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Update member membership error:', error);
    throw new Error('Failed to update member membership');
  }
}

/**
 * Remove a member from a facility (does NOT delete the user account)
 */
export async function removeMemberFromFacility(facilityId: string, userId: string): Promise<boolean> {
  try {
    const result = await query(
      `DELETE FROM facility_memberships
       WHERE facility_id = $1 AND user_id = $2`,
      [facilityId, userId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Remove member from facility error:', error);
    throw new Error('Failed to remove member from facility');
  }
}

/**
 * Add a new member to a facility
 */
export async function addMemberToFacility(
  facilityId: string,
  userId: string,
  membershipType: string = 'Full',
  isFacilityAdmin: boolean = false
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
       VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id)
       DO UPDATE SET
         membership_type = $3,
         is_facility_admin = $4,
         status = 'active'`,
      [userId, facilityId, membershipType, isFacilityAdmin]
    );

    return true;
  } catch (error) {
    console.error('Add member to facility error:', error);
    throw new Error('Failed to add member to facility');
  }
}

/**
 * Set a member as facility admin
 */
export async function setMemberAsAdmin(
  facilityId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE facility_memberships
       SET is_facility_admin = $1
       WHERE facility_id = $2 AND user_id = $3`,
      [isAdmin, facilityId, userId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Set member as admin error:', error);
    throw new Error('Failed to update admin status');
  }
}


/**
 * Check if a user is a facility admin
 */
export async function isFacilityAdmin(facilityId: string, userId: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT is_facility_admin as "isFacilityAdmin"
       FROM facility_memberships
       WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
      [facilityId, userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].isFacilityAdmin;
  } catch (error) {
    console.error('Check facility admin error:', error);
    return false;
  }
}
