/**
 * Bulletin post create form: the POST body and validation must match what the
 * web BulletinPostCreateModal sends, so posts created on mobile behave the same
 * (signups, payments, recurrence, expiry).
 */
import { describe, expect, it } from '@jest/globals';
import {
  buildBulletinPostBody,
  validateBulletinPostForm,
} from '../src/components/BulletinPostCreateModal';

type Form = Parameters<typeof buildBulletinPostBody>[0];

const base: Form = {
  title: ' Friday Drill ',
  description: ' Bring a can of balls ',
  type: 'drill',
  eventDate: '2026-10-02',
  eventTime: '18:00',
  eventDurationMinutes: '90',
  maxParticipants: '8',
  minParticipants: '4',
  cancelIfMinNotMet: true,
  drillCourtId: 'court-1',
  drillGenderRestriction: 'any',
  drillShowParticipants: true,
  expiresInDays: 'after_event',
  recurrenceEnabled: true,
  recurrenceFrequency: 'weekly',
  recurrenceEndType: 'occurrences',
  recurrenceOccurrences: '6',
  recurrenceEndDate: '',
  requirePayment: true,
  signupFeeDollars: '25.00',
};

describe('buildBulletinPostBody', () => {
  it('sends every web field for a signup post', () => {
    const body = buildBulletinPostBody(base, 'fac-1', 'user-1');
    expect(body).toMatchObject({
      facilityId: 'fac-1',
      title: 'Friday Drill',
      content: 'Bring a can of balls',
      category: 'drill',
      isAdminPost: true,
      expiresAfterEvent: true,
      drillStartAt: new Date('2026-10-02T18:00').toISOString(),
      drillDurationMinutes: 90,
      drillCourtId: 'court-1',
      drillMaxParticipants: 8,
      drillGenderRestriction: 'any',
      drillShowParticipants: true,
      cancelIfMinNotMet: true,
      minParticipants: 4,
      requirePayment: true,
      signupAmountCents: 2500,
      signupFeeDollars: '25.00',
      recurrence: { frequency: 'weekly', occurrenceCount: 6 },
    });
    expect(body).not.toHaveProperty('expiresInDays');
  });

  it('keeps announcements simple and uses expiresInDays as a number', () => {
    const body = buildBulletinPostBody(
      { ...base, type: 'announcement', expiresInDays: '30' },
      'fac-1',
      'user-1'
    );
    expect(body).toMatchObject({ category: 'announcement', expiresInDays: 30 });
    for (const key of ['drillStartAt', 'drillCourtId', 'recurrence', 'requirePayment', 'minParticipants']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('omits recurrence for types that cannot repeat and payment when the fee is empty', () => {
    const body = buildBulletinPostBody(
      { ...base, type: 'social', requirePayment: true, signupFeeDollars: '' },
      'fac-1',
      'user-1'
    );
    expect(body).not.toHaveProperty('recurrence');
    expect(body).not.toHaveProperty('requirePayment');
  });
});

describe('validateBulletinPostForm', () => {
  it('accepts a complete signup form', () => {
    expect(validateBulletinPostForm(base)).toBeNull();
  });

  it('requires date, time and court for signup types', () => {
    expect(validateBulletinPostForm({ ...base, drillCourtId: '' })).toMatch(/date\/time and court/);
  });

  it('requires a minimum when auto-cancel is on', () => {
    expect(validateBulletinPostForm({ ...base, minParticipants: '' })).toMatch(/Min Participants/);
  });

  it('requires a fee greater than $0 for paid signups', () => {
    expect(validateBulletinPostForm({ ...base, signupFeeDollars: '0' })).toMatch(/greater than \$0/);
  });

  it('requires a recurrence end', () => {
    expect(
      validateBulletinPostForm({ ...base, recurrenceEndType: 'date', recurrenceEndDate: '' })
    ).toMatch(/end date/);
  });

  it('only needs title and description for announcements', () => {
    expect(
      validateBulletinPostForm({ ...base, type: 'announcement', eventDate: '', eventTime: '', drillCourtId: '' })
    ).toBeNull();
  });
});
