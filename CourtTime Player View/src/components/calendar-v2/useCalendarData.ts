import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { facilitiesApi, bookingApi, courtConfigApi } from '../../api/client';
import {
  START_HOUR, END_HOUR, HALF_ROW,
  generate15MinSlots, get15MinIndex, format24hTo12h, format12hTime,
  getEasternTimeComponents, getEasternDate, formatDateYMD,
} from './calendarConstants';

// ── Types ──

export interface Court {
  id: string;
  name: string;
  type: string;
}

export interface FacilityWithCourts {
  id: string;
  name: string;
  type: string;
  courts: Court[];
}

export interface BookingSlotData {
  player: string;
  duration: string;
  type: 'reservation';
  bookingId: string;
  userId: string;
  isFirstSlot: boolean;
  bookingType?: string;
  notes?: string;
  durationMinutes: number;
  fullDetails: any;
}

export interface ConsolidatedBooking {
  bookingId: string;
  player: string;
  startSlotIndex: number;   // 0-based 15-min index from START_HOUR
  slotCount: number;        // number of 15-min slots
  durationMinutes: number;
  bookingType?: string;
  notes?: string;
  userId: string;
  fullDetails: any;
}

// ── Hook ──

export function useCalendarData() {
  const { selectedFacilityId = 'sunrise-valley' } = useAppContext();
  const { user } = useAuth();

  // ── Date ──
  const [selectedDate, setSelectedDate] = useState(new Date());

  const navigateDate = useCallback((dir: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (dir === 'next' ? 1 : -1));
      return next;
    });
  }, []);

  const isTodayDate = useMemo(() => {
    const today = getEasternDate();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  // ── Eastern time (updates every 60s) ──
  const [easternTime, setEasternTime] = useState(getEasternTimeComponents);

  useEffect(() => {
    const update = () => setEasternTime(getEasternTimeComponents());
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Facilities ──
  const [memberFacilities, setMemberFacilities] = useState<FacilityWithCourts[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!user?.memberFacilities || user.memberFacilities.length === 0) {
        setLoadingFacilities(false);
        return;
      }
      try {
        setLoadingFacilities(true);
        const data: FacilityWithCourts[] = [];
        for (const facilityId of user.memberFacilities) {
          const fRes = await facilitiesApi.getById(facilityId);
          if (fRes.success && fRes.data) {
            const facility = fRes.data.facility;
            const cRes = await facilitiesApi.getCourts(facilityId);
            const courts: Court[] =
              cRes.success && cRes.data?.courts
                ? cRes.data.courts.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    type: c.courtType?.toLowerCase() || 'tennis',
                  }))
                : [];
            data.push({
              id: facility.id,
              name: facility.name,
              type: facility.type || facility.facilityType || 'Tennis Facility',
              courts,
            });
          }
        }
        setMemberFacilities(data);
      } catch (err) {
        console.error('Error fetching facilities:', err);
      } finally {
        setLoadingFacilities(false);
      }
    };
    fetch();
  }, [user?.memberFacilities]);

  const currentFacility = memberFacilities.find(f => f.id === selectedFacilityId);

  // ── Court Filtering ──
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>('tennis');
  const [displayedCourtsCount, setDisplayedCourtsCount] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const allCourts: Court[] = currentFacility?.courts || [];

  const filteredCourts = useMemo(() => {
    if (selectedCourtType === null) return allCourts;
    return allCourts.filter(c => c.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  const courts = useMemo(() => {
    if (displayedCourtsCount !== null && displayedCourtsCount > 0) {
      return filteredCourts.slice(0, displayedCourtsCount);
    }
    if (isMobile && filteredCourts.length > 2) {
      return filteredCourts.slice(0, 2);
    }
    return filteredCourts;
  }, [filteredCourts, displayedCourtsCount, isMobile]);

  // ── Bookings ──
  const [bookingsMap, setBookingsMap] = useState<Record<string, Record<string, BookingSlotData>>>({});
  const [loadingBookings, setLoadingBookings] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoadingBookings(true);
      const dateStr = formatDateYMD(selectedDate);
      const response = await bookingApi.getByFacility(selectedFacilityId, dateStr);

      if (response.success && response.data?.bookings) {
        const transformed: Record<string, Record<string, BookingSlotData>> = {};

        response.data.bookings.forEach((booking: any) => {
          const courtName = booking.courtName;
          if (!transformed[courtName]) transformed[courtName] = {};

          const slotsToFill = Math.ceil(booking.durationMinutes / 15);
          const [startH, startM] = booking.startTime.split(':').map(Number);

          for (let i = 0; i < slotsToFill; i++) {
            const slotMinutes = startM + i * 15;
            const slotHours = startH + Math.floor(slotMinutes / 60);
            const actualMinutes = slotMinutes % 60;
            const slotTime = format12hTime(slotHours, actualMinutes);

            transformed[courtName][slotTime] = {
              player: booking.userName || 'Reserved',
              duration: `${booking.durationMinutes}min`,
              type: 'reservation',
              bookingId: booking.id,
              userId: booking.userId,
              isFirstSlot: i === 0,
              bookingType: booking.bookingType,
              notes: booking.notes,
              durationMinutes: booking.durationMinutes,
              fullDetails: {
                ...booking,
                facilityName: currentFacility?.name,
              },
            };
          }
        });

        setBookingsMap(transformed);
      } else {
        setBookingsMap({});
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setBookingsMap({});
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedFacilityId, selectedDate, currentFacility?.name]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ── Consolidated bookings (for overlay rendering) ──
  const allSlots = useMemo(() => generate15MinSlots(), []);

  const consolidatedBookings = useMemo(() => {
    const result: Record<string, ConsolidatedBooking[]> = {};
    for (const courtName of Object.keys(bookingsMap)) {
      const courtBookings: ConsolidatedBooking[] = [];
      const courtSlots = bookingsMap[courtName];
      const seen = new Set<string>();

      for (const slotTime of allSlots) {
        const slot = courtSlots[slotTime];
        if (!slot || !slot.isFirstSlot || seen.has(slot.bookingId)) continue;
        seen.add(slot.bookingId);

        const startIdx = get15MinIndex(slotTime);
        const slotCount = Math.ceil(slot.durationMinutes / 15);

        courtBookings.push({
          bookingId: slot.bookingId,
          player: slot.player,
          startSlotIndex: startIdx,
          slotCount,
          durationMinutes: slot.durationMinutes,
          bookingType: slot.bookingType,
          notes: slot.notes,
          userId: slot.userId,
          fullDetails: slot.fullDetails,
        });
      }
      result[courtName] = courtBookings;
    }
    return result;
  }, [bookingsMap, allSlots]);

  // ── Prime-time configs ──
  const [primeTimeConfigs, setPrimeTimeConfigs] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const fetchConfigs = async () => {
      if (!courts || courts.length === 0) return;
      const configs: Record<string, any[]> = {};
      for (const court of courts) {
        if (!court.id || primeTimeConfigs[court.id]) continue;
        try {
          const res = await courtConfigApi.getSchedule(court.id);
          if (res.success && res.data) {
            const schedule = res.data.schedule || res.data;
            configs[court.id] = Array.isArray(schedule) ? schedule : [];
          }
        } catch {
          // Court config may not exist
        }
      }
      if (Object.keys(configs).length > 0) {
        setPrimeTimeConfigs(prev => ({ ...prev, ...configs }));
      }
    };
    fetchConfigs();
  }, [courts]);

  const isPrimeTimeSlot = useCallback(
    (courtId: string, time: string): boolean => {
      const schedule = primeTimeConfigs[courtId];
      if (!schedule || schedule.length === 0) return false;

      const dayOfWeek = selectedDate.getDay();
      const dayConfig = schedule.find(
        (c: any) => c.dayOfWeek === dayOfWeek || c.day_of_week === dayOfWeek,
      );
      if (!dayConfig) return false;

      const ptStart = dayConfig.primeTimeStart || dayConfig.prime_time_start;
      const ptEnd = dayConfig.primeTimeEnd || dayConfig.prime_time_end;
      if (!ptStart || !ptEnd) return false;

      const { hour24, minute } = parseTime12h(time);
      const slot24 = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      return slot24 >= ptStart.substring(0, 5) && slot24 < ptEnd.substring(0, 5);
    },
    [primeTimeConfigs, selectedDate],
  );

  // ── Past slot check ──
  const isPastSlot = useCallback(
    (time: string): boolean => {
      // On past dates, everything is past
      const today = getEasternDate();
      if (selectedDate < today) return true;
      // On future dates, nothing is past
      if (selectedDate > today) return false;
      // On today, compare times
      const { hour24, minute } = parseTime12h(time);
      return hour24 < easternTime.hours || (hour24 === easternTime.hours && minute < easternTime.minutes);
    },
    [selectedDate, easternTime],
  );

  // ── Check if a 15-min slot is booked for a given court ──
  const isSlotBooked = useCallback(
    (courtName: string, time: string): boolean => {
      return !!bookingsMap[courtName]?.[time];
    },
    [bookingsMap],
  );

  // ── Has any prime-time configured ──
  const hasPrimeTime = useMemo(
    () =>
      Object.values(primeTimeConfigs).some(schedule =>
        schedule.some((c: any) => c.primeTimeStart || c.prime_time_start),
      ),
    [primeTimeConfigs],
  );

  return {
    // Date
    selectedDate,
    setSelectedDate,
    navigateDate,
    isToday: isTodayDate,

    // Eastern time
    easternTime,

    // Facilities
    memberFacilities,
    currentFacility,
    loadingFacilities,
    selectedFacilityId,

    // Courts
    allCourts,
    filteredCourts,
    courts,
    selectedCourtType,
    setSelectedCourtType,
    displayedCourtsCount,
    setDisplayedCourtsCount,

    // Bookings
    bookingsMap,
    consolidatedBookings,
    loadingBookings,
    fetchBookings,

    // Prime time
    primeTimeConfigs,
    isPrimeTimeSlot,
    hasPrimeTime,

    // Slot checks
    isPastSlot,
    isSlotBooked,

    // User
    user,
  };
}

// Local helper (same logic as parse12hTime in constants, avoids circular dep)
function parseTime12h(time: string): { hour24: number; minute: number } {
  const [timePart, period] = time.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return { hour24: hours, minute: minutes || 0 };
}
