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
} from 'react-native';
import { api } from '../api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court } from '../types/database';
import { BookingSkeleton } from './LoadingSkeleton';

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
  pageIndex: number;
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
  const dragStartRef = useRef<{ pageY: number; startRow: number } | null>(null);
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const totalPages = Math.ceil(courts.length / COURTS_PER_PAGE);
  const pageCourts = courts.slice(pageIndex * COURTS_PER_PAGE, (pageIndex + 1) * COURTS_PER_PAGE);
  const courtColumnWidth = (SCREEN_WIDTH - TIME_LABEL_WIDTH) / COURTS_PER_PAGE;

  useEffect(() => {
    console.log('[book-grid] selectedDate prop', selectedDate);
  }, [selectedDate]);

  // Fetch availability for all courts on selected date
  const fetchAvailability = useCallback(async () => {
    if (courts.length === 0) return;
    setLoading(true);
    console.log('[book-grid] fetch day view', {
      selectedDate,
      facilityId,
      bookingsUrl: `/api/bookings/facility/${facilityId}?date=${selectedDate}`,
      configUrl: `/api/court-config/facility/${facilityId}?date=${selectedDate}`,
      courtCount: courts.length,
    });

    const [bookingsRes, configRes] = await Promise.all([
      api.get(`/api/bookings/facility/${facilityId}?date=${selectedDate}`),
      api.get(`/api/court-config/facility/${facilityId}?date=${selectedDate}`),
    ]);

    console.log('[book-grid] day endpoints response', {
      bookingsSuccess: bookingsRes.success,
      bookingsErrorCategory: bookingsRes.errorCategory,
      bookingsError: bookingsRes.error,
      configSuccess: configRes.success,
      configErrorCategory: configRes.errorCategory,
      configError: configRes.error,
    });

    const bookingsList = bookingsRes.success
      ? (Array.isArray((bookingsRes.data as any)?.bookings) ? (bookingsRes.data as any).bookings : [])
      : [];
    const bookingsByCourtId = new Map<string, Booking[]>();
    bookingsList.forEach((b: any) => {
      const normalized: Booking = {
        startTime: b.startTime || b.start_time || '',
        endTime: b.endTime || b.end_time || '',
        userName: b.userName || b.user_name || '',
        bookingType: b.bookingType || b.booking_type || '',
      };
      const existing = bookingsByCourtId.get(b.courtId) || [];
      existing.push(normalized);
      bookingsByCourtId.set(b.courtId, existing);
    });

    const configList = configRes.success
      ? (Array.isArray((configRes.data as any)?.courtConfigs) ? (configRes.data as any).courtConfigs : [])
      : [];
    const configByCourtId = new Map<string, any>();
    configList.forEach((cfg: any) => configByCourtId.set(cfg.courtId, cfg));

    const results = courts.map((court) => {
      const config = configByCourtId.get(court.id);
      return {
        courtId: court.id,
        courtName: court.name,
        isOpen: config ? Boolean(config.isOpen) : true,
        operatingHours: {
          open: config?.openTime || '06:00',
          close: config?.closeTime || '22:00',
        },
        bookings: bookingsByCourtId.get(court.id) || [],
      };
    });

    setCourtData(results);
    setLoading(false);
  }, [courts, selectedDate, facilityId]);

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
  const isBooked = (targetPageIndex: number, courtIndex: number, rowIndex: number): Booking | null => {
    const globalCourtIndex = targetPageIndex * COURTS_PER_PAGE + courtIndex;
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
      if (isBooked(sel.pageIndex, sel.courtIndex, r)) return true;
    }
    return false;
  };

  // Handle touch events for tap + drag selection
  const handleTouchStart = (
    targetPageIndex: number,
    courtIndex: number,
    rowIndex: number,
    pageY: number
  ) => {
    if (isPast(rowIndex) || isBooked(targetPageIndex, courtIndex, rowIndex)) return;

    dragStartRef.current = { pageY, startRow: rowIndex };
    dragMoved.current = false;
    isDragging.current = false;
    setDragSelection({ pageIndex: targetPageIndex, courtIndex, startRow: rowIndex, endRow: rowIndex });
  };

  const handleTouchEnd = () => {
    if (!dragSelection) return;

    if (isDragging.current && !selectionHasConflict(dragSelection)) {
      const globalCourtIndex = dragSelection.pageIndex * COURTS_PER_PAGE + dragSelection.courtIndex;
      const court = courts[globalCourtIndex];
      const startRow = Math.min(dragSelection.startRow, dragSelection.endRow);
      const endRow = Math.max(dragSelection.startRow, dragSelection.endRow);
      const startTime = timeRows[startRow] + ':00';
      const endTime = getRowEndTime(endRow) + ':00';

      if (court) {
        onBookingSelected(court, startTime, endTime);
      }
    } else if (!dragMoved.current) {
      // Treat as single-tap selection when finger did not move enough to drag.
      const globalCourtIndex = dragSelection.pageIndex * COURTS_PER_PAGE + dragSelection.courtIndex;
      const court = courts[globalCourtIndex];
      const startTime = timeRows[dragSelection.startRow] + ':00';
      const endTime = getRowEndTime(dragSelection.startRow) + ':00';
      if (court) {
        onBookingSelected(court, startTime, endTime);
      }
    }

    dragStartRef.current = null;
    dragMoved.current = false;
    isDragging.current = false;
    setDragSelection(null);
  };

  const isSelected = (targetPageIndex: number, courtIndex: number, rowIndex: number): boolean => {
    if (!dragSelection || courtIndex !== dragSelection.courtIndex) return false;
    if (targetPageIndex !== dragSelection.pageIndex) return false;
    const startRow = Math.min(dragSelection.startRow, dragSelection.endRow);
    const endRow = Math.max(dragSelection.startRow, dragSelection.endRow);
    return rowIndex >= startRow && rowIndex <= endRow;
  };

  // Booking block: find first row of a booking to render the label
  const isBookingStart = (targetPageIndex: number, courtIndex: number, rowIndex: number): Booking | null => {
    const booking = isBooked(targetPageIndex, courtIndex, rowIndex);
    if (!booking) return null;
    // Check if previous row is same booking
    if (rowIndex > 0) {
      const prevBooking = isBooked(targetPageIndex, courtIndex, rowIndex - 1);
      if (prevBooking && prevBooking.startTime === booking.startTime) return null;
    }
    return booking;
  };

  // Get booking block height (number of rows)
  const getBookingRowSpan = (targetPageIndex: number, courtIndex: number, rowIndex: number, booking: Booking): number => {
    let span = 1;
    for (let r = rowIndex + 1; r < timeRows.length; r++) {
      const b = isBooked(targetPageIndex, courtIndex, r);
      if (b && b.startTime === booking.startTime) span++;
      else break;
    }
    return span;
  };

  if (loading) {
    return <BookingSkeleton />;
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
        {pageCourts.map((court) => (
          <View key={court.id} style={[styles.courtHeader, { width: courtColumnWidth }]}>
            <Text style={styles.courtHeaderText} numberOfLines={1}>{court.name}</Text>
            <Text style={styles.courtHeaderMeta}>{court.courtType || 'Tennis'}</Text>
          </View>
        ))}
        {Array.from({ length: Math.max(0, COURTS_PER_PAGE - pageCourts.length) }).map((_, idx) => (
          <View key={`header-empty-${idx}`} style={[styles.courtHeader, { width: courtColumnWidth }]} />
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
            const nextPage = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setPageIndex(Math.max(0, Math.min(totalPages - 1, nextPage)));
          }}
          scrollEnabled={!isDragging.current}
        >
          {Array.from({ length: totalPages }).map((_, renderPageIndex) => {
            const renderPageCourts = courts.slice(
              renderPageIndex * COURTS_PER_PAGE,
              (renderPageIndex + 1) * COURTS_PER_PAGE
            );

            return (
              <View key={`page-${renderPageIndex}`} style={{ width: SCREEN_WIDTH }}>
                {timeRows.map((time, rowIndex) => {
                  const past = isPast(rowIndex);

                  return (
                    <View key={`${renderPageIndex}-${time}`} style={styles.row}>
                      {/* Time label */}
                      <View style={styles.timeLabel}>
                        <Text style={[styles.timeLabelText, past && styles.pastText]}>
                          {formatTimeLabel(time)}
                        </Text>
                      </View>

                      {/* Court cells */}
                      {renderPageCourts.map((court, courtIndex) => {
                        const booked = isBooked(renderPageIndex, courtIndex, rowIndex);
                        const selected = isSelected(renderPageIndex, courtIndex, rowIndex);
                        const bookingStart = isBookingStart(renderPageIndex, courtIndex, rowIndex);
                        const span = bookingStart ? getBookingRowSpan(renderPageIndex, courtIndex, rowIndex, bookingStart) : 0;

                        return (
                          <TouchableOpacity
                            key={court.id}
                            activeOpacity={0.7}
                            style={[
                              styles.cell,
                              { width: courtColumnWidth },
                              past && styles.cellPast,
                              booked && styles.cellBooked,
                              selected && styles.cellSelected,
                              selected && dragSelection && selectionHasConflict(dragSelection) && styles.cellConflict,
                            ]}
                            onTouchStart={(e) => {
                              handleTouchStart(
                                renderPageIndex,
                                courtIndex,
                                rowIndex,
                                e.nativeEvent.pageY
                              );
                            }}
                            onTouchMove={(e) => {
                              if (!dragSelection || !dragStartRef.current) return;
                              if (renderPageIndex !== dragSelection.pageIndex || courtIndex !== dragSelection.courtIndex) return;

                              const deltaY = e.nativeEvent.pageY - dragStartRef.current.pageY;
                              const rowOffset = Math.round(deltaY / ROW_HEIGHT);
                              const nextRow = Math.max(
                                0,
                                Math.min(timeRows.length - 1, dragStartRef.current.startRow + rowOffset)
                              );

                              if (Math.abs(deltaY) > 8) {
                                isDragging.current = true;
                                dragMoved.current = true;
                              }

                              if (!isDragging.current) return;
                              if (nextRow !== dragSelection.endRow) {
                                setDragSelection({ ...dragSelection, endRow: nextRow });
                              }
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

                      {Array.from({ length: Math.max(0, COURTS_PER_PAGE - renderPageCourts.length) }).map((_, idx) => (
                        <View key={`empty-cell-${renderPageIndex}-${rowIndex}-${idx}`} style={[styles.cell, { width: courtColumnWidth }]} />
                      ))}
                    </View>
                  );
                })}
              </View>
            );
          })}
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
            {courts[dragSelection.pageIndex * COURTS_PER_PAGE + dragSelection.courtIndex]?.name} · {formatFullTime(timeRows[Math.min(dragSelection.startRow, dragSelection.endRow)] + ':00')} – {formatFullTime(getRowEndTime(Math.max(dragSelection.startRow, dragSelection.endRow)) + ':00')}
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
