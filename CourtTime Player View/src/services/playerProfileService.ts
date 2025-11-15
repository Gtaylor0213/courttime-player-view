import { query } from '../database/connection';

/**
 * Player Profile Service
 * Handles player profile CRUD operations
 */

export interface PlayerProfileData {
  userId: string;
  skillLevel?: string;
  ntrpRating?: number;
  playingHand?: string;
  playingStyle?: string;
  preferredCourtSurface?: string;
  bio?: string;
  profileImageUrl?: string;
  yearsPlaying?: number;
}

export interface PlayerProfileWithUser {
  userId: string;
  email: string;
  fullName: string;
  skillLevel?: string;
  ntrpRating?: number;
  playingHand?: string;
  playingStyle?: string;
  preferredCourtSurface?: string;
  bio?: string;
  profileImageUrl?: string;
  yearsPlaying?: number;
  memberFacilities?: Array<{
    facilityId: string;
    facilityName: string;
    membershipType: string;
    status: string;
    isFacilityAdmin: boolean;
  }>;
}

/**
 * Get player profile by user ID
 */
export async function getPlayerProfile(userId: string): Promise<PlayerProfileWithUser | null> {
  try {
    const result = await query(
      `SELECT
        u.id as "userId",
        u.email,
        u.full_name as "fullName",
        pp.skill_level as "skillLevel",
        pp.ntrp_rating as "ntrpRating",
        pp.playing_hand as "playingHand",
        pp.playing_style as "playingStyle",
        pp.preferred_court_surface as "preferredCourtSurface",
        pp.bio,
        pp.profile_image_url as "profileImageUrl",
        pp.years_playing as "yearsPlaying"
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const profile = result.rows[0];

    // Get user's facility memberships
    const membershipsResult = await query(
      `SELECT
        f.id as "facilityId",
        f.name as "facilityName",
        fm.membership_type as "membershipType",
        fm.status,
        fm.is_facility_admin as "isFacilityAdmin"
       FROM facility_memberships fm
       JOIN facilities f ON fm.facility_id = f.id
       WHERE fm.user_id = $1 AND fm.status IN ('active', 'pending')
       ORDER BY fm.created_at DESC`,
      [userId]
    );

    profile.memberFacilities = membershipsResult.rows;

    return profile;
  } catch (error) {
    console.error('Get player profile error:', error);
    throw new Error('Failed to fetch player profile');
  }
}

/**
 * Update player profile
 */
export async function updatePlayerProfile(
  userId: string,
  updates: Partial<PlayerProfileData>
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.skillLevel !== undefined) {
      fields.push(`skill_level = $${paramIndex++}`);
      values.push(updates.skillLevel);
    }

    if (updates.ntrpRating !== undefined) {
      fields.push(`ntrp_rating = $${paramIndex++}`);
      values.push(updates.ntrpRating);
    }

    if (updates.playingHand !== undefined) {
      fields.push(`playing_hand = $${paramIndex++}`);
      values.push(updates.playingHand);
    }

    if (updates.playingStyle !== undefined) {
      fields.push(`playing_style = $${paramIndex++}`);
      values.push(updates.playingStyle);
    }

    if (updates.preferredCourtSurface !== undefined) {
      fields.push(`preferred_court_surface = $${paramIndex++}`);
      values.push(updates.preferredCourtSurface);
    }

    if (updates.bio !== undefined) {
      fields.push(`bio = $${paramIndex++}`);
      values.push(updates.bio);
    }

    if (updates.profileImageUrl !== undefined) {
      fields.push(`profile_image_url = $${paramIndex++}`);
      values.push(updates.profileImageUrl);
    }

    if (updates.yearsPlaying !== undefined) {
      fields.push(`years_playing = $${paramIndex++}`);
      values.push(updates.yearsPlaying);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(userId);

    // Upsert player profile
    await query(
      `INSERT INTO player_profiles (user_id, ${fields.map((_, i) => {
        const fieldName = fields[i].split(' = ')[0];
        return fieldName;
      }).join(', ')})
       VALUES ($${paramIndex}, ${values.slice(0, -1).map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET
         ${fields.join(', ')}`,
      values
    );

    return true;
  } catch (error) {
    console.error('Update player profile error:', error);
    throw new Error('Failed to update player profile');
  }
}

/**
 * Request membership to a facility
 */
export async function requestFacilityMembership(
  userId: string,
  facilityId: string,
  membershipType: string = 'Full'
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, $3, 'pending', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE SET
         status = 'pending',
         membership_type = $3`,
      [userId, facilityId, membershipType]
    );

    return true;
  } catch (error) {
    console.error('Request facility membership error:', error);
    throw new Error('Failed to request facility membership');
  }
}

/**
 * Get user's bookings
 */
export async function getUserBookings(userId: string, upcoming: boolean = true): Promise<any[]> {
  try {
    const dateCondition = upcoming
      ? 'AND (b.booking_date > CURRENT_DATE OR (b.booking_date = CURRENT_DATE AND b.start_time > CURRENT_TIME))'
      : '';

    const result = await query(
      `SELECT
        b.id,
        b.booking_date as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        f.name as "facilityName",
        c.name as "courtName",
        c.court_type as "courtType"
       FROM bookings b
       JOIN facilities f ON b.facility_id = f.id
       JOIN courts c ON b.court_id = c.id
       WHERE b.user_id = $1 ${dateCondition}
       ORDER BY b.booking_date ASC, b.start_time ASC
       LIMIT 10`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error('Get user bookings error:', error);
    throw new Error('Failed to fetch user bookings');
  }
}
