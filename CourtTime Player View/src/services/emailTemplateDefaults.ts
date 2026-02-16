/**
 * Email Template Defaults & Render Engine
 * Defines default templates for all auto-generated emails and provides
 * a template rendering engine that replaces {{placeholders}} with values.
 */

export interface TemplateVariable {
  key: string;
  description: string;
  sampleValue: string;
}

export interface TemplateTypeConfig {
  label: string;
  description: string;
  availableVariables: TemplateVariable[];
  defaultSubject: string;
  defaultBody: string;
}

export const EMAIL_TEMPLATE_TYPES: Record<string, TemplateTypeConfig> = {
  booking_confirmation: {
    label: 'Booking Confirmation',
    description: 'Sent when a player successfully books a court',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{courtName}}', description: 'Court name', sampleValue: 'Court 1' },
      { key: '{{date}}', description: 'Booking date', sampleValue: 'February 15, 2026' },
      { key: '{{startTime}}', description: 'Start time', sampleValue: '10:00 AM' },
      { key: '{{endTime}}', description: 'End time', sampleValue: '11:00 AM' },
      { key: '{{bookingType}}', description: 'Booking type', sampleValue: 'Singles' },
    ],
    defaultSubject: 'Booking Confirmed - {{facilityName}}',
    defaultBody: `<h2 style="color: #16a34a;">Booking Confirmed</h2>
<p>Hi {{playerName}},</p>
<p>Your court booking at <strong>{{facilityName}}</strong> has been confirmed!</p>
<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0 0 8px; font-weight: bold; color: #166534;">Booking Details</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Court:</strong> {{courtName}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Date:</strong> {{date}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Time:</strong> {{startTime}} - {{endTime}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Type:</strong> {{bookingType}}</p>
</div>
<p style="color: #666; font-size: 14px;">Need to make changes? You can manage your bookings from the Court Calendar.</p>`,
  },

  booking_cancellation: {
    label: 'Booking Cancellation',
    description: 'Sent when a booking is cancelled',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{courtName}}', description: 'Court name', sampleValue: 'Court 1' },
      { key: '{{date}}', description: 'Booking date', sampleValue: 'February 15, 2026' },
      { key: '{{startTime}}', description: 'Start time', sampleValue: '10:00 AM' },
      { key: '{{reason}}', description: 'Cancellation reason', sampleValue: 'Cancelled by user' },
    ],
    defaultSubject: 'Booking Cancelled - {{facilityName}}',
    defaultBody: `<h2 style="color: #d97706;">Booking Cancelled</h2>
<p>Hi {{playerName}},</p>
<p>Your court booking at <strong>{{facilityName}}</strong> has been cancelled.</p>
<div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 4px 0; color: #374151;"><strong>Court:</strong> {{courtName}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Date:</strong> {{date}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Time:</strong> {{startTime}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Reason:</strong> {{reason}}</p>
</div>
<p style="color: #666; font-size: 14px;">You can book another court from the Court Calendar.</p>`,
  },

  booking_reminder: {
    label: 'Booking Reminder',
    description: 'Sent before an upcoming booking as a reminder',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{courtName}}', description: 'Court name', sampleValue: 'Court 1' },
      { key: '{{date}}', description: 'Booking date', sampleValue: 'February 15, 2026' },
      { key: '{{startTime}}', description: 'Start time', sampleValue: '10:00 AM' },
      { key: '{{endTime}}', description: 'End time', sampleValue: '11:00 AM' },
      { key: '{{hoursUntil}}', description: 'Hours until booking', sampleValue: '2' },
    ],
    defaultSubject: 'Upcoming Booking Reminder - {{facilityName}}',
    defaultBody: `<h2 style="color: #2563eb;">Booking Reminder</h2>
<p>Hi {{playerName}},</p>
<p>This is a reminder that you have an upcoming court booking at <strong>{{facilityName}}</strong> in {{hoursUntil}} hours.</p>
<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 4px 0; color: #374151;"><strong>Court:</strong> {{courtName}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Date:</strong> {{date}}</p>
  <p style="margin: 4px 0; color: #374151;"><strong>Time:</strong> {{startTime}} - {{endTime}}</p>
</div>
<p style="color: #666; font-size: 14px;">See you on the court!</p>`,
  },

  strike_issued: {
    label: 'Strike Issued',
    description: 'Sent when a strike is issued to a player account',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{strikeType}}', description: 'Type of strike', sampleValue: 'No Show' },
      { key: '{{strikeReason}}', description: 'Reason for the strike', sampleValue: 'Did not show up for scheduled booking' },
      { key: '{{expiryDate}}', description: 'When the strike expires', sampleValue: 'March 15, 2026' },
    ],
    defaultSubject: 'Strike Issued - {{facilityName}}',
    defaultBody: `<h2 style="color: #dc2626;">Strike Notice</h2>
<p>Hi {{playerName}},</p>
<p>A strike has been issued on your account at <strong>{{facilityName}}</strong>.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0 0 8px;"><strong style="color: #dc2626;">{{strikeType}}</strong></p>
  <p style="margin: 4px 0; color: #374151;">{{strikeReason}}</p>
</div>
<p style="color: #666; font-size: 14px;">{{expiryDate}}</p>
<p style="color: #666; font-size: 14px;">Accumulating strikes may result in a temporary lockout from booking courts. You can view your full strike history on your profile.</p>`,
  },

  strike_revoked: {
    label: 'Strike Revoked',
    description: 'Sent when a strike is removed from a player account',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{revokeReason}}', description: 'Reason for revoking', sampleValue: 'Strike issued in error' },
    ],
    defaultSubject: 'Strike Removed - {{facilityName}}',
    defaultBody: `<h2 style="color: #16a34a;">Strike Removed</h2>
<p>Hi {{playerName}},</p>
<p>A strike on your account at <strong>{{facilityName}}</strong> has been removed.</p>
<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0; color: #166534;">Your account standing has improved.</p>
</div>
<p style="color: #666; font-size: 14px;">{{revokeReason}}</p>`,
  },

  account_lockout: {
    label: 'Account Lockout',
    description: 'Sent when an account is locked out due to accumulated strikes',
    availableVariables: [
      { key: '{{playerName}}', description: 'Player full name', sampleValue: 'John Doe' },
      { key: '{{facilityName}}', description: 'Facility name', sampleValue: 'Sunrise Valley HOA' },
      { key: '{{lockoutEndDate}}', description: 'When lockout ends', sampleValue: 'March 1, 2026' },
    ],
    defaultSubject: 'Account Locked Out - {{facilityName}}',
    defaultBody: `<h2 style="color: #991b1b;">Account Locked Out</h2>
<p>Hi {{playerName}},</p>
<p>Due to accumulated strikes, your booking privileges at <strong>{{facilityName}}</strong> have been temporarily suspended.</p>
<div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0; color: #991b1b; font-weight: bold;">You are currently unable to make new court reservations at this facility.</p>
</div>
<p style="color: #991b1b; font-size: 14px;">{{lockoutEndDate}}</p>
<p style="color: #666; font-size: 14px;">If you believe this is an error, please contact the facility administrator.</p>`,
  },
};

/**
 * Replace all {{placeholder}} variables in a template with actual values
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value || '');
  }
  return rendered;
}

/**
 * Wrap email body content in the standard CourtTime email layout
 */
export function wrapInEmailLayout(bodyContent: string, facilityName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #16a34a; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 20px;">${facilityName}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
        ${bodyContent}
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
    </div>
  `;
}

/**
 * Get sample variables for preview rendering
 */
export function getSampleVariables(templateType: string): Record<string, string> {
  const config = EMAIL_TEMPLATE_TYPES[templateType];
  if (!config) return {};

  const variables: Record<string, string> = {};
  for (const v of config.availableVariables) {
    const key = v.key.replace(/^\{\{|\}\}$/g, '');
    variables[key] = v.sampleValue;
  }
  return variables;
}
