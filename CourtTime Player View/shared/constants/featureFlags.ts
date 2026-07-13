// Add new feature keys here as you build new features.
// All features default to OFF — enable per facility from the support dashboard.
export const FEATURE_FLAGS = {
  PRO_SHOP: 'pro_shop',
  ANNUAL_MEMBERSHIP_FEES: 'annual_membership_fees',
  PICKLEBALL: 'pickleball',
  WEEK_MONTH_VIEW: 'week_month_view',
  PLAYER_RECURRING_BOOKINGS: 'player_recurring_bookings',
  COURT_WAIVERS: 'court_waivers',
  LESSONS_TAB: 'lessons_tab',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_LABELS: Record<string, string> = {
  pro_shop: 'Pro Shop',
  annual_membership_fees: 'Annual Membership Fees',
  pickleball: 'Pickleball (CourtTime-Pickle)',
  week_month_view: 'Week/Month Calendar Overview',
  player_recurring_bookings: 'Player Recurring Bookings',
  court_waivers: 'Court Waivers (per-court booking waivers)',
  lessons_tab: 'Lessons Tab (dedicated lessons/clinics hub)',
};
