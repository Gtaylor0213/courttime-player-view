/**
 * CourtTime-Pickle org / franchise service.
 * Isolated from classic facility registration — do not modify facilityService.registerFacility.
 */

import crypto from 'crypto';
import { query, transaction } from '../../database/connection';
import type { PoolClient } from 'pg';
import { PRODUCT_LINE_PICKLE } from '../../../shared/constants/productLine';
import { isFacilityAdmin } from '../memberService';

const INVITE_EXPIRY_DAYS = 14;
const RESEND_API_URL = 'https://api.resend.com/emails';

export interface OrgAdminOrg {
  orgId: string;
  orgName: string;
  role: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function uniqueSuffix(): string {
  return crypto.randomBytes(3).toString('hex');
}

const DEFAULT_OPERATING_HOURS = {
  monday: { open: '06:00', close: '22:00', closed: false },
  tuesday: { open: '06:00', close: '22:00', closed: false },
  wednesday: { open: '06:00', close: '22:00', closed: false },
  thursday: { open: '06:00', close: '22:00', closed: false },
  friday: { open: '06:00', close: '22:00', closed: false },
  saturday: { open: '07:00', close: '21:00', closed: false },
  sunday: { open: '07:00', close: '21:00', closed: false },
};

export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM org_admins
     WHERE user_id = $1 AND org_id = $2 AND status = 'active'
     LIMIT 1`,
    [userId, orgId]
  );
  return result.rows.length > 0;
}

export async function getOrgAdminOrgs(userId: string): Promise<OrgAdminOrg[]> {
  const result = await query(
    `SELECT oa.org_id as "orgId", fo.name as "orgName", oa.role
     FROM org_admins oa
     JOIN franchise_organizations fo ON fo.id = oa.org_id
     WHERE oa.user_id = $1 AND oa.status = 'active'`,
    [userId]
  );
  return result.rows;
}

export interface RegisterOrgInput {
  orgName: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  adminPhone?: string;
}

export async function registerOrganization(
  input: RegisterOrgInput
): Promise<{ org: { id: string; name: string; slug: string }; user: Record<string, unknown> }> {
  const bcrypt = await import('bcrypt');
  const SALT_ROUNDS = 10;

  return transaction(async (client: PoolClient) => {
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [
      input.adminEmail.toLowerCase(),
    ]);
    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    const baseSlug = slugify(input.orgName) || 'pickle-org';
    let orgId = baseSlug;
    let attempt = 0;
    while (attempt < 10) {
      const exists = await client.query('SELECT id FROM franchise_organizations WHERE id = $1', [orgId]);
      if (exists.rows.length === 0) break;
      orgId = `${baseSlug}-${uniqueSuffix()}`;
      attempt += 1;
    }

    const passwordHash = await bcrypt.hash(input.adminPassword, SALT_ROUNDS);
    const nameParts = input.adminFullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, first_name, last_name, phone, user_type, is_super_admin)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin', false)
       RETURNING id, email, full_name as "fullName", first_name as "firstName", last_name as "lastName",
         user_type as "userType", created_at as "createdAt"`,
      [
        input.adminEmail.toLowerCase(),
        passwordHash,
        input.adminFullName,
        firstName,
        lastName,
        input.adminPhone || null,
      ]
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO user_preferences (user_id, notifications, timezone, theme)
       VALUES ($1, true, 'America/New_York', 'light')`,
      [user.id]
    );

    const orgResult = await client.query(
      `INSERT INTO franchise_organizations (id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [orgId, input.orgName, orgId]
    );

    await client.query(
      `INSERT INTO org_admins (user_id, org_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [user.id, orgId]
    );

    await client.query('SELECT seed_pickle_membership_products($1)', [orgId]);

    return { org: orgResult.rows[0], user };
  });
}

export async function createLocationInvite(params: {
  orgId: string;
  inviteEmail: string;
  locationName?: string;
  invitedByUserId: string;
}): Promise<{ inviteId: string; token: string; inviteUrl: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  const result = await query(
    `INSERT INTO org_location_invites (org_id, token, invite_email, location_name, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.orgId,
      token,
      params.inviteEmail.toLowerCase().trim(),
      params.locationName || null,
      params.invitedByUserId,
      expiresAt.toISOString(),
    ]
  );

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const inviteUrl = `${appUrl}/register/pickle/location?invite=${encodeURIComponent(token)}`;

  await sendLocationInviteEmail({
    email: params.inviteEmail,
    orgName: await getOrgName(params.orgId),
    locationName: params.locationName,
    inviteUrl,
  });

  return { inviteId: result.rows[0].id, token, inviteUrl };
}

async function getOrgName(orgId: string): Promise<string> {
  const result = await query('SELECT name FROM franchise_organizations WHERE id = $1', [orgId]);
  return result.rows[0]?.name || 'your franchise brand';
}

async function sendLocationInviteEmail(params: {
  email: string;
  orgName: string;
  locationName?: string;
  inviteUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[PICKLE] RESEND_API_KEY not set — skipping location invite email');
    return;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CourtTime <onboarding@resend.dev>';
  const locationLabel = params.locationName ? ` for <strong>${params.locationName}</strong>` : '';

  try {
    await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.email],
        subject: `You're invited to join ${params.orgName} on CourtTime-Pickle`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #15803d;">CourtTime-Pickle Franchise Invitation</h2>
            <p>You've been invited to set up a franchise location${locationLabel} under <strong>${params.orgName}</strong>.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${params.inviteUrl}"
                 style="background-color: #15803d; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Set Up Your Location
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link expires in ${INVITE_EXPIRY_DAYS} days.</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error('[PICKLE] Failed to send location invite email:', err);
  }
}

export interface LocationInviteDetails {
  valid: true;
  orgId: string;
  orgName: string;
  inviteEmail: string;
  locationName?: string;
}

export interface LocationInviteInvalid {
  valid: false;
  error: string;
}

export type LocationInviteValidation = LocationInviteDetails | LocationInviteInvalid;

export async function validateLocationInvite(token: string): Promise<LocationInviteValidation> {
  const result = await query(
    `SELECT i.org_id as "orgId", fo.name as "orgName", i.invite_email as "inviteEmail",
            i.location_name as "locationName", i.status, i.expires_at as "expiresAt"
     FROM org_location_invites i
     JOIN franchise_organizations fo ON fo.id = i.org_id
     WHERE i.token = $1`,
    [token]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'This invitation link is invalid' };
  }

  const row = result.rows[0];
  if (row.status !== 'pending') {
    return { valid: false, error: 'This invitation has already been used or revoked' };
  }
  if (new Date(row.expiresAt) < new Date()) {
    return { valid: false, error: 'This invitation has expired' };
  }

  return {
    valid: true,
    orgId: row.orgId,
    orgName: row.orgName,
    inviteEmail: row.inviteEmail,
    locationName: row.locationName || undefined,
  };
}

export interface ProvisionLocationInput {
  inviteToken: string;
  facilityName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  email?: string;
  courtCount: number;
  adminEmail: string;
  adminPassword?: string;
  adminFullName?: string;
  existingUserId?: string;
}

export async function provisionLocationFromInvite(
  input: ProvisionLocationInput
): Promise<{ facility: Record<string, unknown>; user: Record<string, unknown> }> {
  const validation = await validateLocationInvite(input.inviteToken);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (input.adminEmail.toLowerCase() !== validation.inviteEmail.toLowerCase()) {
    throw new Error('Email must match the invitation');
  }

  const bcrypt = await import('bcrypt');
  const SALT_ROUNDS = 10;

  return transaction(async (client: PoolClient) => {
    let userId = input.existingUserId;
    let userRow: Record<string, unknown>;

    if (!userId) {
      if (!input.adminPassword || !input.adminFullName) {
        throw new Error('Password and full name are required for new accounts');
      }

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [
        input.adminEmail.toLowerCase(),
      ]);
      if (existing.rows.length > 0) {
        throw new Error('An account with this email already exists. Please log in first.');
      }

      const passwordHash = await bcrypt.hash(input.adminPassword, SALT_ROUNDS);
      const nameParts = input.adminFullName.trim().split(/\s+/);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type)
         VALUES ($1, $2, $3, $4, $5, 'admin')
         RETURNING id, email, full_name as "fullName", user_type as "userType"`,
        [
          input.adminEmail.toLowerCase(),
          passwordHash,
          input.adminFullName,
          nameParts[0] || '',
          nameParts.slice(1).join(' ') || '',
        ]
      );
      userRow = userResult.rows[0];
      userId = userRow.id as string;

      await client.query(
        `INSERT INTO user_preferences (user_id, notifications, timezone, theme)
         VALUES ($1, true, 'America/New_York', 'light')`,
        [userId]
      );
    } else {
      const userResult = await client.query(
        `SELECT id, email, full_name as "fullName", user_type as "userType"
         FROM users WHERE id = $1`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      userRow = userResult.rows[0];
      if ((userRow.email as string).toLowerCase() !== validation.inviteEmail.toLowerCase()) {
        throw new Error('Logged-in email does not match invitation');
      }
    }

    let facilityId = slugify(input.facilityName) || `location-${uniqueSuffix()}`;
    let attempt = 0;
    while (attempt < 10) {
      const exists = await client.query('SELECT id FROM facilities WHERE id = $1', [facilityId]);
      if (exists.rows.length === 0) break;
      facilityId = `${slugify(input.facilityName)}-${uniqueSuffix()}`;
      attempt += 1;
    }

    const fullAddress = `${input.streetAddress}, ${input.city}, ${input.state} ${input.zipCode}`;

    const facilityResult = await client.query(
      `INSERT INTO facilities (
        id, name, type, street_address, city, state, zip_code, address,
        phone, email, operating_hours, timezone, status, org_id, product_line
      ) VALUES ($1, $2, 'Pickleball Club', $3, $4, $5, $6, $7, $8, $9, $10, 'America/New_York', 'active', $11, $12)
      RETURNING id, name, org_id as "orgId", product_line as "productLine"`,
      [
        facilityId,
        input.facilityName,
        input.streetAddress,
        input.city,
        input.state,
        input.zipCode,
        fullAddress,
        input.phone || null,
        input.email || input.adminEmail.toLowerCase(),
        JSON.stringify(DEFAULT_OPERATING_HOURS),
        validation.orgId,
        PRODUCT_LINE_PICKLE,
      ]
    );

    const courtCount = Math.max(1, Math.min(30, input.courtCount || 4));
    for (let i = 1; i <= courtCount; i += 1) {
      await client.query(
        `INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights, status)
         VALUES ($1, $2, $3, 'Synthetic', 'Pickleball', true, true, 'available')`,
        [facilityId, `Court ${i}`, i]
      );
    }

    await client.query(
      `INSERT INTO facility_admins (user_id, facility_id, is_super_admin, status, invitation_accepted_at)
       VALUES ($1, $2, true, 'active', CURRENT_TIMESTAMP)`,
      [userId, facilityId]
    );

    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
       VALUES ($1, $2, 'admin', true, 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE SET
         membership_type = 'admin', is_facility_admin = true, status = 'active'`,
      [userId, facilityId]
    );

    await client.query(
      `UPDATE org_location_invites
       SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, facility_id = $2
       WHERE token = $1`,
      [input.inviteToken, facilityId]
    );

    return { facility: facilityResult.rows[0], user: userRow };
  });
}

async function rolloutAllProductsAtFacility(
  orgId: string,
  facilityId: string,
  client: PoolClient
): Promise<void> {
  const products = await client.query(
    `SELECT id FROM org_membership_products WHERE org_id = $1 AND is_active = true`,
    [orgId]
  );
  for (const row of products.rows) {
    await client.query(
      `INSERT INTO org_product_rollouts (org_id, product_id, facility_id, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (org_id, product_id, facility_id) DO UPDATE SET enabled = true, updated_at = NOW()`,
      [orgId, row.id, facilityId]
    );
  }
}

export async function listOrgLocations(orgId: string) {
  const result = await query(
    `SELECT f.id, f.name, f.city, f.state, f.street_address as "streetAddress",
            f.setup_status as "setupStatusRaw",
            p.setup_mode as "setupMode",
            COALESCE(f.stripe_onboarded, false) as "stripeOnboarded",
            f.stripe_account_id as "stripeAccountId",
            (SELECT COUNT(*)::int FROM courts c WHERE c.facility_id = f.id) as "courtCount",
            (SELECT COUNT(*)::int FROM facility_memberships fm
             WHERE fm.facility_id = f.id AND fm.status = 'active') as "memberCount"
     FROM facilities f
     LEFT JOIN org_location_provisions p ON p.facility_id = f.id
     WHERE f.org_id = $1 AND f.product_line = 'pickle'
     ORDER BY f.name`,
    [orgId]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    ...row,
    setupStatus: mapSetupStatusForUi(row.setupStatusRaw as string),
  }));
}

function mapSetupStatusForUi(dbStatus: string | null | undefined): 'pending' | 'complete' {
  if (dbStatus === 'complete') return 'complete';
  return 'pending';
}

export interface CorporateProvisionInput {
  setupMode: 'complete' | 'quick';
  facilityName: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  courtCount?: number;
  operatorEmail: string;
  operatorFullName: string;
  operatorPassword: string;
}

export interface CorporateProvisionResult {
  facility: { id: string; name: string; setupStatus: string };
  operator: { id: string; email: string; fullName: string };
  loginUrl: string;
  operatorEmail: string;
  operatorPassword: string;
}

async function sendFranchiseWelcomeEmail(params: {
  email: string;
  operatorName: string;
  facilityName: string;
  orgName: string;
  loginUrl: string;
  setupMode: 'complete' | 'quick';
  password?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[PICKLE] RESEND_API_KEY not set — skipping franchise welcome email');
    return false;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CourtTime <onboarding@resend.dev>';
  const setupNote =
    params.setupMode === 'quick'
      ? '<p>When you sign in, you will be guided through completing your location setup (address, courts, and hours).</p>'
      : '';
  const passwordBlock = params.password
    ? `<p><strong>Email:</strong> ${params.email}<br/><strong>Temporary password:</strong> ${params.password}</p>
         <p style="color: #666; font-size: 14px;">Please change your password after your first login.</p>`
    : '<p>Use the email and password provided by your corporate administrator to sign in.</p>';

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.email],
        subject: `Welcome to ${params.facilityName} on CourtTime-Pickle`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #15803d;">Welcome to CourtTime-Pickle</h2>
            <p>Hi ${params.operatorName},</p>
            <p>You have been set up as the operator for <strong>${params.facilityName}</strong> under <strong>${params.orgName}</strong>.</p>
            ${passwordBlock}
            ${setupNote}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${params.loginUrl}"
                 style="background-color: #15803d; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Sign In
              </a>
            </div>
          </div>
        `,
      }),
    });
    return response.ok;
  } catch (err) {
    console.error('[PICKLE] Failed to send franchise welcome email:', err);
    return false;
  }
}

async function generateUniqueFacilityId(client: PoolClient, name: string): Promise<string> {
  let facilityId = slugify(name) || `location-${uniqueSuffix()}`;
  let attempt = 0;
  while (attempt < 10) {
    const exists = await client.query('SELECT id FROM facilities WHERE id = $1', [facilityId]);
    if (exists.rows.length === 0) break;
    facilityId = `${slugify(name) || 'location'}-${uniqueSuffix()}`;
    attempt += 1;
  }
  return facilityId;
}

async function insertCourts(
  client: PoolClient,
  facilityId: string,
  courtCount: number
): Promise<void> {
  const count = Math.max(1, Math.min(30, courtCount || 4));
  for (let i = 1; i <= count; i += 1) {
    await client.query(
      `INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights, status)
       VALUES ($1, $2, $3, 'Synthetic', 'Pickleball', true, true, 'available')`,
      [facilityId, `Court ${i}`, i]
    );
  }
}

export async function provisionCorporateLocation(
  orgId: string,
  createdByUserId: string,
  input: CorporateProvisionInput
): Promise<CorporateProvisionResult> {
  const admin = await isOrgAdmin(createdByUserId, orgId);
  if (!admin) {
    throw new Error('Not authorized for this organization');
  }

  if (!input.facilityName?.trim()) {
    throw new Error('Location name is required');
  }
  if (!input.operatorEmail?.trim() || !input.operatorFullName?.trim()) {
    throw new Error('Operator email and full name are required');
  }
  if (!input.operatorPassword || input.operatorPassword.length < 8) {
    throw new Error('Operator password must be at least 8 characters');
  }
  if (input.setupMode === 'complete') {
    if (!input.streetAddress?.trim() || !input.city?.trim() || !input.state || !input.zipCode?.trim()) {
      throw new Error('Complete setup requires full address');
    }
  }

  const bcrypt = await import('bcrypt');
  const SALT_ROUNDS = 10;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const loginUrl = `${appUrl}/login`;
  const orgName = await getOrgName(orgId);

  const result = await transaction(async (client: PoolClient) => {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [
      input.operatorEmail.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      throw new Error('An account with this operator email already exists');
    }

    const facilityId = await generateUniqueFacilityId(client, input.facilityName);
    const isComplete = input.setupMode === 'complete';
    const setupStatus = isComplete ? 'complete' : 'pending_setup';

    const streetAddress = isComplete ? input.streetAddress!.trim() : 'Pending setup';
    const city = isComplete ? input.city!.trim() : 'Pending';
    const state = isComplete ? input.state! : 'NY';
    const zipCode = isComplete ? input.zipCode!.trim() : '00000';
    const fullAddress = isComplete
      ? `${streetAddress}, ${city}, ${state} ${zipCode}`
      : 'Pending setup';

    const facilityResult = await client.query(
      `INSERT INTO facilities (
        id, name, type, street_address, city, state, zip_code, address,
        phone, email, operating_hours, timezone, status, org_id, product_line, setup_status
      ) VALUES ($1, $2, 'Pickleball Club', $3, $4, $5, $6, $7, $8, $9, $10, 'America/New_York', 'active', $11, $12, $13)
      RETURNING id, name, setup_status as "setupStatus"`,
      [
        facilityId,
        input.facilityName.trim(),
        streetAddress,
        city,
        state,
        zipCode,
        fullAddress,
        input.phone?.trim() || null,
        input.operatorEmail.toLowerCase().trim(),
        JSON.stringify(DEFAULT_OPERATING_HOURS),
        orgId,
        PRODUCT_LINE_PICKLE,
        setupStatus,
      ]
    );

    const passwordHash = await bcrypt.hash(input.operatorPassword, SALT_ROUNDS);
    const nameParts = input.operatorFullName.trim().split(/\s+/);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       RETURNING id, email, full_name as "fullName"`,
      [
        input.operatorEmail.toLowerCase().trim(),
        passwordHash,
        input.operatorFullName.trim(),
        nameParts[0] || '',
        nameParts.slice(1).join(' ') || '',
      ]
    );
    const operator = userResult.rows[0];

    await client.query(
      `INSERT INTO user_preferences (user_id, notifications, timezone, theme)
       VALUES ($1, true, 'America/New_York', 'light')`,
      [operator.id]
    );

    await client.query(
      `INSERT INTO facility_admins (user_id, facility_id, is_super_admin, status, invitation_accepted_at)
       VALUES ($1, $2, true, 'active', CURRENT_TIMESTAMP)`,
      [operator.id, facilityId]
    );

    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, is_facility_admin, status, start_date)
       VALUES ($1, $2, 'admin', true, 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE SET
         membership_type = 'admin', is_facility_admin = true, status = 'active'`,
      [operator.id, facilityId]
    );

    const provisionResult = await client.query(
      `INSERT INTO org_location_provisions (org_id, facility_id, operator_user_id, setup_mode, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [orgId, facilityId, operator.id, input.setupMode, createdByUserId]
    );

    if (isComplete) {
      await insertCourts(client, facilityId, input.courtCount || 8);
    }

    await client.query('SELECT seed_pickle_membership_products($1)', [orgId]);
    await rolloutAllProductsAtFacility(orgId, facilityId, client);

    return {
      facility: facilityResult.rows[0],
      operator,
      provisionId: provisionResult.rows[0].id as string,
    };
  });

  const emailSent = await sendFranchiseWelcomeEmail({
    email: result.operator.email as string,
    operatorName: result.operator.fullName as string,
    facilityName: result.facility.name as string,
    orgName,
    loginUrl,
    setupMode: input.setupMode,
    password: input.operatorPassword,
  });

  if (emailSent) {
    await query(
      `UPDATE org_location_provisions SET welcome_sent_at = NOW() WHERE facility_id = $1`,
      [result.facility.id]
    );
  }

  return {
    facility: {
      id: result.facility.id as string,
      name: result.facility.name as string,
      setupStatus: result.facility.setupStatus as string,
    },
    operator: {
      id: result.operator.id as string,
      email: result.operator.email as string,
      fullName: result.operator.fullName as string,
    },
    loginUrl,
    operatorEmail: result.operator.email as string,
    operatorPassword: input.operatorPassword,
  };
}

export async function getCorporateLocationDetail(orgId: string, facilityId: string) {
  const result = await query(
    `SELECT f.id, f.name,
            f.street_address as "streetAddress", f.city, f.state, f.zip_code as "zipCode",
            f.phone, f.setup_status as "setupStatusRaw",
            p.setup_mode as "setupMode", p.welcome_sent_at as "welcomeSentAt",
            COALESCE(f.stripe_onboarded, false) as "stripeOnboarded",
            (SELECT COUNT(*)::int FROM courts c WHERE c.facility_id = f.id) as "courtCount",
            (SELECT COUNT(*)::int FROM facility_memberships fm
             WHERE fm.facility_id = f.id AND fm.status = 'active') as "memberCount",
            u.email as "operatorEmail", u.full_name as "operatorFullName",
            p.welcome_sent_at as "operatorWelcomeSentAt"
     FROM facilities f
     LEFT JOIN org_location_provisions p ON p.facility_id = f.id
     LEFT JOIN facility_admins fa ON fa.facility_id = f.id AND fa.status = 'active' AND fa.is_super_admin = true
     LEFT JOIN users u ON u.id = fa.user_id
     WHERE f.id = $1 AND f.org_id = $2 AND f.product_line = 'pickle'`,
    [facilityId, orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    setupMode: row.setupMode,
    setupStatus: mapSetupStatusForUi(row.setupStatusRaw),
    streetAddress: row.streetAddress,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    phone: row.phone,
    courtCount: row.courtCount,
    memberCount: row.memberCount,
    stripeOnboarded: row.stripeOnboarded,
    operator: row.operatorEmail
      ? {
          email: row.operatorEmail,
          fullName: row.operatorFullName,
          welcomeSentAt: row.operatorWelcomeSentAt,
        }
      : undefined,
  };
}

export async function resendLocationWelcome(orgId: string, facilityId: string): Promise<void> {
  const detail = await getCorporateLocationDetail(orgId, facilityId);
  if (!detail?.operator?.email) {
    throw new Error('Location or operator not found');
  }

  const orgName = await getOrgName(orgId);
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const loginUrl = `${appUrl}/login`;

  const emailSent = await sendFranchiseWelcomeEmail({
    email: detail.operator.email,
    operatorName: detail.operator.fullName || detail.operator.email,
    facilityName: detail.name,
    orgName,
    loginUrl,
    setupMode: (detail.setupMode as 'complete' | 'quick') || 'complete',
  });

  if (!emailSent) {
    throw new Error('Failed to send welcome email');
  }

  await query(
    `UPDATE org_location_provisions SET welcome_sent_at = NOW() WHERE facility_id = $1`,
    [facilityId]
  );
}

export async function getOrgDashboard(orgId: string) {
  const locations = await listOrgLocations(orgId);

  const locationIds = locations.map((l: { id: string }) => l.id);
  if (locationIds.length === 0) {
    return {
      locationCount: 0,
      totalMembers: 0,
      bookingsThisMonth: 0,
      revenueCentsThisMonth: 0,
      locations: [],
    };
  }

  const statsResult = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM facility_memberships fm
        WHERE fm.facility_id = ANY($1::varchar[]) AND fm.status = 'active') as total_members,
       (SELECT COUNT(*)::int FROM bookings b
        WHERE b.facility_id = ANY($1::varchar[])
          AND b.booking_date >= DATE_TRUNC('month', CURRENT_DATE)
          AND b.status NOT IN ('cancelled')) as bookings_this_month,
       (SELECT COALESCE(SUM(amount_cents), 0)::int FROM facility_revenue_log rl
        WHERE rl.facility_id = ANY($1::varchar[])
          AND rl.paid_at >= DATE_TRUNC('month', CURRENT_DATE)) as revenue_cents`,
    [locationIds]
  );

  const stats = statsResult.rows[0];

  return {
    locationCount: locations.length,
    totalMembers: stats.total_members,
    bookingsThisMonth: stats.bookings_this_month,
    revenueCentsThisMonth: stats.revenue_cents,
    locations,
  };
}

export async function listOrgInvites(orgId: string) {
  const result = await query(
    `SELECT id, invite_email as "inviteEmail", location_name as "locationName",
            status, expires_at as "expiresAt", accepted_at as "acceptedAt",
            facility_id as "facilityId", created_at as "createdAt"
     FROM org_location_invites
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [orgId]
  );
  return result.rows;
}

export interface FacilitySummary {
  id: string;
  name: string;
  productLine: string;
  setupStatus: string;
  orgId: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  operatingHours?: Record<string, unknown> | null;
  stripeOnboarded: boolean;
  courtCount: number;
  memberCount: number;
}

export async function getFacilitySummary(facilityId: string): Promise<FacilitySummary | null> {
  const result = await query(
    `SELECT f.id, f.name, f.product_line as "productLine",
            f.setup_status as "setupStatus",
            f.org_id as "orgId",
            f.street_address as "streetAddress", f.city, f.state, f.zip_code as "zipCode",
            f.phone, f.operating_hours as "operatingHours",
            COALESCE(f.stripe_onboarded, false) as "stripeOnboarded",
            (SELECT COUNT(*)::int FROM courts c WHERE c.facility_id = f.id) as "courtCount",
            (SELECT COUNT(*)::int FROM facility_memberships fm
             WHERE fm.facility_id = f.id AND fm.status = 'active') as "memberCount"
     FROM facilities f
     WHERE f.id = $1`,
    [facilityId]
  );
  return result.rows[0] || null;
}

export interface CompleteFranchiseSetupInput {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  courtCount: number;
  operatingHours: Record<string, { open: string; close: string; closed?: boolean }>;
}

export async function completeFranchiseSetup(
  facilityId: string,
  userId: string,
  input: CompleteFranchiseSetupInput
): Promise<{ facilityId: string; setupStatus: string }> {
  const admin = await isFacilityAdmin(facilityId, userId);
  if (!admin) {
    throw new Error('Not authorized for this location');
  }

  const facility = await getFacilitySummary(facilityId);
  if (!facility) {
    throw new Error('Facility not found');
  }
  if (facility.productLine !== PRODUCT_LINE_PICKLE) {
    throw new Error('Not a CourtTime-Pickle franchise location');
  }
  if (facility.setupStatus !== 'pending_setup') {
    throw new Error('Location setup is already complete');
  }

  const courtCount = Math.max(1, Math.min(30, input.courtCount || 4));
  const fullAddress = `${input.streetAddress}, ${input.city}, ${input.state} ${input.zipCode}`;

  return transaction(async (client: PoolClient) => {
    await client.query(
      `UPDATE facilities SET
        street_address = $2, city = $3, state = $4, zip_code = $5, address = $6,
        phone = COALESCE($7, phone),
        operating_hours = $8,
        setup_status = 'complete',
        updated_at = NOW()
       WHERE id = $1`,
      [
        facilityId,
        input.streetAddress,
        input.city,
        input.state,
        input.zipCode,
        fullAddress,
        input.phone || null,
        JSON.stringify(input.operatingHours),
      ]
    );

    const existingCourts = await client.query(
      `SELECT court_number FROM courts WHERE facility_id = $1 ORDER BY court_number`,
      [facilityId]
    );
    const existingCount = existingCourts.rows.length;

    if (existingCount === 0) {
      for (let i = 1; i <= courtCount; i += 1) {
        await client.query(
          `INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights, status)
           VALUES ($1, $2, $3, 'Synthetic', 'Pickleball', true, true, 'available')`,
          [facilityId, `Court ${i}`, i]
        );
      }
    } else if (courtCount > existingCount) {
      for (let i = existingCount + 1; i <= courtCount; i += 1) {
        await client.query(
          `INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights, status)
           VALUES ($1, $2, $3, 'Synthetic', 'Pickleball', true, true, 'available')`,
          [facilityId, `Court ${i}`, i]
        );
      }
    }

    return { facilityId, setupStatus: 'complete' };
  });
}
