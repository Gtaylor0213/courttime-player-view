/**
 * Centralized Email Service
 * Sends transactional emails via Resend API
 */

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

function formatStrikeType(strikeType: string): string {
  switch (strikeType) {
    case 'no_show': return 'No Show';
    case 'late_cancel': return 'Late Cancellation';
    case 'manual': return 'Manual Strike';
    case 'violation': return 'Violation';
    default: return strikeType;
  }
}

function strikeTypeColor(strikeType: string): string {
  switch (strikeType) {
    case 'no_show': return '#dc2626';
    case 'late_cancel': return '#d97706';
    case 'manual': return '#6b7280';
    default: return '#6b7280';
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
  facilityName: string,
  expiresAt?: string | null
): Promise<boolean> {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const profileLink = `${appUrl}/profile`;
  const typeLabel = formatStrikeType(strikeType);
  const typeColor = strikeTypeColor(strikeType);

  const expiryNote = expiresAt
    ? `<p style="color: #666; font-size: 14px;">This strike expires on ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>`
    : '';

  return sendEmail(
    email,
    `Strike Issued - ${facilityName}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Strike Notice</h2>
        <p>Hi ${fullName},</p>
        <p>A strike has been issued on your account at <strong>${facilityName}</strong>.</p>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <div style="display: inline-block; background-color: ${typeColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: bold; margin-bottom: 8px;">
            ${typeLabel}
          </div>
          <p style="margin: 8px 0 0; color: #374151;">${reason}</p>
        </div>
        ${expiryNote}
        <p style="color: #666; font-size: 14px;">Accumulating strikes may result in a temporary lockout from booking courts. You can view your full strike history on your profile.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${profileLink}"
             style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Your Profile
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
      </div>
    `
  );
}

/**
 * Send email when a strike is revoked
 */
export async function sendStrikeRevokedEmail(
  email: string,
  fullName: string,
  facilityName: string,
  revokeReason?: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const profileLink = `${appUrl}/profile`;

  const reasonNote = revokeReason
    ? `<p style="color: #666; font-size: 14px;"><strong>Reason:</strong> ${revokeReason}</p>`
    : '';

  return sendEmail(
    email,
    `Strike Removed - ${facilityName}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Strike Removed</h2>
        <p>Hi ${fullName},</p>
        <p>A strike on your account at <strong>${facilityName}</strong> has been removed.</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;">Your account standing has improved.</p>
        </div>
        ${reasonNote}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${profileLink}"
             style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Your Profile
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
      </div>
    `
  );
}

/**
 * Send email when account is locked out due to strikes
 */
export async function sendLockoutEmail(
  email: string,
  fullName: string,
  facilityName: string,
  lockoutEndsAt?: string | null
): Promise<boolean> {
  const lockoutNote = lockoutEndsAt
    ? `<p style="color: #991b1b; font-size: 14px;">Your booking privileges will be restored on <strong>${new Date(lockoutEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>`
    : `<p style="color: #991b1b; font-size: 14px;">Please contact your facility administrator for more information.</p>`;

  return sendEmail(
    email,
    `Account Locked Out - ${facilityName}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #991b1b;">Account Locked Out</h2>
        <p>Hi ${fullName},</p>
        <p>Due to accumulated strikes, your booking privileges at <strong>${facilityName}</strong> have been temporarily suspended.</p>
        <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b; font-weight: bold;">You are currently unable to make new court reservations at this facility.</p>
        </div>
        ${lockoutNote}
        <p style="color: #666; font-size: 14px;">If you believe this is an error, please contact the facility administrator.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
      </div>
    `
  );
}
