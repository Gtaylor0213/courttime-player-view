import type { PaidCourtFormFields } from '../PaidCourtBookingFields';

export interface FacilityContact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface PeakHourSlot {
  id: string;
  startTime: string;
  endTime: string;
  days: number[];
  appliesToAllCourts: boolean;
  selectedCourtIds: string[];
  rules: {
    maxBookingsPerDay: string;
    maxBookingsPerDayUnlimited: boolean;
    maxBookingsPerDayHousehold: string;
    maxBookingsPerDayHouseholdUnlimited: boolean;
    maxBookingsPerWeek: string;
    maxBookingsPerWeekUnlimited: boolean;
    maxBookingsPerWeekHousehold: string;
    maxBookingsPerWeekHouseholdUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
  };
}

export interface BookingRules {
  generalRules: string;
  restrictionType: 'account' | 'address';
  daysInAdvanceEnabled: boolean;
  daysInAdvance: string;
  maxReservationDurationEnabled: boolean;
  maxReservationDurationMinutes: string;
  courtsPerWeekUserEnabled: boolean;
  courtsPerWeekUser: string;
  courtsPerWeekHouseholdEnabled: boolean;
  courtsPerWeekHousehold: string;
  courtsPerDayUserEnabled: boolean;
  courtsPerDayUser: string;
  courtsPerDayHouseholdEnabled: boolean;
  courtsPerDayHousehold: string;
  maxBookingsPerWeek: string;
  maxBookingsPerWeekUnlimited: boolean;
  maxBookingDurationHours: string;
  maxBookingDurationUnlimited: boolean;
  advanceBookingDays: string;
  advanceBookingDaysUnlimited: boolean;
  restrictionsApplyToAdmins: boolean;
  adminMaxBookingsPerWeek: string;
  adminMaxBookingsUnlimited: boolean;
  adminMaxBookingDurationHours: string;
  adminMaxDurationUnlimited: boolean;
  adminAdvanceBookingDays: string;
  adminAdvanceBookingUnlimited: boolean;
  hasPeakHours: boolean;
  peakHoursApplyToAdmins: boolean;
  peakHoursSlots: PeakHourSlot[];
  peakHoursRestrictions: {
    maxBookingsPerWeek: string;
    maxBookingsUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
  };
  hasWeekendPolicy: boolean;
  weekendPolicyApplyToAdmins: boolean;
  weekendPolicy: {
    maxBookingsPerWeekend: string;
    maxBookingsUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
    advanceBookingDays: string;
    advanceBookingUnlimited: boolean;
  };
  // ACC-001: Max active reservations
  maxActiveReservationsEnabled: boolean;
  maxActiveReservations: string;
  // ACC-003: Max hours per week
  maxHoursPerWeekEnabled: boolean;
  maxHoursPerWeek: string;
  // ACC-004: No overlapping reservations
  noOverlappingReservations: boolean;
  // ACC-006: Minimum lead time
  minimumLeadTimeEnabled: boolean;
  minimumLeadTimeMinutes: string;
  // ACC-009: Strike system
  strikeSystemEnabled: boolean;
  strikeThreshold: string;
  strikeWindowDays: string;
  strikeLockoutDays: string;
  // CRT-008: Allowed booking types
  allowedBookingTypesEnabled: boolean;
  allowedBookingTypes: string[];
  // CRT-010: Court weekly cap
  courtWeeklyCapEnabled: boolean;
  courtWeeklyCap: string;
  // CRT-011: Court release time
  courtReleaseTimeEnabled: boolean;
  courtReleaseTime: string;
  courtReleaseDaysAhead: string;
  // HH-001: Max members per address
  householdMaxMembersEnabled: boolean;
  householdMaxMembers: string;
  // HH-002: Household max active reservations
  householdMaxActiveEnabled: boolean;
  householdMaxActive: string;
  // HH-003: Household peak-hours cap
  householdPrimeCapEnabled: boolean;
  householdPrimeCap: string;
}

export interface FacilityData {
  name: string;
  type: string;
  primaryLocationLabel: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  description: string;
  operatingHours: Record<string, { open: string; close: string; closed: boolean }>;
  timezone: string;
  logoUrl: string;
  facilityImage: File | null;
  facilityImagePreview: string;
  // Primary Contact
  primaryContact: {
    name: string;
    email: string;
    phone: string;
  };
  // Secondary Contacts
  secondaryContacts: FacilityContact[];
  // Address Whitelist
  // Booking Rules
  bookingRules: BookingRules;
}

export interface Court extends PaidCourtFormFields {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp?: boolean;
  status: 'available' | 'maintenance' | 'closed';
  canSplit?: boolean;
  splitConfig?: {
    splitNames: string[];
    splitType: 'Tennis' | 'Pickleball';
  };
  /** Waiver draft for a court being added; published after the court is created. */
  waiverContent?: string;
}

export const defaultOperatingHours = {
  monday: { open: '08:00', close: '20:00', closed: false },
  tuesday: { open: '08:00', close: '20:00', closed: false },
  wednesday: { open: '08:00', close: '20:00', closed: false },
  thursday: { open: '08:00', close: '20:00', closed: false },
  friday: { open: '08:00', close: '20:00', closed: false },
  saturday: { open: '09:00', close: '18:00', closed: false },
  sunday: { open: '09:00', close: '18:00', closed: false },
};

export const defaultBookingRules: BookingRules = {
  generalRules: '',
  restrictionType: 'account',
  daysInAdvanceEnabled: false,
  daysInAdvance: '',
  maxReservationDurationEnabled: false,
  maxReservationDurationMinutes: '',
  courtsPerWeekUserEnabled: false,
  courtsPerWeekUser: '',
  courtsPerWeekHouseholdEnabled: false,
  courtsPerWeekHousehold: '',
  courtsPerDayUserEnabled: false,
  courtsPerDayUser: '',
  courtsPerDayHouseholdEnabled: false,
  courtsPerDayHousehold: '',
  maxBookingsPerWeek: '',
  maxBookingsPerWeekUnlimited: true,
  maxBookingDurationHours: '',
  maxBookingDurationUnlimited: true,
  advanceBookingDays: '',
  advanceBookingDaysUnlimited: true,
  restrictionsApplyToAdmins: false,
  adminMaxBookingsPerWeek: '',
  adminMaxBookingsUnlimited: true,
  adminMaxBookingDurationHours: '',
  adminMaxDurationUnlimited: true,
  adminAdvanceBookingDays: '',
  adminAdvanceBookingUnlimited: true,
  hasPeakHours: false,
  peakHoursApplyToAdmins: false,
  peakHoursSlots: [],
  peakHoursRestrictions: {
    maxBookingsPerWeek: '',
    maxBookingsUnlimited: true,
    maxDurationHours: '',
    maxDurationUnlimited: true,
  },
  hasWeekendPolicy: false,
  weekendPolicyApplyToAdmins: false,
  weekendPolicy: {
    maxBookingsPerWeekend: '',
    maxBookingsUnlimited: true,
    maxDurationHours: '',
    maxDurationUnlimited: true,
    advanceBookingDays: '',
    advanceBookingUnlimited: true,
  },
  maxActiveReservationsEnabled: false,
  maxActiveReservations: '',
  maxHoursPerWeekEnabled: false,
  maxHoursPerWeek: '',
  noOverlappingReservations: false,
  minimumLeadTimeEnabled: false,
  minimumLeadTimeMinutes: '',
  strikeSystemEnabled: false,
  strikeThreshold: '',
  strikeWindowDays: '',
  strikeLockoutDays: '',
  allowedBookingTypesEnabled: false,
  allowedBookingTypes: ['singles', 'doubles', 'lesson', 'clinic', 'open_play', 'tournament', 'practice', 'social', 'other'],
  courtWeeklyCapEnabled: false,
  courtWeeklyCap: '',
  courtReleaseTimeEnabled: false,
  courtReleaseTime: '',
  courtReleaseDaysAhead: '',
  householdMaxMembersEnabled: false,
  householdMaxMembers: '',
  householdMaxActiveEnabled: false,
  householdMaxActive: '',
  householdPrimeCapEnabled: false,
  householdPrimeCap: '',
};

export interface SecondaryLocation {
  id: string;
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
}
