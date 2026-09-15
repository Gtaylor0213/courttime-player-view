/**
 * Member number gate: clubs with the member_number flag on require a number
 * before the player can continue. Mobile never asked, so those members simply
 * had no member number recorded.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

const mockAuthState: {
  user: Record<string, unknown> | null;
  facilityId: string | null;
  facilities: Array<{ id: string; name: string }>;
  updateUser: jest.Mock;
} = {
  user: null,
  facilityId: 'facility-1',
  facilities: [{ id: 'facility-1', name: 'Fields Club' }],
  updateUser: jest.fn(() => Promise.resolve()),
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

import { api } from '../src/api/client';
import { MemberNumberGate, needsMemberNumber } from '../src/components/MemberNumberGate';

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    })
    .join(' ');
}

function findByA11yLabel(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label
  )[0];
}

function pressContaining(tree: renderer.ReactTestRenderer, label: string) {
  const match = tree.root
    .findAll((n) => typeof (n.props as { onPress?: unknown })?.onPress === 'function')
    .find((p) =>
      p.findAllByType(Text).some((t) => {
        const c = t.props.children;
        const text = Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
        return text.includes(label);
      })
    );
  if (!match) throw new Error(`No pressable containing "${label}"`);
  act(() => {
    (match.props as { onPress?: () => void }).onPress?.();
  });
}

let postSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  mockEnabledFeatures.clear();
  mockAuthState.facilityId = 'facility-1';
  mockAuthState.user = { id: 'u1', userType: 'player', memberNumbers: {} };
  mockAuthState.updateUser = jest.fn(() => Promise.resolve());
  postSpy = jest.spyOn(api, 'post');
});

afterEach(() => {
  postSpy.mockRestore();
});

async function render() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<MemberNumberGate />);
  });
  return tree!;
}

describe('needsMemberNumber', () => {
  const base = {
    userType: 'player',
    facilityId: 'facility-1',
    flagEnabled: true,
    memberNumbers: {} as Record<string, string>,
  };

  it('is required for a player at a flagged facility with no number on file', () => {
    expect(needsMemberNumber(base)).toBe(true);
  });

  it('is not required when the flag is off', () => {
    expect(needsMemberNumber({ ...base, flagEnabled: false })).toBe(false);
  });

  it('is not required once a number is recorded for that facility', () => {
    expect(needsMemberNumber({ ...base, memberNumbers: { 'facility-1': '4471' } })).toBe(false);
  });

  it('is still required when the number belongs to a different facility', () => {
    expect(needsMemberNumber({ ...base, memberNumbers: { 'facility-2': '4471' } })).toBe(true);
  });

  it('does not apply to admins', () => {
    expect(needsMemberNumber({ ...base, userType: 'admin' })).toBe(false);
  });

  it('does not apply before a facility is selected', () => {
    expect(needsMemberNumber({ ...base, facilityId: null })).toBe(false);
  });
});

describe('MemberNumberGate', () => {
  it('renders nothing when the flag is off', async () => {
    const tree = await render();
    expect(allText(tree)).not.toContain('Member Number Required');
  });

  it('prompts, naming the club, when the flag is on', async () => {
    mockEnabledFeatures.add(FEATURE_FLAGS.MEMBER_NUMBER);
    const tree = await render();
    const text = allText(tree);
    expect(text).toContain('Member Number Required');
    expect(text).toContain('Fields Club');
  });

  it('saves the number and records it on the user', async () => {
    mockEnabledFeatures.add(FEATURE_FLAGS.MEMBER_NUMBER);
    postSpy.mockResolvedValue({ success: true, data: {} } as never);
    const tree = await render();

    const input = findByA11yLabel(tree, 'Member number');
    await act(async () => {
      (input.props as { onChangeText?: (v: string) => void }).onChangeText?.('  4471  ');
    });

    pressContaining(tree, 'Save & Continue');
    await act(async () => {
      await Promise.resolve();
    });

    // Trimmed before sending.
    expect(postSpy).toHaveBeenCalledWith('/api/members/facility-1/me/member-number', {
      memberNumber: '4471',
    });
    expect(mockAuthState.updateUser).toHaveBeenCalledWith({
      memberNumbers: { 'facility-1': '4471' },
    });
  });

  it('surfaces a save failure and keeps prompting', async () => {
    mockEnabledFeatures.add(FEATURE_FLAGS.MEMBER_NUMBER);
    postSpy.mockResolvedValue({ success: false, error: 'That member number is already in use' } as never);
    const tree = await render();

    const input = findByA11yLabel(tree, 'Member number');
    await act(async () => {
      (input.props as { onChangeText?: (v: string) => void }).onChangeText?.('4471');
    });
    pressContaining(tree, 'Save & Continue');
    await act(async () => {
      await Promise.resolve();
    });

    expect(allText(tree)).toContain('That member number is already in use');
    expect(mockAuthState.updateUser).not.toHaveBeenCalled();
    expect(allText(tree)).toContain('Member Number Required');
  });

  it('cannot be dismissed — there is no cancel and back does nothing', async () => {
    mockEnabledFeatures.add(FEATURE_FLAGS.MEMBER_NUMBER);
    const tree = await render();

    expect(allText(tree)).not.toContain('Cancel');

    const modal = tree.root.findAll(
      (n) => typeof (n.props as { onRequestClose?: unknown })?.onRequestClose === 'function'
    )[0];
    act(() => {
      (modal.props as { onRequestClose?: () => void }).onRequestClose?.();
    });

    expect(allText(tree)).toContain('Member Number Required');
  });
});
