/**
 * The five flagged screens behind the More tab.
 *
 * Each covers the states a member actually hits: loaded, empty, and the one
 * action the screen exists for. The flag gating itself is covered by
 * moreMenu.test.ts — these assume the screen has been reached.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAuthState = { facilityId: 'facility-1', user: { id: 'u1' } };

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => mockAuthState),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../src/utils/alert', () => ({
  showAlert: jest.fn(),
  showApiErrorAlert: jest.fn(),
}));

jest.mock('../src/utils/payments', () => ({
  formatCentsAsUsd: (cents?: number | null) => `$${((cents ?? 0) / 100).toFixed(2)}`,
  openStripeCheckout: jest.fn(() => Promise.resolve(true)),
  courtRequiresPayment: () => false,
  courtGuestFeeCents: () => null,
  courtBallMachineFeeCents: () => null,
  scaleHourlyFeeCents: (c: number) => c,
}));

import { api } from '../src/api/client';
import BallMachineScreen from '../app/ball-machine';
import LessonsScreen from '../app/lessons';
import LevelGroupScreen from '../app/level-group';
import ProShopScreen from '../app/pro-shop';
import PadelScreen from '../app/padel';

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

function pressA11y(tree: renderer.ReactTestRenderer, label: string) {
  const node = tree.root.findAll(
    (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label
  )[0];
  if (!node) throw new Error(`no control labelled "${label}"`);
  act(() => {
    (node.props as { onPress?: () => void }).onPress?.();
  });
}

async function render(Screen: React.ComponentType) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Screen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

let getSpy: ReturnType<typeof jest.spyOn>;
let postSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  getSpy = jest.spyOn(api, 'get');
  postSpy = jest.spyOn(api, 'post');
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('Ball Machine screen', () => {
  function statusResponse(over: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        success: true,
        data: {
          machines: [
            { id: 'm1', name: 'Tennis Machine', isActive: true, hourlyFeeCents: 800, hasAccessCode: true },
          ],
          products: [{ id: 'p1', machineId: null, durationMonths: 3, priceCents: 9000 }],
          activePasses: [],
          ...over,
        },
      },
    };
  }

  it('lists machines and the passes on sale', async () => {
    getSpy.mockResolvedValue(statusResponse() as never);
    const text = allText(await render(BallMachineScreen));
    expect(text).toContain('Tennis Machine');
    expect(text).toContain('3 months');
    expect(text).toContain('$90.00');
    expect(text).toContain('All machines');
  });

  it('shows an active pass with its expiry', async () => {
    getSpy.mockResolvedValue(
      statusResponse({
        activePasses: [
          { id: 'pass1', machineId: null, durationMonths: 3, expiresAt: '2026-12-01T00:00:00Z', status: 'active' },
        ],
      }) as never
    );
    const text = allText(await render(BallMachineScreen));
    expect(text).toContain('Your passes');
    expect(text).toContain('Active until');
  });

  it('reveals the keypad code on request', async () => {
    getSpy.mockImplementation(async (url: string) => {
      if (url.includes('/access-code/')) {
        return {
          success: true,
          data: { success: true, data: { machineName: 'Tennis Machine', accessCode: '4821' } },
        };
      }
      return statusResponse();
    });

    const tree = await render(BallMachineScreen);
    expect(allText(tree)).not.toContain('4821');

    pressA11y(tree, 'Show access code for Tennis Machine');
    await act(async () => {
      await Promise.resolve();
    });

    expect(allText(tree)).toContain('4821');
  });

  it('explains when the member has not paid for the code', async () => {
    const { showAlert } = require('../src/utils/alert');
    getSpy.mockImplementation(async (url: string) => {
      if (url.includes('/access-code/')) {
        return { success: false, error: 'Buy a ball machine pass or add the machine to a booking to see the code' };
      }
      return statusResponse();
    });

    const tree = await render(BallMachineScreen);
    pressA11y(tree, 'Show access code for Tennis Machine');
    await act(async () => {
      await Promise.resolve();
    });

    expect(showAlert).toHaveBeenCalledWith(
      'Access code',
      expect.stringContaining('Buy a ball machine pass')
    );
  });

  it('shows an empty state when the club has no machines', async () => {
    getSpy.mockResolvedValue(statusResponse({ machines: [], products: [] }) as never);
    expect(allText(await render(BallMachineScreen))).toContain('No ball machines');
  });
});

describe('Lessons screen', () => {
  it('lists upcoming lessons with their details', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: {
        posts: [
          {
            id: 'l1',
            title: 'Saturday Clinic',
            content: 'Doubles strategy',
            category: 'clinic',
            drillStartAt: '2026-10-03T14:00:00Z',
            drillCourtName: 'Court 2',
            drillMaxParticipants: 8,
            drillConfirmedCount: 5,
            requirePayment: true,
            signupAmountCents: 2500,
          },
        ],
      },
    } as never);

    const text = allText(await render(LessonsScreen));
    expect(text).toContain('Saturday Clinic');
    expect(text).toContain('Court 2');
    expect(text).toContain('5 / 8 signed up');
    expect(text).toContain('$25.00');
  });

  it('says so when the member is already signed up', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: {
        posts: [
          { id: 'l1', title: 'Clinic', category: 'clinic', currentUserSignupStatus: 'confirmed' },
        ],
      },
    } as never);
    expect(allText(await render(LessonsScreen))).toContain("You're signed up");
  });

  it('shows an empty state when nothing is scheduled', async () => {
    getSpy.mockResolvedValue({ success: true, data: { posts: [] } } as never);
    expect(allText(await render(LessonsScreen))).toContain('No lessons scheduled');
  });
});

describe('My Player Group screen', () => {
  it('shows the group and its other members', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: {
          group: { id: 'g1', name: 'Group B', rank: 2, totalGroups: 4 },
          members: [{ userId: 'u2', fullName: 'Dana Other', skillLevel: '3.5' }],
        },
      },
    } as never);

    const text = allText(await render(LevelGroupScreen));
    expect(text).toContain('Group B');
    expect(text).toContain('Group 2 of 4');
    expect(text).toContain('Dana Other');
  });

  it('explains a hidden or unassigned group rather than showing nothing', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { success: true, data: { group: null, members: [] } },
    } as never);
    expect(allText(await render(LevelGroupScreen))).toContain("You're not in a group yet");
  });
});

describe('Player Groups admin board', () => {
  const adminUser = { id: 'u1', adminFacilities: ['facility-1'] };
  const board = {
    groups: [
      {
        id: 'g1',
        name: '4.0',
        sortPosition: 0,
        isVisibleToPlayers: true,
        members: [{ userId: 'u2', fullName: 'Dana Other', skillLevel: '4.0', isFacilityAdmin: false }],
      },
      { id: 'g2', name: '3.5', sortPosition: 1, isVisibleToPlayers: false, members: [] },
    ],
    unassigned: [{ userId: 'u3', fullName: 'Pat Pool', skillLevel: null, isFacilityAdmin: true }],
  };

  beforeEach(() => {
    (mockAuthState as { user: unknown }).user = adminUser;
    getSpy.mockResolvedValue({ success: true, data: { success: true, data: board } } as never);
  });
  afterEach(() => {
    (mockAuthState as { user: unknown }).user = { id: 'u1' };
  });

  it('shows every tier with its players and the unassigned pool', async () => {
    const text = allText(await render(LevelGroupScreen));
    expect(getSpy).toHaveBeenCalledWith('/api/player-level-groups/facility-1');
    expect(text).toContain('4.0');
    expect(text).toContain('Dana Other');
    expect(text).toContain('3.5');
    expect(text).toContain('Unassigned');
    expect(text).toContain('Pat Pool');
    expect(text).toContain('Admin');
  });

  it('creates a tier from the Add Level row', async () => {
    postSpy.mockResolvedValue({ success: true, data: { success: true, data: { group: {} } } } as never);
    const tree = await render(LevelGroupScreen);
    const input = tree.root.findAll((n) => n.props.placeholder === 'New group name (e.g. 3.5)')[0];
    act(() => {
      input.props.onChangeText('3.0');
    });
    pressA11y(tree, 'Add level');
    await act(async () => {
      await Promise.resolve();
    });
    expect(postSpy).toHaveBeenCalledWith('/api/player-level-groups/facility-1/groups', { name: '3.0' });
  });

  it('moves a player to another tier from the player menu', async () => {
    const putSpy = jest.spyOn(api, 'put').mockResolvedValue({ success: true, data: {} } as never);
    const tree = await render(LevelGroupScreen);
    pressA11y(tree, 'Move Pat Pool');
    pressA11y(tree, '4.0');
    await act(async () => {
      await Promise.resolve();
    });
    expect(putSpy).toHaveBeenCalledWith('/api/player-level-groups/facility-1/assignments', {
      userIds: ['u3'],
      groupId: 'g1',
      position: undefined,
    });
    putSpy.mockRestore();
  });
});

describe('Pro Shop screen', () => {
  function shopResponses(products: unknown[], orders: unknown[] = []) {
    return async (url: string) => {
      if (url.includes('/my-orders/')) return { success: true, data: { success: true, data: orders } };
      return { success: true, data: { success: true, data: products } };
    };
  }

  it('lists products with prices', async () => {
    getSpy.mockImplementation(
      shopResponses([{ id: 'p1', name: 'Grip Tape', price_cents: 1200, stock_quantity: 10 }]) as never
    );
    const text = allText(await render(ProShopScreen));
    expect(text).toContain('Grip Tape');
    expect(text).toContain('$12.00');
  });

  it('builds a basket and totals it', async () => {
    getSpy.mockImplementation(
      shopResponses([{ id: 'p1', name: 'Grip Tape', price_cents: 1200, stock_quantity: 10 }]) as never
    );
    const tree = await render(ProShopScreen);

    pressA11y(tree, 'Add one Grip Tape');
    pressA11y(tree, 'Add one Grip Tape');
    await act(async () => {
      await Promise.resolve();
    });

    const text = allText(tree);
    expect(text).toContain('2 items');
    expect(text).toContain('$24.00');
  });

  it('will not add more than the club has in stock', async () => {
    getSpy.mockImplementation(
      shopResponses([{ id: 'p1', name: 'Last One', price_cents: 500, stock_quantity: 1 }]) as never
    );
    const tree = await render(ProShopScreen);

    pressA11y(tree, 'Add one Last One');
    pressA11y(tree, 'Add one Last One');
    await act(async () => {
      await Promise.resolve();
    });

    expect(allText(tree)).toContain('1 item');
  });

  it('marks out-of-stock products and offers no quantity control', async () => {
    getSpy.mockImplementation(
      shopResponses([{ id: 'p1', name: 'Sold Out Racquet', price_cents: 9900, stock_quantity: 0 }]) as never
    );
    const tree = await render(ProShopScreen);
    expect(allText(tree)).toContain('Out of stock');
    expect(
      tree.root.findAll(
        (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === 'Add one Sold Out Racquet'
      )
    ).toHaveLength(0);
  });

  it('sends the basket to checkout', async () => {
    getSpy.mockImplementation(
      shopResponses([{ id: 'p1', name: 'Grip Tape', price_cents: 1200, stock_quantity: 10 }]) as never
    );
    postSpy.mockResolvedValue({
      success: true,
      data: { success: true, data: { url: 'https://checkout.stripe.test/x' } },
    } as never);

    const tree = await render(ProShopScreen);
    pressA11y(tree, 'Add one Grip Tape');
    await act(async () => {
      await Promise.resolve();
    });
    pressA11y(tree, 'Check out');
    await act(async () => {
      await Promise.resolve();
    });

    expect(postSpy).toHaveBeenCalledWith('/api/pro-shop/checkout/facility-1', {
      items: [{ product_id: 'p1', quantity: 1 }],
    });
  });
});

describe('Padel screen', () => {
  function session(over: Record<string, unknown> = {}) {
    return {
      id: 's1',
      format: 'americano',
      sessionDate: '2026-10-03',
      startTime: '18:00:00',
      durationMinutes: 90,
      playerCount: 8,
      roundsCount: 5,
      status: 'open',
      hostName: 'Dana Other',
      joinedCount: 4,
      isJoined: false,
      ...over,
    };
  }

  it('lists open sessions with their details', async () => {
    getSpy.mockResolvedValue({ success: true, data: { sessions: [session()] } } as never);
    const text = allText(await render(PadelScreen));
    expect(text).toContain('Americano');
    expect(text).toContain('4/8 players');
    expect(text).toContain('6:00 PM');
    expect(text).toContain('Hosted by Dana Other');
  });

  it('joins a session', async () => {
    getSpy.mockResolvedValue({ success: true, data: { sessions: [session()] } } as never);
    postSpy.mockResolvedValue({ success: true, data: {} } as never);

    const tree = await render(PadelScreen);
    pressA11y(tree, 'Join this session');
    await act(async () => {
      await Promise.resolve();
    });

    // The app passes its deep-link return URLs so a drop-in payment comes back to Padel.
    expect(postSpy).toHaveBeenCalledWith(
      '/api/padel/sessions/s1/join',
      expect.objectContaining({ successUrl: expect.stringContaining('courttime://padel') })
    );
  });

  it('offers to leave a session already joined', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { sessions: [session({ isJoined: true })] },
    } as never);
    postSpy.mockResolvedValue({ success: true, data: {} } as never);

    const tree = await render(PadelScreen);
    pressA11y(tree, 'Leave this session');
    await act(async () => {
      await Promise.resolve();
    });

    expect(postSpy).toHaveBeenCalledWith('/api/padel/sessions/s1/leave', {});
  });

  it('will not let a member join a full session', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { sessions: [session({ joinedCount: 8 })] },
    } as never);
    const tree = await render(PadelScreen);
    expect(allText(tree)).toContain('Full');

    pressA11y(tree, 'Session full');
    await act(async () => {
      await Promise.resolve();
    });
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('shows an empty state when nothing is open', async () => {
    getSpy.mockResolvedValue({ success: true, data: { sessions: [] } } as never);
    expect(allText(await render(PadelScreen))).toContain('No open sessions');
  });
});
