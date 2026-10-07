/**
 * MiniCalendar
 * Lightweight month calendar for date selection (no external deps)
 */

import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';

const CELL_GAP = 4;

interface MiniCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  minDate?: string; // YYYY-MM-DD
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MiniCalendar({ selectedDate, onSelectDate, minDate }: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [gridWidth, setGridWidth] = useState(0);

  function handleGridLayout(e: LayoutChangeEvent) {
    setGridWidth(e.nativeEvent.layout.width);
  }

  const cellSize = gridWidth > 0 ? gridWidth / 7 : 0;
  const buttonSize = cellSize > 0 ? Math.max(cellSize - CELL_GAP, 0) : 38;

  useEffect(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    setViewDate(new Date(y, m - 1, 1));
  }, [selectedDate]);

  const today = toDateString(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build the calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function isDisabled(day: number): boolean {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (minDate && dateStr < minDate) return true;
    return false;
  }

  function handlePress(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDate(dateStr);
  }

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      {/* Month navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.arrow}>
          <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={styles.row} onLayout={handleGridLayout}>
        {DAYS.map((d) => (
          <View key={d} style={[styles.cell, { width: cellSize || undefined }]}>
            <Text style={styles.dayLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Date grid */}
      {weeks.map((w, i) => (
        <View key={i} style={styles.row}>
          {w.map((day, j) => {
            if (day === null) {
              return <View key={j} style={[styles.cell, { width: cellSize || undefined }]} />;
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today;
            const disabled = isDisabled(day);

            return (
              <View key={j} style={[styles.cell, { width: cellSize || undefined }]}>
                <TouchableOpacity
                  style={[
                    styles.dayButton,
                    { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
                    isSelected && styles.daySelected,
                    isToday && !isSelected && styles.dayToday,
                  ]}
                  onPress={() => !disabled && handlePress(day)}
                  disabled={disabled}
                >
                  <Text style={[
                    styles.dayText,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                    disabled && styles.dayTextDisabled,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  monthLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    paddingBottom: 4,
    textAlign: 'center',
  },
  dayButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  daySelected: {
    backgroundColor: Colors.primary,
  },
  dayToday: {
    backgroundColor: Colors.secondary,
  },
  dayText: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  dayTextSelected: {
    color: Colors.textInverse,
    fontWeight: '700',
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: Colors.textMuted + '60',
  },
});
