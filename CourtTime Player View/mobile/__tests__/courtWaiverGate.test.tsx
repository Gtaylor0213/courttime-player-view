/**
 * Court waiver gate: the booking submit must not proceed until the member has
 * accepted every pending waiver, and must abort if they decline.
 *
 * Before this existed, a member at a `court_waivers` facility (default ON) hit
 * the server's COURT-WAIVER-NOT-ACCEPTED rejection with no way to resolve it.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { api } from '../src/api/client';
import {
  CourtWaiverAcceptanceModal,
  useCourtWaiverGate,
} from '../src/components/CourtWaiverGate';

function waiver(courtId: string, courtName: string) {
  return {
    courtId,
    courtName,
    facilityId: 'facility-1',
    waiverVersionId: `v-${courtId}`,
    versionNumber: 2,
    contentHtml: '<p>I accept all risk of injury on this court.</p>',
    publishedAt: '2026-09-01T00:00:00Z',
  };
}

/** Harness exposing the gate's promise result to assertions. */
let lastResult: boolean | 'pending';
let triggerGate: ((courtIds: string[]) => void) | null = null;

function Harness() {
  const gate = useCourtWaiverGate();
  triggerGate = (courtIds: string[]) => {
    lastResult = 'pending';
    void gate.ensureAccepted(courtIds).then((accepted) => {
      lastResult = accepted;
    });
  };
  return <CourtWaiverAcceptanceModal {...gate.modalProps} />;
}

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    })
    .join(' ');
}

/** The modal requires the waiver to be scrolled before the checkbox enables. */
function markScrolled(tree: renderer.ReactTestRenderer) {
  const scroll = tree.root.findAll(
    (n) => typeof (n.props as { onContentSizeChange?: unknown })?.onContentSizeChange === 'function'
  )[0];
  if (!scroll) throw new Error('waiver scroll view not found');
  act(() => {
    (scroll.props as { onLayout?: (e: unknown) => void }).onLayout?.({
      nativeEvent: { layout: { height: 300 } },
    });
    (scroll.props as { onContentSizeChange?: (w: number, h: number) => void }).onContentSizeChange?.(
      0,
      100
    );
  });
}

/**
 * Match any node carrying an onPress rather than a component type: under RN
 * 0.86 + react-test-renderer, Pressable and TouchableOpacity do not resolve by
 * type inside a Modal.
 */
function pressContaining(tree: renderer.ReactTestRenderer, label: string) {
  const pressables = tree.root.findAll(
    (n) => typeof (n.props as { onPress?: unknown })?.onPress === 'function'
  );
  const match = pressables.find((p) => {
    const texts = p.findAllByType(Text).map((t) => {
      const c = t.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    });
    return texts.some((t) => t.includes(label));
  });
  if (!match) throw new Error(`No pressable containing "${label}"`);
  act(() => {
    (match.props as { onPress?: () => void }).onPress?.();
  });
}

let getSpy: ReturnType<typeof jest.spyOn>;
let postSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  lastResult = 'pending';
  triggerGate = null;
  getSpy = jest.spyOn(api, 'get');
  postSpy = jest.spyOn(api, 'post');
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

async function renderHarness() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness />);
  });
  return tree!;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('court waiver gate', () => {
  it('proceeds without a prompt when no waivers are pending', async () => {
    getSpy.mockResolvedValue({ success: true, data: { success: true, data: { pending: [] } } } as never);
    const tree = await renderHarness();

    await act(async () => {
      triggerGate!(['court-1']);
    });
    await flush();

    expect(lastResult).toBe(true);
    expect(allText(tree)).not.toContain('Waiver Required');
  });

  it('proceeds without calling the API when there are no courts', async () => {
    const tree = await renderHarness();

    await act(async () => {
      triggerGate!([]);
    });
    await flush();

    expect(lastResult).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();
    expect(allText(tree)).not.toContain('Waiver Required');
  });

  it('shows the waiver and proceeds once accepted', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { success: true, data: { pending: [waiver('court-1', 'Court 3')] } },
    } as never);
    postSpy.mockResolvedValue({ success: true, data: {} } as never);

    const tree = await renderHarness();
    await act(async () => {
      triggerGate!(['court-1']);
    });
    await flush();

    expect(allText(tree)).toContain('Waiver Required');
    expect(allText(tree)).toContain('Court 3');
    // The HTML is rendered as readable text, not raw markup.
    expect(allText(tree)).toContain('I accept all risk of injury on this court.');
    expect(allText(tree)).not.toContain('<p>');
    // Still blocked until the member acts.
    expect(lastResult).toBe('pending');

    markScrolled(tree);
    pressContaining(tree, 'I have read and agree');
    pressContaining(tree, 'Accept & Continue');
    await flush();

    expect(postSpy).toHaveBeenCalledWith('/api/bookings/court-waivers/accept', {
      courtId: 'court-1',
    });
    expect(lastResult).toBe(true);
  });

  it('aborts the booking when the member declines', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { success: true, data: { pending: [waiver('court-1', 'Court 3')] } },
    } as never);

    const tree = await renderHarness();
    await act(async () => {
      triggerGate!(['court-1']);
    });
    await flush();

    pressContaining(tree, 'Cancel');
    await flush();

    expect(lastResult).toBe(false);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('requires every pending waiver before proceeding', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: { pending: [waiver('court-1', 'Court 3'), waiver('court-2', 'Court 4')] },
      },
    } as never);
    postSpy.mockResolvedValue({ success: true, data: {} } as never);

    const tree = await renderHarness();
    await act(async () => {
      triggerGate!(['court-1', 'court-2']);
    });
    await flush();

    expect(allText(tree)).toContain('2 waivers to review');

    markScrolled(tree);
    pressContaining(tree, 'I have read and agree');
    pressContaining(tree, 'Accept & Continue');
    await flush();

    // One down, one to go — the booking must still be blocked.
    expect(lastResult).toBe('pending');
    expect(allText(tree)).toContain('Court 4');

    markScrolled(tree);
    pressContaining(tree, 'I have read and agree');
    pressContaining(tree, 'Accept & Continue');
    await flush();

    expect(lastResult).toBe(true);
    expect(postSpy).toHaveBeenCalledTimes(2);
  });

  it('fails open when the pending check itself errors', async () => {
    // The server still blocks an unaccepted waiver, so failing open here can
    // only produce the old error path — never a silently skipped waiver.
    getSpy.mockResolvedValue({ success: false, error: 'network' } as never);

    const tree = await renderHarness();
    await act(async () => {
      triggerGate!(['court-1']);
    });
    await flush();

    expect(lastResult).toBe(true);
    expect(allText(tree)).not.toContain('Waiver Required');
  });

  it('surfaces a failure to record acceptance instead of proceeding', async () => {
    getSpy.mockResolvedValue({
      success: true,
      data: { success: true, data: { pending: [waiver('court-1', 'Court 3')] } },
    } as never);
    postSpy.mockResolvedValue({ success: false, error: 'Waiver no longer active' } as never);

    const tree = await renderHarness();
    await act(async () => {
      triggerGate!(['court-1']);
    });
    await flush();

    markScrolled(tree);
    pressContaining(tree, 'I have read and agree');
    pressContaining(tree, 'Accept & Continue');
    await flush();

    expect(allText(tree)).toContain('Waiver no longer active');
    expect(lastResult).toBe('pending');
  });
});
