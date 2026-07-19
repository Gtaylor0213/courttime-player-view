import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, CalendarPlus, MapPin, User, FileText, AlertCircle, Edit2, X, Users, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { bookingApi, facilitiesApi } from '../api/client';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { toast } from 'sonner';
import {
  bookingWithDetailsToCalendarDetails,
  openAppleCalendar,
  openGoogleCalendar,
  offerAddBookingToCalendar,
} from '../utils/bookingCalendar';

interface ReservationDetails {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  settlementStatus?:
    | 'not_applicable'
    | 'unsettled'
    | 'settling'
    | 'settled'
    | 'cancelled_unpaid';
  bookingType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  courtName?: string;
  userName?: string;
  userEmail?: string;
  facilityName?: string;
}

interface ParticipantRow {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  hasSavedCard: boolean;
  cardLast4: string | null;
}

interface SettlementLine {
  userId: string;
  fullName: string;
  amountCents: number;
  isOwner: boolean;
  hasSavedCard: boolean;
  cardLast4: string | null;
}

interface ChargeRow {
  userId: string;
  fullName: string;
  amountCents: number;
  status: string;
  errorMessage: string | null;
}

interface ReservationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: ReservationDetails | null;
  onUpdate?: () => void;
  /** Staff-only: show Close out / settlement UI (calendar). Off on player My Reservations. */
  allowStaffCloseOut?: boolean;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ReservationManagementModal({
  isOpen,
  onClose,
  reservation,
  onUpdate,
  allowStaffCloseOut = false,
}: ReservationManagementModalProps) {
  const { user } = useAuth();
  const { enabledFeatures } = useAppContext();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settlementStatus, setSettlementStatus] = useState<string | undefined>();
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string; email: string }>>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [showCloseOut, setShowCloseOut] = useState(false);
  const [settlementPreview, setSettlementPreview] = useState<{
    courtFeeCents: number;
    guestFeeCents: number;
    ballMachineFeeCents: number;
    totalCents: number;
    lines: SettlementLine[];
  } | null>(null);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [isClosingOut, setIsClosingOut] = useState(false);
  const [isLoadingSettlement, setIsLoadingSettlement] = useState(false);

  // Edit form state
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editCourt, setEditCourt] = useState('');
  const [courts, setCourts] = useState<any[]>([]);
  const [isCheckingConflict, setIsCheckingConflict] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);

  const postPlayEnabled = enabledFeatures.includes(FEATURE_FLAGS.POST_PLAY_SETTLEMENT);
  const isPostPlayBooking =
    settlementStatus === 'unsettled' ||
    settlementStatus === 'settling' ||
    settlementStatus === 'settled';
  const canEditRoster = isPostPlayBooking && settlementStatus === 'unsettled';

  useEffect(() => {
    if (!isOpen || !reservation) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await bookingApi.getById(reservation.id);
        const booking = (detail as any)?.booking || (detail as any)?.data?.booking;
        if (!cancelled && booking?.settlementStatus) {
          setSettlementStatus(booking.settlementStatus);
        } else if (!cancelled) {
          setSettlementStatus(reservation.settlementStatus || 'not_applicable');
        }
        const partRes = await bookingApi.getParticipants(reservation.id);
        const list =
          (partRes as any)?.participants ||
          (partRes as any)?.data?.participants ||
          [];
        if (!cancelled) {
          setParticipants(Array.isArray(list) ? list : []);
          const statusFromParts =
            (partRes as any)?.settlementStatus ||
            (partRes as any)?.data?.settlementStatus;
          if (statusFromParts) setSettlementStatus(statusFromParts);
        }
      } catch {
        if (!cancelled) {
          setSettlementStatus(reservation.settlementStatus || 'not_applicable');
          setParticipants([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, reservation?.id]);

  useEffect(() => {
    if (reservation && isEditing) {
      setEditDate(reservation.bookingDate);
      setEditStartTime(reservation.startTime);
      setEditDuration((reservation.durationMinutes / 60).toString());
      setEditCourt(reservation.courtId);
      loadCourts();
    }
  }, [reservation, isEditing]);

  // Check for conflicts whenever edit values change; cancel stale in-flight requests
  useEffect(() => {
    if (!isEditing || !editDate || !editStartTime || !editDuration || !editCourt) return;
    const controller = new AbortController();
    checkForConflicts(controller.signal);
    return () => controller.abort();
  }, [editDate, editStartTime, editDuration, editCourt, isEditing]);

  useEffect(() => {
    if (!reservation || !memberSearch.trim() || memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMembers(true);
      try {
        const res = await bookingApi.lookupFacilityMembers(
          reservation.facilityId,
          memberSearch.trim()
        );
        const rows =
          (res as any)?.data?.members ||
          (res as any)?.members ||
          [];
        const list = Array.isArray(rows) ? rows : [];
        setMemberResults(
          list
            .map((m: any) => ({
              userId: m.userId || m.user_id || m.id,
              fullName: m.fullName || m.full_name || m.name || 'Member',
              email: m.email || '',
            }))
            .filter((m: { userId: string }) => !!m.userId)
            .filter((m: { userId: string }) => !participants.some((p) => p.userId === m.userId))
            .slice(0, 8)
        );
      } catch {
        setMemberResults([]);
      } finally {
        setIsSearchingMembers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, reservation?.facilityId, participants]);

  const loadCourts = async () => {
    if (!reservation?.facilityId) return;

    try {
      const response = await facilitiesApi.getCourts(reservation.facilityId);
      if (response.success && response.data?.courts) {
        setCourts(response.data.courts);
      }
    } catch (error) {
      console.error('Error loading courts:', error);
    }
  };

  const checkForConflicts = async (signal?: AbortSignal) => {
    if (!editDate || !editStartTime || !editDuration || !editCourt) return;

    setIsCheckingConflict(true);
    try {
      const durationMinutes = Math.round(parseFloat(editDuration) * 60);
      const [startHours, startMinutes] = editStartTime.split(':').map(Number);
      const totalMinutes = startHours * 60 + startMinutes + durationMinutes;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;

      const response = await bookingApi.getByCourt(editCourt, editDate);

      if (signal?.aborted) return;

      const bookingData = response.data as any;
      if (response.success && bookingData?.bookings) {
        const conflict = bookingData.bookings.some((booking: any) => {
          if (booking.id === reservation?.id) return false;
          if (booking.status === 'cancelled') return false;
          const existingStart = booking.startTime;
          const existingEnd = booking.endTime;
          return (editStartTime < existingEnd && endTime > existingStart);
        });

        setHasConflict(conflict);
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Error checking conflicts:', error);
    } finally {
      if (!signal?.aborted) setIsCheckingConflict(false);
    }
  };

  if (!reservation) return null;

  const isOwnReservation = user?.id === reservation.userId;
  const isFacilityAdmin = !!user?.adminFacilities?.includes(reservation.facilityId);
  // Close-out is staff-only and calendar-facing — never from player My Reservations
  const canStaffCloseOut =
    allowStaffCloseOut &&
    isFacilityAdmin &&
    isPostPlayBooking &&
    (settlementStatus === 'unsettled' || settlementStatus === 'settling');

  const formatDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const isPastReservation = () => {
    const reservationEndDateTime = new Date(`${reservation.bookingDate}T${reservation.endTime}`);
    return reservationEndDateTime < new Date();
  };
  const canCancelReservation = (isOwnReservation || isFacilityAdmin) &&
    reservation.status !== 'cancelled' &&
    !isPastReservation() &&
    settlementStatus !== 'settled';

  const canAddToCalendar =
    isOwnReservation &&
    reservation.status === 'confirmed' &&
    !isPastReservation();

  const calendarDetails = bookingWithDetailsToCalendarDetails(reservation);

  const handleCancel = async () => {
    if (!reservation?.id) return;

    setIsCancelling(true);
    try {
      const response = await bookingApi.cancel(reservation.id, user?.id || '');
      if (response.success) {
        toast.success('Reservation cancelled successfully');
        setShowCancelConfirm(false);
        onUpdate?.();
        onClose();
      } else {
        toast.error(response.error || 'Failed to cancel reservation');
      }
    } catch (error) {
      console.error('Error canceling reservation:', error);
      toast.error('Failed to cancel reservation. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleAddParticipant = async (userId: string) => {
    try {
      const res = await bookingApi.addParticipant(reservation.id, userId);
      if (!res.success) {
        toast.error(res.error || 'Failed to add player');
        return;
      }
      const list =
        (res as any)?.participants ||
        (res as any)?.data?.participants ||
        [];
      setParticipants(Array.isArray(list) ? list : []);
      setMemberSearch('');
      setMemberResults([]);
      toast.success('Player added');
    } catch {
      toast.error('Failed to add player');
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    try {
      const res = await bookingApi.removeParticipant(reservation.id, userId);
      if (!res.success) {
        toast.error(res.error || 'Failed to remove player');
        return;
      }
      const list =
        (res as any)?.participants ||
        (res as any)?.data?.participants ||
        [];
      setParticipants(Array.isArray(list) ? list : []);
      toast.success('Player removed');
    } catch {
      toast.error('Failed to remove player');
    }
  };

  const loadSettlementPreview = async () => {
    setIsLoadingSettlement(true);
    setShowCloseOut(true);
    try {
      const res = await bookingApi.getSettlement(reservation.id);
      if (!res.success) {
        toast.error(res.error || 'Could not load settlement preview');
        setShowCloseOut(false);
        return;
      }
      const preview =
        (res as any)?.preview ||
        (res as any)?.data?.preview;
      const chargeList =
        (res as any)?.charges ||
        (res as any)?.data?.charges ||
        [];
      setSettlementPreview(preview || null);
      setCharges(Array.isArray(chargeList) ? chargeList : []);
    } catch {
      toast.error('Could not load settlement preview');
      setShowCloseOut(false);
    } finally {
      setIsLoadingSettlement(false);
    }
  };

  const handleCloseOut = async () => {
    setIsClosingOut(true);
    try {
      const res = await bookingApi.closeOutSettlement(reservation.id);
      if (!res.success) {
        toast.error(res.error || 'Close-out failed');
        return;
      }
      const status =
        (res as any)?.settlementStatus ||
        (res as any)?.data?.settlementStatus;
      const chargeList =
        (res as any)?.charges ||
        (res as any)?.data?.charges ||
        [];
      setSettlementStatus(status);
      setCharges(Array.isArray(chargeList) ? chargeList : []);
      if (status === 'settled') {
        toast.success('Reservation closed out — all charges settled');
        onUpdate?.();
      } else {
        toast.message('Close-out finished with some unresolved charges');
      }
    } catch {
      toast.error('Close-out failed');
    } finally {
      setIsClosingOut(false);
    }
  };

  const handleResolveCharge = async (userId: string, resolution: 'cash' | 'waived' | 'retry') => {
    try {
      const res = await bookingApi.resolveSettlementCharge(reservation.id, userId, resolution);
      if (!res.success) {
        toast.error(res.error || 'Could not update charge');
        return;
      }
      const status =
        (res as any)?.settlementStatus ||
        (res as any)?.data?.settlementStatus;
      const chargeList =
        (res as any)?.charges ||
        (res as any)?.data?.charges ||
        [];
      setSettlementStatus(status);
      setCharges(Array.isArray(chargeList) ? chargeList : []);
      if (status === 'settled') {
        toast.success('All charges resolved — reservation settled');
        onUpdate?.();
      } else {
        toast.success('Charge updated');
      }
    } catch {
      toast.error('Could not update charge');
    }
  };

  // Handle save changes
  const handleSaveChanges = async () => {
    if (hasConflict) {
      toast.error('Cannot save: Time slot conflicts with another reservation');
      return;
    }

    setIsSaving(true);
    try {
      const durationMinutes = Math.round(parseFloat(editDuration) * 60);
      const [startHours, startMinutes] = editStartTime.split(':').map(Number);
      const totalMinutes = startHours * 60 + startMinutes + durationMinutes;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;

      if (settlementStatus === 'unsettled') {
        const response = await bookingApi.updateUnsettled(reservation.id, {
          courtId: editCourt,
          bookingDate: editDate,
          startTime: editStartTime,
          endTime,
          durationMinutes,
          notes: reservation.notes || '',
        });
        if (!response.success) {
          toast.error(response.error || 'Failed to update reservation');
          return;
        }
        setIsEditing(false);
        onUpdate?.();
        onClose();
        const court = courts.find((c) => c.id === editCourt);
        offerAddBookingToCalendar(
          'Your reservation was updated.',
          bookingWithDetailsToCalendarDetails({
            ...reservation,
            courtName: court?.name || reservation.courtName,
            bookingDate: editDate,
            startTime: editStartTime,
            endTime,
          }),
          { alertTitle: 'Reservation updated', bookingId: reservation.id }
        );
        return;
      }

      // Prepaid / non-settlement: create new then cancel old.
      // excludeBookingId prevents the old slot from conflicting with the reshaped time.
      const response = await bookingApi.create({
        courtId: editCourt,
        userId: user?.id || '',
        facilityId: reservation.facilityId,
        bookingDate: editDate,
        startTime: editStartTime,
        endTime: endTime,
        durationMinutes: durationMinutes,
        notes: reservation.notes || '',
        excludeBookingId: reservation.id,
      });

      if (!response.success) {
        toast.error(response.error || 'Failed to update reservation');
        return;
      }

      if (response.requiresPayment && response.checkoutUrl) {
        toast.error(
          'This change requires payment. Cancel and rebook, or contact the facility to update the time.'
        );
        return;
      }

      await bookingApi.cancel(reservation.id, user?.id || '');

      const newBookingId = (response as { booking?: { id?: string } }).booking?.id;
      setIsEditing(false);
      onUpdate?.();
      onClose();
      const court = courts.find((c) => c.id === editCourt);
      offerAddBookingToCalendar(
        'Your reservation was updated.',
        bookingWithDetailsToCalendarDetails({
          ...reservation,
          courtName: court?.name || reservation.courtName,
          bookingDate: editDate,
          startTime: editStartTime,
          endTime,
        }),
        { alertTitle: 'Reservation updated', bookingId: newBookingId }
      );
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error('Failed to update reservation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        const displayStr = formatTime(timeStr);
        slots.push({ value: timeStr, label: displayStr });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();
  const showRosterSection = postPlayEnabled || isPostPlayBooking;

  return (
    <>
      <Dialog open={isOpen && !showCancelConfirm} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {isEditing ? 'Edit Reservation' : 'Reservation Details'}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Modify your court reservation' : 'View information about this court reservation'}
            </DialogDescription>
          </DialogHeader>

          {!isEditing ? (
            // View Mode
            <div className="space-y-3 py-3">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Status</span>
                <Badge className={getStatusColor(reservation.status)}>
                  {reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}
                </Badge>
              </div>

              {/* Court & Facility */}
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Location</p>
                  <p className="text-sm">{reservation.courtName || 'Court'}</p>
                  {reservation.facilityName && (
                    <p className="text-xs text-gray-500">{reservation.facilityName}</p>
                  )}
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Date & Time</p>
                  <p className="text-sm">{formatDate(reservation.bookingDate)}</p>
                  <p className="text-sm">
                    {formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}
                    <span className="text-xs text-gray-500 ml-1">
                      ({reservation.durationMinutes} min)
                    </span>
                  </p>
                </div>
              </div>

              {/* Reserved By */}
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Reserved By</p>
                  <p className="text-sm">
                    {reservation.userName || 'Unknown'}
                    {isOwnReservation && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        You
                      </Badge>
                    )}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {reservation.notes && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">Notes</p>
                    <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md border border-gray-200">
                      {reservation.notes}
                    </p>
                  </div>
                </div>
              )}

              {/* Settlement status */}
              {isPostPlayBooking && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Payment</span>
                  <Badge variant="outline" className="text-xs">
                    {settlementStatus === 'unsettled' && 'Pay after play'}
                    {settlementStatus === 'settling' && 'Partial settlement'}
                    {settlementStatus === 'settled' && 'Settled'}
                    {settlementStatus === 'cancelled_unpaid' && 'Cancelled (unpaid)'}
                  </Badge>
                </div>
              )}

              {/* Players on reservation (post-play) */}
              {showRosterSection && isPostPlayBooking && (
                <div className="border border-gray-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-600">Players on this reservation</p>
                  </div>
                  {participants.length === 0 ? (
                    <p className="text-xs text-gray-500">No players listed yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {participants.map((p) => (
                        <li
                          key={p.userId}
                          className="flex items-center justify-between text-sm gap-2"
                        >
                          <span>
                            {p.fullName}
                            {p.userId === reservation.userId && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Owner
                              </Badge>
                            )}
                            {p.hasSavedCard && p.cardLast4 && (
                              <span className="text-xs text-gray-400 ml-2">•••• {p.cardLast4}</span>
                            )}
                          </span>
                          {canEditRoster &&
                            (isOwnReservation || isFacilityAdmin) &&
                            p.userId !== reservation.userId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-600"
                                onClick={() => handleRemoveParticipant(p.userId)}
                              >
                                Remove
                              </Button>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEditRoster && (isOwnReservation || isFacilityAdmin) && (
                    <div className="pt-2 space-y-1">
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members to add…"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      {isSearchingMembers && (
                        <p className="text-xs text-gray-500">Searching…</p>
                      )}
                      {memberResults.length > 0 && (
                        <ul className="border border-gray-100 rounded-md divide-y max-h-40 overflow-y-auto">
                          {memberResults.map((m) => (
                            <li key={m.userId}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => handleAddParticipant(m.userId)}
                              >
                                {m.fullName}
                                {m.email && (
                                  <span className="text-xs text-gray-400 ml-2">{m.email}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Staff close-out panel */}
              {canStaffCloseOut && showCloseOut && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-md p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-amber-700" />
                    <p className="text-sm font-medium text-amber-900">Close-out settlement</p>
                  </div>
                  {isLoadingSettlement ? (
                    <p className="text-sm text-gray-600">Loading preview…</p>
                  ) : settlementPreview ? (
                    <>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <p>Court fee: {formatCents(settlementPreview.courtFeeCents)}</p>
                        {settlementPreview.guestFeeCents > 0 && (
                          <p>Guest fee (owner): {formatCents(settlementPreview.guestFeeCents)}</p>
                        )}
                        {settlementPreview.ballMachineFeeCents > 0 && (
                          <p>
                            Ball machine (owner):{' '}
                            {formatCents(settlementPreview.ballMachineFeeCents)}
                          </p>
                        )}
                        <p className="font-medium text-gray-800">
                          Total: {formatCents(settlementPreview.totalCents)}
                        </p>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {settlementPreview.lines.map((line) => (
                          <li key={line.userId} className="flex justify-between gap-2">
                            <span>
                              {line.fullName}
                              {line.isOwner && (
                                <span className="text-xs text-gray-400 ml-1">(owner)</span>
                              )}
                              {!line.hasSavedCard && (
                                <span className="text-xs text-amber-700 ml-1">no card</span>
                              )}
                            </span>
                            <span>{formatCents(line.amountCents)}</span>
                          </li>
                        ))}
                      </ul>
                      {(settlementStatus === 'unsettled' || settlementStatus === 'settling') && (
                        <Button
                          onClick={handleCloseOut}
                          disabled={isClosingOut}
                          className="w-full"
                        >
                          {isClosingOut ? 'Charging…' : 'Confirm close-out & charge cards'}
                        </Button>
                      )}
                    </>
                  ) : null}
                  {charges.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-amber-200">
                      <p className="text-xs font-medium text-gray-700">Charge results</p>
                      {charges.map((c) => (
                        <div
                          key={c.userId}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {c.fullName}:{' '}
                            <span className="font-medium">{formatCents(c.amountCents)}</span>{' '}
                            <Badge variant="outline" className="text-xs ml-1">
                              {c.status}
                            </Badge>
                            {c.errorMessage && (
                              <span className="text-xs text-red-600 block">{c.errorMessage}</span>
                            )}
                          </span>
                          {c.status === 'failed' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleResolveCharge(c.userId, 'retry')}
                              >
                                Retry
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleResolveCharge(c.userId, 'cash')}
                              >
                                Cash
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => handleResolveCharge(c.userId, 'waived')}
                              >
                                Waive
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Edit Mode
            <div className="space-y-4 py-3">
              {/* Date Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  min={(() => {
                    const now = new Date();
                    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  })()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Court Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Court</label>
                <Select value={editCourt} onValueChange={setEditCourt}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select court" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.map((court) => (
                      <SelectItem key={court.id} value={court.id}>
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Time Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Start Time</label>
                <Select value={editStartTime} onValueChange={setEditStartTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Duration</label>
                <Select value={editDuration} onValueChange={setEditDuration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.25">15 minutes</SelectItem>
                    <SelectItem value="0.5">30 minutes</SelectItem>
                    <SelectItem value="0.75">45 minutes</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="1.25">1 hour 15 minutes</SelectItem>
                    <SelectItem value="1.5">1 hour 30 minutes</SelectItem>
                    <SelectItem value="1.75">1 hour 45 minutes</SelectItem>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="2.5">2 hours 30 minutes</SelectItem>
                    <SelectItem value="3">3 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conflict Warning */}
              {isCheckingConflict && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-green-600 mt-0.5" />
                  <p className="text-sm text-green-800">Checking availability...</p>
                </div>
              )}

              {hasConflict && !isCheckingConflict && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <p className="text-sm text-red-800">
                    This time slot conflicts with another reservation. Please choose a different time or court.
                  </p>
                </div>
              )}

              {!hasConflict && !isCheckingConflict && editDate && editStartTime && editDuration && editCourt && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-green-600 mt-0.5" />
                  <p className="text-sm text-green-800">Time slot is available!</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-3 flex-wrap">
            {!isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 sm:flex-none sm:min-w-[100px]"
                >
                  Close
                </Button>
                {canAddToCalendar && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => openGoogleCalendar(calendarDetails)}
                      className="flex-1 sm:flex-none sm:min-w-[150px]"
                    >
                      <CalendarPlus className="h-4 w-4 mr-1" />
                      Google Calendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        openAppleCalendar(calendarDetails, {
                          bookingConfirmed: false,
                          bookingId: reservation.id,
                        })
                      }
                      className="flex-1 sm:flex-none sm:min-w-[150px]"
                    >
                      <CalendarPlus className="h-4 w-4 mr-1" />
                      Apple Calendar
                    </Button>
                  </>
                )}
                {canCancelReservation && (
                  <>
                    {(isOwnReservation || isFacilityAdmin) && (
                      <Button
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        className="flex-1 sm:flex-none sm:min-w-[100px]"
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Modify
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex-1 sm:flex-none sm:min-w-[100px]"
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {canStaffCloseOut && (
                    <Button
                      onClick={loadSettlementPreview}
                      className="flex-1 sm:flex-none sm:min-w-[120px]"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Close out
                    </Button>
                  )}
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setHasConflict(false);
                  }}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none sm:min-w-[100px]"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveChanges}
                  disabled={isSaving || hasConflict || isCheckingConflict}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Cancel Reservation?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this reservation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-2">
              <p className="text-sm">
                <span className="font-medium">Court:</span> {reservation.courtName}
              </p>
              <p className="text-sm">
                <span className="font-medium">Date:</span> {formatDate(reservation.bookingDate)}
              </p>
              <p className="text-sm">
                <span className="font-medium">Time:</span> {formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setShowCancelConfirm(false)}
              disabled={isCancelling}
              className="flex-1 sm:flex-none sm:min-w-[140px]"
            >
              Keep Reservation
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex-1 sm:flex-none sm:min-w-[180px]"
            >
              {isCancelling ? 'Cancelling...' : 'Yes, Cancel Reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
