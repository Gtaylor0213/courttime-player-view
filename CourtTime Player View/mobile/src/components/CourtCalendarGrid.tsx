/**
 * CourtCalendarGrid
 * Visual calendar grid showing 3 courts at a time with long-press-and-drag booking.
 * Swipe horizontally to page through courts in groups of 3.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court } from '../types/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_LABEL_WIDTH = 52;
const ROW_HEIGHT = 48;
const SLOT_MINUTES = 30;
const COURTS_PER_PAGE = 3;

interface Booking {
  startTime: string;
  endTime: string;
  userName?: string;
  bookingType?: string;
}

interface CourtAvailability {
  courtId: string;
  courtName: string;
  isOpen: boolean;
  operatingHours: { open: string; close: string };
  bookings: Booking[];
}

interface DragSelection {
  courtIndex: number; // index within current page
  startRow: number;
  endRow: number;
}

interface Props {
  courts: Court[];
  selectedDate: string;
  facilityId: string;
  onBookingSelected: (court: Court, startTime: string, endTime: string) => void;
}

export function CourtCalendarGrid({ courts, selectedDate, facilityId, onBookingSelected }: Props) {
  const [courtData, setCourtData] = useState<CourtAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const totalPages = Math.ceil(courts.length / COURTS_PER_PAGE);
  const pageCourts = courts.slice(pageIndex * COURTS_PER_PAGE, (pageIndex + 1) * COURTS_PER_PAGE);
  const courtColumnWidth = (SCREEN_WIDTH - TIME_LABEL_WIDTH) / Math.min(courts.length, COURTS_PER_PAGE);

  // Fetch availability for all courts on selected date
  const fetchAvailability = useCallback(async () => {
    if (courts.length === 0) return;
    setLoading(true);

    const results = await Promise.all(
      courts.map(async (court) => {
        const res = await api.get(`/api/court-config/${court.id}/availability?date=${selectedDate}`);
        if (res.success && res.data) {
          // Normalize snake_case from API to camelCase
          const rawBookings = res.data.existingBookings || [];
          const bookings = rawBookings.map((b: any) => ({
            startTime: b.startTime || b.start_time || '',
            endTime: b.endTime || b.end_time || '',
            userName: b.userName || b.user_name || '',
            bookingType: b.bookingType || b.booking_type || '',
          }));
          return {
            courtId: court.id,
            courtName: court.name,
            isOpen: res.data.isOpen,
            operatingHours: res.data.operatingHours || { open: '08:00', close: '21:00' },
            bookings,
          };
        }
        return {
          courtId: court.id,
          courtName: court.name,
          isOpen: false,
          operatingHours: { open: '08:00', close: '21:00' },
          bookings: [],
        };
      })
    );

    setCourtData(results);
    setLoading(false);
  }, [courts, selectedDate]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Auto-scroll to current time when data loads
  useEffect(() => {
    if (loading || courtData.length === 0 || !scrollRef.current) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (selectedDate !== today) return;

    const hours = courtData[0]?.operatingHours || { open: '08:00', close: '21:00' };
    const [openH, openM] = hours.open.split(':').map(Number);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const firstMinutes = openH * 60 + openM;
    const rowIndex = Math.max(0, Math.floor((nowMinutes - firstMinutes) / SLOT_MINUTES) - 1);
    const scrollY = rowIndex * ROW_HEIGHT;

    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY, animated: true });
    }, 500);
  }, [loading, selectedDate]);

  // Generate time rows from operating hours
  const getTimeRows = (): string[] => {
    if (courtData.length === 0) return [];
    const hours = courtData[0]?.operatingHours || { open: '08:00', close: '21:00' };
    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const rows: string[] = [];
    let h = openH, m = openM;
    while (h < closeH || (h === closeH && m < closeM)) {
      rows.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += SLOT_MINUTES;
      if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    }
    return rows;
  };

  const timeRows = getTimeRows();

  const formatTimeLabel = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')}`;
  };

  const formatFullTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  // Check if a time row is booked for a court
  const isBooked = (courtIndex: number, rowIndex: number): Booking | null => {
    const globalCourtIndex = pageIndex * COURTS_PER_PAGE + courtIndex;
    const data = courtData[globalCourtIndex];
    if (!data) return null;
    const rowTime = timeRows[rowIndex];
    if (!rowTime) return null;
    const rowMinutes = parseInt(rowTime.split(':')[0]) * 60 + parseInt(rowTime.split(':')[1]);

    for (const b of data.bookings) {
      if (!b.startTime || !b.endTime) continue;
      const startParts = b.startTime.split(':');
      const endParts = b.endTime.split(':');
      const bStart = parseInt(startParts[0]) * 60 + parseInt(startParts[1] || '0');
      const bEnd = parseInt(endParts[0]) * 60 + parseInt(endParts[1] || '0');
      if (rowMinutes >= bStart && rowMinutes < bEnd) return b;
    }
    return null;
  };

  // Check if a row is in the past
  const isPast = (rowIndex: number): boolean => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (selectedDate !== today) return selectedDate < today;
    const rowTime = timeRows[rowIndex];
    if (!rowTime) return false;
    const [h, m] = rowTime.split(':').map(Number);
    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
  };

  // Get the row end time (next slot or closing)
  const getRowEndTime = (rowIndex: number): string => {
    if (rowIndex + 1 < timeRows.length) return timeRows[rowIndex + 1];
    const hours = courtData[0]?.operatingHours || { open: '08:00', close: '21:00' };
    return hours.close;
  };

  // Check if drag selection range has any bookings
  const selectionHasConflict = (sel: DragSelection): boolean => {
    const startRow = Math.min(sel.startRow, sel.endRow);
    const endRow = Math.max(sel.startRow, sel.endRow);
    for (let r = startRow; r <= endRow; r++) {
      if (isBooked(sel.courtIndex, r)) return true;
    }
    return false;
  };

  // Handle simple tap/click on a cell (works on web + mobile)
  const handleCellPress = (courtIndex: number, rowIndex: number) => {
    if (isPast(rowIndex) || isBooked(courtIndex, rowIndex)) return;

    const globalCourtIndex = pageIndex * COURTS_PER_PAGE + courtIndex;
    const court = courts[globalCourtIndex];
    if (!court) return;

    const startTime = timeRows[rowIndex] + ':00';
    const endTime = getRowEndTime(rowIndex) + ':00';
    onBookingSelected(court, startTime, endTime);
  };

  // Handle touch events for long press + drag
  const handleTouchStart = (courtIndex: number, rowIndex: number) => {
    if (isPast(rowIndex) || isBooked(courtIndex, rowIndex)) return;

    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragSelection({ courtIndex, startRow: rowIndex, endRow: rowIndex });
    }, 300);
  };

  const handleTouchMove = (courtIndex: number, rowIndex: number) => {
    if (!isDragging.current || !dragSelection) return;
    if (courtIndex !== dragSelection.courtIndex) return;

    // Only extend downward from start
    const newEnd = Math.max(rowIndex, dragSelection.startRow);
    if (newEnd !== dragSelection.endRow) {
      setDragSelection({ ...dragSelection, endRow: newEnd });
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isDragging.current && dragSelection && !selectionHasConflict(dragSelection)) {
      const globalCourtIndex = pageIndex * COURTS_PER_PAGE + dragSelection.courtIndex;
      const court = courts[globalCourtIndex];
      const startRow = Math.min(dragSelection.startRow, dragSelection.endRow);
      const endRow = Math.max(dragSelection.startRow, dragSelection.endRow);
      const startTime = timeRows[startRow] + ':00';
      const endTime = getRowEndTime(endRow) + ':00';

      if (court) {
        onBookingSelected(court, startTime, endTime);
      }
    }

    isDragging.current = false;
    setDragSelection(null);
  };

  const isSelected = (courtIndex: number, rowIndex: number): boolean => {
    if (!dragSelection || courtIndex !== dragSelection.courtIndex) return false;
    const startRow = Math.min(dragSelection.startRow, dragSelection.endRow);
    const endRow = Math.max(dragSelection.startRow, dragSelection.endRow);
    return rowIndex >= startRow && rowIndex <= endRow;
  };

  // Booking block: find first row of a booking to render the label
  const isBookingStart = (courtIndex: number, rowIndex: number): Booking | null => {
    const booking = isBooked(courtIndex, rowIndex);
    if (!booking) return null;
    // Check if previous row is same booking
    if (rowIndex > 0) {
      const prevBooking = isBooked(courtIndex, rowIndex - 1);
      if (prevBooking && prevBooking.startTime === booking.startTime) return null;
    }
    return booking;
  };

  // Get booking block height (number of rows)
  const getBookingRowSpan = (courtIndex: number, rowIndex: number, booking: Booking): number => {
    let span = 1;
    for (let r = rowIndex + 1; r < timeRows.length; r++) {
      const b = isBooked(courtIndex, r);
      if (b && b.startTime === booking.startTime) span++;
      else break;
    }
    return span;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading court availability...</Text>
      </View>
    );
  }

  if (courts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>No courts available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Page indicator */}
      {totalPages > 1 && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            Courts {pageIndex * COURTS_PER_PAGE + 1}-{Math.min((pageIndex + 1) * COURTS_PER_PAGE, courts.length)} of {courts.length}
          </Text>
          <View style={styles.pageDots}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === pageIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Court headers (sticky) */}
      <View style={styles.headerRow}>
        <View style={styles.timeLabel} />
        {pageCourts.map((court, i) => (
          <View key={court.id} style={[styles.courtHeader, { width: courtColumnWidth }]}>
            <Text style={styles.courtHeaderText} numberOfLines={1}>{court.name}</Text>
            <Text style={styles.courtHeaderMeta}>{court.courtType || 'Tennis'}</Text>
          </View>
        ))}
      </View>

      {/* Scrollable time grid */}
      <ScrollView
        ref={scrollRef}
        style={styles.gridScroll}
        showsVerticalScrollIndicator={false}
        onTouchEnd={handleTouchEnd}
        scrollEnabled={!isDragging.current}
      >
        {/* Horizontal swipe wrapper */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - TIME_LABEL_WIDTH));
            setPageIndex(page);
          }}
          scrollEnabled={!isDragging.current}
        >
          {/* Single page grid */}
          <View style={{ width: SCREEN_WIDTH }}>
            {timeRows.map((time, rowIndex) => {
              const past = isPast(rowIndex);

              return (
                <View key={time} style={styles.row}>
                  {/* Time label */}
                  <View style={styles.timeLabel}>
                    <Text style={[styles.timeLabelText, past && styles.pastText]}>
                      {formatTimeLabel(time)}
                    </Text>
                  </View>

                  {/* Court cells */}
                  {pageCourts.map((court, courtIndex) => {
                    const booked = isBooked(courtIndex, rowIndex);
                    const selected = isSelected(courtIndex, rowIndex);
                    const bookingStart = isBookingStart(courtIndex, rowIndex);
                    const span = bookingStart ? getBookingRowSpan(courtIndex, rowIndex, bookingStart) : 0;

                    return (
                      <TouchableOpacity
                        key={court.id}
                        activeOpacity={0.7}
                        onPress={() => handleCellPress(courtIndex, rowIndex)}
                        style={[
                          styles.cell,
                          { width: courtColumnWidth },
                          past && styles.cellPast,
                          booked && styles.cellBooked,
                          selected && styles.cellSelected,
                          selected && selectionHasConflict(dragSelection!) && styles.cellConflict,
                        ]}
                        onTouchStart={() => handleTouchStart(courtIndex, rowIndex)}
                        onTouchMove={(e) => {
                          if (!isDragging.current) return;
                          const y = e.nativeEvent.locationY;
                          const gridY = e.nativeEvent.pageY;
                          const newRow = Math.max(0, Math.min(timeRows.length - 1,
                            rowIndex + Math.round(y / ROW_HEIGHT)
                          ));
                          handleTouchMove(courtIndex, newRow);
                        }}
                      >
                        {bookingStart && (
                          <View style={[styles.bookingBlock, { height: span * ROW_HEIGHT - 2 }]}>
                            <Text style={styles.bookingBlockText} numberOfLines={1}>
                              {bookingStart.bookingType || 'Booked'}
                            </Text>
                            <Text style={styles.bookingBlockTime} numberOfLines={1}>
                              {formatFullTime(bookingStart.startTime)} - {formatFullTime(bookingStart.endTime)}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Drag hint */}
      {!dragSelection && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Long press and drag to select a time slot</Text>
        </View>
      )}

      {/* Selection preview */}
      {dragSelection && !selectionHasConflict(dragSelection) && (
        <View style={styles.selectionPreview}>
          <Text style={styles.selectionPreviewText}>
            {pageCourts[dragSelection.courtIndex]?.name} · {formatFullTime(timeRows[Math.min(dragSelection.startRow, dragSelection.endRow)] + ':00')} – {formatFullTime(getRowEndTime(Math.max(dragSelection.startRow, dragSelection.endRow)) + ':00')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },

  // Page indicator
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.card,
  },
  pageText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  pageDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  courtHeader: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderLight,
  },
  courtHeaderText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  courtHeaderMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Grid
  gridScroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  timeLabel: {
    width: TIME_LABEL_WIDTH,
    justifyContent: 'center',
    paddingRight: Spacing.xs,
    alignItems: 'flex-end',
  },
  timeLabelText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  pastText: {
    color: Colors.textMuted,
  },

  // Cells
  cell: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellPast: {
    backgroundColor: Colors.borderLight + '80',
  },
  cellBooked: {
    backgroundColor: 'transparent',
  },
  cellSelected: {
    backgroundColor: Colors.primary + '25',
  },
  cellConflict: {
    backgroundColor: Colors.error + '20',
  },

  // Booking blocks
  bookingBlock: {
    position: 'absolute',
    top: 1,
    left: 2,
    right: 2,
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  bookingBlockText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  bookingBlockTime: {
    fontSize: 9,
    color: Colors.textSecondary,
  },

  // Hint
  hint: {
    padding: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    alignItems: 'center',
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Selection preview
  selectionPreview: {
    padding: Spacing.sm,
    backgroundColor: Colors.primary + '15',
    borderTopWidth: 1,
    borderTopColor: Colors.primary,
    alignItems: 'center',
  },
  selectionPreviewText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
});
