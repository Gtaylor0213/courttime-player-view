import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Clock, MapPin, User, FileText, AlertCircle, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getBookingTypeBadgeColor, getBookingTypeLabel } from '../constants/bookingTypes';
import { parseLocalDate } from '../utils/dateUtils';

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

interface ReservationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: ReservationDetails | null;
  onCancelReservation?: (reservationId: string) => Promise<void>;
}

export function ReservationDetailsModal({
  isOpen,
  onClose,
  reservation,
  onCancelReservation
}: ReservationDetailsModalProps) {
  const { user } = useAuth();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (!reservation) return null;

  const isOwnReservation = user?.id === reservation.userId;

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
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

  // Check if reservation is in the past
  const isPastReservation = () => {
    const reservationDateTime = parseLocalDate(`${reservation.bookingDate}T${reservation.startTime}`);
    return reservationDateTime < new Date();
  };

  // Handle cancel reservation
  const handleCancel = async () => {
    if (!onCancelReservation) return;

    setIsCancelling(true);
    try {
      await onCancelReservation(reservation.id);
      setShowCancelConfirm(false);
      onClose();
    } catch (error) {
      console.error('Error canceling reservation:', error);
    } finally {
      setIsCancelling(false);
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

  return (
    <>
      <Dialog open={isOpen && !showCancelConfirm} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Reservation Details
            </DialogTitle>
            <DialogDescription>
              View information about this court reservation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Status</span>
              <Badge className={getStatusColor(reservation.status)}>
                {reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}
              </Badge>
            </div>

            {/* Booking Type */}
            {reservation.bookingType && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Type</span>
                <Badge className={getBookingTypeBadgeColor(reservation.bookingType)}>
                  {getBookingTypeLabel(reservation.bookingType)}
                </Badge>
              </div>
            )}

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

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-none sm:min-w-[100px]"
            >
              Close
            </Button>
            {isOwnReservation &&
             reservation.status !== 'cancelled' &&
             !isPastReservation() &&
             onCancelReservation && (
              <Button
                variant="destructive"
                onClick={() => setShowCancelConfirm(true)}
                className="flex-1 sm:flex-none sm:min-w-[160px]"
              >
                Cancel Reservation
              </Button>
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
