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
  InteractionManager,
  TouchableOpacity,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court } from '../types/database';
import { BookingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { createPollingTransport } from '../../../shared/api/sync';
import { getOperatingHoursForDay, isTruthyClosed } from '../../../shared/utils/operatingHours';
import { userFacingApiMessage, type ApiFailureShape } from '../utils/apiUserMessages';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TIME_LABEL_WIDTH = 46;
const ROW_HEIGHT = 48;
const DEFAULT_SLOT_MINUTES = 30;
const COURTS_PER_PAGE = 4;
const ACTIVE_DAY_POLL_MS = 5000;
const DRAG_ARM_DELAY_MS = 180;
const BOOKED_SLOT_TAP_MAX_MOVEMENT_PX = 8;

/** Normalize YYYY-M-D vs YYYY-MM-DD so "today" checks match Book / MiniCalendar. */
function normalizeYmd(value: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function localTodayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface Booking {
  id?: string;
  userId?: string;
  courtId?: string;
  bookingDate?: string;
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

interface FacilityDayHours {
  isOpen: boolean;
  open: string;
  close: string;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function getFacilityDayConfig(rawOperatingHours: any, dayIndex: number): any {
  if (!rawOperatingHours || typeof rawOperatingHours !== 'object') return null;
  const dayName = DAY_NAMES[dayIndex];
  return getOperatingHoursForDay(rawOperatingHours, dayName) ?? null;
}

function parseTimeToMinutesSafe(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const timePart = value.includes('T') ? value.split('T')[1] || '' : value;
  const normalized = timePart.trim().toUpperCase();
  const ampmMatch = normalized.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const suffix = ampmMatch[3];
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (suffix === 'PM' && h !== 12) h += 12;
    if (suffix === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const match = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function normalizeHHMM(value: string | undefined | null, fallback: string): string {
  const mins = parseTimeToMinutesSafe(value);
  if (mins === null) return fallback;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Resolve a single day's facility hours from API (object or legacy "8:00 AM – 10:00 PM" string). */
function parseDayConfigBounds(dayConfig: unknown): FacilityDayHours | null {
  if (dayConfig == null) return null;

  if (typeof dayConfig === 'string') {
    const trimmed = dayConfig.trim();
    if (!trimmed || trimmed.toLowerCase() === 'closed') {
      return { isOpen: false, open: '08:00', close: '20:00' };
    }
    const parts = trimmed.split(/\s*[–—-]\s*/);
    if (parts.length < 2) return null;
    const open = normalizeHHMM(parts[0]!.trim(), '08:00');
    const close = normalizeHHMM(parts[1]!.trim(), '20:00');
    return { isOpen: true, open, close };
  }

  if (typeof dayConfig !== 'object') return null;
  const dc = dayConfig as Record<string, unknown>;
  const closed =
    isTruthyClosed(dc.closed) ||
    isTruthyClosed(dc.isClosed) ||
    isTruthyClosed(dc.is_closed) ||
    dc.isOpen === false ||
    dc.is_open === false ||
    (typeof dc.isOpen === 'string' && dc.isOpen.trim().toLowerCase() === 'false') ||
    (typeof dc.is_open === 'string' && String(dc.is_open).trim().toLowerCase() === 'false');
  if (closed) {
    return { isOpen: false, open: '08:00', close: '20:00' };
  }
  const open = normalizeHHMM(
    (dc.open ??
      dc.openTime ??
      dc.open_time ??
      dc.start ??
      dc.startTime ??
      dc.start_time) as string | undefined,
    '08:00'
  );
  const close = normalizeHHMM(
    (dc.close ??
      dc.closeTime ??
      dc.close_time ??
      dc.end ??
      dc.endTime ??
      dc.end_time) as string | undefined,
    '20:00'
  );
  return { isOpen: true, open, close };
}

function bookingsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = parseTimeToMinutesSafe(aStart);
  const aE = parseTimeToMinutesSafe(aEnd);
  const bS = parseTimeToMinutesSafe(bStart);
  const bE = parseTimeToMinutesSafe(bEnd);
  if (aS === null || aE === null || bS === null || bE === null) return false;
  return aS < bE && bS < aE;
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
  onBookedSlotPress?: (court: Court, booking: Booking) => void;
  /** While true, parent screen should disable its ScrollView so nested grid drags are not stolen. */
  onInteractionLockChange?: (locked: boolean) => void;
  /** When "Now" is tapped while another day is selected, parent should switch to today; then the grid auto-scrolls after load. */
  onRequestToday?: () => void;
}

interface GridLoadError {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

function toGridLoadError(res: ApiFailureShape, title: string): GridLoadError {
  return {
    icon: res.errorCategory === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline',
    title,
    description: userFacingApiMessage(res),
  };
}

export function CourtCalendarGrid({
  courts,
  selectedDate,
  facilityId,
  onBookingSelected,
  onBookedSlotPress,
  onInteractionLockChange,
  onRequestToday,
}: Props) {
  const [courtData, setCourtData] = useState<CourtAvailability[]>([]);
  /** Must match facility slot duration so row times align with booking modal / API. */
  const [slotStepMinutes, setSlotStepMinutes] = useState(DEFAULT_SLOT_MINUTES);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  /** Disables inner + parent scroll while a cell gesture is active (refs alone do not re-render scrollEnabled). */
  const [touchCaptureActive, setTouchCaptureActive] = useState(false);
  const [facilityDayHours, setFacilityDayHours] = useState<FacilityDayHours | null>(null);
  const [loadError, setLoadError] = useState<GridLoadError | null>(null);
  /** Same payload as dragSelection, updated synchronously — RN can fire parent onTouchEnd before state from onTouchStart commits. */
  const dragSelectionRef = useRef<DragSelection | null>(null);
  const dragStartRef = useRef<{ pageX: number; pageY: number; startRow: number } | null>(null);
  const bookedTouchStartRef = useRef<{
    pageX: number;
    pageY: number;
    bookingId: string | undefined;
    courtId: string;
  } | null>(null);
  /** When true, current touch intent is horizontal page swipe, so cell tap/drag should be ignored. */
  const horizontalSwipeRef = useRef(false);
  /** Drag select only starts after a short hold so vertical swipes still scroll naturally. */
  const dragArmedRef = useRef(false);
  const dragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const fetchRequestIdRef = useRef(0);
  const selectedYmd = useMemo(() => normalizeYmd(selectedDate) ?? selectedDate, [selectedDate]);

  const totalPages = Math.ceil(courts.length / COURTS_PER_PAGE);
  const pageCourts = courts.slice(pageIndex * COURTS_PER_PAGE, (pageIndex + 1) * COURTS_PER_PAGE);
  const openCourtData = useMemo(() => courtData.filter((d) => d.isOpen), [courtData]);

  /** Facility + per-court bounds so the grid never ends before published operating hours (courts can lag by one slot). */
  const mergedScheduleBounds = useMemo(() => {
    if (facilityDayHours && !facilityDayHours.isOpen) return null;

    const courtOpens = openCourtData
      .map((d) => parseTimeToMinutesSafe(d.operatingHours?.open))
      .filter((v): v is number => v !== null);
    const courtCloses = openCourtData
      .map((d) => parseTimeToMinutesSafe(d.operatingHours?.close))
      .filter((v): v is number => v !== null);
    const courtOpenMin = courtOpens.length ? Math.min(...courtOpens) : null;
    const courtCloseMax = courtCloses.length ? Math.max(...courtCloses) : null;

    const fo = facilityDayHours ? parseTimeToMinutesSafe(facilityDayHours.open) : null;
    const fc = facilityDayHours ? parseTimeToMinutesSafe(facilityDayHours.close) : null;

    const openMinutes =
      fo !== null && courtOpenMin !== null ? Math.max(fo, courtOpenMin) : (fo ?? courtOpenMin);
    const closeMinutes =
      fc !== null && courtCloseMax !== null ? Math.max(fc, courtCloseMax) : (fc ?? courtCloseMax);

    if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return null;
    return { openMinutes, closeMinutes };
  }, [facilityDayHours, openCourtData]);

  const timeRows = useMemo(() => {
    if (!mergedScheduleBounds) return [];
    const { openMinutes, closeMinutes } = mergedScheduleBounds;
    const rows: string[] = [];
    let minutes = openMinutes;
    while (minutes < closeMinutes) {
      rows.push(
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      );
      minutes += slotStepMinutes;
    }
    return rows;
  }, [mergedScheduleBounds, slotStepMinutes]);

  const mergedCloseHHMM = useMemo(() => {
    if (!mergedScheduleBounds) return null;
    const m = mergedScheduleBounds.closeMinutes;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }, [mergedScheduleBounds]);

  /** Fixed gutters between court columns so borders do not shrink column width math */
  const COURT_COLUMN_GUTTER = Spacing.xs;
  const courtTrackWidth = SCREEN_WIDTH - TIME_LABEL_WIDTH;
  const courtColumnWidth =
    (courtTrackWidth - COURT_COLUMN_GUTTER * (COURTS_PER_PAGE - 1)) / COURTS_PER_PAGE;

  useEffect(() => {
    console.log('[book-grid] selectedDate prop', selectedDate);
  }, [selectedDate]);

  // Fetch availability for all courts on selected date
  const fetchAvailability = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    const requestId = ++fetchRequestIdRef.current;

    if (courts.length === 0) {
      if (requestId !== fetchRequestIdRef.current) return;
      setCourtData([]);
      setFacilityDayHours(null);
      setLoadError(null);
      if (!background) {
        setLoading(false);
      }
      return;
    }

    if (!background) {
      setLoading(true);
      setLoadError(null);
    }

    console.log('[book-grid] fetch day view', {
      selectedDate,
      facilityId,
      bookingsUrl: `/api/bookings/facility/${facilityId}?date=${selectedDate}`,
      configUrl: `/api/court-config/facility/${facilityId}?date=${selectedDate}`,
      courtCount: courts.length,
    });

    const [bookingsRes, configRes, facilityRes] = await Promise.all([
      api.get(`/api/bookings/facility/${facilityId}?date=${selectedDate}`),
      api.get(`/api/court-config/facility/${facilityId}?date=${selectedDate}`),
      api.get(`/api/facilities/${facilityId}`),
    ]);

    console.log('[book-grid] day endpoints response', {
      bookingsSuccess: bookingsRes.success,
      bookingsErrorCategory: bookingsRes.errorCategory,
      bookingsError: bookingsRes.error,
      configSuccess: configRes.success,
      configErrorCategory: configRes.errorCategory,
      configError: configRes.error,
      facilitySuccess: facilityRes.success,
      facilityErrorCategory: facilityRes.errorCategory,
      facilityError: facilityRes.error,
      background,
    });

    if (!bookingsRes.success || !configRes.success) {
      if (requestId !== fetchRequestIdRef.current) return;

      if (background) {
        console.log('[book-grid] background refresh failed; keeping existing grid data', {
          bookingsErrorCategory: bookingsRes.errorCategory,
          configErrorCategory: configRes.errorCategory,
        });
        return;
      }

      const criticalFailure = !bookingsRes.success ? bookingsRes : configRes;
      setCourtData([]);
      setFacilityDayHours(null);
      setLoadError(
        toGridLoadError(
          criticalFailure,
          criticalFailure.errorCategory === 'offline'
            ? 'You are offline'
            : 'Could not load booking availability'
        )
      );
      setLoading(false);
      return;
    }

    const dateObj = new Date(`${selectedDate}T00:00:00`);
    const dayIndex = dateObj.getDay();
    const facility = facilityRes.success
      ? ((facilityRes.data as any)?.facility || facilityRes.data || null)
      : null;
    const facilityOperatingHours = facility?.operatingHours || facility?.operating_hours || null;
    const dayConfig = getFacilityDayConfig(facilityOperatingHours, dayIndex);
    if (requestId !== fetchRequestIdRef.current) return;
    setFacilityDayHours(parseDayConfigBounds(dayConfig));

    const bookingsList = bookingsRes.success
      ? (Array.isArray((bookingsRes.data as any)?.bookings) ? (bookingsRes.data as any).bookings : [])
      : [];
    const bookingsByCourtId = new Map<string, Booking[]>();
    const courtById = new Map<string, any>();
    courts.forEach((c: any) => courtById.set(c.id, c));
    const parentToChildren = new Map<string, string[]>();
    courts.forEach((c: any) => {
      if (c?.parentCourtId) {
        const existing = parentToChildren.get(c.parentCourtId) || [];
        existing.push(c.id);
        parentToChildren.set(c.parentCourtId, existing);
      }
    });
    bookingsList.forEach((b: any) => {
      const sourceCourtId = b.courtId || b.court_id;
      if (!sourceCourtId) return;
      const normalized: Booking = {
        id: b.id || b.bookingId,
        userId: b.userId || b.user_id,
        courtId: sourceCourtId,
        bookingDate: b.bookingDate || b.booking_date || selectedDate,
        startTime: b.startTime || b.start_time || '',
        endTime: b.endTime || b.end_time || '',
        userName: b.userName || b.user_name || '',
        bookingType: b.bookingType || b.booking_type || '',
      };
      const existing = bookingsByCourtId.get(sourceCourtId) || [];
      existing.push(normalized);
      bookingsByCourtId.set(sourceCourtId, existing);

      // Mirror web behavior for split courts:
      // - booking parent blocks all children
      // - booking child blocks parent + siblings
      const sourceCourt = courtById.get(sourceCourtId);
      const relatedCourtIds = new Set<string>();
      const children = parentToChildren.get(sourceCourtId) || [];
      children.forEach((id) => relatedCourtIds.add(id));
      if (sourceCourt?.parentCourtId) {
        relatedCourtIds.add(sourceCourt.parentCourtId);
        const siblings = parentToChildren.get(sourceCourt.parentCourtId) || [];
        siblings.forEach((id) => {
          if (id !== sourceCourtId) relatedCourtIds.add(id);
        });
      }

      for (const relatedCourtId of relatedCourtIds) {
        const existingRelated = bookingsByCourtId.get(relatedCourtId) || [];
        const conflictAlreadyPresent = existingRelated.some((rb) =>
          bookingsOverlap(rb.startTime, rb.endTime, normalized.startTime, normalized.endTime)
        );
        if (conflictAlreadyPresent) continue;
        existingRelated.push({
          id: `${normalized.id || 'booking'}-blocked-${relatedCourtId}`,
          courtId: relatedCourtId,
          bookingDate: normalized.bookingDate,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          userName: `Blocked (${sourceCourt?.name || 'Related court'})`,
          bookingType: 'blocked',
        });
        bookingsByCourtId.set(relatedCourtId, existingRelated);
      }
    });

    const configList = configRes.success
      ? (Array.isArray((configRes.data as any)?.courtConfigs) ? (configRes.data as any).courtConfigs : [])
      : [];
    const configByCourtId = new Map<string, any>();
    configList.forEach((cfg: any) => configByCourtId.set(cfg.courtId, cfg));
    const openConfigList = configList.filter((cfg: any) => Boolean(cfg?.isOpen));
    const openFacilityStartMinutes = openConfigList
      .map((cfg: any) => parseTimeToMinutesSafe(cfg?.openTime))
      .filter((v: number | null): v is number => v !== null);
    const openFacilityEndMinutes = openConfigList
      .map((cfg: any) => parseTimeToMinutesSafe(cfg?.closeTime))
      .filter((v: number | null): v is number => v !== null);
    const facilityOpenTime =
      openFacilityStartMinutes.length > 0
        ? `${String(Math.floor(Math.min(...openFacilityStartMinutes) / 60)).padStart(2, '0')}:${String(Math.min(...openFacilityStartMinutes) % 60).padStart(2, '0')}`
        : '06:00';
    const facilityCloseTime =
      openFacilityEndMinutes.length > 0
        ? `${String(Math.floor(Math.max(...openFacilityEndMinutes) / 60)).padStart(2, '0')}:${String(Math.max(...openFacilityEndMinutes) % 60).padStart(2, '0')}`
        : '22:00';

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
      const isOpen = config ? Boolean(config.isOpen) : openConfigList.length > 0;
      return {
        courtId: court.id,
        courtName: court.name,
        isOpen,
        operatingHours: {
          open: config?.openTime || facilityOpenTime,
          close: config?.closeTime || facilityCloseTime,
        },
        bookings: bookingsByCourtId.get(court.id) || [],
      };
    });

    if (requestId !== fetchRequestIdRef.current) return;
    setCourtData(results);
    setLoadError(null);
    if (!background) {
      setLoading(false);
    }
  }, [courts, selectedDate, facilityId]);

  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  useEffect(() => {
    return () => {
      onInteractionLockChange?.(false);
    };
  }, [onInteractionLockChange]);

  useEffect(() => {
    if (selectedYmd !== localTodayYmd()) {
      return;
    }

    const stopPolling = createPollingTransport(ACTIVE_DAY_POLL_MS).subscribe(() => {
      void fetchAvailability({ background: true });
    });

    return stopPolling;
  }, [fetchAvailability, selectedYmd]);

  /**
   * Vertical size of the time column (one row per slot). Used for scroll math and iOS content height.
   */
  const gridContentHeight = useMemo(() => timeRows.length * ROW_HEIGHT, [timeRows.length]);

  /**
   * Fixed viewport for the day grid. On iOS, a nested vertical ScrollView with only minHeight often
   * expands to full content height inside Book's outer ScrollView — then there is nothing to scroll
   * internally and scrollTo is a no-op. Hard-cap height so the grid always scrolls inside this box.
   */
  const gridViewportHeight = useMemo(() => {
    const cap = SCREEN_HEIGHT * 0.52;
    const h = gridContentHeight;
    return Math.min(cap, Math.max(280, Math.min(h, cap)));
  }, [gridContentHeight]);

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

  const currentTimeIndicatorY = useMemo(() => {
    const now = new Date();
    const today = localTodayYmd();
    if (selectedYmd !== today || timeRows.length === 0) return null;
    const firstRowMinutes = parseTimeToMinutesSafe(timeRows[0]);
    if (firstRowMinutes === null) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const deltaMinutes = nowMinutes - firstRowMinutes;
    if (deltaMinutes < 0) return null;
    const y = (deltaMinutes / slotStepMinutes) * ROW_HEIGHT;
    const maxY = Math.max(0, timeRows.length * ROW_HEIGHT - 1);
    if (y > maxY) return null;
    return y;
  }, [selectedYmd, timeRows, slotStepMinutes]);

  // Check if a time row is booked for a court
  const isBooked = (targetPageIndex: number, courtIndex: number, rowIndex: number): Booking | null => {
    const globalCourtIndex = targetPageIndex * COURTS_PER_PAGE + courtIndex;
    const data = courtData[globalCourtIndex];
    if (!data) return null;
    const rowTime = timeRows[rowIndex];
    if (!rowTime) return null;
    const rowMinutes = parseTimeToMinutesSafe(rowTime);
    if (rowMinutes === null) return null;

    for (const b of data.bookings) {
      if (!b.startTime || !b.endTime) continue;
      const bStart = parseTimeToMinutesSafe(b.startTime);
      const bEnd = parseTimeToMinutesSafe(b.endTime);
      if (bStart === null || bEnd === null) continue;
      if (rowMinutes >= bStart && rowMinutes < bEnd) return b;
    }
    return null;
  };

  // Check if a row is in the past
  const isPast = (rowIndex: number): boolean => {
    const now = new Date();
    const today = localTodayYmd();
    if (selectedYmd !== today) return selectedYmd < today;
    const rowTime = timeRows[rowIndex];
    if (!rowTime) return false;
    const rowMinutes = parseTimeToMinutesSafe(rowTime);
    if (rowMinutes === null) return false;
    const h = Math.floor(rowMinutes / 60);
    const m = rowMinutes % 60;
    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
  };

  const scrollToCurrentTime = useCallback((options?: { fromUserTap?: boolean; reliable?: boolean }) => {
    if (loading || !scrollRef.current) return;
    if (timeRows.length === 0) return;

    // Only clear capture on explicit "Now" — onContentSizeChange also calls this handler,
    // and unconditional setState there fights layout and tests.
    if (options?.fromUserTap) {
      if (dragArmTimerRef.current) {
        clearTimeout(dragArmTimerRef.current);
        dragArmTimerRef.current = null;
      }
      dragArmedRef.current = false;
      dragSelectionRef.current = null;
      setDragSelection(null);
      setTouchCaptureActive(false);
      onInteractionLockChange?.(false);
    }

    const rowIsPast = (rowIndex: number): boolean => {
      const now = new Date();
      const today = localTodayYmd();
      if (selectedYmd !== today) return selectedYmd < today;
      const rowTime = timeRows[rowIndex];
      if (!rowTime) return false;
      const rowMinutes = parseTimeToMinutesSafe(rowTime);
      if (rowMinutes === null) return false;
      const h = Math.floor(rowMinutes / 60);
      const m = rowMinutes % 60;
      return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
    };

    const firstFutureRowIndex = timeRows.findIndex((_, rowIndex) => !rowIsPast(rowIndex));
    let scrollY: number;
    if (currentTimeIndicatorY !== null) {
      const lead = Math.min(ROW_HEIGHT * 2, Math.max(32, gridViewportHeight * 0.12));
      scrollY = Math.max(0, currentTimeIndicatorY - lead);
    } else if (firstFutureRowIndex >= 0) {
      scrollY = Math.max(0, firstFutureRowIndex - 1) * ROW_HEIGHT;
    } else {
      const today = localTodayYmd();
      if (selectedYmd === today) {
        scrollY = Math.max(0, gridContentHeight - gridViewportHeight);
      } else {
        scrollY = 0;
      }
    }

    const maxOffset = Math.max(0, gridContentHeight - gridViewportHeight);
    scrollY = Math.min(Math.max(0, scrollY), maxOffset);

    const applyScroll = () => {
      scrollRef.current?.scrollTo({ x: 0, y: scrollY, animated: Boolean(options?.fromUserTap) });
    };

    // iOS: first scrollTo often runs before native contentSize is final (esp. after date change +
    // fetch). Immediate applyScroll no-ops; deferred retries + onContentSizeChange with reliable
    // fixes "stuck at top" on today.
    const useReliableTiming = Boolean(options?.fromUserTap || options?.reliable);
    if (useReliableTiming) {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyScroll();
            setTimeout(applyScroll, 50);
            setTimeout(applyScroll, 160);
            setTimeout(applyScroll, 320);
            setTimeout(applyScroll, 520);
            setTimeout(applyScroll, 800);
          });
        });
      });
    } else {
      applyScroll();
    }
  }, [
    loading,
    selectedYmd,
    timeRows,
    currentTimeIndicatorY,
    gridViewportHeight,
    gridContentHeight,
    onInteractionLockChange,
  ]);

  const handleNowPress = useCallback(() => {
    const today = localTodayYmd();
    if (selectedYmd !== today && onRequestToday) {
      onRequestToday();
      return;
    }
    scrollToCurrentTime({ fromUserTap: true });
  }, [selectedYmd, onRequestToday, scrollToCurrentTime]);

  useEffect(() => {
    if (loading) return;
    const isToday = selectedYmd === localTodayYmd();
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        scrollToCurrentTime(isToday ? { reliable: true } : undefined);
        setTimeout(() => scrollToCurrentTime(isToday ? { reliable: true } : undefined), 140);
      });
    });
    return () => task.cancel();
  }, [loading, scrollToCurrentTime, timeRows.length, pageIndex, selectedYmd]);

  // Get the row end time (next slot or closing)
  const getRowEndTime = useCallback(
    (rowIndex: number): string => {
      if (rowIndex + 1 < timeRows.length) return timeRows[rowIndex + 1]!;
      if (mergedCloseHHMM) return mergedCloseHHMM;
      const closeCandidates = openCourtData
        .map((d) => parseTimeToMinutesSafe(d.operatingHours?.close))
        .filter((v): v is number => v !== null);
      const closeMinutes = closeCandidates.length > 0 ? Math.max(...closeCandidates) : 21 * 60;
      return `${String(Math.floor(closeMinutes / 60)).padStart(2, '0')}:${String(closeMinutes % 60).padStart(2, '0')}`;
    },
    [timeRows, mergedCloseHHMM, openCourtData]
  );

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

  const handleBookedTouchStart = (court: Court, booking: Booking, pageX: number, pageY: number) => {
    bookedTouchStartRef.current = {
      pageX,
      pageY,
      bookingId: booking.id,
      courtId: court.id,
    };
  };

  const handleBookedTouchEnd = (court: Court, booking: Booking, e: GestureResponderEvent) => {
    const start = bookedTouchStartRef.current;
    bookedTouchStartRef.current = null;
    if (!start || start.courtId !== court.id || start.bookingId !== booking.id) return;

    const deltaX = e.nativeEvent.pageX - start.pageX;
    const deltaY = e.nativeEvent.pageY - start.pageY;
    const movedDistance = Math.hypot(deltaX, deltaY);
    if (movedDistance > BOOKED_SLOT_TAP_MAX_MOVEMENT_PX) return;

    onBookedSlotPress?.(court, booking);
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
        const startRow = Math.min(sel.startRow, sel.endRow);
        const endRow = Math.max(sel.startRow, sel.endRow);
        openSelectedRange(sel.pageIndex, sel.courtIndex, startRow, endRow);
      } else if (!dragMoved.current) {
        // Treat as single-tap selection when finger did not move enough to drag.
        openSelectedRange(sel.pageIndex, sel.courtIndex, sel.startRow, sel.startRow);
      }
    } finally {
      dragStartRef.current = null;
      dragMoved.current = false;
      isDragging.current = false;
      horizontalSwipeRef.current = false;
      dragArmedRef.current = false;
      bookedTouchStartRef.current = null;
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

  const openSelectedRange = useCallback(
    (targetPageIndex: number, courtIndex: number, startRow: number, endRow: number) => {
      const globalCourtIndex = targetPageIndex * COURTS_PER_PAGE + courtIndex;
      const court = courts[globalCourtIndex];
      if (!court) return;

      const resolvedStartRow = Math.min(startRow, endRow);
      const resolvedEndRow = Math.max(startRow, endRow);
      const startTime = timeRows[resolvedStartRow] + ':00';
      const endTime = getRowEndTime(resolvedEndRow) + ':00';

      void onBookingSelected(court, startTime, endTime);
    },
    [courts, getRowEndTime, onBookingSelected, timeRows]
  );

  const openBookedSlotDetails = useCallback(
    (court: Court, booking: Booking) => {
      if (booking.bookingType === 'blocked') return;
      onBookedSlotPress?.(court, booking);
    },
    [onBookedSlotPress]
  );

  if (loading) {
    return <BookingSkeleton />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={loadError.icon}
        title={loadError.title}
        description={loadError.description}
        actionLabel="Try again"
        onAction={() => {
          void fetchAvailability();
        }}
      />
    );
  }

  if (courts.length === 0) {
    return (
      <EmptyState
        icon="tennisball-outline"
        title="No courts available"
        description="This club does not have any reservable courts available right now."
      />
    );
  }

  if (timeRows.length === 0) {
    return (
      <EmptyState
        icon="moon-outline"
        title="Facility is closed on this date"
        description="Choose another date to see court availability."
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Page indicator */}
      <View style={styles.pageIndicator}>
        <Text style={styles.pageText}>
          Courts {pageIndex * COURTS_PER_PAGE + 1}-{Math.min((pageIndex + 1) * COURTS_PER_PAGE, courts.length)} of {courts.length}
        </Text>
        <View style={styles.pageIndicatorRight}>
          <TouchableOpacity
            style={styles.nowButton}
            onPress={handleNowPress}
            accessibilityRole="button"
            accessibilityLabel="Scroll to current time"
          >
            <Text style={styles.nowButtonText}>Now</Text>
          </TouchableOpacity>
          {totalPages > 1 && (
            <View style={styles.pageDots}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === pageIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      </View>

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

      {/* Fixed-height wrapper: iOS nested ScrollView must not grow to full content or scrollTo does nothing */}
      <View style={[styles.gridScrollViewport, { height: gridViewportHeight }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.gridScrollFill}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollToCurrentTime(selectedYmd === localTodayYmd() ? { reliable: true } : undefined)
          }
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          nestedScrollEnabled
          scrollEnabled={!touchCaptureActive}
          removeClippedSubviews={false}
        >
        {/* Horizontal swipe wrapper — explicit height so vertical contentSize matches row math */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ height: gridContentHeight }}
          contentContainerStyle={{ minHeight: gridContentHeight }}
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
              <View key={`page-${renderPageIndex}`} style={styles.pageContent}>
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
                        const isBlockedSlot = booked?.bookingType === 'blocked';
                        const selected = isSelected(renderPageIndex, courtIndex, rowIndex);
                        const bookingStart = isBookingStart(renderPageIndex, courtIndex, rowIndex);
                        const span = bookingStart ? getBookingRowSpan(renderPageIndex, courtIndex, rowIndex, bookingStart) : 0;
                        const fullTimeLabel = formatFullTime(time + ':00');
                        const cellDisabled = isBlockedSlot || (past && !booked);
                        const accessibilityLabel = booked
                          ? isBlockedSlot
                            ? `${court.name} at ${fullTimeLabel}. Unavailable because a related court is booked.`
                            : `${court.name} at ${fullTimeLabel}. Booked ${bookingStart?.bookingType || booked.bookingType || 'reservation'} from ${formatFullTime(booked.startTime)} to ${formatFullTime(booked.endTime)}.`
                          : past
                            ? `${court.name} at ${fullTimeLabel}. Past time slot.`
                            : `${court.name} at ${fullTimeLabel}. Available to book.`;
                        const accessibilityHint = booked
                          ? isBlockedSlot
                            ? 'This slot is unavailable.'
                            : 'Double tap to view booking details.'
                          : past
                            ? 'Past time slots cannot be booked.'
                            : 'Double tap to book this time or long press and drag to select a longer booking.';

                        return (
                          <View
                            key={court.id}
                            style={[
                              styles.cell,
                              { width: courtColumnWidth, marginLeft: courtIndex > 0 ? COURT_COLUMN_GUTTER : 0 },
                              courtIndex > 0 && styles.courtColumnDividerLeft,
                              past && styles.cellPast,
                              booked && styles.cellBooked,
                              isBlockedSlot && styles.cellBlocked,
                              selected && styles.cellSelected,
                              selected && dragSelection && selectionHasConflict(dragSelection) && styles.cellConflict,
                            ]}
                            accessible
                            accessibilityRole="button"
                            accessibilityLabel={accessibilityLabel}
                            accessibilityHint={accessibilityHint}
                            accessibilityState={{ disabled: cellDisabled, selected }}
                            accessibilityActions={
                              cellDisabled
                                ? undefined
                                : [
                                    {
                                      name: 'activate',
                                      label: booked ? 'View booking details' : 'Book this time slot',
                                    },
                                  ]
                            }
                            onAccessibilityAction={() => {
                              if (booked) {
                                openBookedSlotDetails(court, booked);
                                return;
                              }
                              openSelectedRange(renderPageIndex, courtIndex, rowIndex, rowIndex);
                            }}
                            onTouchStart={(e) => {
                              if (booked) {
                                if (booked.bookingType !== 'blocked') {
                                  handleBookedTouchStart(court, booked, e.nativeEvent.pageX, e.nativeEvent.pageY);
                                }
                                return;
                              }
                              handleTouchStart(
                                renderPageIndex,
                                courtIndex,
                                rowIndex,
                                e.nativeEvent.pageX,
                                e.nativeEvent.pageY
                              );
                            }}
                            onTouchEnd={(e) => {
                              if (booked) {
                                if (booked.bookingType === 'blocked') return;
                                handleBookedTouchEnd(court, booked, e);
                                return;
                              }
                              handleTouchEnd();
                            }}
                            onTouchCancel={() => {
                              bookedTouchStartRef.current = null;
                              handleTouchEnd();
                            }}
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
                              <View
                                style={[
                                  styles.bookingBlock,
                                  bookingStart.bookingType === 'blocked' && styles.bookingBlockBlocked,
                                  { height: span * ROW_HEIGHT - 2 },
                                ]}
                                accessible={false}
                              >
                                <Text style={styles.bookingBlockText} numberOfLines={1}>
                                  {bookingStart.bookingType === 'blocked' ? 'Blocked' : (bookingStart.bookingType || 'Booked')}
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
                {currentTimeIndicatorY !== null && (
                  <View pointerEvents="none" style={[styles.currentTimeLineWrap, { top: currentTimeIndicatorY }]}>
                    <View style={styles.currentTimeDot} />
                    <View style={styles.currentTimeLine} />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
        </ScrollView>
      </View>

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
  pageIndicatorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pageDots: {
    flexDirection: 'row',
    gap: 6,
  },
  nowButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEE2E2',
  },
  nowButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#DC2626',
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

  gridScrollViewport: {
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  gridScrollFill: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timeLabel: {
    width: TIME_LABEL_WIDTH,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
  },
  timeLabelText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
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
  cellBlocked: {
    backgroundColor: '#E5E7EB',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingBlockBlocked: {
    backgroundColor: '#E5E7EB',
    borderLeftColor: '#6B7280',
  },
  bookingBlockText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
  },
  bookingBlockTime: {
    fontSize: 9,
    color: Colors.textSecondary,
    textAlign: 'center',
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
  pageContent: {
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  currentTimeLineWrap: {
    position: 'absolute',
    left: TIME_LABEL_WIDTH,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
    elevation: 5,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    marginLeft: 2,
    marginRight: 4,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#DC2626',
  },
});
