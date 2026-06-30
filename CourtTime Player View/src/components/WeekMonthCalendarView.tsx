import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { bookingApi } from '../api/client';
import {
  getBookingTypeColor,
  getBookingTypeBadgeColor,
  getBookingTypeLabel,
} from '../constants/bookingTypes';
import { ReservationDetailsModal } from './ReservationDetailsModal';

// Week view time grid constants
const SLOT_HEIGHT_PX = 28;        // pixels per 30-minute slot
const DAY_START_HOUR = 6;          // 6:00 AM
const DAY_END_HOUR = 22;           // 10:00 PM
const DAY_START_MINUTES = DAY_START_HOUR * 60;
const DAY_END_MINUTES = DAY_END_HOUR * 60;
const TOTAL_HEIGHT_PX = ((DAY_END_MINUTES - DAY_START_MINUTES) / 30) * SLOT_HEIGHT_PX;

type Booking = {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  bookingType?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  courtName?: string;
  userName?: string;
  userEmail?: string;
  facilityName?: string;
  bulletinPostId?: string;
};

interface Props {
  facilityId: string;
  facilityName: string;
  viewMode: 'week' | 'month';
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onSwitchToCourtView: (date: Date) => void;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Monday-anchored week start
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function WeekMonthCalendarView({
  facilityId,
  facilityName,
  viewMode,
  selectedDate,
  onDateChange,
  onSwitchToCourtView,
}: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Booking | null>(null);

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart]
  );

  const monthStart = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate]
  );

  const monthEnd = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0),
    [selectedDate]
  );

  // All dates that need to be fetched (7 for week, N for month)
  const fetchDayStrs = useMemo(() => {
    if (viewMode === 'week') {
      return weekDays.map(toDateStr);
    }
    const daysInMonth = monthEnd.getDate();
    return Array.from({ length: daysInMonth }, (_, i) =>
      toDateStr(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i + 1))
    );
  }, [viewMode, weekDays, monthEnd, selectedDate]);

  // Stable key for the effect dependency — avoids reference churn from array recreation
  const fetchKey = fetchDayStrs.join(',');

  useEffect(() => {
    if (!facilityId || fetchDayStrs.length === 0) return;
    setLoading(true);
    Promise.all(
      fetchDayStrs.map(ds =>
        bookingApi.getByFacility(facilityId, ds)
          .then((res: any) => (res?.success && Array.isArray(res.bookings) ? res.bookings : []))
          .catch(() => [])
      )
    ).then(results => {
      setBookings((results as Booking[][]).flat());
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, fetchKey]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookings.forEach(b => {
      if (!map[b.bookingDate]) map[b.bookingDate] = [];
      map[b.bookingDate].push(b);
    });
    return map;
  }, [bookings]);

  const navigate = (dir: 'prev' | 'next') => {
    const d = new Date(selectedDate);
    if (viewMode === 'week') {
      d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    } else {
      d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    }
    onDateChange(d);
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'week') {
      const weekEnd = weekDays[6];
      const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
      const year = weekEnd.getFullYear();
      if (startMonth === endMonth) {
        return `${startMonth} ${weekStart.getDate()}–${weekEnd.getDate()}, ${year}`;
      }
      return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${year}`;
    }
    return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewMode, weekStart, weekDays, selectedDate]);

  // Hour slots for the week time grid
  const hourSlots = useMemo(() => {
    const slots: { hour: number; label: string; top: number }[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
      const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
      const top = ((h * 60 - DAY_START_MINUTES) / 30) * SLOT_HEIGHT_PX;
      slots.push({ hour: h, label, top });
    }
    return slots;
  }, []);

  const today = todayStr();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const renderWeekView = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Day column headers */}
      <div className="flex-shrink-0 flex border-b border-gray-200 bg-white">
        <div className="w-12 md:w-16 flex-shrink-0 border-r border-gray-100" />
        {weekDays.map((day) => {
          const ds = toDateStr(day);
          const isToday = ds === today;
          return (
            <div
              key={ds}
              className="flex-1 text-center py-2 cursor-pointer hover:bg-green-50 transition-colors select-none"
              onClick={() => onSwitchToCourtView(day)}
              title="View court schedule for this day"
            >
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={`text-sm font-semibold mt-0.5 mx-auto w-7 h-7 flex items-center justify-center rounded-full ${
                isToday ? 'bg-green-600 text-white' : 'text-gray-800'
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="flex flex-1 min-h-0 overflow-y-auto">
        {/* Time label column */}
        <div className="w-12 md:w-16 flex-shrink-0 relative border-r border-gray-100 bg-gray-50" style={{ height: TOTAL_HEIGHT_PX }}>
          {hourSlots.map(({ hour, label, top }) => (
            <div
              key={hour}
              className="absolute right-2 text-xs text-gray-400"
              style={{ top: top - 9 }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1" style={{ minHeight: TOTAL_HEIGHT_PX }}>
          {weekDays.map((day, dayIdx) => {
            const ds = toDateStr(day);
            const isToday = ds === today;
            const dayBookings = bookingsByDate[ds] || [];

            return (
              <div
                key={ds}
                className={`flex-1 relative border-r border-gray-100 last:border-r-0`}
                style={{ height: TOTAL_HEIGHT_PX }}
              >
                {/* Hour grid lines */}
                {hourSlots.map(({ hour, top }) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-gray-100"
                    style={{ top }}
                  />
                ))}

                {/* Half-hour sub-lines */}
                {hourSlots.slice(0, -1).map(({ hour, top }) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute left-0 right-0 border-t border-gray-50"
                    style={{ top: top + SLOT_HEIGHT_PX }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && nowMinutes >= DAY_START_MINUTES && nowMinutes <= DAY_END_MINUTES && (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                    style={{ top: ((nowMinutes - DAY_START_MINUTES) / 30) * SLOT_HEIGHT_PX }}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500 -ml-1 flex-shrink-0" />
                    <div className="flex-1 border-t-2 border-green-500" />
                  </div>
                )}

                {/* Booking blocks */}
                {dayBookings.map((booking) => {
                  const startMins = parseTimeMinutes(booking.startTime);
                  const endMins = parseTimeMinutes(booking.endTime);
                  const clampedStart = Math.max(startMins, DAY_START_MINUTES);
                  const clampedEnd = Math.min(endMins, DAY_END_MINUTES);
                  if (clampedEnd <= clampedStart) return null;

                  const top = ((clampedStart - DAY_START_MINUTES) / 30) * SLOT_HEIGHT_PX;
                  const height = Math.max(
                    ((clampedEnd - clampedStart) / 30) * SLOT_HEIGHT_PX,
                    SLOT_HEIGHT_PX
                  );
                  const bgClass = getBookingTypeColor(booking.bookingType);
                  const tall = height > SLOT_HEIGHT_PX * 1.5;

                  return (
                    <div
                      key={booking.id}
                      className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-black/10 ${bgClass}`}
                      style={{ top, height }}
                      onClick={() => setSelectedReservation(booking)}
                    >
                      <p className="text-xs font-medium leading-tight truncate text-gray-800">
                        {booking.courtName}
                      </p>
                      {tall && (
                        <p className="text-xs leading-tight truncate text-gray-600">
                          {getBookingTypeLabel(booking.bookingType)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderMonthView = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const daysInMonth = monthEnd.getDate();
    const startDow = monthStart.getDay(); // 0=Sun

    const cells: (Date | null)[] = [
      ...Array(startDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-shrink-0 grid grid-cols-7 border-b border-gray-200 bg-white">
          {dowLabels.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100" style={{ minHeight: 90 }}>
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="border-r border-gray-100 bg-gray-50/50" />;
                }
                const ds = toDateStr(day);
                const isToday = ds === today;
                const dayBookings = (bookingsByDate[ds] || []).slice().sort((a, b) =>
                  a.startTime.localeCompare(b.startTime)
                );
                const visible = dayBookings.slice(0, 2);
                const extra = dayBookings.length - visible.length;

                return (
                  <div
                    key={di}
                    className="border-r border-gray-100 last:border-r-0 p-1 cursor-pointer hover:bg-green-50 transition-colors min-h-[90px]"
                    onClick={() => onSwitchToCourtView(day)}
                  >
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-green-100'
                    }`}>
                      {day.getDate()}
                    </div>
                    {visible.map(b => (
                      <div
                        key={b.id}
                        className={`text-xs px-1 py-0.5 rounded mb-0.5 truncate ${getBookingTypeBadgeColor(b.bookingType)}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedReservation(b); }}
                        title={`${b.startTime.slice(0, 5)} · ${b.courtName} · ${getBookingTypeLabel(b.bookingType)}`}
                      >
                        <span className="font-medium">{b.startTime.slice(0, 5)}</span>{' '}
                        <span className="opacity-80">{b.courtName}</span>
                      </div>
                    ))}
                    {extra > 0 && (
                      <div className="text-xs text-green-700 font-medium pl-1">{extra} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Navigation bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <Button variant="outline" size="sm" onClick={() => navigate('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{headerLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-green-700 hover:text-green-800 h-7 px-2"
            onClick={() => onDateChange(new Date())}
          >
            Today
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : viewMode === 'week' ? renderWeekView() : renderMonthView()}

      <ReservationDetailsModal
        isOpen={!!selectedReservation}
        onClose={() => setSelectedReservation(null)}
        reservation={selectedReservation as any}
      />
    </div>
  );
}
