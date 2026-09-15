import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import BookCourtScreen from '../app/(tabs)/book';
import { api, paymentApi } from '../src/api/client';

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  createEventAsync: jest.fn(),
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: {
    OWNER: 'owner',
    EDITOR: 'editor',
    CONTRIBUTOR: 'contributor',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        storage.delete(key);
        return Promise.resolve();
      }),
      __reset: () => storage.clear(),
    },
  };
});

/**
 * Every field `book.tsx` reads off `useAuth()`. Declared as a hoisted function so
 * per-test overrides can spread it instead of rebuilding the object — rebuilding
 * is how the terms-acceptance fields went missing and broke this suite.
 */
function mockAuth(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      adminFacilities: ['facility-1'],
    },
    facilityId: 'facility-1',
    facilities: [{ id: 'facility-1', name: 'Test Club' }],
    setFacilityId: jest.fn(),
    selectedBookDate: '2026-05-04',
    setSelectedBookDate: jest.fn(),
    refreshTermsStatus: jest.fn(() => Promise.resolve()),
    acceptTermsAndContinue: jest.fn(() => Promise.resolve(true)),
    pendingTermsAcceptances: [],
    refreshGeneralRulesStatus: jest.fn(() => Promise.resolve()),
    acceptGeneralRulesAndContinue: jest.fn(() => Promise.resolve(true)),
    pendingGeneralRulesAcceptances: [],
    ...overrides,
  };
}

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => mockAuth()),
}));

/** Facility flags under test; per-test overrides push keys into this set. */
const mockEnabledFeatures = new Set<string>();

/** Lets a test swap the court the mocked grid opens the modal with. */
let mockCourtOverrides: Record<string, unknown> | null = null;

/** Named ball machines the facility has configured. */
let mockBallMachines: Array<{ id: string; name: string; isActive: boolean }> = [];

jest.mock('../src/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: jest.fn(() => ({
    enabledFeatures: [...mockEnabledFeatures],
    isFeatureEnabled: (key: string) => mockEnabledFeatures.has(key),
    flagsLoaded: true,
    flagsFromCache: false,
    refreshFlags: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('../src/components/CourtCalendarGrid', () => {
  const React = require('react');
  const { TouchableOpacity, Text, View } = require('react-native');
  return {
    CourtCalendarGrid: ({
      onBookingSelected,
    }: {
      onBookingSelected: (c: unknown, s: string, e: string) => void;
    }) => (
      <View testID="mock-grid">
        <TouchableOpacity
          testID="open-booking-modal"
          onPress={() =>
            onBookingSelected(
              mockCourtOverrides ?? {
                id: 'court-1',
                name: 'Court 1',
                status: 'available',
                isWalkUp: false,
                // The real grid passes courts straight from the facility list,
                // fees included.
                guestFeeCents: 1500,
              },
              '10:00:00',
              '11:00:00'
            )
          }
        >
          <Text>Open booking</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

jest.mock('../src/utils/alert', () => ({ showAlert: jest.fn(), showApiErrorAlert: jest.fn() }));
jest.mock('../src/utils/haptics', () => ({ hapticSuccess: jest.fn(), hapticError: jest.fn() }));
jest.mock('../src/components/StrikeLockoutBanner', () => ({
  StrikeLockoutBanner: () => null,
}));

jest.mock('../src/hooks/useOfflineApi', () => ({
  useOfflineApi: jest.fn(() => ({
    bannerState: 'online',
    lastCachedAt: null,
    fetchWithCache: jest.fn(),
    retryConnectivity: jest.fn(),
  })),
}));

function collectText(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (React.isValidElement(n) && (n.props as { children?: unknown }).children != null) {
      walk((n.props as { children?: unknown }).children);
    }
  };
  walk(node);
  return out;
}

async function pressByTestId(root: renderer.ReactTestRenderer, testId: string) {
  const el = root.root.findByProps({ testID: testId });
  await act(async () => {
    const ret = el.props.onPress?.();
    if (ret != null && typeof (ret as Promise<unknown>).then === 'function') {
      await ret;
    }
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Quick Reserve lives under the collapsed "More" tools section. */
async function expandBookingTools(root: renderer.ReactTestRenderer) {
  try {
    const toggle = root.root.findByProps({ accessibilityLabel: 'Show booking tools' });
    await act(async () => {
      toggle.props.onPress?.();
      await Promise.resolve();
    });
  } catch {
    /* already expanded */
  }
}

type TouchableLike = { props: { children?: unknown; onPress?: () => void } };
type ModalLike = { props: { visible?: boolean; children?: unknown } };

function pressTouchableContainingText(root: renderer.ReactTestRenderer, label: string) {
  try {
    const byA11y = root.root.findByProps({ accessibilityLabel: label });
    act(() => {
      (byA11y.props as { onPress?: () => void }).onPress?.();
    });
    return;
  } catch {
    /* fall through */
  }
  const buttons = [
    ...(root.root.findAllByType(TouchableOpacity) as TouchableLike[]),
    ...(root.root.findAllByType(Pressable) as TouchableLike[]),
  ];
  const match = buttons.find((b) => collectText(b.props.children).includes(label));
  if (!match) throw new Error(`No pressable containing "${label}"`);
  act(() => {
    match.props.onPress?.();
  });
}

function visibleModalTexts(root: renderer.ReactTestRenderer): string[] {
  const modals = root.root.findAllByType(Modal) as ModalLike[];
  const visible = modals.filter((m) => Boolean(m.props.visible));
  return visible.flatMap((m) => collectText(m.props.children));
}

describe('BookCourtScreen booking modal confirm copy', () => {
  let getSpy: jest.SpiedFunction<typeof api.get>;
  let createBookingSpy: jest.SpiedFunction<typeof paymentApi.bookings.create>;
  let tree: renderer.ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnabledFeatures.clear();
    mockCourtOverrides = null;
    mockBallMachines = [];
    tree = undefined;
    createBookingSpy = jest
      .spyOn(paymentApi.bookings, 'create')
      .mockResolvedValue({ success: true, data: {} });
    getSpy = jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/api/ball-machine/status/')) {
        return { success: true, data: { machines: mockBallMachines, activePasses: [] } };
      }
      if (url.includes('/api/facilities/') && url.includes('/courts')) {
        return {
          success: true,
          data: {
            courts: [
              {
                id: 'court-1',
                name: 'Court 1',
                status: 'available',
                isWalkUp: false,
                guestFeeCents: 1500,
              },
              { id: 'court-2', name: 'Court 2', status: 'available', isWalkUp: false },
            ],
          },
        };
      }
      if (url.includes('/api/bookings/facility/')) {
        return { success: true, data: { bookings: [] } };
      }
      if (url.includes('/api/court-config/facility/')) {
        return { success: true, data: { courtConfigs: [] } };
      }
      if (url.includes('/api/strikes/check/')) {
        return {
          success: true,
          data: { isLockedOut: false, activeStrikes: 0, threshold: 3 },
        };
      }
      if (url.includes('/availability')) {
        return {
          success: true,
          data: {
            date: '2026-05-04',
            isOpen: true,
            operatingHours: { open: '08:00', close: '21:00' },
            slotDuration: 30,
            existingBookings: [] as Array<{ startTime: string; endTime: string }>,
          },
        };
      }
      return { success: false, error: 'unexpected url in test mock: ' + url };
    });
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
      tree = undefined;
      await Promise.resolve();
    });
    createBookingSpy.mockRestore();
    getSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shows Confirm Booking with no extra courts; Book 2 Courts with one additional; resets after close and reopen', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T07:00:00'));

    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
    });
    await flushMicrotasks();

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });

    let texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Confirm Booking' })).not.toThrow();
    expect(texts).not.toContain('Book 2 Courts');

    await act(async () => {
      const expand = tree!.root.findByProps({ accessibilityLabel: 'Expand additional courts' });
      expand.props.onPress?.();
      await Promise.resolve();
    });

    await act(async () => {
      pressTouchableContainingText(tree!, 'Court 2');
      await Promise.resolve();
    });

    texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Book 2 Courts' })).not.toThrow();

    await act(async () => {
      await pressByTestId(tree!, 'dismiss-booking-modal');
    });

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });

    texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Confirm Booking' })).not.toThrow();
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Book 2 Courts' })).toThrow();

    jest.useRealTimers();
  });

  it('Quick Reserve keeps selected court when jumping selectedDate to today (no silent skip on confirm)', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T14:30:00'));

    const { useAuth } = require('../src/contexts/AuthContext');
    (useAuth as jest.Mock).mockImplementation(() =>
      mockAuth({
        user: { id: 'user-1', adminFacilities: [] },
        selectedBookDate: '2026-01-15',
      })
    );

    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
    });
    await flushMicrotasks();

    await expandBookingTools(tree!);

    await act(async () => {
      pressTouchableContainingText(tree!, 'Quick Reserve');
    });
    await flushMicrotasks();

    await act(async () => {
      pressTouchableContainingText(tree!, 'Confirm Booking');
    });
    await flushMicrotasks();

    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        facilityId: 'facility-1',
        userId: 'user-1',
        bookingDate: '2026-05-04',
      })
    );

    (useAuth as jest.Mock).mockImplementation(() => mockAuth());
  });

  it('offers Add to Calendar after a successful single-court booking', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T07:00:00'));

    const { showAlert } = require('../src/utils/alert');

    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
    });
    await flushMicrotasks();

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });
    await flushMicrotasks();

    await act(async () => {
      pressTouchableContainingText(tree!, 'Confirm Booking');
    });
    await flushMicrotasks();

    const bookedCall = (showAlert as jest.Mock).mock.calls.find((call: unknown[]) => call[0] === 'Booked!');

    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        facilityId: 'facility-1',
        userId: 'user-1',
      })
    );
    expect(bookedCall).toBeTruthy();
    expect(bookedCall?.[1]).toContain('Add it to your device calendar?');
    expect(bookedCall?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Not now' }),
        expect.objectContaining({ text: 'Add to Calendar' }),
      ])
    );

    jest.useRealTimers();
  });

  /**
   * Both capabilities used to be gated on isAdmin alone on mobile, while web
   * gates them on `isAdmin || flag`. A facility that switched the flag on gave
   * its members the feature on web and not in the app.
   */
  /** Renders as a plain member (no admin facilities) with the booking modal open. */
  async function renderAsMember() {
    const { useAuth } = require('../src/contexts/AuthContext');
    (useAuth as jest.Mock).mockImplementation(() =>
      mockAuth({ user: { id: 'user-1', adminFacilities: [] } })
    );
    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
    });
    await flushMicrotasks();
    await expandBookingTools(tree!);
    // The booking modal is where these controls live; the mocked calendar
    // grid opens it the same way the real grid does.
    await pressByTestId(tree!, 'open-booking-modal');
    await flushMicrotasks();
    return visibleModalTexts(tree!);
  }

  describe('flag-gated booking capabilities', () => {
    it('hides additional courts and recurring from a member when both flags are off', async () => {
      const texts = await renderAsMember();
      expect(texts.join(' ')).not.toContain('Additional Courts');
      expect(texts.join(' ')).not.toContain('Recurring Booking');
    });

    it('offers additional courts to a member when player_multiple_courts is on', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.PLAYER_MULTIPLE_COURTS);
      const texts = await renderAsMember();
      expect(texts.join(' ')).toContain('Additional Courts');
      expect(texts.join(' ')).not.toContain('Recurring Booking');
    });

    it('offers recurring to a member when player_recurring_bookings is on', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.PLAYER_RECURRING_BOOKINGS);
      const texts = await renderAsMember();
      expect(texts.join(' ')).toContain('Recurring Booking');
      expect(texts.join(' ')).not.toContain('Additional Courts');
    });
  });

  /**
   * Ball machines: with 2+ active machines the server rejects a booking that
   * does not name one ("Choose which ball machine to add"), so the picker is a
   * correctness requirement rather than a nicety.
   */
  describe('ball machine selection', () => {
    function courtWithMachineFee() {
      return {
        id: 'court-1',
        name: 'Court 1',
        status: 'available',
        isWalkUp: false,
        ballMachineFeeCents: 800,
      };
    }

    function renderedText(): string {
      return tree!.root
        .findAllByType(Text)
        .map((n) => {
          const c = n.props.children;
          return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
        })
        .join(' ');
    }

    async function enableBallMachine() {
      const toggle = tree!.root.findAll(
        (n) => typeof (n.props as { onValueChange?: unknown })?.onValueChange === 'function'
      );
      // The ball machine switch is the last toggle in the modal.
      await act(async () => {
        (toggle[toggle.length - 1]!.props as { onValueChange?: (v: boolean) => void }).onValueChange?.(
          true
        );
      });
      await flushMicrotasks();
    }

    it('shows no picker when the facility has a single machine', async () => {
      mockCourtOverrides = courtWithMachineFee();
      mockBallMachines = [{ id: 'm1', name: 'Tennis Machine', isActive: true }];
      await renderAsMember();
      await enableBallMachine();

      expect(renderedText()).not.toContain('Which ball machine?');
    });

    it('asks which machine once a second one exists', async () => {
      mockCourtOverrides = courtWithMachineFee();
      mockBallMachines = [
        { id: 'm1', name: 'Tennis Machine', isActive: true },
        { id: 'm2', name: 'Pickleball Machine', isActive: true },
      ];
      await renderAsMember();
      await enableBallMachine();

      const text = renderedText();
      expect(text).toContain('Which ball machine?');
      expect(text).toContain('Tennis Machine');
      expect(text).toContain('Pickleball Machine');
    });

    it('ignores inactive machines when deciding to ask', async () => {
      mockCourtOverrides = courtWithMachineFee();
      mockBallMachines = [
        { id: 'm1', name: 'Tennis Machine', isActive: true },
        { id: 'm2', name: 'Retired Machine', isActive: false },
      ];
      await renderAsMember();
      await enableBallMachine();

      expect(renderedText()).not.toContain('Which ball machine?');
    });
  });

  /**
   * Split court payments: the picker only appears for a paid court under the
   * flag, and the chosen participants have to reach the booking payload — this
   * is a money path, so the payload assertion is the point of the test.
   */
  describe('split court payments', () => {
    /** A paid court, so selectedCourtRequiresPayment is true. */
    function paidCourt() {
      return {
        id: 'court-1',
        name: 'Court 1',
        status: 'available',
        isWalkUp: false,
        requirePayment: true,
        bookingAmountCents: 4000,
      };
    }

    /**
     * The picker is a composite component, so its text does not appear in the
     * modal's static children — read the rendered tree.
     */
    function renderedText(): string {
      return tree!.root
        .findAllByType(Text)
        .map((n) => {
          const c = n.props.children;
          return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
        })
        .join(' ');
    }

    it('stays hidden when the flag is off', async () => {
      mockCourtOverrides = paidCourt();
      await renderAsMember();
      expect(renderedText()).not.toContain('Split this court fee');
    });

    it('is offered for a paid court when the flag is on', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.SPLIT_COURT_PAYMENTS);
      mockCourtOverrides = paidCourt();
      await renderAsMember();
      expect(renderedText()).toContain('Split this court fee with members');
    });

    it('stays hidden for an unpaid court even with the flag on', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.SPLIT_COURT_PAYMENTS);
      await renderAsMember();
      expect(renderedText()).not.toContain('Split this court fee');
    });

    it('stays hidden for a paid court when post-play settlement is on', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.SPLIT_COURT_PAYMENTS);
      mockEnabledFeatures.add(FEATURE_FLAGS.POST_PLAY_SETTLEMENT);
      mockCourtOverrides = paidCourt();
      await renderAsMember();
      expect(renderedText()).not.toContain('Split this court fee');
    });
  });

  /**
   * Guests: web collects a count (0-3) and a required name each. Mobile sent
   * only a bringGuest boolean, so admins saw nameless guests on the booking.
   */
  describe('guests', () => {
    function pressGuestCount(count: number) {
      const label = count === 0 ? 'No guests' : `${count} guest${count > 1 ? 's' : ''}`;
      const node = tree!.root.findAll(
        (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label
      )[0];
      if (!node) throw new Error(`no guest count control for "${label}"`);
      act(() => {
        (node.props as { onPress?: () => void }).onPress?.();
      });
    }

    /** Text is split across nodes, so collapse the joined whitespace. */
    function squash(parts: string[]): string {
      return parts.join(' ').replace(/\s+/g, ' ');
    }

    it('offers a guest count with the per-guest fee', async () => {
      const texts = squash(await renderAsMember());
      expect(texts).toContain('Guests');
      expect(texts).toContain('$15.00 per guest, max 3');
    });

    it('asks for a name per guest and totals the fee', async () => {
      await renderAsMember();
      pressGuestCount(2);
      await flushMicrotasks();

      expect(squash(visibleModalTexts(tree!))).toContain('= $30.00 guest fee');

      // findAll matches the composite and its host node, so count distinct labels.
      const names = new Set(
        tree!.root
          .findAll((n) =>
            /^Guest \d name$/.test((n.props as { accessibilityLabel?: string })?.accessibilityLabel || '')
          )
          .map((n) => (n.props as { accessibilityLabel: string }).accessibilityLabel)
      );
      expect([...names].sort()).toEqual(['Guest 1 name', 'Guest 2 name']);
    });

    it('blocks the booking until every guest is named', async () => {
      const { showAlert } = require('../src/utils/alert');
      await renderAsMember();
      pressGuestCount(1);
      await flushMicrotasks();

      await act(async () => {
        pressTouchableContainingText(tree!, 'Pay and Book');
      });
      await flushMicrotasks();

      expect(showAlert).toHaveBeenCalledWith('Booking failed', 'Please enter a name for each guest.');
      expect(createBookingSpy).not.toHaveBeenCalled();
    });
  });

  /**
   * Reservation type lists, mirroring web's BookingWizard: Deer Lake's list
   * replaces the standard one and makes a type mandatory; BHR's appends
   * "Party" to it.
   */
  describe('reservation type lists', () => {
    it('shows the standard list and marks the type optional by default', async () => {
      const texts = (await renderAsMember()).join(' ');
      expect(texts).toContain('Booking Type (Optional)');
      expect(texts).toContain('Fun');
      expect(texts).not.toContain('ALTA Tennis');
      expect(texts).not.toContain('Party');
    });

    it('swaps in the Deer Lake list and drops the optional labelling', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.DEER_LAKE_RESERVATION_TYPES);
      const texts = (await renderAsMember()).join(' ');
      expect(texts).toContain('ALTA Tennis');
      expect(texts).toContain('General Pickleball');
      // The standard list is replaced, not extended.
      expect(texts).not.toContain('Flex Match (T-2)');
      expect(texts).toContain('Booking Type');
      expect(texts).not.toContain('Booking Type (Optional)');
    });

    it('appends Party to the standard list for BHR', async () => {
      mockEnabledFeatures.add(FEATURE_FLAGS.BHR_RESERVATION_TYPES);
      const texts = (await renderAsMember()).join(' ');
      expect(texts).toContain('Party');
      expect(texts).toContain('Fun');
      expect(texts).toContain('Booking Type (Optional)');
    });

    it('clears the default type when the active list does not offer it', async () => {
      // The 'match' default is absent from Deer Lake's list. If it survived,
      // the chip row would show nothing selected while still submitting
      // 'match', and the required-type check would pass it through.
      mockEnabledFeatures.add(FEATURE_FLAGS.DEER_LAKE_RESERVATION_TYPES);
      await renderAsMember();

      const selected = tree!.root
        .findAll((n) => Boolean((n.props as { accessibilityState?: { selected?: boolean } })?.accessibilityState?.selected))
        .map((n) => collectText((n.props as { children?: unknown }).children).join(' '));

      expect(selected.join(' ')).not.toContain('Fun');
    });
  });
});
