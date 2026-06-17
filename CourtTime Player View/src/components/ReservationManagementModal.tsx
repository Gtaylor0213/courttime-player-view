import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, CalendarPlus, Clock, MapPin, User, FileText, AlertCircle, Edit2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi, facilitiesApi } from '../api/client';
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
  bookingType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  courtName?: string;
  userName?: string;
  userEmail?: string;
  facilityName?: string;
}

interface ReservationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: ReservationDetails | null;
  onUpdate?: () => void;
}

export function ReservationManagementModal({
  isOpen,
  onClose,
  reservation,
  onUpdate
}: ReservationManagementModalProps) {
  const { user } = useAuth();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editCourt, setEditCourt] = useState('');
  const [courts, setCourts] = useState<any[]>([]);
  const [isCheckingConflict, setIsCheckingConflict] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);

  useEffect(() => {
    if (reservation && isEditing) {
      // Initialize form with current values
      setEditDate(reservation.bookingDate);
      setEditStartTime(reservation.startTime);
      setEditDuration((reservation.durationMinutes / 60).toString());
      setEditCourt(reservation.courtId);

      // Load courts for the facility
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
      // Calculate end time
      const durationMinutes = Math.round(parseFloat(editDuration) * 60);
      const [startHours, startMinutes] = editStartTime.split(':').map(Number);
      const totalMinutes = startHours * 60 + startMinutes + durationMinutes;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;

      // Get existing bookings for the selected court and date
      const response = await bookingApi.getByCourt(editCourt, editDate);

      if (signal?.aborted) return;

      const bookingData = response.data as any;
      if (response.success && bookingData?.bookings) {
        // Check if any existing booking conflicts (excluding current booking)
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

  // Format date for display — append T00:00:00 so it parses as local time, not UTC midnight
  const formatDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format time to 12-hour format
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Check if reservation is fully completed (end time has passed)
  const isPastReservation = () => {
    const reservationEndDateTime = new Date(`${reservation.bookingDate}T${reservation.endTime}`);
    return reservationEndDateTime < new Date();
  };
  const canCancelReservation = (isOwnReservation || isFacilityAdmin) &&
    reservation.status !== 'cancelled' &&
    !isPastReservation();

  const canAddToCalendar =
    isOwnReservation &&
    reservation.status === 'confirmed' &&
    !isPastReservation();

  const calendarDetails = bookingWithDetailsToCalendarDetails(reservation);

  // Handle cancel reservation
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

  // Handle save changes
  const handleSaveChanges = async () => {
    if (hasConflict) {
      toast.error('Cannot save: Time slot conflicts with another reservation');
      return;
    }

    setIsSaving(true);
    try {
      // Calculate new end time
      const durationMinutes = Math.round(parseFloat(editDuration) * 60);
      const [startHours, startMinutes] = editStartTime.split(':').map(Number);
      const totalMinutes = startHours * 60 + startMinutes + durationMinutes;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;

      // Create the new booking first — if this fails the original is preserved
      const response = await bookingApi.create({
        courtId: editCourt,
        userId: user?.id || '',
        facilityId: reservation.facilityId,
        bookingDate: editDate,
        startTime: editStartTime,
        endTime: endTime,
        durationMinutes: durationMinutes,
        notes: reservation.notes || ''
      });

      if (!response.success) {
        toast.error(response.error || 'Failed to update reservation');
        return;
      }

      // New booking secured — now cancel the old one
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

  // Get status badge color
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

  // Generate time slots (15-minute intervals)
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
                    {isOwnReservation && (
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
