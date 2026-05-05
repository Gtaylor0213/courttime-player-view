/**
 * CourtCalendarGrid
 * Visual calendar grid showing 3 courts at a time with long-press-and-drag booking.
 * Swipe horizontally to page through courts in groups of 3.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { api } from '../api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court } from '../types/database';
import { BookingSkeleton } from './LoadingSkeleton';
import { createPollingTransport } from '../../../shared/api/sync';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TIME_LABEL_WIDTH = 46;
const ROW_HEIGHT = 48;
const DEFAULT_SLOT_MINUTES = 30;
const COURTS_PER_PAGE = 4;
const ACTIVE_DAY_POLL_MS = 5000;
const DRAG_ARM_DELAY_MS = 180;

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
  onBookingSelected: (court: Court, startTime: string, endTime: string) => void | Promise<void>;
  /** While true, parent screen should disable its ScrollView so nested grid drags are not stolen. */
  onInteractionLockChange?: (locked: boolean) => void;
}

export function CourtCalendarGrid({
  courts,
  selectedDate,
  facilityId,
  onBookingSelected,
  onInteractionLockChange,
}: Props) {
  const [courtData, setCourtData] = useState<CourtAvailability[]>([]);
  /** Must match facility slot duration so row times align with booking modal / API. */
  const [slotStepMinutes, setSlotStepMinutes] = useState(DEFAULT_SLOT_MINUTES);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  /** Disables inner + parent scroll while a cell gesture is active (refs alone do not re-render scrollEnabled). */
  const [touchCaptureActive, setTouchCaptureActive] = useState(false);
  /** Same payload as dragSelection, updated synchronously — RN can fire parent onTouchEnd before state from onTouchStart commits. */
  const dragSelectionRef = useRef<DragSelection | null>(null);
  const dragStartRef = useRef<{ pageX: number; pageY: number; startRow: number } | null>(null);
  /** When true, current touch intent is horizontal page swipe, so cell tap/drag should be ignored. */
  const horizontalSwipeRef = useRef(false);
  /** Drag select only starts after a short hold so vertical swipes still scroll naturally. */
  const dragArmedRef = useRef(false);
  const dragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartedAtRef = useRef(0);
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const totalPages = Math.ceil(courts.length / COURTS_PER_PAGE);
  const pageCourts = courts.slice(pageIndex * COURTS_PER_PAGE, (pageIndex + 1) * COURTS_PER_PAGE);
  /** Fixed gutters between court columns so borders do not shrink column width math */
  const COURT_COLUMN_GUTTER = Spacing.xs;
  const courtTrackWidth = SCREEN_WIDTH - TIME_LABEL_WIDTH;
  const courtColumnWidth =
    (courtTrackWidth - COURT_COLUMN_GUTTER * (COURTS_PER_PAGE - 1)) / COURTS_PER_PAGE;

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

    let step = DEFAULT_SLOT_MINUTES;
    for (const cfg of configList) {
      const raw = cfg?.slotDuration ?? cfg?.slot_duration;
      const d = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10);
      if (Number.isFinite(d) && d > 0) {
        step = d;
        break;
      }
    }
    setSlotStepMinutes(step);

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

  useEffect(() => {
    return () => {
      onInteractionLockChange?.(false);
    };
  }, [onInteractionLockChange]);

  useEffect(() => {
    const stopPolling = createPollingTransport(ACTIVE_DAY_POLL_MS).subscribe(() => {
      fetchAvailability();
    });
    return stopPolling;
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
    const rowIndex = Math.max(0, Math.floor((nowMinutes - firstMinutes) / slotStepMinutes) - 1);
    const scrollY = rowIndex * ROW_HEIGHT;

    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY, animated: true });
    }, 500);
  }, [loading, selectedDate, slotStepMinutes]);

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
      m += slotStepMinutes;
      if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    }
    return rows;
  };

  const timeRows = getTimeRows();

  /** Avoid flex:1 in a parent ScrollView — it can confuse layout/touches; bound grid height instead. */
  const gridScrollMinHeight = useMemo(() => {
    const rowsH = timeRows.length * ROW_HEIGHT + 100;
    return Math.min(SCREEN_HEIGHT * 0.52, Math.max(280, rowsH));
  }, [timeRows.length]);

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

  const releaseInteractionLocks = () => {
    setTouchCaptureActive(false);
    onInteractionLockChange?.(false);
  };

  // Handle touch events for tap + drag selection
  const handleTouchStart = (
    targetPageIndex: number,
    courtIndex: number,
    rowIndex: number,
    pageX: number,
    pageY: number
  ) => {
    if (isPast(rowIndex) || isBooked(targetPageIndex, courtIndex, rowIndex)) return;

    // Do not lock parent/inner scrolling yet — wait until movement confirms
    // a vertical drag selection. This keeps horizontal court paging responsive.
    dragStartRef.current = { pageX, pageY, startRow: rowIndex };
    touchStartedAtRef.current = Date.now();
    dragMoved.current = false;
    isDragging.current = false;
    horizontalSwipeRef.current = false;
    dragArmedRef.current = false;
    if (dragArmTimerRef.current) clearTimeout(dragArmTimerRef.current);
    dragArmTimerRef.current = setTimeout(() => {
      // User held long enough: arm drag selection now.
      dragArmedRef.current = true;
      const nextSel: DragSelection = {
        pageIndex: targetPageIndex,
        courtIndex,
        startRow: rowIndex,
        endRow: rowIndex,
      };
      dragSelectionRef.current = nextSel;
      setDragSelection(nextSel);
    }, DRAG_ARM_DELAY_MS);
  };

  const handleTouchEnd = () => {
    try {
      if (dragArmTimerRef.current) {
        clearTimeout(dragArmTimerRef.current);
        dragArmTimerRef.current = null;
      }
      if (horizontalSwipeRef.current) return;
      const sel = dragSelectionRef.current;
      if (!sel || !dragArmedRef.current) return;
      dragSelectionRef.current = null;

      if (isDragging.current && !selectionHasConflict(sel)) {
        const globalCourtIndex = sel.pageIndex * COURTS_PER_PAGE + sel.courtIndex;
        const court = courts[globalCourtIndex];
        const startRow = Math.min(sel.startRow, sel.endRow);
        const endRow = Math.max(sel.startRow, sel.endRow);
        const startTime = timeRows[startRow] + ':00';
        const endTime = getRowEndTime(endRow) + ':00';

        if (court) {
          void onBookingSelected(court, startTime, endTime);
        }
      } else if (!dragMoved.current) {
        // Treat as single-tap selection when finger did not move enough to drag.
        const globalCourtIndex = sel.pageIndex * COURTS_PER_PAGE + sel.courtIndex;
        const court = courts[globalCourtIndex];
        const startTime = timeRows[sel.startRow] + ':00';
        const endTime = getRowEndTime(sel.startRow) + ':00';
        if (court) {
          void onBookingSelected(court, startTime, endTime);
        }
      }
    } finally {
      dragStartRef.current = null;
      dragMoved.current = false;
      isDragging.current = false;
      horizontalSwipeRef.current = false;
      dragArmedRef.current = false;
      setDragSelection(null);
      releaseInteractionLocks();
    }
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
        <View style={[styles.timeLabel, styles.timeLabelHeaderSpacer]} />
        {pageCourts.map((court, courtIndex) => (
          <View
            key={court.id}
            style={[
              styles.courtHeader,
              { width: courtColumnWidth, marginLeft: courtIndex > 0 ? COURT_COLUMN_GUTTER : 0 },
              courtIndex > 0 && styles.courtColumnDividerLeft,
            ]}
          >
            <Text style={styles.courtHeaderText} numberOfLines={1}>{court.name}</Text>
            <Text style={styles.courtHeaderMeta}>{court.courtType || 'Tennis'}</Text>
          </View>
        ))}
        {Array.from({ length: Math.max(0, COURTS_PER_PAGE - pageCourts.length) }).map((_, idx) => {
          const courtIndex = pageCourts.length + idx;
          return (
            <View
              key={`header-empty-${idx}`}
              style={[
                styles.courtHeader,
                { width: courtColumnWidth, marginLeft: courtIndex > 0 ? COURT_COLUMN_GUTTER : 0 },
                courtIndex > 0 && styles.courtColumnDividerLeft,
              ]}
            />
          );
        })}
      </View>

      {/* Scrollable time grid */}
      <ScrollView
        ref={scrollRef}
        style={[styles.gridScroll, { minHeight: gridScrollMinHeight }]}
        showsVerticalScrollIndicator={false}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        nestedScrollEnabled
        scrollEnabled={!touchCaptureActive}
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
          nestedScrollEnabled
          scrollEnabled={!touchCaptureActive}
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
                      <View style={[styles.timeLabel, styles.timeLabelGrid]}>
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
                          <View
                            key={court.id}
                            style={[
                              styles.cell,
                              { width: courtColumnWidth, marginLeft: courtIndex > 0 ? COURT_COLUMN_GUTTER : 0 },
                              courtIndex > 0 && styles.courtColumnDividerLeft,
                              past && styles.cellPast,
                              booked && styles.cellBooked,
                              selected && styles.cellSelected,
                              selected && dragSelection && selectionHasConflict(dragSelection) && styles.cellConflict,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`${court.name} ${formatFullTime(time + ':00')}`}
                            accessibilityState={{ disabled: past || Boolean(booked) }}
                            onTouchStart={(e) => {
                              handleTouchStart(
                                renderPageIndex,
                                courtIndex,
                                rowIndex,
                                e.nativeEvent.pageX,
                                e.nativeEvent.pageY
                              );
                            }}
                            onTouchEnd={handleTouchEnd}
                            onTouchCancel={handleTouchEnd}
                            onTouchMove={(e) => {
                              const cur = dragSelectionRef.current;
                              if (!cur || !dragStartRef.current) return;
                              if (renderPageIndex !== cur.pageIndex || courtIndex !== cur.courtIndex) return;

                              const deltaX = e.nativeEvent.pageX - dragStartRef.current.pageX;
                              const deltaY = e.nativeEvent.pageY - dragStartRef.current.pageY;
                              const absX = Math.abs(deltaX);
                              const absY = Math.abs(deltaY);

                              // Before drag is armed, movement should behave like normal scroll/swipe.
                              if (!dragArmedRef.current) {
                                if (absX > 8 || absY > 8) {
                                  if (dragArmTimerRef.current) {
                                    clearTimeout(dragArmTimerRef.current);
                                    dragArmTimerRef.current = null;
                                  }
                                }
                                return;
                              }

                              // Let horizontal intent page through courts smoothly.
                              if (absX > 10 && absX > absY + 2) {
                                horizontalSwipeRef.current = true;
                                dragSelectionRef.current = null;
                                setDragSelection(null);
                                releaseInteractionLocks();
                                return;
                              }

                              const rowOffset = Math.round(deltaY / ROW_HEIGHT);
                              const nextRow = Math.max(
                                0,
                                Math.min(timeRows.length - 1, dragStartRef.current.startRow + rowOffset)
                              );

                              if (Math.abs(deltaY) > 8) {
                                if (!touchCaptureActive) {
                                  setTouchCaptureActive(true);
                                  onInteractionLockChange?.(true);
                                }
                                isDragging.current = true;
                                dragMoved.current = true;
                              }

                              if (!isDragging.current) return;
                              if (nextRow !== cur.endRow) {
                                const nextSel = { ...cur, endRow: nextRow };
                                dragSelectionRef.current = nextSel;
                                setDragSelection(nextSel);
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
                          </View>
                        );
                      })}

                      {Array.from({ length: Math.max(0, COURTS_PER_PAGE - renderPageCourts.length) }).map((_, idx) => {
                        const courtIndex = renderPageCourts.length + idx;
                        return (
                          <View
                            key={`empty-cell-${renderPageIndex}-${rowIndex}-${idx}`}
                            style={[
                              styles.cell,
                              {
                                width: courtColumnWidth,
                                marginLeft: courtIndex > 0 ? COURT_COLUMN_GUTTER : 0,
                              },
                              courtIndex > 0 && styles.courtColumnDividerLeft,
                            ]}
                          />
                        );
                      })}
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
    alignSelf: 'stretch',
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
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  courtColumnDividerLeft: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
  },
  timeLabelHeaderSpacer: {
    borderRightWidth: 2,
    borderRightColor: Colors.border,
  },
  timeLabelGrid: {
    borderRightWidth: 2,
    borderRightColor: Colors.border,
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

  // Grid (height comes from minHeight in component — not flex:1 inside Book's ScrollView)
  gridScroll: {},
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.borderLight,
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
