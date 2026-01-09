/**
 * Household Utilities for the Rules Engine
 */

import { HouseholdGroup, BookingWithDetails } from '../types';
import { getTimeWindow, formatDate } from './timeUtils';
import type { WindowType } from '../types';

/**
 * Normalize an address for comparison
 * - Converts to lowercase
 * - Removes common abbreviations
 * - Removes extra spaces
 * - Removes punctuation
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';

  let normalized = address.toLowerCase().trim();

  // Replace common abbreviations
  const abbreviations: Record<string, string> = {
    'street': 'st',
    'avenue': 'ave',
    'boulevard': 'blvd',
    'drive': 'dr',
    'road': 'rd',
    'lane': 'ln',
    'court': 'ct',
    'circle': 'cir',
    'place': 'pl',
    'terrace': 'ter',
    'highway': 'hwy',
    'apartment': 'apt',
    'suite': 'ste',
    'building': 'bldg',
    'floor': 'fl',
    'unit': 'unit',
    'north': 'n',
    'south': 's',
    'east': 'e',
    'west': 'w',
    'northeast': 'ne',
    'northwest': 'nw',
    'southeast': 'se',
    'southwest': 'sw'
  };

  // Apply abbreviation replacements (whole words only)
  for (const [full, abbr] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    normalized = normalized.replace(regex, abbr);
  }

  // Remove punctuation except for apartment/unit numbers
  normalized = normalized.replace(/[.,#]/g, '');

  // Normalize multiple spaces to single space
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * Check if two addresses match (fuzzy comparison)
 */
export function addressesMatch(address1: string, address2: string): boolean {
  const norm1 = normalizeAddress(address1);
  const norm2 = normalizeAddress(address2);
  return norm1 === norm2;
}

/**
 * Count household members
 */
export function countHouseholdMembers(household: HouseholdGroup): number {
  return household.members.length;
}

/**
 * Check if household has reached member limit
 */
export function isHouseholdFull(household: HouseholdGroup): boolean {
  return household.members.length >= household.maxMembers;
}

/**
 * Count active bookings across all household members
 */
export function countHouseholdActiveBookings(
  householdBookings: BookingWithDetails[]
): number {
  return householdBookings.filter(
    booking => booking.status === 'confirmed' || booking.status === 'pending'
  ).length;
}

/**
 * Count household bookings in a time window
 */
export function countHouseholdBookingsInWindow(
  householdBookings: BookingWithDetails[],
  windowType: WindowType,
  referenceDate: Date = new Date()
): number {
  const window = getTimeWindow(windowType, referenceDate);
  const windowStartStr = formatDate(window.startDate);
  const windowEndStr = formatDate(window.endDate);

  return householdBookings.filter(booking => {
    if (booking.bookingDate < windowStartStr || booking.bookingDate > windowEndStr) {
      return false;
    }
    return booking.status !== 'cancelled';
  }).length;
}

/**
 * Count household prime-time bookings in a time window
 */
export function countHouseholdPrimeTimeBookings(
  householdBookings: BookingWithDetails[],
  windowType: WindowType,
  referenceDate: Date = new Date()
): number {
  const window = getTimeWindow(windowType, referenceDate);
  const windowStartStr = formatDate(window.startDate);
  const windowEndStr = formatDate(window.endDate);

  return householdBookings.filter(booking => {
    if (booking.bookingDate < windowStartStr || booking.bookingDate > windowEndStr) {
      return false;
    }
    if (booking.status === 'cancelled') {
      return false;
    }
    return booking.isPrimeTime;
  }).length;
}

/**
 * Get remaining household booking slots
 */
export function getRemainingHouseholdSlots(
  currentActive: number,
  maxActive: number
): number {
  return Math.max(0, maxActive - currentActive);
}

/**
 * Get remaining household prime-time slots for the week
 */
export function getRemainingHouseholdPrimeTimeSlots(
  currentPrimeTime: number,
  maxPrimeTime: number
): number {
  return Math.max(0, maxPrimeTime - currentPrimeTime);
}

/**
 * Get household booking summary for display
 */
export function getHouseholdBookingSummary(household: HouseholdGroup, bookings: BookingWithDetails[]): {
  totalMembers: number;
  maxMembers: number;
  activeBookings: number;
  maxActiveBookings: number;
  primeTimeThisWeek: number;
  maxPrimeTimePerWeek: number;
} {
  const activeBookings = countHouseholdActiveBookings(bookings);
  const primeTimeThisWeek = countHouseholdPrimeTimeBookings(bookings, 'calendar_week');

  return {
    totalMembers: household.members.length,
    maxMembers: household.maxMembers,
    activeBookings,
    maxActiveBookings: household.maxActiveReservations,
    primeTimeThisWeek,
    maxPrimeTimePerWeek: household.primeTimeMaxPerWeek
  };
}

/**
 * Check if user belongs to a household
 */
export function userBelongsToHousehold(
  userId: string,
  household: HouseholdGroup
): boolean {
  return household.members.some(member => member.userId === userId);
}

/**
 * Get user's role in household
 */
export function getUserHouseholdRole(
  userId: string,
  household: HouseholdGroup
): 'primary' | 'member' | 'none' {
  const member = household.members.find(m => m.userId === userId);

  if (!member) {
    return 'none';
  }

  return member.isPrimary ? 'primary' : 'member';
}

/**
 * Format household address for display
 */
export function formatHouseholdAddress(household: HouseholdGroup): string {
  const parts = [household.streetAddress];

  if (household.city) {
    parts.push(household.city);
  }

  if (household.state) {
    parts.push(household.state);
  }

  if (household.zipCode) {
    parts.push(household.zipCode);
  }

  return parts.join(', ');
}
