/**
 * Split court payments: mobile had none of this, so members at facilities with
 * split_court_payments on could split a court fee on the web and not in the app.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { api } from '../src/api/client';
import {
  MAX_SPLIT_PARTICIPANTS,
  SplitPaymentPicker,
  parseMemberLookup,
  type SplitPaymentMember,
} from '../src/components/SplitPaymentPicker';

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

function byA11yLabel(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label
  )[0];
}

let getSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  getSpy = jest.spyOn(api, 'get');
});

afterEach(() => {
  getSpy.mockRestore();
});

/** Renders the picker with controlled state, as book.tsx does. */
function Harness({ initialEnabled = false }: { initialEnabled?: boolean }) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [members, setMembers] = React.useState<SplitPaymentMember[]>([]);
  lastMembers = members;
  return (
    <SplitPaymentPicker
      facilityId="facility-1"
      currentUserId="me"
      enabled={enabled}
      onEnabledChange={setEnabled}
      members={members}
      onMembersChange={setMembers}
    />
  );
}

let lastMembers: SplitPaymentMember[] = [];

async function render(initialEnabled = false) {
  lastMembers = [];
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness initialEnabled={initialEnabled} />);
  });
  return tree!;
}

async function search(tree: renderer.ReactTestRenderer, term: string) {
  const input = byA11yLabel(tree, 'Search members to split with');
  await act(async () => {
    (input.props as { onChangeText?: (v: string) => void }).onChangeText?.(term);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function press(tree: renderer.ReactTestRenderer, label: string) {
  const node = byA11yLabel(tree, label);
  if (!node) throw new Error(`no control labelled "${label}"`);
  act(() => {
    (node.props as { onPress?: () => void }).onPress?.();
  });
}

function membersResponse(members: Array<Partial<SplitPaymentMember>>) {
  return { success: true, data: { success: true, members } };
}

describe('parseMemberLookup', () => {
  it('reads the flat { members } shape the endpoint returns', () => {
    expect(parseMemberLookup({ success: true, members: [{ userId: 'a', fullName: 'A' }] })).toEqual([
      { userId: 'a', fullName: 'A' },
    ]);
  });

  it('reads a nested data envelope too', () => {
    expect(
      parseMemberLookup({ data: { members: [{ userId: 'b', fullName: 'B' }] } })
    ).toEqual([{ userId: 'b', fullName: 'B' }]);
  });

  it('returns an empty list for anything unexpected', () => {
    expect(parseMemberLookup({ members: 'nope' })).toEqual([]);
    expect(parseMemberLookup(null)).toEqual([]);
  });
});

describe('SplitPaymentPicker', () => {
  it('shows only the toggle until it is switched on', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('Split this court fee with members');
    expect(byA11yLabel(tree, 'Search members to split with')).toBeUndefined();
  });

  it('explains the terms once enabled', async () => {
    const tree = await render(true);
    const text = allText(tree);
    expect(text).toContain('Add up to 3 other members');
    expect(text).toContain('Your share is charged now');
  });

  it('does not search until two characters are typed', async () => {
    const tree = await render(true);
    await search(tree, 'a');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('never offers the organiser as a participant', async () => {
    getSpy.mockResolvedValue(
      membersResponse([
        { userId: 'me', fullName: 'My Own Name' },
        { userId: 'other', fullName: 'Dana Other' },
      ]) as never
    );
    const tree = await render(true);
    await search(tree, 'na');

    expect(allText(tree)).toContain('Dana Other');
    expect(allText(tree)).not.toContain('My Own Name');
  });

  it('adds and removes participants', async () => {
    getSpy.mockResolvedValue(membersResponse([{ userId: 'u2', fullName: 'Dana Other' }]) as never);
    const tree = await render(true);
    await search(tree, 'dana');

    press(tree, 'Add Dana Other to the split');
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastMembers.map((m) => m.userId)).toEqual(['u2']);

    press(tree, 'Remove Dana Other from the split');
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastMembers).toEqual([]);
  });

  it('stops at the participant cap', async () => {
    getSpy.mockResolvedValue(
      membersResponse([
        { userId: 'u2', fullName: 'B Two' },
        { userId: 'u3', fullName: 'C Three' },
        { userId: 'u4', fullName: 'D Four' },
      ]) as never
    );
    const tree = await render(true);

    for (const name of ['B Two', 'C Three', 'D Four']) {
      await search(tree, 'x'.repeat(2));
      press(tree, `Add ${name} to the split`);
      await act(async () => {
        await Promise.resolve();
      });
    }

    // Organiser + 3 others.
    expect(lastMembers).toHaveLength(MAX_SPLIT_PARTICIPANTS - 1);
    expect(allText(tree)).toContain(`Maximum ${MAX_SPLIT_PARTICIPANTS} people per split reservation`);
    expect(byA11yLabel(tree, 'Search members to split with')).toBeUndefined();
  });

  it('survives a failed lookup without breaking the form', async () => {
    getSpy.mockResolvedValue({ success: false, error: 'network' } as never);
    const tree = await render(true);
    await search(tree, 'dana');

    expect(allText(tree)).toContain('Split this court fee with members');
  });
});
