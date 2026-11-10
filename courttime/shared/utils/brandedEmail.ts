/**
 * The CourtTime-branded email shell (green header bar, white card, footer with
 * the email-preferences link and mailing address) shared by the app launch
 * email and the support-console newsletter, so every announcement looks the same.
 *
 * No server-only imports, so the support console can render a live preview in the
 * browser from the exact code the server sends with.
 *
 * Links and images use the live site on purpose: emails are read in inboxes,
 * so localhost URLs would break even for a test send from a dev server.
 */
import { APP_STORE_URL, PLAY_STORE_URL } from './appDownload';

export const EMAIL_SITE_URL = 'https://www.courttimeapp.com';
export const COMPANY_MAILING_ADDRESS =
  'CourtTime Limited Liability Company, 4239 Allenhurst Dr, Norcross, GA 30092';
export const BRAND_GREEN = '#1a5f2a';

export function escapeEmailHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface BrandedEmailOptions {
  /** The document <title>; already-safe text (escape user input first). */
  title: string;
  /** Inbox preview line shown after the subject; already-safe text. */
  preheader?: string;
  /** Inner HTML of the white card. */
  bodyHtml: string;
}

export function wrapInBrandedEmail({ title, preheader, bodyHtml }: BrandedEmailOptions): string {
  const profileUrl = `${EMAIL_SITE_URL}/profile`;
  const preheaderHtml = preheader
    ? `\n  <div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">${preheaderHtml}
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px 16px;">
    <div style="background-color: ${BRAND_GREEN}; padding: 20px 24px; border-radius: 10px 10px 0 0;">
      <p style="color: #ffffff; margin: 0; font-size: 22px; font-weight: bold;">CourtTime</p>
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; padding: 28px 24px; color: #374151; font-size: 16px; line-height: 1.55;">
${bodyHtml}
    </div>
    <div style="padding: 16px 8px; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
      <p style="margin: 0 0 6px;">You're receiving this because you have a CourtTime account. To stop CourtTime emails, turn off email notifications on your <a href="${profileUrl}" style="color: #6b7280;">profile</a>.</p>
      <p style="margin: 0;">${COMPANY_MAILING_ADDRESS}</p>
    </div>
  </div>
</body>
</html>`;
}

const BADGE_HEIGHT = 48;

function storeBadge(href: string, src: string, alt: string, width: number): string {
  return `
    <a href="${href}" style="display: inline-block; margin: 6px;" target="_blank">
      <img src="${EMAIL_SITE_URL}/badges/${src}" alt="${alt}" height="${BADGE_HEIGHT}" width="${width}"
        style="display: block; height: ${BADGE_HEIGHT}px; width: ${width}px; border: 0;" />
    </a>`;
}

/** The centered App Store + Google Play badges (images load from the live site). */
export function storeBadgesHtml(): string {
  return `      <div style="text-align: center; margin: 24px 0 20px;">
        ${storeBadge(APP_STORE_URL, 'app-store.png', 'Download on the App Store', 144)}
        ${storeBadge(PLAY_STORE_URL, 'google-play.png', 'Get it on Google Play', 161)}
      </div>`;
}

/** A centered green call-to-action button. `href` and `label` must already be safe. */
export function emailButtonHtml(href: string, label: string): string {
  return `      <p style="margin: 24px 0; text-align: center;"><a href="${href}" style="display: inline-block; background-color: ${BRAND_GREEN}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px;" target="_blank">${label}</a></p>`;
}
