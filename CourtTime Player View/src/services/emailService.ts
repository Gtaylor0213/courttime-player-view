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

/**
 * Send an email via Resend
 */
async function sendEmail(to: string, subject: string, html: string): Promise<EmailSendResult> {
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
  variables: Record<string, string>
): Promise<boolean> {
  const defaults = EMAIL_TEMPLATE_TYPES[templateType];
  if (!defaults) {
    console.error(`Unknown template type: ${templateType}`);
    return false;
  }

  // Try to load custom template
  const custom = await getTemplateForFacility(facilityId, templateType);

  // If custom template exists and is disabled, skip sending
  if (custom && !custom.isEnabled) {
    return false;
  }

  const subjectTemplate = custom?.subject || defaults.defaultSubject;
  const bodyTemplate = custom?.bodyHtml || defaults.defaultBody;

  const renderedSubject = renderTemplate(subjectTemplate, variables);
  const renderedBody = renderTemplate(bodyTemplate, variables);
  const fullHtml = wrapInEmailLayout(renderedBody, facilityName);

  const result = await sendEmail(to, renderedSubject, fullHtml);
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
  bookingType: string
): Promise<boolean> {
  return sendTemplatedEmail(email, facilityId, facilityName, 'booking_confirmation', {
    playerName: fullName,
    facilityName,
    courtName,
    date: bookingDate,
    startTime,
    endTime,
    bookingType,
  });
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
  reason: string
): Promise<boolean> {
  return sendTemplatedEmail(email, facilityId, facilityName, 'booking_cancellation', {
    playerName: fullName,
    facilityName,
    courtName,
    date: bookingDate,
    startTime,
    reason,
  });
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
  expiresAt?: string | null
): Promise<boolean> {
  const typeLabel = formatStrikeType(strikeType);
  const expiryDate = expiresAt
    ? `This strike expires on ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : '';

  return sendTemplatedEmail(email, facilityId, facilityName, 'strike_issued', {
    playerName: fullName,
    facilityName,
    strikeType: typeLabel,
    strikeReason: reason,
    expiryDate,
  });
}

/**
 * Send email when a strike is revoked
 */
export async function sendStrikeRevokedEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  revokeReason?: string
): Promise<boolean> {
  return sendTemplatedEmail(email, facilityId, facilityName, 'strike_revoked', {
    playerName: fullName,
    facilityName,
    revokeReason: revokeReason ? `Reason: ${revokeReason}` : '',
  });
}

/**
 * Send email when account is locked out due to strikes
 */
export async function sendLockoutEmail(
  email: string,
  fullName: string,
  facilityId: string,
  facilityName: string,
  lockoutEndsAt?: string | null
): Promise<boolean> {
  const lockoutEndDate = lockoutEndsAt
    ? `Your booking privileges will be restored on ${new Date(lockoutEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : 'Please contact your facility administrator for more information.';

  return sendTemplatedEmail(email, facilityId, facilityName, 'account_lockout', {
    playerName: fullName,
    facilityName,
    lockoutEndDate,
  });
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
  facilityName: string
): Promise<EmailSendResult> {
  const htmlMessage = messageBody.replace(/\n/g, '<br>');
  const bodyContent = `
    <p style="color: #374151; margin-top: 0;">Hi ${fullName},</p>
    <div style="color: #374151; line-height: 1.6;">${htmlMessage}</div>
  `;
  const fullHtml = wrapInEmailLayout(bodyContent, facilityName);

  return sendEmail(email, `${subject} - ${facilityName}`, fullHtml);
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
  registeredParticipants: number
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
  return sendEmail(email, `${eventType} Cancelled - ${eventTitle}`, html);
}
