import { query, transaction } from '../database/connection';
import { Facility, Court } from '../types/database';
import type { PoolClient } from 'pg';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an admin invitation email via Resend
 */
async function sendAdminInviteEmail(
  inviteEmail: string,
  facilityName: string,
  invitedByName: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set - skipping admin invite email');
    return false;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const registerLink = `${appUrl}/register`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CourtTime <onboarding@resend.dev>';

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [inviteEmail],
        subject: `You've been invited to manage ${facilityName} on CourtTime`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">CourtTime Admin Invitation</h2>
            <p>Hi there,</p>
            <p><strong>${invitedByName}</strong> has invited you to be an administrator of <strong>${facilityName}</strong> on CourtTime.</p>
            <p>As a facility administrator, you'll be able to manage courts, bookings, members, and more.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${registerLink}"
                 style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Get Started
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">If you already have an account, simply log in and you'll see the facility in your dashboard.</p>
            <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API error (admin invite):', errorData);
      return false;
    }

    console.log(`Admin invite email sent to ${inviteEmail} for facility ${facilityName}`);
    return true;
  } catch (error) {
    console.error('Failed to send admin invite email:', error);
    return false;
  }
}

/**
 * Facility Service
 * Handles facility and court-related operations, facility registration, and admin management
 */

export interface FacilityCreateData {
  name: string;
  type: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  description?: string;
  operatingHours?: Record<string, { open: string; close: string; closed?: boolean }>;
  generalRules?: string;
  cancellationPolicy?: string;
  bookingRules?: string;
}

export interface FacilityRuleData {
  facilityId: string;
  ruleType: 'booking_limit' | 'cancellation_policy' | 'usage_rules' | 'peak_hours';
  ruleName: string;
  ruleDescription?: string;
  ruleConfig: Record<string, any>;
  appliesToCourts?: string[]; // Array of court UUIDs, null = all courts
  createdBy: string;
}

export interface FacilityRule {
  id: string;
  facilityId: string;
  ruleType: string;
  ruleName: string;
  ruleDescription?: string;
  ruleConfig: Record<string, any>;
  isActive: boolean;
  appliesToCourts?: string[];
  createdBy?: string;
  createdAt: Date;
}

/**
 * Get all facilities
 */
export async function getAllFacilities(): Promise<Facility[]> {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        type,
        address,
        street_address as "streetAddress",
        city,
        state,
        zip_code as "zipCode",
        phone,
        email,
        description,
        amenities,
        operating_hours as "operatingHours",
        logo_url as "logoUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM facilities
      ORDER BY name
    `);

    return result.rows;
  } catch (error) {
    console.error('Get all facilities error:', error);
    return [];
  }
}

/**
 * Search facilities by query
 */
export async function searchFacilities(searchQuery: string): Promise<any[]> {
  try {
    const result = await query(`
      SELECT
        f.id,
        f.name,
        f.type,
        f.address,
        f.street_address,
        f.city,
        f.state,
        f.zip_code,
        f.description,
        f.logo_url,
        COUNT(DISTINCT c.id) as courts,
        COUNT(DISTINCT fm.user_id) as members
      FROM facilities f
      LEFT JOIN courts c ON f.id = c.facility_id
      LEFT JOIN facility_memberships fm ON f.id = fm.facility_id AND fm.status = 'active'
      WHERE
        LOWER(f.name) LIKE LOWER($1) OR
        LOWER(f.type) LIKE LOWER($1) OR
        LOWER(f.address) LIKE LOWER($1) OR
        LOWER(f.street_address) LIKE LOWER($1) OR
        LOWER(f.city) LIKE LOWER($1) OR
        LOWER(f.description) LIKE LOWER($1)
      GROUP BY f.id, f.name, f.type, f.address, f.street_address, f.city, f.state, f.zip_code, f.description, f.logo_url
      ORDER BY f.name
    `, [`%${searchQuery}%`]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type || 'Facility',
      location: row.street_address || row.address || 'Location not specified',
      streetAddress: row.street_address,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      description: row.description || '',
      logoUrl: row.logo_url,
      courts: parseInt(row.courts) || 0,
      members: parseInt(row.members) || 0,
      requiresApproval: row.type === 'Private Club' // Private clubs require approval
    }));
  } catch (error) {
    console.error('Search facilities error:', error);
    return [];
  }
}

/**
 * Get facility by ID
 */
export async function getFacilityById(facilityId: string): Promise<Facility | null> {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        type,
        address,
        street_address as "streetAddress",
        city,
        state,
        zip_code as "zipCode",
        phone,
        email,
        contact_name as "contactName",
        description,
        operating_hours as "operatingHours",
        timezone,
        logo_url as "logoUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM facilities
      WHERE id = $1
    `, [facilityId]);

    if (result.rows.length === 0) {
      return null;
    }

    const facility = result.rows[0];

    // Fetch contacts from facility_contacts table
    try {
      const contactsResult = await query(`
        SELECT name, email, phone, is_primary as "isPrimary"
        FROM facility_contacts
        WHERE facility_id = $1 AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
      `, [facilityId]);

      const primary = contactsResult.rows.find((c: any) => c.isPrimary);
      const secondary = contactsResult.rows.filter((c: any) => !c.isPrimary);

      if (primary) {
        facility.primaryContact = { name: primary.name, email: primary.email, phone: primary.phone };
      }
      if (secondary.length > 0) {
        facility.secondaryContacts = secondary.map((c: any) => ({ name: c.name, email: c.email, phone: c.phone }));
      }
    } catch (contactError) {
      console.error('Error fetching facility contacts:', contactError);
    }

    return facility;
  } catch (error) {
    console.error('Get facility by ID error:', error);
    return null;
  }
}

/**
 * Get courts for a facility
 */
export async function getFacilityCourts(facilityId: string): Promise<Court[]> {
  try {
    const result = await query(`
      SELECT
        id,
        facility_id as "facilityId",
        name,
        court_number as "courtNumber",
        surface_type as "surfaceType",
        court_type as "courtType",
        is_indoor as "isIndoor",
        has_lights as "hasLights",
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM courts
      WHERE facility_id = $1
      ORDER BY court_number
    `, [facilityId]);

    return result.rows;
  } catch (error) {
    console.error('Get facility courts error:', error);
    return [];
  }
}

/**
 * Get facilities with member counts
 */
export async function getFacilitiesWithStats(): Promise<any[]> {
  try {
    const result = await query(`
      SELECT
        f.id,
        f.name,
        f.type,
        f.description,
        COUNT(DISTINCT c.id) as total_courts,
        COUNT(DISTINCT fm.user_id) FILTER (WHERE fm.status = 'active') as active_members,
        COUNT(DISTINCT fm.user_id) FILTER (WHERE fm.status = 'pending') as pending_requests
      FROM facilities f
      LEFT JOIN courts c ON f.id = c.facility_id
      LEFT JOIN facility_memberships fm ON f.id = fm.facility_id
      GROUP BY f.id, f.name, f.type, f.description
      ORDER BY f.name
    `);

    return result.rows;
  } catch (error) {
    console.error('Get facilities with stats error:', error);
    return [];
  }
}

/**
 * Create a new facility with super admin
 */
export async function createFacilityWithAdmin(
  facilityData: FacilityCreateData,
  superAdminUserId: string
): Promise<{ facility: any; adminId: string }> {
  return transaction(async (client: PoolClient) => {
    // Generate facility ID from name (slug format)
    const facilityId = facilityData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // 1. Create facility
    const facilityResult = await client.query(
      `INSERT INTO facilities (
        id, name, type, address, phone, email, contact_name, description,
        operating_hours, general_rules, cancellation_policy, booking_rules, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
      RETURNING
        id, name, type, address, phone, email, contact_name as "contactName",
        description, operating_hours as "operatingHours",
        general_rules as "generalRules", cancellation_policy as "cancellationPolicy",
        booking_rules as "bookingRules", status, created_at as "createdAt"`,
      [
        facilityId,
        facilityData.name,
        facilityData.type,
        facilityData.address,
        facilityData.phone || null,
        facilityData.email || null,
        facilityData.contactName || null,
        facilityData.description || null,
        facilityData.operatingHours ? JSON.stringify(facilityData.operatingHours) : null,
        facilityData.generalRules || null,
        facilityData.cancellationPolicy || null,
        facilityData.bookingRules || null,
      ]
    );

    const facility = facilityResult.rows[0];

    // 2. Mark user as super admin
    await client.query(
      `UPDATE users SET is_super_admin = true WHERE id = $1`,
      [superAdminUserId]
    );

    // 3. Add user as facility admin (super admin)
    const adminResult = await client.query(
      `INSERT INTO facility_admins (user_id, facility_id, is_super_admin, status)
       VALUES ($1, $2, true, 'active')
       RETURNING id`,
      [superAdminUserId, facilityId]
    );

    // 4. Create facility membership for super admin
    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
       VALUES ($1, $2, 'admin', true, 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE SET is_facility_admin = true, membership_type = 'admin'`,
      [superAdminUserId, facilityId]
    );

    return {
      facility,
      adminId: adminResult.rows[0].id,
    };
  });
}

/**
 * Update facility information
 */
export async function updateFacility(
  facilityId: string,
  updates: Partial<FacilityCreateData>
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.name) {
    fields.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  if (updates.type) {
    fields.push(`type = $${paramCount++}`);
    values.push(updates.type);
  }
  if (updates.address) {
    fields.push(`address = $${paramCount++}`);
    values.push(updates.address);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(updates.phone);
  }
  if (updates.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(updates.email);
  }
  if (updates.contactName !== undefined) {
    fields.push(`contact_name = $${paramCount++}`);
    values.push(updates.contactName);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    values.push(updates.description);
  }
  if (updates.operatingHours) {
    fields.push(`operating_hours = $${paramCount++}`);
    values.push(JSON.stringify(updates.operatingHours));
  }
  if ((updates as any).timezone) {
    fields.push(`timezone = $${paramCount++}`);
    values.push((updates as any).timezone);
  }
  if (updates.generalRules !== undefined) {
    fields.push(`general_rules = $${paramCount++}`);
    values.push(updates.generalRules);
  }
  if (updates.cancellationPolicy !== undefined) {
    fields.push(`cancellation_policy = $${paramCount++}`);
    values.push(updates.cancellationPolicy);
  }
  if (updates.bookingRules !== undefined) {
    fields.push(`booking_rules = $${paramCount++}`);
    values.push(updates.bookingRules);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(facilityId);

  const result = await query(
    `UPDATE facilities
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING
       id, name, type, address, phone, email, contact_name as "contactName",
       description, operating_hours as "operatingHours", timezone,
       general_rules as "generalRules", cancellation_policy as "cancellationPolicy",
       booking_rules as "bookingRules", status, created_at as "createdAt"`,
    values
  );

  return result.rows[0];
}

/**
 * Create a facility rule
 */
export async function createFacilityRule(ruleData: FacilityRuleData): Promise<FacilityRule> {
  const result = await query(
    `INSERT INTO facility_rules (
      facility_id, rule_type, rule_name, rule_description, rule_config,
      applies_to_courts, created_by, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    RETURNING
      id, facility_id as "facilityId", rule_type as "ruleType",
      rule_name as "ruleName", rule_description as "ruleDescription",
      rule_config as "ruleConfig", is_active as "isActive",
      applies_to_courts as "appliesToCourts", created_by as "createdBy",
      created_at as "createdAt"`,
    [
      ruleData.facilityId,
      ruleData.ruleType,
      ruleData.ruleName,
      ruleData.ruleDescription || null,
      JSON.stringify(ruleData.ruleConfig),
      ruleData.appliesToCourts || null,
      ruleData.createdBy,
    ]
  );

  return result.rows[0];
}

/**
 * Get all rules for a facility
 */
export async function getFacilityRules(facilityId: string): Promise<FacilityRule[]> {
  const result = await query(
    `SELECT
      id, facility_id as "facilityId", rule_type as "ruleType",
      rule_name as "ruleName", rule_description as "ruleDescription",
      rule_config as "ruleConfig", is_active as "isActive",
      applies_to_courts as "appliesToCourts", created_by as "createdBy",
      created_at as "createdAt"
     FROM facility_rules
     WHERE facility_id = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [facilityId]
  );

  return result.rows;
}

/**
 * Update a facility rule
 */
export async function updateFacilityRule(
  ruleId: string,
  updates: Partial<Omit<FacilityRuleData, 'facilityId' | 'createdBy'>>
): Promise<FacilityRule> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.ruleName) {
    fields.push(`rule_name = $${paramCount++}`);
    values.push(updates.ruleName);
  }
  if (updates.ruleDescription !== undefined) {
    fields.push(`rule_description = $${paramCount++}`);
    values.push(updates.ruleDescription);
  }
  if (updates.ruleConfig) {
    fields.push(`rule_config = $${paramCount++}`);
    values.push(JSON.stringify(updates.ruleConfig));
  }
  if (updates.appliesToCourts !== undefined) {
    fields.push(`applies_to_courts = $${paramCount++}`);
    values.push(updates.appliesToCourts);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(ruleId);

  const result = await query(
    `UPDATE facility_rules
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING
       id, facility_id as "facilityId", rule_type as "ruleType",
       rule_name as "ruleName", rule_description as "ruleDescription",
       rule_config as "ruleConfig", is_active as "isActive",
       applies_to_courts as "appliesToCourts", created_by as "createdBy",
       created_at as "createdAt"`,
    values
  );

  return result.rows[0];
}

/**
 * Delete (deactivate) a facility rule
 */
export async function deleteFacilityRule(ruleId: string): Promise<void> {
  await query(
    `UPDATE facility_rules SET is_active = false WHERE id = $1`,
    [ruleId]
  );
}

/**
 * Upload HOA addresses for a facility
 */
export async function uploadHOAAddresses(
  facilityId: string,
  addresses: Array<{
    streetAddress: string;
    city?: string;
    state?: string;
    zipCode?: string;
    householdName?: string;
  }>,
  uploadedBy: string
): Promise<number> {
  return transaction(async (client: PoolClient) => {
    let insertedCount = 0;

    for (const address of addresses) {
      try {
        await client.query(
          `INSERT INTO hoa_addresses (
            facility_id, street_address, city, state, zip_code, household_name, uploaded_by, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
          ON CONFLICT (facility_id, street_address)
          DO UPDATE SET
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            zip_code = EXCLUDED.zip_code,
            household_name = EXCLUDED.household_name,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP`,
          [
            facilityId,
            address.streetAddress,
            address.city || null,
            address.state || null,
            address.zipCode || null,
            address.householdName || null,
            uploadedBy,
          ]
        );
        insertedCount++;
      } catch (error) {
        console.error('Error inserting HOA address:', error);
        // Continue with next address
      }
    }

    return insertedCount;
  });
}

/**
 * Get HOA addresses for a facility
 */
export async function getHOAAddresses(facilityId: string): Promise<any[]> {
  const result = await query(
    `SELECT
      id, facility_id as "facilityId", street_address as "streetAddress",
      city, state, zip_code as "zipCode", household_name as "householdName",
      is_active as "isActive", created_at as "createdAt"
     FROM hoa_addresses
     WHERE facility_id = $1 AND is_active = true
     ORDER BY street_address`,
    [facilityId]
  );

  return result.rows;
}

/**
 * Check if an address is valid for a facility
 */
export async function isValidHOAAddress(
  facilityId: string,
  streetAddress: string
): Promise<boolean> {
  const result = await query(
    `SELECT id FROM hoa_addresses
     WHERE facility_id = $1 AND street_address = $2 AND is_active = true
     LIMIT 1`,
    [facilityId, streetAddress]
  );

  return result.rows.length > 0;
}

/**
 * Get facility statistics
 */
export async function getFacilityStats(facilityId: string): Promise<any> {
  const result = await query(
    `SELECT
      (SELECT COUNT(*) FROM facility_memberships WHERE facility_id = $1 AND status = 'active') as "activeMemberCount",
      (SELECT COUNT(*) FROM courts WHERE facility_id = $1 AND status = 'available') as "availableCourtCount",
      (SELECT COUNT(*) FROM bookings WHERE facility_id = $1 AND status = 'confirmed' AND booking_date >= CURRENT_DATE) as "upcomingBookingsCount",
      (SELECT COUNT(*) FROM facility_admins WHERE facility_id = $1 AND status = 'active') as "adminCount"`,
    [facilityId]
  );

  return result.rows[0];
}

/**
 * Court creation data
 */
export interface CourtCreateData {
  name: string;
  courtNumber: number;
  surfaceType: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  courtType: 'Tennis' | 'Pickleball' | 'Dual';
  isIndoor: boolean;
  hasLights: boolean;
  canSplit?: boolean;
  splitConfig?: {
    splitNames: string[];
    splitType: 'Tennis' | 'Pickleball';
  };
}

/**
 * Facility contact data
 */
export interface FacilityContactData {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
}

/**
 * Full facility registration data
 */
export interface FacilityRegistrationData {
  // Super Admin Account (if creating new user)
  adminEmail?: string;
  adminPassword?: string;
  adminFullName?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminPhone?: string;
  adminStreetAddress?: string;
  adminCity?: string;
  adminState?: string;
  adminZipCode?: string;

  // Facility Information
  facilityName: string;
  facilityType: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  contactName: string;
  description?: string;
  facilityImage?: string;

  // Contacts
  primaryContact?: FacilityContactData;
  secondaryContacts?: FacilityContactData[];

  // Operating Hours
  operatingHours: Record<string, { open: string; close: string; closed?: boolean }>;

  // Facility Rules
  generalRules: string;

  // Restriction settings
  restrictionType: 'account' | 'address';
  maxBookingsPerWeek: number; // -1 means unlimited
  maxBookingDurationHours: number; // -1 means unlimited
  advanceBookingDays: number; // -1 means unlimited
  cancellationNoticeHours: number; // 0 means no notice required

  // Admin restrictions (optional)
  restrictionsApplyToAdmins?: boolean;
  adminRestrictions?: {
    maxBookingsPerWeek: number;
    maxBookingDurationHours: number;
    advanceBookingDays: number;
    cancellationNoticeHours: number;
  };

  // Peak hours policy (optional) - with per-day time slots
  peakHoursPolicy?: {
    enabled: boolean;
    applyToAdmins: boolean;
    timeSlots: Record<string, Array<{ id: string; startTime: string; endTime: string }>>; // e.g., { monday: [{id, startTime, endTime}], ... }
    maxBookingsPerWeek: number;
    maxDurationHours: number;
  };

  // Weekend policy (optional)
  weekendPolicy?: {
    enabled: boolean;
    applyToAdmins: boolean;
    maxBookingsPerWeekend: number;
    maxDurationHours: number;
    advanceBookingDays: number;
  };

  // Courts
  courts: CourtCreateData[];

  // Admin Invites (emails)
  adminInvites?: string[];

  // Address Whitelist
  hoaAddresses?: Array<{ streetAddress: string; city?: string; state?: string; zipCode?: string; householdName?: string }>;
  accountsPerAddress?: number;
}

/**
 * Register a new facility with super admin
 * Creates facility, courts, rules, and sets up admin user
 */
export async function registerFacility(
  data: FacilityRegistrationData,
  existingUserId?: string
): Promise<{ facility: any; user: any; courts: any[] }> {
  const bcrypt = await import('bcrypt');
  const SALT_ROUNDS = 10;

  return transaction(async (client: PoolClient) => {
    let superAdminUserId = existingUserId;
    let userResult: any = null;

    // 1. Create super admin user if credentials provided
    if (!existingUserId && data.adminEmail && data.adminPassword && data.adminFullName) {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [data.adminEmail.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.adminPassword, SALT_ROUNDS);

      // Split full name (use explicit first/last if provided)
      const firstName = data.adminFirstName || data.adminFullName!.trim().split(/\s+/)[0] || '';
      const lastName = data.adminLastName || data.adminFullName!.trim().split(/\s+/).slice(1).join(' ') || '';

      // Create user
      userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name, phone, street_address, city, state, zip_code, user_type, is_super_admin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'admin', true)
         RETURNING id, email, full_name as "fullName", first_name as "firstName", last_name as "lastName", user_type as "userType", is_super_admin as "isSuperAdmin", created_at as "createdAt"`,
        [data.adminEmail.toLowerCase(), passwordHash, data.adminFullName, firstName, lastName, data.adminPhone || null, data.adminStreetAddress || null, data.adminCity || null, data.adminState || null, data.adminZipCode || null]
      );

      superAdminUserId = userResult.rows[0].id;

      // Create user preferences
      await client.query(
        `INSERT INTO user_preferences (user_id, notifications, timezone, theme)
         VALUES ($1, true, 'America/New_York', 'light')`,
        [superAdminUserId]
      );
    } else if (existingUserId) {
      // Mark existing user as super admin
      await client.query(
        `UPDATE users SET user_type = 'admin', is_super_admin = true WHERE id = $1`,
        [existingUserId]
      );

      // Get existing user data
      userResult = await client.query(
        `SELECT id, email, full_name as "fullName", first_name as "firstName", last_name as "lastName",
         user_type as "userType", is_super_admin as "isSuperAdmin", created_at as "createdAt"
         FROM users WHERE id = $1`,
        [existingUserId]
      );
    }

    if (!superAdminUserId) {
      throw new Error('No admin user ID available');
    }

    // 2. Generate facility ID from name (slug format)
    const facilityId = data.facilityName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if facility ID already exists
    const existingFacility = await client.query(
      'SELECT id FROM facilities WHERE id = $1',
      [facilityId]
    );

    if (existingFacility.rows.length > 0) {
      throw new Error('A facility with a similar name already exists');
    }

    // 3. Create facility
    const facilityResult = await client.query(
      `INSERT INTO facilities (
        id, name, type, street_address, city, state, zip_code, address,
        phone, email, contact_name, description, operating_hours, timezone,
        general_rules, cancellation_policy, booking_rules, logo_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'active')
      RETURNING
        id, name, type, street_address as "streetAddress", city, state, zip_code as "zipCode",
        address, phone, email, contact_name as "contactName", description,
        operating_hours as "operatingHours", timezone, general_rules as "generalRules",
        cancellation_policy as "cancellationPolicy", booking_rules as "bookingRules",
        logo_url as "logoUrl", status, created_at as "createdAt"`,
      [
        facilityId,
        data.facilityName,
        data.facilityType,
        data.streetAddress,
        data.city,
        data.state,
        data.zipCode,
        `${data.streetAddress}, ${data.city}, ${data.state} ${data.zipCode}`, // Full address for legacy field
        data.phone,
        data.email,
        data.contactName,
        data.description || null,
        JSON.stringify(data.operatingHours),
        data.timezone || 'America/New_York',
        data.generalRules,
        data.cancellationPolicy || null,
        data.bookingRules || null,
        data.facilityImage || null,
      ]
    );

    const facility = facilityResult.rows[0];

    // 4. Add user as facility admin (super admin)
    await client.query(
      `INSERT INTO facility_admins (user_id, facility_id, is_super_admin, status, permissions)
       VALUES ($1, $2, true, 'active', '{"manage_courts": true, "manage_bookings": true, "manage_admins": true, "manage_bulletin": true, "manage_rules": true}'::jsonb)`,
      [superAdminUserId, facilityId]
    );

    // 5. Create facility membership for super admin
    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
       VALUES ($1, $2, 'admin', true, 'active', CURRENT_DATE)`,
      [superAdminUserId, facilityId]
    );

    // 6. Create facility rules
    // Main booking limit rule (for regular members)
    await client.query(
      `INSERT INTO facility_rules (facility_id, rule_type, rule_name, rule_description, rule_config, created_by)
       VALUES ($1, 'booking_limit', 'Default Booking Limits', 'Default booking limits for this facility', $2, $3)`,
      [
        facilityId,
        JSON.stringify({
          restriction_type: data.restrictionType || 'account',
          max_bookings_per_week: data.maxBookingsPerWeek,
          max_duration_hours: data.maxBookingDurationHours,
          advance_booking_days: data.advanceBookingDays,
          cancellation_notice_hours: data.cancellationNoticeHours,
          applies_to_admins: data.restrictionsApplyToAdmins !== false,
        }),
        superAdminUserId,
      ]
    );

    // Admin-specific restrictions (if different from regular members)
    if (data.restrictionsApplyToAdmins === false && data.adminRestrictions) {
      await client.query(
        `INSERT INTO facility_rules (facility_id, rule_type, rule_name, rule_description, rule_config, created_by)
         VALUES ($1, 'admin_booking_limit', 'Admin Booking Limits', 'Booking limits for facility administrators', $2, $3)`,
        [
          facilityId,
          JSON.stringify({
            max_bookings_per_week: data.adminRestrictions.maxBookingsPerWeek,
            max_duration_hours: data.adminRestrictions.maxBookingDurationHours,
            advance_booking_days: data.adminRestrictions.advanceBookingDays,
            cancellation_notice_hours: data.adminRestrictions.cancellationNoticeHours,
          }),
          superAdminUserId,
        ]
      );
    }

    // Peak hours policy - with per-day time slots
    if (data.peakHoursPolicy?.enabled) {
      // Convert timeSlots to a cleaner format for storage (remove client-side IDs)
      const cleanedTimeSlots: Record<string, Array<{ startTime: string; endTime: string }>> = {};
      for (const [day, slots] of Object.entries(data.peakHoursPolicy.timeSlots || {})) {
        if (slots && slots.length > 0) {
          cleanedTimeSlots[day] = slots.map(slot => ({
            startTime: slot.startTime,
            endTime: slot.endTime
          }));
        }
      }

      await client.query(
        `INSERT INTO facility_rules (facility_id, rule_type, rule_name, rule_description, rule_config, created_by)
         VALUES ($1, 'peak_hours', 'Peak Hours Restrictions', 'Special restrictions during peak hours', $2, $3)`,
        [
          facilityId,
          JSON.stringify({
            apply_to_admins: data.peakHoursPolicy.applyToAdmins !== false,
            time_slots: cleanedTimeSlots, // Per-day time slots
            max_bookings_per_week: data.peakHoursPolicy.maxBookingsPerWeek,
            max_duration_hours: data.peakHoursPolicy.maxDurationHours,
          }),
          superAdminUserId,
        ]
      );
    }

    // Weekend policy
    if (data.weekendPolicy?.enabled) {
      await client.query(
        `INSERT INTO facility_rules (facility_id, rule_type, rule_name, rule_description, rule_config, created_by)
         VALUES ($1, 'weekend_policy', 'Weekend Restrictions', 'Special restrictions for weekends', $2, $3)`,
        [
          facilityId,
          JSON.stringify({
            apply_to_admins: data.weekendPolicy.applyToAdmins !== false,
            max_bookings_per_weekend: data.weekendPolicy.maxBookingsPerWeekend,
            max_duration_hours: data.weekendPolicy.maxDurationHours,
            advance_booking_days: data.weekendPolicy.advanceBookingDays,
          }),
          superAdminUserId,
        ]
      );
    }

    // 6b. Save rules engine configs (facility_rule_configs table)
    if (data.ruleConfigs && Array.isArray(data.ruleConfigs)) {
      try {
        for (const rule of data.ruleConfigs) {
          const defResult = await client.query(
            'SELECT id FROM booking_rule_definitions WHERE rule_code = $1',
            [rule.ruleCode]
          );
          if (defResult.rows.length > 0) {
            await client.query(
              `INSERT INTO facility_rule_configs (facility_id, rule_definition_id, rule_config, is_enabled, created_by)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (facility_id, rule_definition_id) DO UPDATE SET
                 rule_config = EXCLUDED.rule_config, is_enabled = EXCLUDED.is_enabled, updated_at = CURRENT_TIMESTAMP`,
              [facilityId, defResult.rows[0].id, JSON.stringify(rule.ruleConfig), rule.isEnabled, superAdminUserId]
            );
          }
        }
      } catch (ruleConfigError) {
        // Non-fatal: rules engine tables may not exist if migration 007 hasn't been applied
        console.warn('Could not save rule engine configs (tables may not exist yet):', ruleConfigError);
      }
    }

    // 7. Create courts
    const createdCourts: any[] = [];

    for (const court of data.courts) {
      const courtResult = await client.query(
        `INSERT INTO courts (
          facility_id, name, court_number, surface_type, court_type,
          is_indoor, has_lights, status, is_split_court, split_configuration
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8, $9)
        RETURNING
          id, facility_id as "facilityId", name, court_number as "courtNumber",
          surface_type as "surfaceType", court_type as "courtType",
          is_indoor as "isIndoor", has_lights as "hasLights", status,
          is_split_court as "isSplitCourt", split_configuration as "splitConfiguration"`,
        [
          facilityId,
          court.name,
          court.courtNumber,
          court.surfaceType,
          court.courtType,
          court.isIndoor,
          court.hasLights,
          court.canSplit || false,
          court.splitConfig ? JSON.stringify(court.splitConfig) : null,
        ]
      );

      const createdCourt = courtResult.rows[0];
      createdCourts.push(createdCourt);

      // If court can split, create child courts
      if (court.canSplit && court.splitConfig?.splitNames && court.splitConfig.splitNames.length > 0) {
        for (let i = 0; i < court.splitConfig.splitNames.length; i++) {
          const splitName = court.splitConfig.splitNames[i];
          await client.query(
            `INSERT INTO courts (
              facility_id, name, court_number, surface_type, court_type,
              is_indoor, has_lights, status, parent_court_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8)`,
            [
              facilityId,
              `Court ${splitName}`,
              court.courtNumber * 100 + (i + 1), // e.g., Court 3a = 301, 3b = 302
              court.surfaceType,
              court.splitConfig.splitType,
              court.isIndoor,
              court.hasLights,
              createdCourt.id,
            ]
          );
        }
      }
    }

    // 8. Store facility contacts
    // First, add primary contact
    if (data.primaryContact || data.contactName) {
      const primaryName = data.primaryContact?.name || data.contactName;
      const primaryEmail = data.primaryContact?.email || data.email;
      const primaryPhone = data.primaryContact?.phone || data.phone;

      if (primaryName) {
        await client.query(
          `INSERT INTO facility_contacts (facility_id, name, email, phone, is_primary, role)
           VALUES ($1, $2, $3, $4, true, 'Primary Contact')`,
          [facilityId, primaryName, primaryEmail || null, primaryPhone || null]
        );
      }
    }

    // Add secondary contacts
    if (data.secondaryContacts && data.secondaryContacts.length > 0) {
      for (const contact of data.secondaryContacts) {
        if (contact.name && contact.name.trim()) {
          await client.query(
            `INSERT INTO facility_contacts (facility_id, name, email, phone, is_primary, role)
             VALUES ($1, $2, $3, $4, false, $5)`,
            [
              facilityId,
              contact.name.trim(),
              contact.email?.trim() || null,
              contact.phone?.trim() || null,
              contact.role?.trim() || null
            ]
          );
        }
      }
    }

    // 9. Store admin invitations and send invite emails
    if (data.adminInvites && data.adminInvites.length > 0) {
      const inviterName = data.adminFullName || 'A facility administrator';
      for (const inviteEmail of data.adminInvites) {
        if (inviteEmail && inviteEmail.trim()) {
          await client.query(
            `INSERT INTO facility_admins (facility_id, invitation_email, invited_by, invitation_sent_at, status, is_super_admin)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'pending', false)`,
            [facilityId, inviteEmail.trim().toLowerCase(), superAdminUserId]
          );
          // Send invite email (fire-and-forget, don't block registration)
          sendAdminInviteEmail(inviteEmail.trim().toLowerCase(), data.facilityName, inviterName).catch(err => {
            console.error(`Failed to send invite email to ${inviteEmail}:`, err);
          });
        }
      }
    }

    // 10. Insert addresses into address_whitelist
    if (data.hoaAddresses && data.hoaAddresses.length > 0) {
      const defaultLimit = data.accountsPerAddress || 4;
      for (const addr of data.hoaAddresses) {
        if (addr.streetAddress?.trim()) {
          // Build full address string for the whitelist table
          const parts = [addr.streetAddress.trim()];
          if (addr.city?.trim()) parts.push(addr.city.trim());
          if (addr.state?.trim()) parts.push(addr.state.trim());
          if (addr.zipCode?.trim()) parts.push(addr.zipCode.trim());
          const fullAddress = parts.join(', ');

          await client.query(
            `INSERT INTO address_whitelist (facility_id, address, accounts_limit)
             VALUES ($1, $2, $3)
             ON CONFLICT (facility_id, address) DO NOTHING`,
            [facilityId, fullAddress, defaultLimit]
          );
        }
      }
    }

    // Get user data with memberFacilities
    const userData = userResult ? userResult.rows[0] : null;
    if (userData) {
      userData.memberFacilities = [facilityId];
      userData.userType = 'admin';
    }

    return {
      facility,
      user: userData,
      courts: createdCourts,
    };
  });
}
