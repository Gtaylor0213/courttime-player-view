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

/**
 * Send an email via Resend
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set - skipping email');
    return false;
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
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
    console.log(`Email template ${templateType} is disabled for facility ${facilityId}`);
    return false;
  }

  const subjectTemplate = custom?.subject || defaults.defaultSubject;
  const bodyTemplate = custom?.bodyHtml || defaults.defaultBody;

  const renderedSubject = renderTemplate(subjectTemplate, variables);
  const renderedBody = renderTemplate(bodyTemplate, variables);
  const fullHtml = wrapInEmailLayout(renderedBody, facilityName);

  return sendEmail(to, renderedSubject, fullHtml);
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
): Promise<boolean> {
  const htmlMessage = messageBody.replace(/\n/g, '<br>');
  const bodyContent = `
    <p style="color: #374151; margin-top: 0;">Hi ${fullName},</p>
    <div style="color: #374151; line-height: 1.6;">${htmlMessage}</div>
  `;
  const fullHtml = wrapInEmailLayout(bodyContent, facilityName);

  return sendEmail(email, `${subject} - ${facilityName}`, fullHtml);
}
