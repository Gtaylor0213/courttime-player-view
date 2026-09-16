import { describe, expect, it } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { getMoreMenuItems, shouldShowMoreTab, MORE_MENU_ITEMS } from '../src/utils/moreMenu';

/** Builds the predicate the context supplies. */
function enabled(...flags: string[]) {
  const set = new Set(flags);
  return (flag: string) => set.has(flag);
}

describe('More menu', () => {
  it('is hidden when the facility has no flagged features', () => {
    expect(shouldShowMoreTab(enabled())).toBe(false);
    expect(getMoreMenuItems(enabled())).toEqual([]);
  });

  it('appears as soon as one feature is enabled', () => {
    expect(shouldShowMoreTab(enabled(FEATURE_FLAGS.LESSONS_TAB))).toBe(true);
  });

  it('lists only the enabled features', () => {
    const items = getMoreMenuItems(enabled(FEATURE_FLAGS.PRO_SHOP, FEATURE_FLAGS.PADEL));
    expect(items.map((i) => i.key)).toEqual(['shop', 'padel']);
  });

  it('keeps a stable display order regardless of which flags are on', () => {
    // Enabling them in a different order must not reorder the menu.
    const items = getMoreMenuItems(enabled(FEATURE_FLAGS.PADEL, FEATURE_FLAGS.PRO_SHOP));
    expect(items.map((i) => i.key)).toEqual(['shop', 'padel']);
  });

  it('every item has a route, icon and flag', () => {
    for (const item of MORE_MENU_ITEMS) {
      expect(item.route.startsWith('/')).toBe(true);
      expect(item.icon).toBeTruthy();
      expect(item.flag).toBeTruthy();
      expect(item.label).toBeTruthy();
    }
  });

  it('uses no duplicate routes or keys', () => {
    expect(new Set(MORE_MENU_ITEMS.map((i) => i.key)).size).toBe(MORE_MENU_ITEMS.length);
    expect(new Set(MORE_MENU_ITEMS.map((i) => i.route)).size).toBe(MORE_MENU_ITEMS.length);
  });
});
