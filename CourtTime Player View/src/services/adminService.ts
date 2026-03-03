/**
 * Admin Service
 * Handles facility admin management and invitations
 */

import { query, transaction } from '../database/connection';
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

export interface FacilityAdmin {
  id: string;
  userId: string;
  facilityId: string;
  isSuperAdmin: boolean;
  invitedBy?: string;
  invitationEmail?: string;
  invitationSentAt?: Date;
  invitationAcceptedAt?: Date;
  status: 'active' | 'pending' | 'suspended' | 'removed';
  permissions: Record<string, boolean>;
  createdAt: Date;

  // Joined user data
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

/**
 * Add an existing user as admin to a facility
 */
export async function addAdminToFacility(
  userId: string,
  facilityId: string,
  invitedBy: string,
  isSuperAdmin: boolean = false
): Promise<FacilityAdmin> {
  const result = await query(
    `INSERT INTO facility_admins (
      user_id, facility_id, is_super_admin, invited_by, status,
      invitation_accepted_at
    ) VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP)
    RETURNING
      id, user_id as "userId", facility_id as "facilityId",
      is_super_admin as "isSuperAdmin", invited_by as "invitedBy",
      invitation_email as "invitationEmail", invitation_sent_at as "invitationSentAt",
      invitation_accepted_at as "invitationAcceptedAt", status,
      permissions, created_at as "createdAt"`,
    [userId, facilityId, isSuperAdmin, invitedBy]
  );

  // Also create facility membership
  await query(
    `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
     VALUES ($1, $2, 'admin', 'active', CURRENT_DATE)
     ON CONFLICT (user_id, facility_id) DO UPDATE SET
       membership_type = 'admin',
       status = 'active'`,
    [userId, facilityId]
  );

  return result.rows[0];
}

/**
 * Send admin invitation via email
 */
export async function inviteAdmin(
  facilityId: string,
  email: string,
  invitedBy: string
): Promise<FacilityAdmin> {
  const normalizedEmail = email.trim().toLowerCase();

  // Check if there's already a pending invitation for this email
  const existing = await query(
    `SELECT id FROM facility_admins
     WHERE facility_id = $1 AND LOWER(invitation_email) = $2 AND status = 'pending'`,
    [facilityId, normalizedEmail]
  );

  if (existing.rows.length > 0) {
    throw new Error('An invitation has already been sent to this email');
  }

  // Check if this email is already an active admin
  const activeAdmin = await query(
    `SELECT fa.id FROM facility_admins fa
     JOIN users u ON fa.user_id = u.id
     WHERE fa.facility_id = $1 AND LOWER(u.email) = $2 AND fa.status = 'active'`,
    [facilityId, normalizedEmail]
  );

  if (activeAdmin.rows.length > 0) {
    throw new Error('This user is already an admin of this facility');
  }

  const result = await query(
    `INSERT INTO facility_admins (
      facility_id, invitation_email, invited_by, status, invitation_sent_at
    ) VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP)
    RETURNING
      id, user_id as "userId", facility_id as "facilityId",
      is_super_admin as "isSuperAdmin", invited_by as "invitedBy",
      invitation_email as "invitationEmail", invitation_sent_at as "invitationSentAt",
      invitation_accepted_at as "invitationAcceptedAt", status,
      permissions, created_at as "createdAt"`,
    [facilityId, normalizedEmail, invitedBy]
  );

  // Get facility name and inviter name for the email
  const facilityResult = await query('SELECT name FROM facilities WHERE id = $1', [facilityId]);
  const inviterResult = await query('SELECT full_name FROM users WHERE id = $1', [invitedBy]);
  const facilityName = facilityResult.rows[0]?.name || 'a facility';
  const inviterName = inviterResult.rows[0]?.full_name || 'A facility administrator';

  // Send invite email (fire-and-forget)
  sendAdminInviteEmail(normalizedEmail, facilityName, inviterName).catch(err => {
    console.error(`Failed to send invite email to ${normalizedEmail}:`, err);
  });

  return result.rows[0];
}

/**
 * Accept admin invitation (when invited user registers/logs in)
 */
export async function acceptAdminInvitation(
  invitationId: string,
  userId: string
): Promise<FacilityAdmin> {
  return transaction(async (client: PoolClient) => {
    // Update invitation with user ID and mark as accepted
    const result = await client.query(
      `UPDATE facility_admins
       SET user_id = $1, status = 'active', invitation_accepted_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'
       RETURNING
         id, user_id as "userId", facility_id as "facilityId",
         is_super_admin as "isSuperAdmin", invited_by as "invitedBy",
         invitation_email as "invitationEmail", invitation_sent_at as "invitationSentAt",
         invitation_accepted_at as "invitationAcceptedAt", status,
         permissions, created_at as "createdAt"`,
      [userId, invitationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Invitation not found or already accepted');
    }

    const admin = result.rows[0];

    // Create facility membership for the new admin
    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, 'admin', 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id) DO UPDATE SET
         membership_type = 'admin',
         status = 'active'`,
      [userId, admin.facilityId]
    );

    return admin;
  });
}

/**
 * Get all admins for a facility
 */
export async function getFacilityAdmins(facilityId: string): Promise<FacilityAdmin[]> {
  const result = await query(
    `SELECT
      fa.id,
      fa.user_id as "userId",
      fa.facility_id as "facilityId",
      fa.is_super_admin as "isSuperAdmin",
      fa.invited_by as "invitedBy",
      fa.invitation_email as "invitationEmail",
      fa.invitation_sent_at as "invitationSentAt",
      fa.invitation_accepted_at as "invitationAcceptedAt",
      fa.status,
      fa.permissions,
      fa.created_at as "createdAt",
      u.id as "user_id",
      u.email as "user_email",
      u.full_name as "user_full_name"
     FROM facility_admins fa
     LEFT JOIN users u ON fa.user_id = u.id
     WHERE fa.facility_id = $1 AND fa.status != 'removed'
     ORDER BY fa.is_super_admin DESC, fa.created_at ASC`,
    [facilityId]
  );

  return result.rows.map(row => ({
    id: row.id,
    userId: row.userId,
    facilityId: row.facilityId,
    isSuperAdmin: row.isSuperAdmin,
    invitedBy: row.invitedBy,
    invitationEmail: row.invitationEmail,
    invitationSentAt: row.invitationSentAt,
    invitationAcceptedAt: row.invitationAcceptedAt,
    status: row.status,
    permissions: row.permissions,
    createdAt: row.createdAt,
    user: row.user_id ? {
      id: row.user_id,
      email: row.user_email,
      fullName: row.user_full_name,
    } : undefined,
  }));
}

/**
 * Get facilities where user is admin
 */
export async function getUserAdminFacilities(userId: string): Promise<any[]> {
  const result = await query(
    `SELECT
      f.id,
      f.name,
      f.type,
      f.address,
      fa.is_super_admin as "isSuperAdmin",
      fa.permissions,
      fa.status
     FROM facility_admins fa
     JOIN facilities f ON fa.facility_id = f.id
     WHERE fa.user_id = $1 AND fa.status = 'active'
     ORDER BY fa.is_super_admin DESC, f.name`,
    [userId]
  );

  return result.rows;
}

/**
 * Check if user is admin of a facility
 */
export async function isUserFacilityAdmin(
  userId: string,
  facilityId: string
): Promise<boolean> {
  const result = await query(
    `SELECT id FROM facility_admins
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [userId, facilityId]
  );

  return result.rows.length > 0;
}

/**
 * Check if user is super admin of a facility
 */
export async function isUserSuperAdmin(
  userId: string,
  facilityId: string
): Promise<boolean> {
  const result = await query(
    `SELECT id FROM facility_admins
     WHERE user_id = $1 AND facility_id = $2 AND is_super_admin = true AND status = 'active'
     LIMIT 1`,
    [userId, facilityId]
  );

  return result.rows.length > 0;
}

/**
 * Remove admin from facility (soft delete)
 */
export async function removeAdmin(
  adminId: string,
  removedBy: string
): Promise<void> {
  return transaction(async (client: PoolClient) => {
    // Get admin details
    const adminResult = await client.query(
      `SELECT user_id, facility_id, is_super_admin FROM facility_admins WHERE id = $1`,
      [adminId]
    );

    if (adminResult.rows.length === 0) {
      throw new Error('Admin not found');
    }

    const admin = adminResult.rows[0];

    if (admin.is_super_admin) {
      throw new Error('Cannot remove super admin');
    }

    // Remove admin status
    await client.query(
      `UPDATE facility_admins SET status = 'removed' WHERE id = $1`,
      [adminId]
    );

    // Update facility membership to regular member
    await client.query(
      `UPDATE facility_memberships
       SET membership_type = 'member'
       WHERE user_id = $1 AND facility_id = $2`,
      [admin.user_id, admin.facility_id]
    );
  });
}

/**
 * Update admin permissions
 */
export async function updateAdminPermissions(
  adminId: string,
  permissions: Record<string, boolean>
): Promise<FacilityAdmin> {
  const result = await query(
    `UPDATE facility_admins
     SET permissions = $1
     WHERE id = $2
     RETURNING
       id, user_id as "userId", facility_id as "facilityId",
       is_super_admin as "isSuperAdmin", invited_by as "invitedBy",
       invitation_email as "invitationEmail", invitation_sent_at as "invitationSentAt",
       invitation_accepted_at as "invitationAcceptedAt", status,
       permissions, created_at as "createdAt"`,
    [JSON.stringify(permissions), adminId]
  );

  return result.rows[0];
}

/**
 * Suspend admin (temporarily revoke access)
 */
export async function suspendAdmin(adminId: string): Promise<void> {
  await query(
    `UPDATE facility_admins SET status = 'suspended' WHERE id = $1`,
    [adminId]
  );
}

/**
 * Reactivate suspended admin
 */
export async function reactivateAdmin(adminId: string): Promise<void> {
  await query(
    `UPDATE facility_admins SET status = 'active' WHERE id = $1 AND status = 'suspended'`,
    [adminId]
  );
}
