import { query, transaction } from '../database/connection';
import { User, UserPreferences, PlayerProfile, FacilityMembership } from '../types/database';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Authentication Service
 * Handles user authentication and registration
 */

export interface LoginResult {
  success: boolean;
  user?: User & { memberFacilities?: string[] };
  message?: string;
}

export interface RegisterResult {
  success: boolean;
  user?: User;
  message?: string;
}

/**
 * Hash a password
 */
async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

interface AdditionalUserData {
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  skillLevel?: string;
  ustaRating?: string;
  bio?: string;
  profilePicture?: string;
  notificationPreferences?: {
    emailBookingConfirmations?: boolean;
    smsReminders?: boolean;
    promotionalEmails?: boolean;
    weeklyDigest?: boolean;
    maintenanceUpdates?: boolean;
  };
}

/**
 * Register a new user
 */
export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  userType: 'player' | 'admin' = 'player',
  additionalData?: AdditionalUserData
): Promise<RegisterResult> {
  try {
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return {
        success: false,
        message: 'User with this email already exists'
      };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Split full name into first and last name
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create user in transaction
    const result = await transaction(async (client) => {
      // Insert user with contact information
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type, phone, street_address, city, state, zip_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, email, full_name as "fullName", first_name as "firstName", last_name as "lastName", user_type as "userType", phone, street_address as "streetAddress", city, state, zip_code as "zipCode", created_at as "createdAt", updated_at as "updatedAt"`,
        [
          email.toLowerCase(),
          passwordHash,
          fullName,
          firstName,
          lastName,
          userType,
          additionalData?.phone || null,
          additionalData?.streetAddress || null,
          additionalData?.city || null,
          additionalData?.state || null,
          additionalData?.zipCode || null
        ]
      );

      const user = userResult.rows[0];

      // Create user preferences with notification settings
      const notifPrefs = additionalData?.notificationPreferences || {};
      await client.query(
        `INSERT INTO user_preferences (
          user_id,
          notifications,
          timezone,
          theme,
          email_booking_confirmations,
          sms_reminders,
          promotional_emails,
          weekly_digest,
          maintenance_updates
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.id,
          true,
          'America/New_York',
          'light',
          notifPrefs.emailBookingConfirmations !== undefined ? notifPrefs.emailBookingConfirmations : true,
          notifPrefs.smsReminders !== undefined ? notifPrefs.smsReminders : true,
          notifPrefs.promotionalEmails !== undefined ? notifPrefs.promotionalEmails : false,
          notifPrefs.weeklyDigest !== undefined ? notifPrefs.weeklyDigest : true,
          notifPrefs.maintenanceUpdates !== undefined ? notifPrefs.maintenanceUpdates : true
        ]
      );

      // Create player profile if user is a player
      if (userType === 'player') {
        await client.query(
          `INSERT INTO player_profiles (user_id, skill_level, ntrp_rating, bio, profile_image_url)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, additionalData?.skillLevel || null, additionalData?.ustaRating || null, additionalData?.bio || null, additionalData?.profilePicture || null]
        );
      }

      return user;
    });

    return {
      success: true,
      user: result,
      message: 'User registered successfully'
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      message: 'Registration failed. Please try again.'
    };
  }
}

/**
 * Login a user
 */
export async function loginUser(email: string, password: string): Promise<LoginResult> {
  try {
    // Get user with password hash and profile image
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.password_hash as "passwordHash",
        u.full_name as "fullName",
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.address,
        u.street_address as "streetAddress",
        u.city,
        u.state,
        u.zip_code as "zipCode",
        u.phone,
        u.user_type as "userType",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        pp.profile_image_url as "profileImageUrl"
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Invalid email or password'
      };
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      return {
        success: false,
        message: 'Invalid email or password'
      };
    }

    // Get user's facility memberships
    const membershipsResult = await query(
      `SELECT facility_id as "facilityId"
       FROM facility_memberships
       WHERE user_id = $1 AND status = 'active'`,
      [user.id]
    );

    const memberFacilities = membershipsResult.rows.map(row => row.facilityId);

    // Get facilities where user is an admin
    const adminResult = await query(
      `SELECT facility_id as "facilityId"
       FROM facility_admins
       WHERE user_id = $1 AND status = 'active'`,
      [user.id]
    );

    const adminFacilities = adminResult.rows.map(row => row.facilityId);

    // Remove password hash from response
    delete user.passwordHash;

    return {
      success: true,
      user: {
        ...user,
        memberFacilities,
        adminFacilities
      },
      message: 'Login successful'
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: 'Login failed. Please try again.'
    };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const result = await query(
      `SELECT
        u.id,
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
        u.user_type as "userType",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        pp.skill_level as "skillLevel",
        pp.bio,
        pp.profile_image_url as "profileImageUrl"
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Get user with memberships
 */
export async function getUserWithMemberships(userId: string): Promise<(User & { memberFacilities: string[]; adminFacilities: string[] }) | null> {
  try {
    const user = await getUserById(userId);

    if (!user) {
      return null;
    }

    // Get user's facility memberships
    const membershipsResult = await query(
      `SELECT facility_id as "facilityId"
       FROM facility_memberships
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    const memberFacilities = membershipsResult.rows.map(row => row.facilityId);

    // Get facilities where user is an admin
    const adminResult = await query(
      `SELECT facility_id as "facilityId"
       FROM facility_admins
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    const adminFacilities = adminResult.rows.map(row => row.facilityId);

    return {
      ...user,
      memberFacilities,
      adminFacilities
    };
  } catch (error) {
    console.error('Get user with memberships error:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<User, 'id' | 'email' | 'createdAt' | 'updatedAt'>>
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.fullName) {
      fields.push(`full_name = $${paramIndex++}`);
      values.push(updates.fullName);
    }

    if (updates.userType) {
      fields.push(`user_type = $${paramIndex++}`);
      values.push(updates.userType);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(userId);

    await query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}`,
      values
    );

    return true;
  } catch (error) {
    console.error('Update user profile error:', error);
    return false;
  }
}

/**
 * Add user to facility
 * New members start as 'pending' unless their address is on the whitelist
 */
export async function addUserToFacility(
  userId: string,
  facilityId: string,
  membershipType: string = 'Full'
): Promise<boolean> {
  try {
    // Get user's address to check against whitelist
    const userResult = await query(
      `SELECT street_address as "streetAddress" FROM users WHERE id = $1`,
      [userId]
    );

    let status: 'active' | 'pending' = 'pending';

    // Check if user's address is on the whitelist for auto-approval
    if (userResult.rows.length > 0 && userResult.rows[0].streetAddress) {
      const whitelistResult = await query(
        `SELECT accounts_limit as "accountsLimit"
         FROM address_whitelist
         WHERE facility_id = $1 AND LOWER(address) = LOWER($2)`,
        [facilityId, userResult.rows[0].streetAddress]
      );

      if (whitelistResult.rows.length > 0) {
        // Check if account limit hasn't been exceeded
        const countResult = await query(
          `SELECT COUNT(DISTINCT u.id) as count
           FROM users u
           JOIN facility_memberships fm ON u.id = fm.user_id
           WHERE fm.facility_id = $1
             AND LOWER(u.street_address) = LOWER($2)
             AND fm.status IN ('active', 'pending')`,
          [facilityId, userResult.rows[0].streetAddress]
        );

        const currentCount = parseInt(countResult.rows[0].count) || 0;
        const limit = whitelistResult.rows[0].accountsLimit;

        if (currentCount < limit) {
          status = 'active';
        }
      }
    }

    await query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       ON CONFLICT (user_id, facility_id)
       DO UPDATE SET status = $4, membership_type = $3`,
      [userId, facilityId, membershipType, status]
    );

    return true;
  } catch (error) {
    console.error('Add user to facility error:', error);
    return false;
  }
}
