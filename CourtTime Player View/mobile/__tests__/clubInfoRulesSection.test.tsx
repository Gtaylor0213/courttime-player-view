/**
 * Club Info booking rules section. The rule formatting itself is covered in
 * shared/utils/__tests__/clubInfoRules.test.ts; what is mobile-specific — and
 * what these cover — is the gating: members only, and General Rules text only
 * under its flag.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

const mockAuthState: {
  user: Record<string, unknown> | null;
  facilityId: string | null;
  isLoading: boolean;
} = {
  user: { id: 'u1', memberFacilities: ['facility-1'], adminFacilities: [] },
  facilityId: 'facility-1',
  isLoading: false,
};

const mockEnabledFeatures = new Set<string>();

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => mockAuthState),
}));

jest.mock('../src/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: jest.fn(() => ({
    enabledFeatures: [...mockEnabledFeatures],
    isFeatureEnabled: (key: string) => mockEnabledFeatures.has(key),
    flagsLoaded: true,
    flagsFromCache: false,
    refreshFlags: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ facilityId: 'facility-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { api } from '../src/api/client';
import ClubInfoScreen from '../app/club-info';

const BOOKING_RULES = {
  advanceBookingDaysUnlimited: false,
  advanceBookingDays: 14,
  maxReservationDuration: { enabled: true, limit: 120 },
  hasPeakHours: true,
  peakHoursSlots: [
    { startTime: '17:00', endTime: '20:00', days: [1, 3], rules: { maxBookingsPerDay: 1 } },
  ],
};

let getSpy: ReturnType<typeof jest.spyOn>;

function mockFacility(overrides: Record<string, unknown> = {}) {
  getSpy.mockImplementation(async (url: string) => {
    if (url.includes('/courts')) return { success: true, data: { courts: [] } };
    if (url.includes('/schedule')) return { success: true, data: {} };
    return {
      success: true,
      data: {
        facility: {
          id: 'facility-1',
          name: 'Fields Club',
          bookingRules: BOOKING_RULES,
          ...overrides,
        },
      },
    };
  });
}

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    })
    .join(' ')
    .replace(/\s+/g, ' ');
}

async function render() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ClubInfoScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

beforeEach(() => {
  mockEnabledFeatures.clear();
  mockAuthState.user = { id: 'u1', memberFacilities: ['facility-1'], adminFacilities: [] };
  getSpy = jest.spyOn(api, 'get');
  mockFacility();
});

afterEach(() => {
  getSpy.mockRestore();
});

describe('Club Info booking rules section', () => {
  it('shows the configured rules to a member', async () => {
    const text = allText(await render());
    expect(text).toContain('Booking Rules & Policies');
    expect(text).toContain('Book up to:');
    expect(text).toContain('14 days in advance');
    expect(text).toContain('Max booking duration:');
    expect(text).toContain('2 hours');
  });

  it('lists peak hours with their limits', async () => {
    const text = allText(await render());
    expect(text).toContain('Peak Hours');
    expect(text).toContain('5:00 PM – 8:00 PM · Mon, Wed');
    expect(text).toContain('Max 1 booking(s) per day during peak hours');
  });

  it('splits the duration by court type when the facility does', async () => {
    mockFacility({
      bookingRules: {
        ...BOOKING_RULES,
        maxReservationDurationByCourtType: {
          enabled: true,
          tennisMinutes: 120,
          pickleballMinutes: 60,
        },
      },
    });
    const text = allText(await render());
    expect(text).toContain('Max duration (Tennis):');
    expect(text).toContain('Max duration (Pickleball):');
  });

  it('hides the whole section from a non-member', async () => {
    mockAuthState.user = { id: 'u1', memberFacilities: [], adminFacilities: [] };
    const text = allText(await render());
    expect(text).not.toContain('Booking Rules & Policies');
  });

  it('shows it to a facility admin', async () => {
    mockAuthState.user = { id: 'u1', memberFacilities: [], adminFacilities: ['facility-1'] };
    const text = allText(await render());
    expect(text).toContain('Booking Rules & Policies');
  });

  it('renders General Rules only under its flag, as readable text', async () => {
    mockFacility({ generalRules: '<p>No glass on court.</p>' });

    const withoutFlag = allText(await render());
    expect(withoutFlag).not.toContain('No glass on court.');

    mockEnabledFeatures.add(FEATURE_FLAGS.GENERAL_RULES);
    const withFlag = allText(await render());
    expect(withFlag).toContain('No glass on court.');
    expect(withFlag).not.toContain('<p>');
  });

  it('parses booking rules delivered as a JSON string', async () => {
    mockFacility({ bookingRules: JSON.stringify(BOOKING_RULES) });
    const text = allText(await render());
    expect(text).toContain('14 days in advance');
  });
});
