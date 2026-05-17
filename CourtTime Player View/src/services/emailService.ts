/**
 * Centralized Email Service
 * Sends transactional emails via Resend API
 * Supports per-facility custom templates with fallback to defaults
 */

import { query } from '../database/connection';
import {
  EMAIL_TEMPLATE_TYPES,
  renderTemplate,
  wrapInEmailLayout,
} from './emailTemplateDefaults';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailSendResult {
  success: boolean;
  status: number | null;
  error?: string;
  response?: unknown;
}

/** Which preference column gates this send (each can be toggled independently). */
export type TransactionalEmailCategory = 'general' | 'booking' | 'membership_request';

async function shouldSendTransactionalEmail(
  userId: string | undefined,
  category: TransactionalEmailCategory
): Promise<boolean> {
  if (!userId) return true;
  const prefs = await import('./userPreferencesService');
  switch (category) {
    case 'booking':
      return prefs.isEmailBookingConfirmationsEnabled(userId);
    case 'membership_request':
      return prefs.isEmailMembershipRequestAlertsEnabled(userId);
    default:
      return prefs.isEmailNotificationsEnabled(userId);
  }
}

/**
 * Send an email via Resend
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  userId?: string,
  category: TransactionalEmailCategory = 'general'
): Promise<EmailSendResult> {
  if (!(await shouldSendTransactionalEmail(userId, category))) {
    return { success: true, status: null };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set - skipping email');
    return {
      success: false,
      status: null,
      error: 'RESEND_API_KEY is not set',
    };
  }

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
        to: [to],
        subject,
        html,
      }),
    });

    const rawBody = await response.text();
    let parsedBody: any = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = rawBody;
    }

    // Always log the complete response payload to aid debugging.
    console.log('Resend API response:', {
      to,
      subject,
      status: response.status,
      ok: response.ok,
      body: parsedBody,
    });

    if (!response.ok) {
      const resendError =
        parsedBody?.message ||
        parsedBody?.error?.message ||
        parsedBody?.error ||
        `Resend request failed with status ${response.status}`;

      return {
        success: false,
        status: response.status,
        error: resendError,
        response: parsedBody,
      };
    }

    return {
      success: true,
      status: response.status,
      response: parsedBody,
    };
  } catch (error) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      status: null,
      error: error instanceof Error ? error.message : 'Unknown email send error',
    };
  }
}

/**
 * Load a custom template from the database for a facility
 * Returns null if no custom template exists
 */
async function getTemplateForFacility(
  facilityId: string,
  templateType: string
): Promise<{ subject: string; bodyHtml: string; isEnabled: boolean } | null> {
  try {
    const result = await query(
      `SELECT subject, body_html as "bodyHtml", is_enabled as "isEnabled"
       FROM email_templates
       WHERE facility_id = $1 AND template_type = $2`,
      [facilityId, templateType]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error loading email template:', error);
    return null;
  }
}

/**
 * Send a templated email — loads custom template if available, otherwise uses default
 */
async function sendTemplatedEmail(
  to: string,
  facilityId: string,
  facilityName: string,
  templateType: string,
  variables: Record<string, string>,
  userId?: string,
  category: TransactionalEmailCategory = 'general'
): Promise<boolean> {
  if (!(await shouldSendTransactionalEmail(userId, category))) {
    return true;
  }

  const defaults = EMAIL_TEMPLATE_TYPES[templateType];
  if (!defaults) {
    console.error(`Unknown template type: ${templateType}`);
    return false;
  }

  // Try to load custom template
  const custom = await getTemplateForFacility(facilityId, templateType);

  const subjectTemplate = custom?.subject || defaults.defaultSubject;
  const bodyTemplate = custom?.bodyHtml || defaults.defaultBody;

  const renderedSubject = renderTemplate(subjectTemplate, variables);
  const renderedBody = renderTemplate(bodyTemplate, variables);
  const fullHtml = wrapInEmailLayout(renderedBody, facilityName);

  const result = await sendEmail(to, renderedSubject, fullHtml, userId, category);
  return result.success;
}

// =====================================================
// BOOKING EMAILS
// =====================================================

/**
 * Send booking confirmation email
 */
export async function sendBookingConfirmationEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  courtName: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  bookingType: string,
  userId?: string
): Promise<boolean> {
  return sendTemplatedEmail(
    email,
    facilityId,
    facilityName,
    'booking_confirmation',
    {
      playerName: fullName,
      facilityName,
      courtName,
      date: bookingDate,
      startTime,
      endTime,
      bookingType,
    },
    userId,
    'booking'
  );
}

/**
 * Send booking cancellation email
 */
export async function sendBookingCancellationEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  courtName: string,
  bookingDate: string,
  startTime: string,
  reason: string,
  userId?: string
): Promise<boolean> {
  return sendTemplatedEmail(
    email,
    facilityId,
    facilityName,
    'booking_cancellation',
    {
      playerName: fullName,
      facilityName,
      courtName,
      date: bookingDate,
      startTime,
      reason,
    },
    userId,
    'booking'
  );
}

// =====================================================
// STRIKE EMAILS
// =====================================================

function formatStrikeType(strikeType: string): string {
  switch (strikeType) {
    case 'no_show': return 'No Show';
    case 'late_cancel': return 'Late Cancellation';
    case 'manual': return 'Manual Strike';
    case 'violation': return 'Violation';
    default: return strikeType;
  }
}

/**
 * Send email when a strike is issued
 */
export async function sendStrikeIssuedEmail(
  email: string,
  fullName: string,
  strikeType: string,
  reason: string,
  facilityId: string,
  facilityName: string,
  expiresAt?: string | null,
  userId?: string
): Promise<boolean> {
  const typeLabel = formatStrikeType(strikeType);
  const expiryDate = expiresAt
    ? `This strike expires on ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : '';

  return sendTemplatedEmail(
    email,
    facilityId,
    facilityName,
    'strike_issued',
    {
      playerName: fullName,
      facilityName,
      strikeType: typeLabel,
      strikeReason: reason,
      expiryDate,
    },
    userId
  );
}

/**
 * Send email when a strike is revoked
 */
export async function sendStrikeRevokedEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  revokeReason?: string,
  userId?: string
): Promise<boolean> {
  return sendTemplatedEmail(
    email,
    facilityId,
    facilityName,
    'strike_revoked',
    {
      playerName: fullName,
      facilityName,
      revokeReason: revokeReason ? `Reason: ${revokeReason}` : '',
    },
    userId
  );
}

/**
 * Send email when account is locked out due to strikes
 */
export async function sendLockoutEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  lockoutEndsAt?: string | null,
  userId?: string
): Promise<boolean> {
  const lockoutEndDate = lockoutEndsAt
    ? `Your booking privileges will be restored on ${new Date(lockoutEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : 'Please contact your facility administrator for more information.';

  return sendTemplatedEmail(
    email,
    facilityId,
    facilityName,
    'account_lockout',
    {
      playerName: fullName,
      facilityName,
      lockoutEndDate,
    },
    userId
  );
}

// =====================================================
// ANNOUNCEMENT EMAIL (not templated - admin composes directly)
// =====================================================

/**
 * Send announcement/blast email from admin to facility members
 */
export async function sendAnnouncementEmail(
  email: string,
  fullName: string,
  subject: string,
  messageBody: string,
  facilityName: string,
  userId?: string
): Promise<EmailSendResult> {
  const htmlMessage = messageBody.replace(/\n/g, '<br>');
  const bodyContent = `
    <p style="color: #374151; margin-top: 0;">Hi ${fullName},</p>
    <div style="color: #374151; line-height: 1.6;">${htmlMessage}</div>
  `;
  const fullHtml = wrapInEmailLayout(bodyContent, facilityName);

  return sendEmail(email, `${subject} - ${facilityName}`, fullHtml, userId, 'general');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Email active facility admins when a player requests membership (separate pref from booking email).
 */
export async function sendMembershipRequestAdminEmail(
  adminEmail: string,
  adminUserId: string,
  requesterName: string,
  requesterEmail: string,
  facilityName: string,
  membershipType: string
): Promise<EmailSendResult> {
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const manageUrl = `${appUrl}/admin?tab=members`;
  const safeName = escapeHtml(requesterName || 'A player');
  const safeEmail = escapeHtml(requesterEmail || '');
  const safeFacility = escapeHtml(facilityName || 'your facility');
  const safeType = escapeHtml(membershipType || 'Full');

  const bodyContent = `
    <p style="color: #374151; margin-top: 0;"><strong>${safeName}</strong>${safeEmail ? ` (${safeEmail})` : ''} has requested to join <strong>${safeFacility}</strong>.</p>
    <p style="color: #374151;">Membership type: <strong>${safeType}</strong></p>
    <p style="color: #374151;">Review pending members in the admin console to approve or decline.</p>
    <p style="margin: 24px 0 0;">
      <a href="${manageUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Open members</a>
    </p>
    <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If the button does not work, copy this link: ${escapeHtml(manageUrl)}</p>
  `;
  const fullHtml = wrapInEmailLayout(bodyContent, facilityName);
  return sendEmail(adminEmail, `New membership request — ${facilityName}`, fullHtml, adminUserId, 'membership_request');
}

/**
 * Send bulletin event cancellation email when minimum participants are not met
 */
export async function sendBulletinMinParticipantsNotMetEmail(
  email: string,
  fullName: string,
  facilityName: string,
  eventTitle: string,
  eventType: string,
  eventDateTimeLabel: string,
  minParticipants: number,
  registeredParticipants: number,
  userId?: string
): Promise<EmailSendResult> {
  const bodyContent = `
    <p style="color: #374151; margin-top: 0;">Hi ${fullName},</p>
    <p style="color: #374151;">${eventType} <strong>${eventTitle}</strong> will not be taking place because the minimum participant count was not met.</p>
    <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 4px 0; color: #374151;"><strong>Scheduled Time:</strong> ${eventDateTimeLabel}</p>
      <p style="margin: 4px 0; color: #374151;"><strong>Minimum Participants:</strong> ${minParticipants}</p>
      <p style="margin: 4px 0; color: #374151;"><strong>Registered Participants:</strong> ${registeredParticipants}</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Please check the bulletin board for future postings.</p>
  `;
  const html = wrapInEmailLayout(bodyContent, facilityName);
  return sendEmail(email, `${eventType} Cancelled - ${eventTitle}`, html, userId, 'general');
}
