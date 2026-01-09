/**
 * Time utilities for the Rules Engine
 */

import { TimeWindow, WindowType } from '../types';

/**
 * Parse a time string (HH:MM:SS or HH:MM) to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Convert minutes since midnight to HH:MM:SS format
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
  graceMinutes: number = 0
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2) + graceMinutes;
  const e2 = timeToMinutes(end2) - graceMinutes;

  // Check for overlap
  return s1 < e2 && e1 > s2;
}

/**
 * Get time window based on type (rolling 7 days or calendar week)
 */
export function getTimeWindow(
  windowType: WindowType,
  referenceDate: Date = new Date()
): TimeWindow {
  const startDate = new Date(referenceDate);
  const endDate = new Date(referenceDate);

  if (windowType === 'rolling_7_days') {
    // Last 7 days including today
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Calendar week (Sunday to Saturday)
    const dayOfWeek = referenceDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() + (6 - dayOfWeek));
    endDate.setHours(23, 59, 59, 999);
  }

  return {
    type: windowType,
    startDate,
    endDate
  };
}

/**
 * Get weekend window (Saturday-Sunday)
 */
export function getWeekendWindow(referenceDate: Date = new Date()): TimeWindow {
  const startDate = new Date(referenceDate);
  const endDate = new Date(referenceDate);

  const dayOfWeek = referenceDate.getDay();

  if (dayOfWeek === 0) {
    // Sunday - weekend is today and yesterday
    startDate.setDate(startDate.getDate() - 1);
  } else if (dayOfWeek === 6) {
    // Saturday - weekend is today and tomorrow
    endDate.setDate(endDate.getDate() + 1);
  } else {
    // Weekday - find next weekend
    startDate.setDate(startDate.getDate() + (6 - dayOfWeek));
    endDate.setDate(endDate.getDate() + (7 - dayOfWeek));
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return {
    type: 'calendar_week',
    startDate,
    endDate
  };
}

/**
 * Calculate minutes between two timestamps
 */
export function minutesBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60));
}

/**
 * Combine date and time into a Date object
 */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time as HH:MM:SS
 */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Check if a time aligns to a slot grid
 */
export function isAlignedToSlot(time: string, slotMinutes: number): boolean {
  const minutes = timeToMinutes(time);
  return minutes % slotMinutes === 0;
}

/**
 * Get the next aligned time slot
 */
export function getNextAlignedSlot(time: string, slotMinutes: number): string {
  const minutes = timeToMinutes(time);
  const alignedMinutes = Math.ceil(minutes / slotMinutes) * slotMinutes;
  return minutesToTime(alignedMinutes);
}

/**
 * Check if date is in the future
 */
export function isFutureDate(dateStr: string, timeStr: string): boolean {
  const bookingTime = combineDateAndTime(dateStr, timeStr);
  return bookingTime > new Date();
}

/**
 * Get day of week from date string (0=Sunday)
 */
export function getDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get start of day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Parse an RRULE string and check if a date matches
 * (Simplified - supports basic weekly recurrence)
 */
export function matchesRecurrenceRule(
  rule: string,
  originalDate: Date,
  checkDate: Date
): boolean {
  // Basic parsing for FREQ=WEEKLY;BYDAY=TU format
  if (!rule.includes('FREQ=WEEKLY')) {
    return false;
  }

  const dayMatch = rule.match(/BYDAY=([A-Z,]+)/);
  if (!dayMatch) {
    // Weekly with no specific days - check same day of week
    return originalDate.getDay() === checkDate.getDay();
  }

  const dayMap: Record<string, number> = {
    SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6
  };

  const days = dayMatch[1].split(',').map(d => dayMap[d]);
  return days.includes(checkDate.getDay());
}
