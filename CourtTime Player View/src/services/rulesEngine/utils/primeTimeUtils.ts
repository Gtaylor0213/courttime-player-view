/**
 * Prime Time Utilities for the Rules Engine
 */

import { CourtOperatingConfig, BookingWithDetails } from '../types';
import { timeRangesOverlap, getDayOfWeek, getTimeWindow, formatDate } from './timeUtils';
import type { WindowType } from '../types';

/**
 * Check if a booking time falls within prime time hours for a court
 */
export function isPrimeTime(
  operatingConfigs: CourtOperatingConfig[],
  bookingDate: string,
  startTime: string,
  endTime: string
): boolean {
  const dayOfWeek = getDayOfWeek(bookingDate);

  // Find config for this day
  const dayConfig = operatingConfigs.find(c => c.dayOfWeek === dayOfWeek);

  if (!dayConfig || !dayConfig.primeTimeStart || !dayConfig.primeTimeEnd) {
    return false;
  }

  // Check if booking overlaps prime time window
  return timeRangesOverlap(
    startTime,
    endTime,
    dayConfig.primeTimeStart,
    dayConfig.primeTimeEnd
  );
}

/**
 * Count prime-time bookings in a time window
 */
export function countPrimeTimeBookings(
  bookings: BookingWithDetails[],
  windowType: WindowType,
  referenceDate: Date = new Date()
): number {
  const window = getTimeWindow(windowType, referenceDate);
  const windowStartStr = formatDate(window.startDate);
  const windowEndStr = formatDate(window.endDate);

  return bookings.filter(booking => {
    // Check if booking is within the window
    if (booking.bookingDate < windowStartStr || booking.bookingDate > windowEndStr) {
      return false;
    }

    // Check if booking is not cancelled
    if (booking.status === 'cancelled') {
      return false;
    }

    // Check if booking is prime time
    return booking.isPrimeTime;
  }).length;
}

/**
 * Get prime time windows for a specific date
 */
export function getPrimeTimeWindows(
  operatingConfigs: CourtOperatingConfig[],
  bookingDate: string
): Array<{ start: string; end: string }> {
  const dayOfWeek = getDayOfWeek(bookingDate);
  const dayConfig = operatingConfigs.find(c => c.dayOfWeek === dayOfWeek);

  if (!dayConfig || !dayConfig.primeTimeStart || !dayConfig.primeTimeEnd) {
    return [];
  }

  return [{
    start: dayConfig.primeTimeStart,
    end: dayConfig.primeTimeEnd
  }];
}

/**
 * Get prime time max duration for a specific day
 */
export function getPrimeTimeMaxDuration(
  operatingConfigs: CourtOperatingConfig[],
  bookingDate: string
): number | null {
  const dayOfWeek = getDayOfWeek(bookingDate);
  const dayConfig = operatingConfigs.find(c => c.dayOfWeek === dayOfWeek);

  if (!dayConfig || !dayConfig.primeTimeStart) {
    return null;
  }

  return dayConfig.primeTimeMaxDuration || null;
}

/**
 * Calculate percentage of booking that falls within prime time
 */
export function getPrimeTimeOverlapPercentage(
  operatingConfigs: CourtOperatingConfig[],
  bookingDate: string,
  startTime: string,
  endTime: string
): number {
  const dayOfWeek = getDayOfWeek(bookingDate);
  const dayConfig = operatingConfigs.find(c => c.dayOfWeek === dayOfWeek);

  if (!dayConfig || !dayConfig.primeTimeStart || !dayConfig.primeTimeEnd) {
    return 0;
  }

  const bookingStart = timeToMinutes(startTime);
  const bookingEnd = timeToMinutes(endTime);
  const primeStart = timeToMinutes(dayConfig.primeTimeStart);
  const primeEnd = timeToMinutes(dayConfig.primeTimeEnd);

  // Calculate overlap
  const overlapStart = Math.max(bookingStart, primeStart);
  const overlapEnd = Math.min(bookingEnd, primeEnd);

  if (overlapStart >= overlapEnd) {
    return 0;
  }

  const overlapMinutes = overlapEnd - overlapStart;
  const bookingMinutes = bookingEnd - bookingStart;

  return (overlapMinutes / bookingMinutes) * 100;
}

/**
 * Helper: Parse time to minutes
 */
function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Check if a tier is eligible for prime time
 */
export function isTierEligibleForPrimeTime(
  tierName: string,
  allowedTiers: string[],
  allowAdminOverride: boolean = true,
  isFacilityAdmin: boolean = false
): boolean {
  // If admin override is allowed and user is admin, they're eligible
  if (allowAdminOverride && isFacilityAdmin) {
    return true;
  }

  // If no tiers specified, all are eligible
  if (!allowedTiers || allowedTiers.length === 0) {
    return true;
  }

  // Check if tier is in allowed list (case-insensitive)
  return allowedTiers.some(
    allowed => allowed.toLowerCase() === tierName.toLowerCase()
  );
}

/**
 * Get user's remaining prime time bookings for the week
 */
export function getRemainingPrimeTimeBookings(
  currentPrimeTimeCount: number,
  maxPrimeTimePerWeek: number
): number {
  return Math.max(0, maxPrimeTimePerWeek - currentPrimeTimeCount);
}

/**
 * Format prime time window for display
 */
export function formatPrimeTimeWindow(start: string, end: string): string {
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return minutes === 0
      ? `${displayHours}${period}`
      : `${displayHours}:${minutes.toString().padStart(2, '0')}${period}`;
  };

  return `${formatTime(start)} - ${formatTime(end)}`;
}
