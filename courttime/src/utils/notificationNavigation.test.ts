import { describe, expect, it } from 'vitest';
import { resolveNotificationPath } from './notificationNavigation';

describe('resolveNotificationPath', () => {
  it('prefers a same-origin actionUrl', () => {
    expect(
      resolveNotificationPath({
        type: 'facility_announcement',
        actionUrl: '/admin/members?status=pending',
      })
    ).toBe('/admin/members?status=pending');
  });

  it('rejects external or protocol-relative URLs', () => {
    expect(
      resolveNotificationPath({
        type: 'facility_announcement',
        actionUrl: 'https://evil.example/phish',
      })
    ).toBeNull();

    expect(
      resolveNotificationPath({
        type: 'facility_announcement',
        actionUrl: '//evil.example/phish',
      })
    ).toBeNull();
  });

  it('falls back by notification type when actionUrl is missing', () => {
    expect(resolveNotificationPath({ type: 'reservation_cancelled' })).toBe('/my-reservations');
    expect(resolveNotificationPath({ type: 'payment_received' })).toBe('/payments');
    expect(resolveNotificationPath({ type: 'weather_alert' })).toBe('/calendar');
  });
});
