import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../constants/theme';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

type DayHoursInput =
  | string
  | {
      open?: string;
      close?: string;
      closed?: boolean;
    }
  | null
  | undefined;

type OperatingHours = Record<string, DayHoursInput>;

type NormalizedDayHours = {
  closed: boolean;
  display: string;
  openDisplay?: string;
};

function weekdayKeyInTimezone(date: Date, timeZone?: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timeZone || undefined,
  }).format(date);
  return weekday.toLowerCase();
}

function titleCaseDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function to12HourTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/[aApP][mM]/.test(trimmed)) return trimmed.toUpperCase();
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return trimmed;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function normalizeDayHours(hours: DayHoursInput): NormalizedDayHours {
  if (!hours) {
    return { closed: true, display: 'Closed' };
  }
  if (typeof hours === 'string') {
    const value = hours.trim();
    if (!value || value.toLowerCase() === 'closed') {
      return { closed: true, display: 'Closed' };
    }
    return { closed: false, display: value };
  }
  if (hours.closed) {
    return { closed: true, display: 'Closed' };
  }
  if (hours.open && hours.close) {
    const openDisplay = to12HourTime(hours.open);
    const closeDisplay = to12HourTime(hours.close);
    return {
      closed: false,
      display: `${openDisplay} – ${closeDisplay}`,
      openDisplay,
    };
  }
  return { closed: true, display: 'Closed' };
}

export function getTodayHoursMessage(operatingHours: OperatingHours, timezone?: string, now: Date = new Date()): string {
  const today = weekdayKeyInTimezone(now, timezone);
  const todayHours = normalizeDayHours(operatingHours[today]);

  if (!todayHours.closed) {
    return `${todayHours.display} (club local time)`;
  }

  const startIdx = DAY_NAMES.indexOf(today as (typeof DAY_NAMES)[number]);
  if (startIdx < 0) {
    return 'Closed today — please check the weekly schedule.';
  }

  for (let offset = 1; offset <= 7; offset++) {
    const idx = (startIdx + offset) % 7;
    const day = DAY_NAMES[idx];
    const next = normalizeDayHours(operatingHours[day]);
    if (!next.closed) {
      const nextOpen = next.openDisplay || next.display;
      return `Closed today — reopens ${titleCaseDay(day)} at ${nextOpen}.`;
    }
  }

  return 'Closed today — please check with the club for reopening hours.';
}

interface OperatingHoursCardProps {
  operatingHours: OperatingHours;
  timezone?: string;
}

export function OperatingHoursCard({ operatingHours, timezone }: OperatingHoursCardProps) {
  const todayMessage = getTodayHoursMessage(operatingHours, timezone);

  return (
    <View style={styles.card}>
      <Text style={styles.todayHoursText}>{todayMessage}</Text>
      {DAY_NAMES.map((day, idx) => {
        const normalized = normalizeDayHours(operatingHours[day]);
        const isLast = idx === DAY_NAMES.length - 1;
        return (
          <View key={day} style={[styles.hoursRow, isLast && { borderBottomWidth: 0 }]}>
            <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
            <Text style={normalized.closed ? styles.closedText : styles.hoursText}>
              {normalized.display}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  todayHoursText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.primary + '08',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dayLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    width: 40,
  },
  hoursText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  closedText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
