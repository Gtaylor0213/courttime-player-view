/**
 * The "More" tab's contents.
 *
 * Mobile has five fixed tabs — Home, Book, Community, Messages, Profile — plus
 * Admin for facility staff. The flagged features cannot each have a tab, so
 * they live behind More, which itself only appears when the selected facility
 * has at least one of them enabled. A member at a club with none of these
 * features never sees the tab at all.
 *
 * Web reaches the same screens from its sidebar; the flags and the wording are
 * kept in step with `UnifiedSidebar`.
 */

import { FEATURE_FLAGS, type FeatureFlagKey } from '../../../shared/constants/featureFlags';

export interface MoreMenuItem {
  key: string;
  label: string;
  description: string;
  /** Ionicons name. */
  icon: string;
  /** Route to push, relative to the app root. */
  route: string;
  flag: FeatureFlagKey;
}

/**
 * Every flagged feature that can appear, in display order. Order matches web's
 * sidebar so a member moving between the two finds things in the same sequence.
 */
export const MORE_MENU_ITEMS: MoreMenuItem[] = [
  {
    key: 'shop',
    label: 'Pro Shop',
    description: 'Browse and buy from your club',
    icon: 'cart-outline',
    route: '/pro-shop',
    flag: FEATURE_FLAGS.PRO_SHOP,
  },
  {
    key: 'lessons',
    label: 'Lessons',
    description: 'Clinics and lessons at your club',
    icon: 'school-outline',
    route: '/lessons',
    flag: FEATURE_FLAGS.LESSONS_TAB,
  },
  {
    key: 'padel',
    label: 'Padel',
    description: 'Social play sessions and open matches',
    icon: 'trophy-outline',
    route: '/padel',
    flag: FEATURE_FLAGS.PADEL,
  },
  {
    key: 'ball-machine',
    label: 'Ball Machine',
    description: 'Passes and court access codes',
    icon: 'tennisball-outline',
    route: '/ball-machine',
    flag: FEATURE_FLAGS.BALL_MACHINE,
  },
  {
    key: 'level-group',
    label: 'My Player Group',
    description: 'Your skill group and who is in it',
    icon: 'people-circle-outline',
    route: '/level-group',
    flag: FEATURE_FLAGS.PLAYER_LEVEL_GROUPS,
  },
];

/** The menu items this facility has switched on, in display order. */
export function getMoreMenuItems(isFeatureEnabled: (flag: FeatureFlagKey) => boolean): MoreMenuItem[] {
  return MORE_MENU_ITEMS.filter((item) => isFeatureEnabled(item.flag));
}

/**
 * Whether the More tab should appear at all.
 *
 * Hidden when nothing is enabled: an empty tab is worse than no tab, and flags
 * fail closed, so an unresolved flag set hides it too.
 */
export function shouldShowMoreTab(isFeatureEnabled: (flag: FeatureFlagKey) => boolean): boolean {
  return getMoreMenuItems(isFeatureEnabled).length > 0;
}
