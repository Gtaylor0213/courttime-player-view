import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../constants/theme';
import {
  OPERATING_DAYS_MONDAY_FIRST,
  getTodayHoursMessage,
  normalizeDayHours,
  getOperatingHoursForDay,
  type OperatingHoursMap,
} from '../../../shared/utils/operatingHours';

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export { getTodayHoursMessage };

interface OperatingHoursCardProps {
  operatingHours: OperatingHoursMap;
  timezone?: string;
}

export function OperatingHoursCard({ operatingHours, timezone }: OperatingHoursCardProps) {
  const todayMessage = getTodayHoursMessage(operatingHours, timezone);

  return (
    <View style={styles.card}>
      <Text style={styles.todayHoursText}>{todayMessage}</Text>
      {OPERATING_DAYS_MONDAY_FIRST.map((day, idx) => {
        const normalized = normalizeDayHours(getOperatingHoursForDay(operatingHours, day));
        const isLast = idx === OPERATING_DAYS_MONDAY_FIRST.length - 1;
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
