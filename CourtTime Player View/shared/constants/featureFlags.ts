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
  POST_PLAY_SETTLEMENT: 'post_play_settlement',
  PLAYER_LEVEL_GROUPS: 'player_level_groups',
  BALL_MACHINE: 'st_marlow_ball_machine',
  SPLIT_COURT_PAYMENTS: 'split_court_payments',
  MEMBER_NUMBER: 'member_number',
  DEER_LAKE_RESERVATION_TYPES: 'deer_lake_reservation_types',
  UNIVERSITY_CLUB_GUEST_FEE: 'university_club_guest_fee',
  PLAYER_MULTIPLE_COURTS: 'player_multiple_courts',
  COURT_DAILY_BILLING: 'court_daily_billing',
  BHR_RESERVATION_TYPES: 'bhr_reservation_types',
  PADEL: 'padel',
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
  post_play_settlement: 'Post-Play Settlement (charge after staff close-out)',
  player_level_groups: 'Player Level Groups (admin skill tiers in Messages)',
  st_marlow_ball_machine: 'St. Marlow Ball Machine (passes + access code)',
  split_court_payments: 'Split Court Payments (each reservation member pays their share)',
  member_number: 'Member Number Required (prompt new/existing members for their club member #)',
  deer_lake_reservation_types: 'Deer Lake Reservation Types (swap in Deer Lake\'s custom reservation type list)',
  university_club_guest_fee: 'University Club Guest Fee (offer "pay at front desk" alongside Stripe when a guest fee applies)',
  player_multiple_courts: 'Player Multiple Courts (let members add additional courts to a booking, not just admins)',
  court_daily_billing: 'Court Daily Billing (let admins charge a flat day rate instead of hourly for a court)',
  bhr_reservation_types: 'BHR Reservation Types (adds a "Party" reservation type alongside the standard types)',
  padel: 'Padel (padel courts, Americano/Mexicano social play, open matches)',
};
