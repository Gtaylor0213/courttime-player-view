import { query } from '../database/connection';

/**
 * Hitting Partner Service
 * Handles hitting partner post CRUD operations
 */

export interface HittingPartnerPost {
  id: string;
  userId: string;
  userName: string;
  userInitials: string;
  facilityId: string;
  facilityName: string;
  skillLevel?: string;
  availability: string;
  playStyle: string[];
  description: string;
  postedDate: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'deleted';
}

export interface CreateHittingPartnerPost {
  userId: string;
  facilityId: string;
  skillLevel?: string;
  availability: string;
  playStyle: string[];
  description: string;
  expiresInDays: number; // 7-90 days
}

/**
 * Get all active hitting partner posts for a facility
 */
export async function getFacilityHittingPartnerPosts(facilityId: string): Promise<HittingPartnerPost[]> {
  try {
    // First, auto-expire old posts
    await query(
      `UPDATE hitting_partner_posts
       SET status = 'expired'
       WHERE facility_id = $1 AND expires_at < CURRENT_TIMESTAMP AND status = 'active'`,
      [facilityId]
    );

    const result = await query(
      `SELECT
        hp.id,
        hp.user_id as "userId",
        u.full_name as "userName",
        hp.facility_id as "facilityId",
        f.name as "facilityName",
        COALESCE(pp.skill_level, hp.skill_level) as "skillLevel",
        hp.availability,
        hp.play_style as "playStyle",
        hp.description,
        hp.posted_date as "postedDate",
        hp.expires_at as "expiresAt",
        hp.status
       FROM hitting_partner_posts hp
       JOIN users u ON hp.user_id = u.id
       JOIN facilities f ON hp.facility_id = f.id
       LEFT JOIN player_profiles pp ON hp.user_id = pp.user_id
       WHERE hp.facility_id = $1 AND hp.status = 'active'
       ORDER BY hp.posted_date DESC`,
      [facilityId]
    );

    return result.rows.map(row => ({
      ...row,
      userInitials: getInitials(row.userName)
    }));
  } catch (error) {
    console.error('Get hitting partner posts error:', error);
    throw new Error('Failed to fetch hitting partner posts');
  }
}

/**
 * Get all hitting partner posts (for users with no facility - show all)
 */
export async function getAllHittingPartnerPosts(): Promise<HittingPartnerPost[]> {
  try {
    const result = await query(
      `SELECT
        hp.id,
        hp.user_id as "userId",
        u.full_name as "userName",
        hp.facility_id as "facilityId",
        f.name as "facilityName",
        COALESCE(pp.skill_level, hp.skill_level) as "skillLevel",
        hp.availability,
        hp.play_style as "playStyle",
        hp.description,
        hp.posted_date as "postedDate",
        hp.expires_at as "expiresAt",
        hp.status
       FROM hitting_partner_posts hp
       JOIN users u ON hp.user_id = u.id
       JOIN facilities f ON hp.facility_id = f.id
       LEFT JOIN player_profiles pp ON hp.user_id = pp.user_id
       WHERE hp.status = 'active' AND hp.expires_at > CURRENT_TIMESTAMP
       ORDER BY hp.posted_date DESC
       LIMIT 50`,
      []
    );

    return result.rows.map(row => ({
      ...row,
      userInitials: getInitials(row.userName)
    }));
  } catch (error) {
    console.error('Get all hitting partner posts error:', error);
    throw new Error('Failed to fetch hitting partner posts');
  }
}

/**
 * Create a new hitting partner post
 */
export async function createHittingPartnerPost(data: CreateHittingPartnerPost): Promise<string> {
  try {
    // Validate expiration days
    if (data.expiresInDays < 7 || data.expiresInDays > 90) {
      throw new Error('Expiration must be between 7 and 90 days');
    }

    const result = await query(
      `INSERT INTO hitting_partner_posts (
        user_id,
        facility_id,
        skill_level,
        availability,
        play_style,
        description,
        expires_at,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        CURRENT_TIMESTAMP + INTERVAL '1 day' * $7,
        'active'
      )
      RETURNING id`,
      [
        data.userId,
        data.facilityId,
        data.skillLevel,
        data.availability,
        data.playStyle,
        data.description,
        data.expiresInDays
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    console.error('Create hitting partner post error:', error);
    throw new Error('Failed to create hitting partner post');
  }
}

/**
 * Update a hitting partner post
 */
export async function updateHittingPartnerPost(
  postId: string,
  userId: string,
  updates: Partial<CreateHittingPartnerPost>
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.availability !== undefined) {
      fields.push(`availability = $${paramIndex++}`);
      values.push(updates.availability);
    }

    if (updates.playStyle !== undefined) {
      fields.push(`play_style = $${paramIndex++}`);
      values.push(updates.playStyle);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.skillLevel !== undefined) {
      fields.push(`skill_level = $${paramIndex++}`);
      values.push(updates.skillLevel);
    }

    if (updates.expiresInDays !== undefined) {
      fields.push(`expires_at = CURRENT_TIMESTAMP + INTERVAL '1 day' * $${paramIndex++}`);
      values.push(updates.expiresInDays);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(postId, userId);

    const result = await query(
      `UPDATE hitting_partner_posts
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
      values
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Update hitting partner post error:', error);
    throw new Error('Failed to update hitting partner post');
  }
}

/**
 * Delete a hitting partner post (soft delete)
 */
export async function deleteHittingPartnerPost(postId: string, userId: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE hitting_partner_posts
       SET status = 'deleted'
       WHERE id = $1 AND user_id = $2`,
      [postId, userId]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Delete hitting partner post error:', error);
    throw new Error('Failed to delete hitting partner post');
  }
}

/**
 * Get user's own hitting partner posts
 */
export async function getUserHittingPartnerPosts(userId: string): Promise<HittingPartnerPost[]> {
  try {
    const result = await query(
      `SELECT
        hp.id,
        hp.user_id as "userId",
        u.full_name as "userName",
        hp.facility_id as "facilityId",
        f.name as "facilityName",
        COALESCE(pp.skill_level, hp.skill_level) as "skillLevel",
        hp.availability,
        hp.play_style as "playStyle",
        hp.description,
        hp.posted_date as "postedDate",
        hp.expires_at as "expiresAt",
        hp.status
       FROM hitting_partner_posts hp
       JOIN users u ON hp.user_id = u.id
       JOIN facilities f ON hp.facility_id = f.id
       LEFT JOIN player_profiles pp ON hp.user_id = pp.user_id
       WHERE hp.user_id = $1 AND hp.status IN ('active', 'expired')
       ORDER BY hp.posted_date DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      ...row,
      userInitials: getInitials(row.userName)
    }));
  } catch (error) {
    console.error('Get user hitting partner posts error:', error);
    throw new Error('Failed to fetch user hitting partner posts');
  }
}

/**
 * Helper function to generate initials from name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}
