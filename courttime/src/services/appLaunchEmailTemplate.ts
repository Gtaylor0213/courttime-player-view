/**
 * The one-time "CourtTime is in the app stores" email sent to every account.
 *
 * The badge images (public/badges) load from the live site, so they have to be
 * deployed before anyone gets it. The shell is shared/utils/brandedEmail.ts.
 */
import { APP_STORE_URL, GET_APP_PATH, PLAY_STORE_URL } from '../../shared/utils/appDownload';
import {
  BRAND_GREEN,
  COMPANY_MAILING_ADDRESS,
  EMAIL_SITE_URL,
  escapeEmailHtml,
  wrapInBrandedEmail,
} from '../../shared/utils/brandedEmail';

export { COMPANY_MAILING_ADDRESS };
export const LAUNCH_SITE_URL = EMAIL_SITE_URL;
export const APP_LAUNCH_EMAIL_SUBJECT = 'The CourtTime app is here: iPhone and Android';

const BADGE_HEIGHT = 48;

/** "Jane" from "Jane Q. Smith"; "there" when no usable name is stored. */
export function greetingName(fullName: string | null | undefined): string {
  const first = (fullName || '').trim().split(/\s+/)[0] || '';
  return first && /[a-z]/i.test(first) ? first : 'there';
}

export function buildAppLaunchEmailHtml(fullName: string | null | undefined): string {
  const name = escapeEmailHtml(greetingName(fullName));
  const getAppUrl = `${LAUNCH_SITE_URL}${GET_APP_PATH}`;
  const badge = (href: string, src: string, alt: string, width: number) => `
    <a href="${href}" style="display: inline-block; margin: 6px;" target="_blank">
      <img src="${LAUNCH_SITE_URL}/badges/${src}" alt="${alt}" height="${BADGE_HEIGHT}" width="${width}"
        style="display: block; height: ${BADGE_HEIGHT}px; width: ${width}px; border: 0;" />
    </a>`;

  return wrapInBrandedEmail({
    title: APP_LAUNCH_EMAIL_SUBJECT,
    preheader: 'Book courts in a couple of taps. Free on the App Store and Google Play.',
    bodyHtml: `      <p style="margin: 0 0 16px;">Hi ${name},</p>
      <p style="margin: 0 0 16px; font-size: 22px; font-weight: bold; color: #111827; line-height: 1.3;">CourtTime is now an app for iPhone and Android.</p>
      <p style="margin: 0 0 16px;">Book a court at your club in a couple of taps, get a reminder before you play, and check the court calendar from anywhere.</p>
      <div style="text-align: center; margin: 24px 0 20px;">
        ${badge(APP_STORE_URL, 'app-store.png', 'Download on the App Store', 144)}
        ${badge(PLAY_STORE_URL, 'google-play.png', 'Get it on Google Play', 161)}
      </div>
      <p style="margin: 0 0 16px;">It's free. Sign in with the same email and password you use on the website, and your reservations will already be there.</p>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">Reading this on your phone? <a href="${getAppUrl}" style="color: ${BRAND_GREEN}; font-weight: bold;">Tap here</a> and we'll open the right store for you.</p>`,
  });
}
