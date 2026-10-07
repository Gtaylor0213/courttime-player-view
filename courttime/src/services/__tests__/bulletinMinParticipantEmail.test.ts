import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const fetchMock = vi.fn();
const isEmailBookingConfirmationsEnabledMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../userPreferencesService', () => ({
  isEmailBookingConfirmationsEnabled: (...args: unknown[]) =>
    isEmailBookingConfirmationsEnabledMock(...args),
  isEmailNotificationsEnabled: vi.fn().mockResolvedValue(false),
}));

vi.stubEnv('RESEND_API_KEY', 're_test_bulletin_cancel');
vi.stubEnv('RESEND_FROM_EMAIL', 'CourtTime <test@courttime.test>');

global.fetch = fetchMock as typeof fetch;

import { sendBulletinMinParticipantsNotMetEmail } from '../emailService';

describe('sendBulletinMinParticipantsNotMetEmail', () => {
  beforeEach(() => {
    queryMock.mockReset();
    fetchMock.mockReset();
    isEmailBookingConfirmationsEnabledMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'email_1' }),
    });
  });

  it('uses booking confirmation email preference, not general notifications', async () => {
    isEmailBookingConfirmationsEnabledMock.mockResolvedValue(true);

    await sendBulletinMinParticipantsNotMetEmail(
      'player@club.com',
      'Player One',
      'Sunset Tennis',
      'Friday Drill',
      'Drill',
      'May 20, 2026, 6:00 PM',
      4,
      2,
      'user-1'
    );

    expect(isEmailBookingConfirmationsEnabledMock).toHaveBeenCalledWith('user-1');
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.subject).toContain('Drill Cancelled');
    expect(body.html).toContain('minimum participant count was not met');
    expect(body.html).toContain('your card will be refunded');
  });

  it('skips send when booking confirmation emails are disabled', async () => {
    isEmailBookingConfirmationsEnabledMock.mockResolvedValue(false);

    const result = await sendBulletinMinParticipantsNotMetEmail(
      'player@club.com',
      'Player One',
      'Sunset Tennis',
      'Friday Drill',
      'Drill',
      'May 20, 2026, 6:00 PM',
      4,
      2,
      'user-1'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
