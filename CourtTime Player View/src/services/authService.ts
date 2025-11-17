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

    // Create user in transaction
    const result = await transaction(async (client) => {
      // Insert user with contact information
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, user_type, phone, street_address, city, state, zip_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, email, full_name as "fullName", user_type as "userType", phone, street_address as "streetAddress", city, state, zip_code as "zipCode", created_at as "createdAt", updated_at as "updatedAt"`,
        [
          email.toLowerCase(),
          passwordHash,
          fullName,
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
          `INSERT INTO player_profiles (user_id, skill_level)
           VALUES ($1, $2)`,
          [user.id, additionalData?.skillLevel || null]
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
    // Get user with password hash
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.password_hash as "passwordHash",
        u.full_name as "fullName",
        u.user_type as "userType",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt"
       FROM users u
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

    // Remove password hash from response
    delete user.passwordHash;

    return {
      success: true,
      user: {
        ...user,
        memberFacilities
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
        id,
        email,
        full_name as "fullName",
        user_type as "userType",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM users
       WHERE id = $1`,
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
export async function getUserWithMemberships(userId: string): Promise<(User & { memberFacilities: string[] }) | null> {
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

    return {
      ...user,
      memberFacilities
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
 */
export async function addUserToFacility(
  userId: string,
  facilityId: string,
  membershipType: string = 'Full'
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id)
       DO UPDATE SET status = 'active', membership_type = $3`,
      [userId, facilityId, membershipType]
    );

    return true;
  } catch (error) {
    console.error('Add user to facility error:', error);
    return false;
  }
}
