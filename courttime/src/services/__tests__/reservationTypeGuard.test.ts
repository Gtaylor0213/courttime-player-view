import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const isFeatureEnabledMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../featureFlagService', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabledMock(...args),
}));

import { checkReservationType, sameCourtSet } from '../reservationTypeGuard';

function courtsOf(...types: string[]) {
  queryMock.mockResolvedValueOnce({ rows: types.map((court_type) => ({ court_type })) });
}

describe('checkReservationType', () => {
  beforeEach(() => {
    queryMock.mockReset();
    isFeatureEnabledMock.mockReset();
    isFeatureEnabledMock.mockResolvedValue(true);
  });

  it('allows anything at clubs without the Deer Lake list', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    expect(await checkReservationType({ facilityId: 'other', bookingType: 'match', courtIds: ['c1'] })).toBeNull();
    expect(await checkReservationType({ facilityId: 'other', bookingType: undefined, courtIds: ['c1'] })).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('requires a type at Deer Lake', async () => {
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: '', courtIds: ['c1'] })).toBe(
      'Please select a reservation type.',
    );
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: undefined, courtIds: ['c1'] })).toBe(
      'Please select a reservation type.',
    );
  });

  it('rejects "Fun" and other types that are not on the Deer Lake list', async () => {
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: 'match', courtIds: ['c1'] })).toBe(
      "Please select one of this club's reservation types.",
    );
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'Match, Lesson', courtIds: ['c1'] }),
    ).toBe("Please select one of this club's reservation types.");
  });

  it('accepts a type that fits the court', async () => {
    courtsOf('Tennis');
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: 'general_tennis', courtIds: ['c1'] })).toBeNull();
    courtsOf('Pickleball');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'group_pickleball_lesson', courtIds: ['c2'], isAdmin: true }),
    ).toBeNull();
  });

  it('rejects a type for the other sport', async () => {
    courtsOf('Tennis');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'general_pickleball', courtIds: ['c1'] }),
    ).toBe("General Pickleball isn't available on tennis courts. Please choose a different reservation type.");
    courtsOf('Pickleball');
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: 'cardio_tennis', courtIds: ['c2'], isAdmin: true })).toBe(
      "Cardio Tennis isn't available on pickleball courts. Please choose a different reservation type.",
    );
  });

  it('allows only types that fit both sports on a mixed booking', async () => {
    courtsOf('Tennis', 'Pickleball');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'general_tennis', courtIds: ['c1', 'c2'] }),
    ).toBe(
      "General Tennis can't be booked on tennis and pickleball courts together. Please choose a different reservation type.",
    );
    courtsOf('Tennis', 'Pickleball');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'maintenance', courtIds: ['c1', 'c2'], isAdmin: true }),
    ).toBeNull();
  });
});

describe('sameCourtSet', () => {
  it('ignores order and duplicates', () => {
    expect(sameCourtSet(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
    expect(sameCourtSet(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('checkReservationType admin-only types', () => {
  beforeEach(() => {
    queryMock.mockReset();
    isFeatureEnabledMock.mockReset();
    isFeatureEnabledMock.mockResolvedValue(true);
  });

  it('lets members book the types open to everyone, including the new practice types', async () => {
    courtsOf('Tennis');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'team_tennis_practice', courtIds: ['c1'], userId: 'u1' }),
    ).toBeNull();
    courtsOf('Pickleball');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'team_pickleball_practice', courtIds: ['c2'], userId: 'u1' }),
    ).toBeNull();
  });

  it('rejects an admin-only type from a member who is not a facility admin', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // facility_admins lookup
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'private_tennis_lesson', courtIds: ['c1'], userId: 'u1' }),
    ).toBe('Private Tennis Lesson can only be booked by a club admin. Please choose a different reservation type.');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'maintenance', courtIds: ['c1'] }),
    ).toBe('Maintenance can only be booked by a club admin. Please choose a different reservation type.');
  });

  it('allows admin-only types for admins and facility admins', async () => {
    courtsOf('Tennis');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'cardio_tennis', courtIds: ['c1'], isAdmin: true }),
    ).toBeNull();
    queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // facility_admins lookup
    courtsOf('Tennis');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'cardio_tennis', courtIds: ['c1'], userId: 'fa1' }),
    ).toBeNull();
  });
});
