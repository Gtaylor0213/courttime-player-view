import { describe, expect, it } from 'vitest';
import { wrapInBrandedEmail } from '../brandedEmail';
import { buildNewsletterEmailHtml } from '../newsletterEmail';
import { wrapInEmailLayout } from '../../../src/services/emailTemplateDefaults';
import { buildAppLaunchEmailHtml } from '../../../src/services/appLaunchEmailTemplate';

const APP_STORE = 'https://apps.apple.com/app/id6826902090';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.courttime.player';
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('every CourtTime email carries the app store buttons', () => {
  it('club email layout (bookings, strikes, invites, announcements…)', () => {
    const html = wrapInEmailLayout('<p>Your booking is confirmed.</p>', 'Sunset Tennis');
    expect(html).toContain('Get the CourtTime app');
    expect(count(html, APP_STORE)).toBe(1);
    expect(count(html, PLAY_STORE)).toBe(1);
  });

  it('branded layout (newsletters)', () => {
    const html = buildNewsletterEmailHtml({ subject: 'News', body: 'Hello everyone' });
    expect(count(html, APP_STORE)).toBe(1);
    expect(count(html, PLAY_STORE)).toBe(1);
  });

  it('never doubles the buttons when the body already shows them', () => {
    expect(count(buildAppLaunchEmailHtml('Ann'), APP_STORE)).toBe(1);
    const withBadges = wrapInBrandedEmail({
      title: 't',
      bodyHtml: '<img src="https://www.courttimeapp.com/badges/app-store.png" />',
    });
    expect(withBadges).not.toContain('Get the CourtTime app');
  });
});
