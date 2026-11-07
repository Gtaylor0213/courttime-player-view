/**
 * The one-time "CourtTime is in the app stores" email sent to every account.
 *
 * Links and images use the live site on purpose: the email is read in inboxes,
 * so localhost URLs would break even for a test send from a dev server. The
 * badge images (public/badges) have to be deployed before anyone gets it.
 */
import { APP_STORE_URL, GET_APP_PATH, PLAY_STORE_URL } from '../../shared/utils/appDownload';

export const LAUNCH_SITE_URL = 'https://www.courttimeapp.com';
export const APP_LAUNCH_EMAIL_SUBJECT = 'The CourtTime app is here: iPhone and Android';
export const COMPANY_MAILING_ADDRESS =
  'CourtTime Limited Liability Company, 4239 Allenhurst Dr, Norcross, GA 30092';

const BRAND_GREEN = '#1a5f2a';
const BADGE_HEIGHT = 48;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Jane" from "Jane Q. Smith"; "there" when no usable name is stored. */
export function greetingName(fullName: string | null | undefined): string {
  const first = (fullName || '').trim().split(/\s+/)[0] || '';
  return first && /[a-z]/i.test(first) ? first : 'there';
}

export function buildAppLaunchEmailHtml(fullName: string | null | undefined): string {
  const name = escapeHtml(greetingName(fullName));
  const getAppUrl = `${LAUNCH_SITE_URL}${GET_APP_PATH}`;
  const profileUrl = `${LAUNCH_SITE_URL}/profile`;
  const badge = (href: string, src: string, alt: string, width: number) => `
    <a href="${href}" style="display: inline-block; margin: 6px;" target="_blank">
      <img src="${LAUNCH_SITE_URL}/badges/${src}" alt="${alt}" height="${BADGE_HEIGHT}" width="${width}"
        style="display: block; height: ${BADGE_HEIGHT}px; width: ${width}px; border: 0;" />
    </a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${APP_LAUNCH_EMAIL_SUBJECT}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="display: none; max-height: 0; overflow: hidden;">Book courts in a couple of taps. Free on the App Store and Google Play.</div>
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px 16px;">
    <div style="background-color: ${BRAND_GREEN}; padding: 20px 24px; border-radius: 10px 10px 0 0;">
      <p style="color: #ffffff; margin: 0; font-size: 22px; font-weight: bold;">CourtTime</p>
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; padding: 28px 24px; color: #374151; font-size: 16px; line-height: 1.55;">
      <p style="margin: 0 0 16px;">Hi ${name},</p>
      <p style="margin: 0 0 16px; font-size: 22px; font-weight: bold; color: #111827; line-height: 1.3;">CourtTime is now an app for iPhone and Android.</p>
      <p style="margin: 0 0 16px;">Book a court at your club in a couple of taps, get a reminder before you play, and check the court calendar from anywhere.</p>
      <div style="text-align: center; margin: 24px 0 20px;">
        ${badge(APP_STORE_URL, 'app-store.png', 'Download on the App Store', 144)}
        ${badge(PLAY_STORE_URL, 'google-play.png', 'Get it on Google Play', 161)}
      </div>
      <p style="margin: 0 0 16px;">It's free. Sign in with the same email and password you use on the website, and your reservations will already be there.</p>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">Reading this on your phone? <a href="${getAppUrl}" style="color: ${BRAND_GREEN}; font-weight: bold;">Tap here</a> and we'll open the right store for you.</p>
    </div>
    <div style="padding: 16px 8px; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
      <p style="margin: 0 0 6px;">You're receiving this because you have a CourtTime account. To stop CourtTime emails, turn off email notifications on your <a href="${profileUrl}" style="color: #6b7280;">profile</a>.</p>
      <p style="margin: 0;">${COMPANY_MAILING_ADDRESS}</p>
    </div>
  </div>
</body>
</html>`;
}
