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
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'group_pickleball_lesson', courtIds: ['c2'] }),
    ).toBeNull();
  });

  it('rejects a type for the other sport', async () => {
    courtsOf('Tennis');
    expect(
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'general_pickleball', courtIds: ['c1'] }),
    ).toBe("General Pickleball isn't available on tennis courts. Please choose a different reservation type.");
    courtsOf('Pickleball');
    expect(await checkReservationType({ facilityId: 'deerlake', bookingType: 'cardio_tennis', courtIds: ['c2'] })).toBe(
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
      await checkReservationType({ facilityId: 'deerlake', bookingType: 'maintenance', courtIds: ['c1', 'c2'] }),
    ).toBeNull();
  });
});

describe('sameCourtSet', () => {
  it('ignores order and duplicates', () => {
    expect(sameCourtSet(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
    expect(sameCourtSet(['a'], ['a', 'b'])).toBe(false);
  });
});
