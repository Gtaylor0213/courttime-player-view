/**
 * Week / month schedule overview, behind the `week_month_view` flag.
 *
 * Web renders this as a time grid (`WeekMonthCalendarView`). A 7-column time
 * grid is unreadable on a phone, so mobile shows the same information in two
 * shapes that suit the screen: a week agenda, and a month grid of booking
 * counts. Tapping any day hands the date back so the caller can open its day
 * view — the equivalent of web's "switch to court view".
 *
 * Range maths and grouping come from `shared/utils/scheduleOverview` so the two
 * clients agree on what a week is.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import {
  formatOverviewSlotLabel,
  getMonthDays,
  getMonthLeadingBlankCount,
  getOverviewDateStrings,
  getWeekDays,
  groupBookingsByDate,
  shiftOverviewDate,
  toDateStr,
  type OverviewBooking,
} from '../../../shared/utils/scheduleOverview';
import { getBookingTypeLabel } from '../../../shared/constants/bookingTypes';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

export type OverviewMode = 'week' | 'month';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ScheduleOverviewProps {
  facilityId: string;
  /** Anchor date, YYYY-MM-DD. */
  selectedDate: string;
  /** Called when a day is tapped — the caller opens that day's court view. */
  onSelectDate: (date: string) => void;
  /**
   * Window-space Y the month grid should extend down to (e.g. the bottom of the
   * screen's scroll area). When set, month rows grow so the grid fills that
   * space instead of leaving it blank; cells never shrink below square.
   */
  fillToWindowY?: number | null;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function monthTitle(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function weekTitle(date: Date): string {
  const days = getWeekDays(date);
  const start = days[0];
  const end = days[6];
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

export function ScheduleOverview({
  facilityId,
  selectedDate,
  onSelectDate,
  fillToWindowY = null,
}: ScheduleOverviewProps) {
  const [mode, setMode] = useState<OverviewMode>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(() => parseYmd(selectedDate));
  const [bookings, setBookings] = useState<OverviewBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const dateStrings = useMemo(
    () => getOverviewDateStrings(mode, anchorDate),
    [mode, anchorDate]
  );
  // Array identity churns every render; the joined string does not.
  const fetchKey = dateStrings.join(',');

  useEffect(() => {
    if (!facilityId || dateStrings.length === 0) return;
    let cancelled = false;
    setLoading(true);

    // One request for the whole range (web's per-day loop is 31 calls on a long month).
    const startDate = dateStrings[0]!;
    const endDate = dateStrings[dateStrings.length - 1]!;
    api
      .get(`/api/bookings/facility/${facilityId}/range?startDate=${startDate}&endDate=${endDate}`)
      .then((res) => {
        const data = res.success ? (res.data as { bookings?: unknown }) : null;
        return Array.isArray(data?.bookings) ? (data.bookings as OverviewBooking[]) : [];
      })
      .catch(() => [] as OverviewBooking[])
      .then((results) => {
        if (!cancelled) setBookings(results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, fetchKey]);

  const byDate = useMemo(() => groupBookingsByDate(bookings), [bookings]);

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      setAnchorDate((current) => shiftOverviewDate(mode, current, direction));
    },
    [mode]
  );

  const title = mode === 'week' ? weekTitle(anchorDate) : monthTitle(anchorDate);
  const todayStr = toDateStr(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        {(['week', 'month'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeChip, mode === m && styles.modeChipActive]}
            onPress={() => setMode(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            accessibilityLabel={`${m === 'week' ? 'Week' : 'Month'} view`}
          >
            <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
              {m === 'week' ? 'Week' : 'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={() => navigate('prev')}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${mode}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{title}</Text>
        <TouchableOpacity
          onPress={() => navigate('next')}
          accessibilityRole="button"
          accessibilityLabel={`Next ${mode}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : mode === 'week' ? (
        <WeekAgenda
          anchorDate={anchorDate}
          byDate={byDate}
          todayStr={todayStr}
          onSelectDate={onSelectDate}
        />
      ) : (
        <MonthGrid
          anchorDate={anchorDate}
          byDate={byDate}
          todayStr={todayStr}
          onSelectDate={onSelectDate}
          fillToWindowY={fillToWindowY}
        />
      )}
    </View>
  );
}

function WeekAgenda({
  anchorDate,
  byDate,
  todayStr,
  onSelectDate,
}: {
  anchorDate: Date;
  byDate: Record<string, OverviewBooking[]>;
  todayStr: string;
  onSelectDate: (date: string) => void;
}) {
  const days = getWeekDays(anchorDate);

  return (
    <ScrollView style={styles.agenda} contentContainerStyle={styles.agendaContent}>
      {days.map((day) => {
        const ymd = toDateStr(day);
        const dayBookings = byDate[ymd] || [];
        const isToday = ymd === todayStr;

        return (
          <TouchableOpacity
            key={ymd}
            style={styles.agendaDay}
            onPress={() => onSelectDate(ymd)}
            accessibilityRole="button"
            accessibilityLabel={`${day.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}, ${dayBookings.length} reservation${dayBookings.length === 1 ? '' : 's'}`}
          >
            <View style={styles.agendaHeader}>
              <Text style={[styles.agendaDayLabel, isToday && styles.todayText]}>
                {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {isToday ? ' · Today' : ''}
              </Text>
              <Text style={styles.agendaCount}>
                {dayBookings.length === 0
                  ? 'Open'
                  : `${dayBookings.length} booked`}
              </Text>
            </View>

            {dayBookings.slice(0, 4).map((booking, idx) => (
              <Text key={`${ymd}-${idx}`} style={styles.agendaSlot} numberOfLines={1}>
                {formatOverviewSlotLabel(booking)}
                {booking.bookingType ? ` · ${getBookingTypeLabel(booking.bookingType)}` : ''}
              </Text>
            ))}
            {dayBookings.length > 4 ? (
              <Text style={styles.agendaMore}>+{dayBookings.length - 4} more</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function MonthGrid({
  anchorDate,
  byDate,
  todayStr,
  onSelectDate,
  fillToWindowY,
}: {
  anchorDate: Date;
  byDate: Record<string, OverviewBooking[]>;
  todayStr: string;
  onSelectDate: (date: string) => void;
  fillToWindowY: number | null;
}) {
  const days = getMonthDays(anchorDate);
  const blanks = getMonthLeadingBlankCount(anchorDate);
  const rowCount = Math.max(1, Math.ceil((blanks + days.length) / 7));

  const gridRef = useRef<View>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [gridTopY, setGridTopY] = useState<number | null>(null);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
    // Refs are null under react-test-renderer; the grid then keeps square cells.
    gridRef.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) setGridTopY(y);
    });
  }, []);

  // Square cells by default; stretch rows to fill the remaining screen when we know where the grid sits.
  const squareSize = gridWidth > 0 ? gridWidth / 7 : null;
  let cellHeight: number | null = null;
  if (squareSize != null && fillToWindowY != null && gridTopY != null) {
    const available = fillToWindowY - gridTopY;
    cellHeight = Math.max(squareSize, Math.floor(available / rowCount));
  }
  const cellSizeStyle = cellHeight != null ? { height: cellHeight } : styles.monthCellSquare;

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View ref={gridRef} style={styles.monthGrid} onLayout={onGridLayout}>
        {Array.from({ length: blanks }, (_, i) => (
          <View key={`blank-${i}`} style={[styles.monthCell, cellSizeStyle]} />
        ))}
        {days.map((day) => {
          const ymd = toDateStr(day);
          const count = (byDate[ymd] || []).length;
          const isToday = ymd === todayStr;

          return (
            <TouchableOpacity
              key={ymd}
              style={[styles.monthCell, cellSizeStyle, isToday && styles.monthCellToday]}
              onPress={() => onSelectDate(ymd)}
              accessibilityRole="button"
              accessibilityLabel={`${day.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}, ${count} reservation${count === 1 ? '' : 's'}`}
            >
              <Text style={[styles.monthDayNumber, isToday && styles.todayText]}>
                {day.getDate()}
              </Text>
              {count > 0 ? <Text style={styles.monthCount}>{count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modeChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeChipText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  modeChipTextActive: {
    color: Colors.textInverse,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  navTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  loading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  agenda: {
    maxHeight: 420,
  },
  agendaContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  agendaDay: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: 2,
  },
  agendaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  agendaDayLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  agendaCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  agendaSlot: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  agendaMore: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  todayText: {
    color: Colors.primary,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingVertical: Spacing.xs,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  monthCellSquare: {
    aspectRatio: 1,
  },
  monthCellToday: {
    backgroundColor: Colors.surface,
  },
  monthDayNumber: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  monthCount: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
});
