import crypto from 'crypto';
import { query } from '../database/connection';

const TOKEN_EXPIRY_DAYS = 14;
const RESEND_API_URL = 'https://api.resend.com/emails';

export function generateSetupToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function normalizeWhitelistEmail(email: string | null | undefined): string | null {
  const trimmed = (email || '').trim().toLowerCase();
  return trimmed || null;
}

export function buildMemberSetupInviteHtml(
  email: string,
  facilityName: string,
  setupLink: string,
  loginLink: string
): string {
  return [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
    '<h2 style="color: #2563eb;">Welcome to CourtTime</h2>',
    '<p>Hi there,</p>',
    `<p><strong>${facilityName}</strong> is moving court booking to CourtTime. Your email is already on the approved list.</p>`,
    '<motionless>',
    '<div style="text-align: center; margin: 30px 0;">',
    `<a href="${setupLink}" style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Create your account</a>`,
    '</div>',
    '<div style="text-align: center; margin: 20px 0;">',
    `<a href="${loginLink}" style="background-color: #ffffff; color: #2563eb; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; border: 1px solid #2563eb;">Log in with an existing account</a>`,
    '</div>',
    `<p style="color: #666; font-size: 14px;">Please use <strong>${email}</strong>. These links expire in ${TOKEN_EXPIRY_DAYS} days.</p>`,
    `<p style="color: #666; font-size: 14px;">Already use CourtTime for another facility? Log in with your existing account and we'll add ${facilityName} for you.</p>`,
    `<p style="color: #666; font-size: 14px;">If you didn't expect this email, you can safely ignore it.</p>`,
    '<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />',
    '<p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>',
    '</div>',
  ]
    .join('')
    .replace(/<\/?motionless>/g, '');
}

export interface SetupInviteDetails {
  valid: true;
  email: string;
  facilityId: string;
  facilityName: string;
  address: string;
  lastName: string;
}

export interface SetupInviteInvalid {
  valid: false;
  error: string;
}

export type SetupInviteValidation = SetupInviteDetails | SetupInviteInvalid;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Send member setup invite email via Resend.
 * Retries on 429 (rate limited), honoring Resend's Retry-After header when present,
 * since bulk whitelist imports can send hundreds of these back to back.
 */
export async function sendMemberSetupInviteEmail(
  email: string,
  facilityName: string,
  token: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set - skipping member setup invite email');
    return false;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const encodedToken = encodeURIComponent(token);
  const setupLink = `${appUrl}/register?setupToken=${encodedToken}`;
  const loginLink = `${appUrl}/login?setupToken=${encodedToken}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CourtTime <onboarding@resend.dev>';

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Set up your ${facilityName} CourtTime account`,
          html: buildMemberSetupInviteHtml(email, facilityName, setupLink, loginLink),
        }),
      });

      if (response.ok) return true;

      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const retryAfterHeader = Number(response.headers.get('Retry-After'));
        const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 500 * 2 ** attempt;
        await delay(backoffMs);
        continue;
      }

      const errorData = await response.json();
      console.error('Resend API error (member setup invite):', errorData);
      return false;
    } catch (error) {
      console.error('Failed to send member setup invite email:', error);
      return false;
    }
  }

  return false;
}

/**
 * Generate a setup token on a whitelist row and send the invite email.
 * Returns whether the email was actually sent, so bulk callers can track failures.
 *
 * Issuing a new token invalidates any previously sent link for the row and clears
 * setup_invite_accepted_at. Pass `skipIfAccepted` for bulk resends so a member who
 * joined after the batch was queued isn't reset back to "not joined" and re-emailed.
 */
export async function issueSetupInviteForWhitelistRow(
  whitelistId: string,
  options: { skipIfAccepted?: boolean } = {}
): Promise<boolean> {
  const rowResult = await query(
    `SELECT
       aw.id,
       aw.email,
       aw.facility_id as "facilityId",
       f.name as "facilityName"
     FROM address_whitelist aw
     JOIN facilities f ON f.id = aw.facility_id
     WHERE aw.id = $1`,
    [whitelistId]
  );

  if (rowResult.rows.length === 0) return false;

  const row = rowResult.rows[0];
  const email = normalizeWhitelistEmail(row.email);
  if (!email) return false;

  const token = generateSetupToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const updateResult = await query(
    `UPDATE address_whitelist
     SET setup_token = $1,
         setup_token_expires_at = $2,
         setup_invite_sent_at = CURRENT_TIMESTAMP,
         setup_invite_accepted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
       ${options.skipIfAccepted ? 'AND setup_invite_accepted_at IS NULL' : ''}
     RETURNING id`,
    [token, expiresAt, whitelistId]
  );

  // Row was accepted between being queued and being sent - leave it joined.
  if (updateResult.rows.length === 0) return false;

  const sent = await sendMemberSetupInviteEmail(email, row.facilityName, token);
  if (!sent) {
    console.warn(`Member setup invite email not sent for whitelist row ${whitelistId}`);
  }
  return sent;
}

/**
 * Validate a setup token for the registration prefill flow.
 */
export async function validateSetupToken(token: string): Promise<SetupInviteValidation> {
  if (!token?.trim()) {
    return { valid: false, error: 'Invalid setup link' };
  }

  const result = await query(
    `SELECT
       aw.email,
       aw.address,
       COALESCE(aw.last_name, '') as "lastName",
       aw.facility_id as "facilityId",
       aw.setup_token_expires_at as "expiresAt",
       aw.setup_invite_accepted_at as "acceptedAt",
       f.name as "facilityName"
     FROM address_whitelist aw
     JOIN facilities f ON f.id = aw.facility_id
     WHERE aw.setup_token = $1`,
    [token.trim()]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'This setup link is invalid or has expired' };
  }

  const row = result.rows[0];

  if (row.acceptedAt) {
    return { valid: false, error: 'This setup link has already been used' };
  }

  if (!row.expiresAt || new Date(row.expiresAt) < new Date()) {
    return { valid: false, error: 'This setup link has expired' };
  }

  const email = normalizeWhitelistEmail(row.email);
  if (!email) {
    return { valid: false, error: 'This setup link is invalid' };
  }

  return {
    valid: true,
    email,
    facilityId: row.facilityId,
    facilityName: row.facilityName,
    address: row.address,
    lastName: row.lastName,
  };
}

/**
 * Mark setup invite as accepted and clear token fields.
 */
export async function consumeSetupToken(token: string, _userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE address_whitelist
     SET setup_invite_accepted_at = CURRENT_TIMESTAMP,
         setup_token = NULL,
         setup_token_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE setup_token = $1
       AND setup_invite_accepted_at IS NULL
       AND setup_token_expires_at > CURRENT_TIMESTAMP
     RETURNING id`,
    [token.trim()]
  );

  return result.rows.length > 0;
}

/**
 * Resolve facility id from a valid setup token (for registration).
 */
export async function getFacilityIdForSetupToken(token: string): Promise<string | null> {
  const validation = await validateSetupToken(token);
  if (!validation.valid) return null;
  return validation.facilityId;
}
