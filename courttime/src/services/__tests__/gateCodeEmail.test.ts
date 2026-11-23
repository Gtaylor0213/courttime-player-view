import { describe, it, expect } from 'vitest';
import { EMAIL_TEMPLATE_TYPES, insertGateCodeLine, renderTemplate } from '../emailTemplateDefaults';
import { normalizeGateCode } from '../gateCodeService';

const defaultBody = EMAIL_TEMPLATE_TYPES.booking_confirmation.defaultBody;

describe('insertGateCodeLine', () => {
  it('leaves the template untouched when there is no code', () => {
    expect(insertGateCodeLine(defaultBody, null)).toBe(defaultBody);
    expect(insertGateCodeLine(defaultBody, '')).toBe(defaultBody);
  });

  it('puts the Gate Code line between Court and Date in the default template', () => {
    const out = renderTemplate(insertGateCodeLine(defaultBody, '4821'), { courtName: '11A', date: 'Nov 20, 2026' });
    const court = out.indexOf('<strong>Court:</strong> 11A');
    const gate = out.indexOf('<strong>Gate Code:</strong> 4821');
    const date = out.indexOf('<strong>Date:</strong>');
    expect(court).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(court);
    expect(date).toBeGreaterThan(gate);
  });

  it('falls back to before the Date line when a custom template has no court', () => {
    const tpl = '<p>Hi</p><p>When: {{date}}</p>';
    expect(insertGateCodeLine(tpl, '99')).toMatch(/<p>Hi<\/p><p[^>]*><strong>Gate Code:<\/strong> 99<\/p>\s*<p>When/);
  });

  it('appends when neither court nor date is present', () => {
    expect(insertGateCodeLine('<p>Hi</p>', '7')).toMatch(/<p>Hi<\/p>\n<p[^>]*><strong>Gate Code:<\/strong> 7<\/p>$/);
  });

  it('escapes HTML in the code', () => {
    expect(insertGateCodeLine(defaultBody, '<b>1</b>')).toContain('&lt;b&gt;1&lt;/b&gt;');
  });
});

describe('normalizeGateCode', () => {
  it('trims, blanks to null, and caps length', () => {
    expect(normalizeGateCode('  12#34 ')).toBe('12#34');
    expect(normalizeGateCode('   ')).toBeNull();
    expect(normalizeGateCode(undefined)).toBeNull();
    expect(normalizeGateCode('x'.repeat(100))).toHaveLength(64);
  });
});

import { bookingWithDetailsToCalendarDetails, buildIcsEventContent, withGateCode } from '../../../shared/utils/bookingCalendar';

describe('gate code in calendar notes', () => {
  const base = { courtName: '11A', facilityName: 'Glen Abbey PB', bookingDate: '2026-11-21', startTime: '09:00', endTime: '10:00' };

  it('puts the gate code first in the event notes and on the details', () => {
    const d = bookingWithDetailsToCalendarDetails({ ...base, gateCode: '4821' });
    expect(d.notes?.split('\n')[0]).toBe('Gate code: 4821');
    expect(d.gateCode).toBe('4821');
    expect(buildIcsEventContent(d)).toContain('Gate code: 4821');
  });

  it('leaves notes alone without a code and does not duplicate the line', () => {
    const d = bookingWithDetailsToCalendarDetails(base);
    expect(d.notes).not.toContain('Gate code');
    expect(d.gateCode).toBeUndefined();
    const once = withGateCode(d, '1');
    expect(withGateCode(once, '1').notes).toBe(once.notes);
  });
});

import { buildGoogleCalendarUrl } from '../../../shared/utils/bookingCalendar';
import { buildCalendarButtonsHtml } from '../emailTemplateDefaults';
import { signBookingCalendarToken, verifyBookingCalendarToken } from '../bookingCalendarLinkService';

describe('calendar links in booking emails', () => {
  it('keeps club wall-clock time in the Google link', () => {
    const url = new URL(buildGoogleCalendarUrl(
      bookingWithDetailsToCalendarDetails({ courtName: '11A', bookingDate: '2026-11-21', startTime: '09:00:00', endTime: '10:00:00', gateCode: '4821' }),
      { timeZone: 'America/Chicago' }
    ));
    expect(url.searchParams.get('dates')).toBe('20261121T090000/20261121T100000');
    expect(url.searchParams.get('ctz')).toBe('America/Chicago');
    expect(url.searchParams.get('details')).toContain('Gate code: 4821');
  });

  it('escapes ampersands in button links', () => {
    expect(buildCalendarButtonsHtml('https://x.test/?a=1&b=2', '#')).toContain('a=1&amp;b=2');
  });

  it('accepts a signed token only for the same booking and member', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const token = signBookingCalendarToken('b1', 'u1');
    expect(verifyBookingCalendarToken('b1', 'u1', token)).toBe(true);
    expect(verifyBookingCalendarToken('b2', 'u1', token)).toBe(false);
    expect(verifyBookingCalendarToken('b1', 'u2', token)).toBe(false);
    expect(verifyBookingCalendarToken('b1', 'u1', 'short')).toBe(false);
  });
});
