/**
 * Feature flag resolution: flag on, flag off, fetch failure, facility switch,
 * and the offline fallback. These encode the rules in FeatureFlagContext's
 * header comment — particularly that flags fail closed.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

const mockAuthState: { facilityId: string | null; isAuthenticated: boolean } = {
  facilityId: 'facility-1',
  isAuthenticated: true,
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => mockAuthState),
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
      getAllKeys: jest.fn(() => Promise.resolve([...storage.keys()])),
      multiRemove: jest.fn((keys: string[]) => {
        keys.forEach((k) => storage.delete(k));
        return Promise.resolve();
      }),
      __reset: () => storage.clear(),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../src/api/client';
import { FeatureFlagProvider, useFeatureFlags } from '../src/contexts/FeatureFlagContext';

/** Renders the resolved state so assertions read off the rendered output. */
function FlagProbe() {
  const { isFeatureEnabled, flagsLoaded, flagsFromCache } = useFeatureFlags();
  return (
    <Text>
      {[
        `lessons:${isFeatureEnabled(FEATURE_FLAGS.LESSONS_TAB)}`,
        `padel:${isFeatureEnabled(FEATURE_FLAGS.PADEL)}`,
        `loaded:${flagsLoaded}`,
        `cached:${flagsFromCache}`,
      ].join(' ')}
    </Text>
  );
}

async function renderProbe() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <FeatureFlagProvider>
        <FlagProbe />
      </FeatureFlagProvider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree!;
}

function readProbe(tree: renderer.ReactTestRenderer): string {
  const children = tree.root.findByType(Text).props.children;
  return Array.isArray(children) ? children.join('') : String(children);
}

/** The server returns `{ success, data: string[] }`; api.get wraps that again. */
function flagsResponse(keys: string[]) {
  return { success: true, data: { success: true, data: keys } };
}

let getSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  mockAuthState.facilityId = 'facility-1';
  mockAuthState.isAuthenticated = true;
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
  getSpy = jest.spyOn(api, 'get');
});

afterEach(() => {
  getSpy.mockRestore();
});

describe('feature flag resolution', () => {
  it('enables only the flags the facility actually has on', async () => {
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.LESSONS_TAB]) as never);

    const tree = await renderProbe();

    expect(readProbe(tree)).toContain('lessons:true');
    expect(readProbe(tree)).toContain('padel:false');
    expect(readProbe(tree)).toContain('loaded:true');
  });

  it('enables nothing when the facility has no flags on', async () => {
    getSpy.mockResolvedValue(flagsResponse([]) as never);

    const tree = await renderProbe();

    expect(readProbe(tree)).toContain('lessons:false');
    expect(readProbe(tree)).toContain('padel:false');
    expect(readProbe(tree)).toContain('loaded:true');
  });

  it('fails closed when the flag fetch fails and nothing is cached', async () => {
    getSpy.mockResolvedValue({ success: false, error: 'Network request failed' } as never);

    const tree = await renderProbe();

    expect(readProbe(tree)).toContain('lessons:false');
    expect(readProbe(tree)).toContain('padel:false');
    // Still "loaded" — resolution settled, the answer is just "nothing on".
    expect(readProbe(tree)).toContain('loaded:true');
  });

  it('fails closed on a malformed payload rather than trusting it', async () => {
    getSpy.mockResolvedValue({ success: true, data: { success: true, data: 'lessons_tab' } } as never);

    const tree = await renderProbe();

    expect(readProbe(tree)).toContain('lessons:false');
  });

  it('falls back to the last known good set when the fetch fails offline', async () => {
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.LESSONS_TAB]) as never);
    await renderProbe();

    // Same facility, now unreachable: the cached set should survive.
    getSpy.mockResolvedValue({ success: false, error: 'offline' } as never);
    const offlineTree = await renderProbe();

    expect(readProbe(offlineTree)).toContain('lessons:true');
    expect(readProbe(offlineTree)).toContain('cached:true');
  });

  it('swaps the flag set when the member switches facility', async () => {
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.LESSONS_TAB]) as never);
    const tree = await renderProbe();
    expect(readProbe(tree)).toContain('lessons:true');

    mockAuthState.facilityId = 'facility-2';
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.PADEL]) as never);

    await act(async () => {
      tree.update(
        <FeatureFlagProvider>
          <FlagProbe />
        </FeatureFlagProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(readProbe(tree)).toContain('lessons:false');
    expect(readProbe(tree)).toContain('padel:true');
  });

  it('ignores a slow response for the facility the member already left', async () => {
    // facility-1's fetch hangs, the member switches to facility-2, then the
    // stale response lands. It must not repaint facility-1's flags.
    let resolveSlow: ((value: unknown) => void) | undefined;
    getSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSlow = resolve;
      }) as never
    );

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FeatureFlagProvider>
          <FlagProbe />
        </FeatureFlagProvider>
      );
    });

    mockAuthState.facilityId = 'facility-2';
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.PADEL]) as never);
    await act(async () => {
      tree!.update(
        <FeatureFlagProvider>
          <FlagProbe />
        </FeatureFlagProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    // facility-1 finally answers, with a flag facility-2 does not have.
    await act(async () => {
      resolveSlow?.(flagsResponse([FEATURE_FLAGS.LESSONS_TAB]));
      await Promise.resolve();
    });

    expect(readProbe(tree!)).toContain('padel:true');
    expect(readProbe(tree!)).toContain('lessons:false');
  });

  it('enables nothing when no facility is selected', async () => {
    mockAuthState.facilityId = null;
    getSpy.mockResolvedValue(flagsResponse([FEATURE_FLAGS.LESSONS_TAB]) as never);

    const tree = await renderProbe();

    expect(readProbe(tree)).toContain('lessons:false');
    expect(readProbe(tree)).toContain('loaded:true');
    expect(getSpy).not.toHaveBeenCalled();
  });
});
