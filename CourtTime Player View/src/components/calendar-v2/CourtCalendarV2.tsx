import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { BookingWizard } from '../BookingWizard';
import { QuickReservePopup } from '../QuickReservePopup';
import { NotificationBell } from '../NotificationBell';
import { ReservationDetailsModal } from '../ReservationDetailsModal';
import { useNotifications } from '../../contexts/NotificationContext';
import { bookingApi } from '../../api/client';
import { getBookingTypeLabel } from '../../constants/bookingTypes';

import { useCalendarData } from './useCalendarData';
import { useCalendarDrag } from './useCalendarDrag';
import { DragConfirmPopover } from './DragConfirmPopover';
import {
  ROW_HEIGHT, HALF_ROW, TIME_COL_WIDTH, COURT_COL_MIN_WIDTH, HEADER_HEIGHT,
  START_HOUR, END_HOUR,
  generate30MinSlots, generate15MinSlots,
  parse12hTime, format12hTime, get15MinIndex,
  getEasternTimeComponents, formatCurrentEasternTime, formatDateDisplay, formatDateYMD,
  resolveBookingColor,
} from './calendarConstants';

// ── Component ──

export function CourtCalendarV2() {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Data ──
  const data = useCalendarData();
  const {
    selectedDate, setSelectedDate, navigateDate, isToday,
    easternTime,
    memberFacilities, currentFacility, loadingFacilities, selectedFacilityId,
    allCourts, filteredCourts, courts,
    selectedCourtType, setSelectedCourtType,
    displayedCourtsCount, setDisplayedCourtsCount,
    bookingsMap, consolidatedBookings, loadingBookings, fetchBookings,
    isPrimeTimeSlot, hasPrimeTime, isPastSlot, isSlotBooked,
    user,
  } = data;

  // ── Drag ──
  const handleSlotClick = useCallback(
    (courtName: string, courtId: string, slotIndex: number) => {
      const time = allSlotsRef.current[slotIndex];
      if (!time || isPastSlot(time) || isSlotBooked(courtName, time)) return;
      openBookingWizardDirect(courtName, courtId, time);
    },
    [isPastSlot, isSlotBooked],
  );

  const {
    drag, showConfirmation, confirmationData, setShowConfirmation,
    handleMouseDown, handleMouseEnter,
    clearDrag, isSlotInDragRange, allSlots,
  } = useCalendarDrag(isSlotBooked, isPastSlot, handleSlotClick);

  // ── Precomputed slot lists ──
  const thirtyMinSlots = useMemo(() => generate30MinSlots(), []);

  // ── Modal state ──
  const [bookingWizard, setBookingWizard] = React.useState({
    isOpen: false,
    court: '',
    courtId: '',
    time: '',
    date: '',
    facility: '',
    facilityId: '',
    selectedSlots: undefined as Array<{ court: string; courtId: string; time: string }> | undefined,
  });

  const [showQuickReserve, setShowQuickReserve] = React.useState(false);

  const [reservationDetailsModal, setReservationDetailsModal] = React.useState({
    isOpen: false,
    reservation: null as any,
  });

  // ── Current time indicator position ──
  const currentTimePosition = useMemo(() => {
    if (!isToday) return null;
    const { hours, minutes } = easternTime;
    if (hours < START_HOUR || hours >= END_HOUR) return null;
    const minutesFromStart = (hours - START_HOUR) * 60 + minutes;
    return HEADER_HEIGHT + (minutesFromStart / 15) * HALF_ROW;
  }, [isToday, easternTime]);

  // ── Table dimensions ──
  const tableWidth = useMemo(
    () => TIME_COL_WIDTH + courts.length * COURT_COL_MIN_WIDTH,
    [courts.length],
  );
  const tableHeight = useMemo(
    () => HEADER_HEIGHT + thirtyMinSlots.length * ROW_HEIGHT,
    [thirtyMinSlots.length],
  );

  // ── Auto-scroll to current time ──
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      if (isToday && currentTimePosition !== null) {
        const target = Math.max(0, currentTimePosition - container.clientHeight / 3);
        container.scrollTo({ top: target, behavior: 'smooth' });
      } else {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedDate, isToday, currentTimePosition]);

  // ── Ref for allSlots (avoids stale closure in handleSlotClick) ──
  const allSlotsRef = useRef(allSlots);
  allSlotsRef.current = allSlots;

  // ── Handlers ──

  const openBookingWizard = useCallback(
    (courtName: string, courtId: string, time: string, selectedSlots?: Array<{ court: string; courtId: string; time: string }>) => {
      setBookingWizard({
        isOpen: true,
        court: courtName,
        courtId,
        time,
        date: formatDateYMD(selectedDate),
        facility: currentFacility?.name || '',
        facilityId: currentFacility?.id || '',
        selectedSlots,
      });
    },
    [selectedDate, currentFacility],
  );

  // Stable ref for openBookingWizard to avoid re-creating handleSlotClick
  const openBookingWizardRef = useRef(openBookingWizard);
  openBookingWizardRef.current = openBookingWizard;

  const openBookingWizardDirect = useCallback(
    (courtName: string, courtId: string, time: string) => {
      openBookingWizardRef.current(courtName, courtId, time);
    },
    [],
  );

  const closeBookingWizard = useCallback(() => {
    setBookingWizard({
      isOpen: false, court: '', courtId: '', time: '', date: '', facility: '', facilityId: '',
      selectedSlots: undefined,
    });
    clearDrag();
  }, [clearDrag]);

  const handleBookingClick = useCallback(
    (fullDetails: any) => {
      setReservationDetailsModal({ isOpen: true, reservation: fullDetails });
    },
    [],
  );

  const handleCancelReservation = useCallback(
    async (reservationId: string) => {
      try {
        const response = await bookingApi.cancel(reservationId, user?.id || '');
        if (response.success) {
          await fetchBookings();
          setReservationDetailsModal({ isOpen: false, reservation: null });
        } else {
          alert(response.error || 'Failed to cancel reservation');
        }
      } catch (err) {
        console.error('Error canceling reservation:', err);
        alert('Failed to cancel reservation. Please try again.');
      }
    },
    [user?.id, fetchBookings],
  );

  const handleDragConfirmBook = useCallback(() => {
    if (!confirmationData) return;
    const minIdx = Math.min(drag.startSlotIndex, drag.endSlotIndex);
    const maxIdx = Math.max(drag.startSlotIndex, drag.endSlotIndex);
    const selectedSlots: Array<{ court: string; courtId: string; time: string }> = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      selectedSlots.push({
        court: confirmationData.courtName,
        courtId: confirmationData.courtId,
        time: allSlots[i],
      });
    }
    openBookingWizard(
      confirmationData.courtName,
      confirmationData.courtId,
      allSlots[minIdx],
      selectedSlots,
    );
    setShowConfirmation(false);
  }, [confirmationData, drag, allSlots, openBookingWizard, setShowConfirmation]);

  const handleQuickReserve = useCallback(
    async (reservation: any) => {
      await fetchBookings();
    },
    [fetchBookings],
  );

  // ── Render ──

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <header className="bg-white border-b border-gray-200 relative z-10 flex-shrink-0">
          <div className="px-6 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-medium">Court Calendar</h1>
            <NotificationBell />
          </div>
        </header>

        {memberFacilities.length === 0 && !loadingFacilities ? (
          /* ── No Membership ── */
          <div className="px-6 py-6">
            <Card>
              <CardContent className="p-8 text-center space-y-4">
                <Calendar className="h-16 w-16 text-gray-300 mx-auto" />
                <h3 className="text-xl font-medium text-gray-900">No Facility Memberships</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  You need to be a member of a facility to view and book courts.
                </p>
                <Button onClick={() => navigate('/profile')} className="mt-4">
                  Request Facility Membership
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* ── Controls Bar ── */}
            <div className="flex-shrink-0 z-40 bg-white border-b border-gray-200 shadow-sm">
              <div className="px-6 py-4">
                {/* Top Row */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <h3 className="text-lg font-medium">{currentFacility?.name}</h3>
                    <Badge variant="outline">{currentFacility?.type}</Badge>

                    {/* Court Type */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600">Court Type:</span>
                      <div className="flex gap-1">
                        <Button
                          variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                        >
                          Tennis
                        </Button>
                        <Button
                          variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball')}
                        >
                          Pickleball
                        </Button>
                      </div>
                    </div>

                    {/* Courts Count */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600">Courts:</span>
                      <Select
                        value={displayedCourtsCount?.toString() || 'all'}
                        onValueChange={v => setDisplayedCourtsCount(v === 'all' ? null : parseInt(v))}
                      >
                        <SelectTrigger className="w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="6">6</SelectItem>
                          <SelectItem value="all">All ({filteredCourts.length})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Prime-Time Legend */}
                    {hasPrimeTime && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300" />
                        <span className="text-xs text-gray-500">Prime Time</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Reserve */}
                  <Button
                    onClick={() => setShowQuickReserve(true)}
                    className="flex items-center gap-2 px-6 py-2 text-base font-medium shadow-md"
                    size="lg"
                  >
                    <Calendar className="h-5 w-5" />
                    Quick Reserve
                  </Button>
                </div>

                {/* Bottom Row: Facility + Date Nav */}
                <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Facility:</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {currentFacility?.name || 'Loading...'}
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full">
                          <Info className="h-4 w-4 text-gray-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <p className="text-sm text-gray-700">
                          Click on any empty time slot to book a court. Hold and drag to select
                          multiple consecutive slots. Use the sidebar to switch facilities.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-center min-w-[200px]">
                      <h2 className="font-medium">{formatDateDisplay(selectedDate)}</h2>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Calendar Grid ── */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
              {courts.length === 0 ? (
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center text-gray-500 flex-1">
                  <p>No {selectedCourtType} courts available at this facility.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? 'pickleball' : 'tennis')}
                  >
                    Show {selectedCourtType === 'tennis' ? 'Pickleball' : 'Tennis'} Courts
                  </Button>
                </div>
              ) : (
                <div
                  ref={scrollContainerRef}
                  className="calendar-scroll bg-white rounded-lg shadow-lg border border-gray-200 overflow-auto relative w-full flex-1 min-h-0"
                >
                  {/* ── Table ── */}
                  <table
                    style={{
                      tableLayout: 'fixed',
                      borderCollapse: 'separate',
                      borderSpacing: 0,
                      width: tableWidth,
                    }}
                  >
                    <thead>
                      <tr>
                        {/* Corner cell: sticky top + left */}
                        <th
                          className="sticky top-0 left-0 z-30 bg-gray-100 border-r border-b-2 border-gray-300"
                          style={{
                            width: TIME_COL_WIDTH,
                            minWidth: TIME_COL_WIDTH,
                            height: HEADER_HEIGHT,
                            textAlign: 'center',
                            verticalAlign: 'middle',
                          }}
                        >
                          <span className="font-semibold text-xs text-gray-700">Time (EST)</span>
                        </th>
                        {/* Court headers: sticky top */}
                        {courts.map(court => (
                          <th
                            key={court.id}
                            className="sticky top-0 z-20 bg-white border-r border-b-2 border-gray-300 last:border-r-0 p-3 text-left font-normal"
                            style={{
                              width: COURT_COL_MIN_WIDTH,
                              minWidth: COURT_COL_MIN_WIDTH,
                              height: HEADER_HEIGHT,
                              verticalAlign: 'middle',
                            }}
                          >
                            <div className="font-semibold text-sm text-gray-900">{court.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5 capitalize">{court.type}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {thirtyMinSlots.map((slot30, rowIndex) => {
                        const isHourMark = slot30.endsWith(':00 AM') || slot30.endsWith(':00 PM');
                        // Each 30-min row maps to two 15-min slot indices
                        const topSlotIdx = rowIndex * 2;
                        const bottomSlotIdx = rowIndex * 2 + 1;

                        return (
                          <tr
                            key={rowIndex}
                            style={{ height: ROW_HEIGHT }}
                            className={isHourMark ? 'border-b border-gray-300' : ''}
                          >
                            {/* Time label */}
                            <td
                              className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-2"
                              style={{
                                width: TIME_COL_WIDTH,
                                minWidth: TIME_COL_WIDTH,
                                textAlign: 'right',
                                verticalAlign: 'top',
                                paddingTop: 4,
                                borderBottom: isHourMark ? '1px solid #d1d5db' : '1px solid #f3f4f6',
                              }}
                            >
                              <span
                                className={`text-xs ${isHourMark ? 'font-bold text-gray-900' : 'text-gray-500'}`}
                              >
                                {slot30}
                              </span>
                            </td>

                            {/* Court cells */}
                            {courts.map((court, courtIdx) => {
                              const topTime = allSlots[topSlotIdx];
                              const bottomTime = allSlots[bottomSlotIdx];
                              const topPast = topTime ? isPastSlot(topTime) : false;
                              const bottomPast = bottomTime ? isPastSlot(bottomTime) : false;
                              const topBooked = topTime ? isSlotBooked(court.name, topTime) : false;
                              const bottomBooked = bottomTime ? isSlotBooked(court.name, bottomTime) : false;
                              const topPrime = isPrimeTimeSlot(court.id, topTime || '');
                              const bottomPrime = isPrimeTimeSlot(court.id, bottomTime || '');
                              const topInDrag = isSlotInDragRange(court.name, topSlotIdx);
                              const bottomInDrag = isSlotInDragRange(court.name, bottomSlotIdx);

                              return (
                                <td
                                  key={court.id}
                                  className="relative border-r border-gray-200 last:border-r-0 p-0"
                                  style={{
                                    width: COURT_COL_MIN_WIDTH,
                                    minWidth: COURT_COL_MIN_WIDTH,
                                    height: ROW_HEIGHT,
                                    verticalAlign: 'top',
                                    borderBottom: isHourMark ? '1px solid #d1d5db' : '1px solid #f3f4f6',
                                  }}
                                >
                                  {/* Top half (first 15 min) */}
                                  <div
                                    className={`absolute top-0 left-0 right-0 ${getHalfZoneClasses(topPast, topBooked, topPrime, topInDrag)}`}
                                    style={{ height: HALF_ROW }}
                                    onMouseDown={e => {
                                      if (!topPast && !topBooked) handleMouseDown(court.name, court.id, topSlotIdx, e);
                                    }}
                                    onMouseEnter={() => handleMouseEnter(court.name, topSlotIdx)}
                                  >
                                    {topInDrag && drag.endSlotIndex === topSlotIdx && drag.slotCount > 1 && (
                                      <div className="absolute right-1 top-1/2 -translate-y-1/2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md z-20 whitespace-nowrap pointer-events-none">
                                        {drag.durationMinutes} min
                                      </div>
                                    )}
                                  </div>

                                  {/* 15-min midpoint line */}
                                  <div
                                    className="absolute left-1 right-1 border-b border-dashed border-gray-200 pointer-events-none"
                                    style={{ top: HALF_ROW }}
                                  />

                                  {/* Bottom half (second 15 min) */}
                                  <div
                                    className={`absolute left-0 right-0 ${getHalfZoneClasses(bottomPast, bottomBooked, bottomPrime, bottomInDrag)}`}
                                    style={{ top: HALF_ROW, height: HALF_ROW }}
                                    onMouseDown={e => {
                                      if (!bottomPast && !bottomBooked) handleMouseDown(court.name, court.id, bottomSlotIdx, e);
                                    }}
                                    onMouseEnter={() => handleMouseEnter(court.name, bottomSlotIdx)}
                                  >
                                    {bottomInDrag && drag.endSlotIndex === bottomSlotIdx && drag.slotCount > 1 && (
                                      <div className="absolute right-1 top-1/2 -translate-y-1/2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md z-20 whitespace-nowrap pointer-events-none">
                                        {drag.durationMinutes} min
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* ── Booking Overlay Layer ── */}
                  <div
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{ width: tableWidth, height: tableHeight, zIndex: 5 }}
                  >
                    {courts.map((court, courtIdx) =>
                      (consolidatedBookings[court.name] || []).map(booking => {
                        const top = HEADER_HEIGHT + booking.startSlotIndex * HALF_ROW + 2;
                        const left = TIME_COL_WIDTH + courtIdx * COURT_COL_MIN_WIDTH + 3;
                        const width = COURT_COL_MIN_WIDTH - 6;
                        const height = booking.slotCount * HALF_ROW - 4;
                        const colors = resolveBookingColor(booking.bookingType, booking.userId, user?.id);

                        return (
                          <div
                            key={booking.bookingId}
                            className="absolute pointer-events-auto cursor-pointer transition-shadow hover:shadow-md"
                            style={{
                              top,
                              left,
                              width,
                              height,
                              backgroundColor: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderLeft: `4px solid ${colors.accent}`,
                              borderRadius: 6,
                              overflow: 'hidden',
                            }}
                            onClick={() => handleBookingClick(booking.fullDetails)}
                          >
                            <div className="px-2 py-1 h-full overflow-hidden">
                              <div
                                className="text-xs font-semibold truncate leading-tight"
                                style={{ color: colors.text }}
                              >
                                {booking.player}
                              </div>
                              {height > 32 && (
                                <div
                                  className="text-[10px] mt-0.5 opacity-80 truncate"
                                  style={{ color: colors.text }}
                                >
                                  {booking.durationMinutes}min
                                  {booking.bookingType && ` \u00B7 ${getBookingTypeLabel(booking.bookingType)}`}
                                </div>
                              )}
                              {height > 52 && booking.notes && (
                                <div
                                  className="text-[9px] mt-0.5 truncate italic opacity-70"
                                  style={{ color: colors.text }}
                                >
                                  {booking.notes.length > 30
                                    ? `${booking.notes.substring(0, 30)}...`
                                    : booking.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }),
                    )}
                  </div>

                  {/* ── Current Time Indicator ── */}
                  {currentTimePosition !== null && (
                    <div
                      className="pointer-events-none"
                      style={{
                        position: 'absolute',
                        top: currentTimePosition,
                        left: 0,
                        right: 0,
                        zIndex: 25,
                        height: 2,
                      }}
                    >
                      {/* Time badge */}
                      <div className="sticky left-0 inline-flex items-center" style={{ zIndex: 30 }}>
                        <div className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md">
                          {formatCurrentEasternTime()}
                        </div>
                      </div>
                      {/* Red line */}
                      <div
                        className="absolute bg-red-500"
                        style={{
                          left: TIME_COL_WIDTH,
                          right: 0,
                          top: '50%',
                          height: 2,
                          transform: 'translateY(-50%)',
                          boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)',
                        }}
                      />
                      {/* Circle */}
                      <div
                        className="absolute w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow"
                        style={{
                          left: TIME_COL_WIDTH - 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Drag Confirmation Popover ── */}
      {showConfirmation && confirmationData && (
        <DragConfirmPopover
          courtName={confirmationData.courtName}
          startTime={confirmationData.startTime}
          endTime={confirmationData.endTime}
          durationMinutes={confirmationData.durationMinutes}
          dateFormatted={formatDateDisplay(selectedDate)}
          anchorX={confirmationData.anchorX}
          anchorY={confirmationData.anchorY}
          onBook={handleDragConfirmBook}
          onCancel={clearDrag}
        />
      )}

      {/* ── Booking Wizard ── */}
      <BookingWizard
        isOpen={bookingWizard.isOpen}
        onClose={closeBookingWizard}
        court={bookingWizard.court}
        courtId={bookingWizard.courtId}
        date={bookingWizard.date}
        time={bookingWizard.time}
        facility={bookingWizard.facility}
        facilityId={bookingWizard.facilityId}
        selectedSlots={bookingWizard.selectedSlots}
        onBookingCreated={fetchBookings}
      />

      {/* ── Quick Reserve ── */}
      <QuickReservePopup
        isOpen={showQuickReserve}
        onClose={() => setShowQuickReserve(false)}
        onReserve={handleQuickReserve}
        facilities={memberFacilities}
        selectedFacilityId={selectedFacilityId}
      />

      {/* ── Reservation Details ── */}
      <ReservationDetailsModal
        isOpen={reservationDetailsModal.isOpen}
        onClose={() => setReservationDetailsModal({ isOpen: false, reservation: null })}
        reservation={reservationDetailsModal.reservation}
        onCancelReservation={handleCancelReservation}
      />
    </>
  );
}

// ── Helpers ──

function getHalfZoneClasses(isPast: boolean, isBooked: boolean, isPrime: boolean, inDrag: boolean): string {
  if (inDrag) return 'bg-blue-400/30 border border-blue-400/50 z-10';
  if (isPast) return 'bg-[#f0f0f0] cursor-default';
  if (isBooked) return 'cursor-pointer'; // booking overlay handles visuals
  if (isPrime) return 'bg-purple-50 hover:bg-purple-100 cursor-pointer';
  return 'hover:bg-green-50 cursor-pointer';
}
