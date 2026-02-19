import { query } from '../database/connection';

/**
 * Player Profile Service
 * Handles player profile CRUD operations
 */

export interface PlayerProfileData {
  userId: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  skillLevel?: string;
  ustaRating?: string;
  bio?: string;
  profileImageUrl?: string;
}

export interface PlayerProfileWithUser {
  userId: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  skillLevel?: string;
  ustaRating?: string;
  bio?: string;
  profileImageUrl?: string;
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
    console.log('Fetching player profile for userId:', userId);
    const result = await query(
      `SELECT
        u.id as "userId",
        u.email,
        u.full_name as "fullName",
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.address,
        u.street_address as "streetAddress",
        u.city,
        u.state,
        u.zip_code as "zipCode",
        u.phone,
        pp.skill_level as "skillLevel",
        pp.ntrp_rating as "ustaRating",
        pp.bio,
        pp.profile_image_url as "profileImageUrl"
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1`,
      [userId]
    );
    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) {
      return null;
    }

    const profile = result.rows[0];

    // Get user's facility memberships (derive admin status from facility_admins table)
    const membershipsResult = await query(
      `SELECT
        f.id as "facilityId",
        f.name as "facilityName",
        fm.membership_type as "membershipType",
        fm.status,
        CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as "isFacilityAdmin"
       FROM facility_memberships fm
       JOIN facilities f ON fm.facility_id = f.id
       LEFT JOIN facility_admins fa ON fa.user_id = fm.user_id AND fa.facility_id = fm.facility_id AND fa.status = 'active'
       WHERE fm.user_id = $1 AND fm.status IN ('active', 'pending')
       ORDER BY fm.created_at DESC`,
      [userId]
    );

    profile.memberFacilities = membershipsResult.rows;

    return profile;
  } catch (error) {
    console.error('Get player profile error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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
    const userFields: string[] = [];
    const profileFields: string[] = [];
    const userValues: any[] = [];
    const profileValues: any[] = [];
    let userParamIndex = 1;
    let profileParamIndex = 1;

    // User table fields
    if (updates.firstName !== undefined) {
      userFields.push(`first_name = $${userParamIndex++}`);
      userValues.push(updates.firstName);
      // Also update full_name
      const lastName = updates.lastName;
      if (lastName !== undefined || userFields.length > 0) {
        userFields.push(`full_name = $${userParamIndex++}`);
        userValues.push(`${updates.firstName} ${lastName || ''}`);
      }
    }

    if (updates.lastName !== undefined) {
      userFields.push(`last_name = $${userParamIndex++}`);
      userValues.push(updates.lastName);
      // Update full_name if not already done
      if (!userFields.some(f => f.includes('full_name'))) {
        userFields.push(`full_name = COALESCE(first_name, '') || ' ' || $${userParamIndex++}`);
        userValues.push(updates.lastName);
      }
    }

    if (updates.address !== undefined) {
      userFields.push(`address = $${userParamIndex++}`);
      userValues.push(updates.address);
    }

    if (updates.streetAddress !== undefined) {
      userFields.push(`street_address = $${userParamIndex++}`);
      userValues.push(updates.streetAddress);
    }

    if (updates.city !== undefined) {
      userFields.push(`city = $${userParamIndex++}`);
      userValues.push(updates.city);
    }

    if (updates.state !== undefined) {
      userFields.push(`state = $${userParamIndex++}`);
      userValues.push(updates.state);
    }

    if (updates.zipCode !== undefined) {
      userFields.push(`zip_code = $${userParamIndex++}`);
      userValues.push(updates.zipCode);
    }

    if (updates.phone !== undefined) {
      userFields.push(`phone = $${userParamIndex++}`);
      userValues.push(updates.phone);
    }

    // Player profile table fields
    if (updates.skillLevel !== undefined) {
      profileFields.push(`skill_level = $${profileParamIndex++}`);
      profileValues.push(updates.skillLevel);
    }

    if (updates.ustaRating !== undefined) {
      profileFields.push(`ntrp_rating = $${profileParamIndex++}`);
      profileValues.push(updates.ustaRating);
    }

    if (updates.bio !== undefined) {
      profileFields.push(`bio = $${profileParamIndex++}`);
      profileValues.push(updates.bio);
    }

    if (updates.profileImageUrl !== undefined) {
      profileFields.push(`profile_image_url = $${profileParamIndex++}`);
      profileValues.push(updates.profileImageUrl);
    }

    // Update users table
    if (userFields.length > 0) {
      userValues.push(userId);
      await query(
        `UPDATE users
         SET ${userFields.join(', ')}
         WHERE id = $${userParamIndex}`,
        userValues
      );
    }

    // Update player_profiles table
    if (profileFields.length > 0) {
      profileValues.push(userId);
      await query(
        `INSERT INTO player_profiles (user_id, ${profileFields.map(f => f.split(' = ')[0]).join(', ')})
         VALUES ($${profileParamIndex}, ${profileValues.slice(0, -1).map((_, i) => `$${i + 1}`).join(', ')})
         ON CONFLICT (user_id) DO UPDATE SET
           ${profileFields.join(', ')}`,
        profileValues
      );
    }

    return userFields.length > 0 || profileFields.length > 0;
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
      ? `AND b.booking_date >= CURRENT_DATE`
      : '';

    const result = await query(
      `SELECT
        b.id,
        b.court_id as "courtId",
        b.user_id as "userId",
        b.facility_id as "facilityId",
        TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        f.name as "facilityName",
        c.name as "courtName",
        c.court_type as "courtType",
        u.full_name as "userName",
        u.email as "userEmail"
       FROM bookings b
       JOIN facilities f ON b.facility_id = f.id
       JOIN courts c ON b.court_id = c.id
       JOIN users u ON b.user_id = u.id
       WHERE b.user_id = $1
         AND b.status != 'cancelled'
         ${dateCondition}
       ORDER BY b.booking_date ASC, b.start_time ASC
       LIMIT 50`,
      [userId]
    );

    // If upcoming, filter out bookings that have already ended today
    if (upcoming && result.rows.length > 0) {
      const now = new Date();
      // Use local date components to avoid timezone issues
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}-${month}-${day}`; // YYYY-MM-DD
      const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

      console.log('Filtering bookings - Current date:', currentDate, 'Current time:', currentTime);

      const filtered = result.rows.filter(booking => {
        // Keep all future dates
        if (booking.bookingDate > currentDate) {
          console.log(`  ✓ Keeping ${booking.facilityName} ${booking.courtName} ${booking.startTime}-${booking.endTime} (future date: ${booking.bookingDate})`);
          return true;
        }
        // For today, only keep bookings that haven't ended yet
        if (booking.bookingDate === currentDate) {
          const keep = booking.endTime >= currentTime;
          console.log(`  ${keep ? '✓' : '✗'} ${booking.facilityName} ${booking.courtName} ${booking.startTime}-${booking.endTime} (today, endTime ${booking.endTime} ${keep ? '>=' : '<'} ${currentTime})`);
          return keep;
        }
        return false;
      });

      console.log(`Filtered ${filtered.length} bookings from ${result.rows.length} total`);
      return filtered.slice(0, 10);
    }

    return result.rows.slice(0, 10);
  } catch (error) {
    console.error('Get user bookings error:', error);
    throw new Error('Failed to fetch user bookings');
  }
}
