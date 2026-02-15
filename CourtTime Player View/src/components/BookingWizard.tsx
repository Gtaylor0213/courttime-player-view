import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Clock, MapPin, User, AlertCircle, Info } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi } from '../api/client';
import { BOOKING_TYPES } from '../constants/bookingTypes';

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: string;
}

interface RuleWarning {
  ruleCode: string;
  ruleName: string;
  message: string;
}

interface BookingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  court: string;
  courtId: string;
  date: string;
  time: string;
  facility: string;
  facilityId: string;
  selectedSlots?: Array<{ court: string; courtId: string; time: string }>;
  onBookingCreated?: () => void;
}

export function BookingWizard({ isOpen, onClose, court, courtId, date, time, facility, facilityId, selectedSlots, onBookingCreated }: BookingWizardProps) {
  const [duration, setDuration] = useState(() => {
    if (selectedSlots && selectedSlots.length > 1) {
      // Each slot is 15 minutes (0.25 hours)
      return (selectedSlots.length * 0.25).toString();
    }
    return '1'; // Default to 1 hour for single slots
  });
  const [bookingType, setBookingType] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleViolations, setRuleViolations] = useState<RuleViolation[]>([]);
  const [ruleWarnings, setRuleWarnings] = useState<RuleWarning[]>([]);
  const [isPrimeTime, setIsPrimeTime] = useState(false);
  const { showToast } = useNotifications();
  const { user } = useAuth();

  // Update duration and reset form when selectedSlots changes OR when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedSlots && selectedSlots.length > 1) {
        // Calculate duration based on selected slots
        setDuration((selectedSlots.length * 0.25).toString());
      } else {
        // Reset to default for single slot bookings
        setDuration('1');
      }
      // Reset booking type, notes, and violations when modal opens
      setBookingType('');
      setNotes('');
      setRuleViolations([]);
      setRuleWarnings([]);
      setIsPrimeTime(false);
    }
  }, [selectedSlots, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      showToast('error', 'Error', 'You must be logged in to book a court.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Helper to convert 12h time to 24h format
      const convertTo24Hour = (time12h: string): string => {
        const [time, period] = time12h.split(' ');
        let [hours, minutes] = time.split(':').map(Number);

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`;
      };

      // Helper to parse date string to YYYY-MM-DD
      const parseDate = (dateStr: string): string => {
        // If date is already in YYYY-MM-DD format, return as-is
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return dateStr;
        }
        // If date has time component, extract date part
        if (dateStr.includes('T')) {
          return dateStr.split('T')[0];
        }
        // Parse from format like "Monday, November 15, 2025"
        // Add noon time to avoid timezone edge cases
        const parsed = new Date(dateStr + ' 12:00:00');
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const bookingDate = parseDate(date);
      const startTime24 = convertTo24Hour(time);
      const durationMinutes = parseFloat(duration) * 60;

      // Calculate end time
      const [hours, minutes] = startTime24.split(':').map(Number);
      const endDate = new Date();
      endDate.setHours(hours, minutes + durationMinutes, 0, 0);
      const endTime24 = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:00`;

      console.log('📝 Creating booking with data:', {
        courtId,
        userId: user.id,
        facilityId,
        bookingDate,
        startTime: startTime24,
        endTime: endTime24,
        durationMinutes,
        court,
        facility
      });

      // Create the booking
      const result = await bookingApi.create({
        courtId: courtId,
        userId: user.id,
        facilityId: facilityId,
        bookingDate: bookingDate,
        startTime: startTime24,
        endTime: endTime24,
        durationMinutes: durationMinutes,
        bookingType: bookingType || undefined,
        notes: notes || undefined
      });

      if (result.success) {
        console.log('✅ Booking created successfully:', result);

        // Show success notification
        const reservationDetails = {
          facility,
          court,
          date,
          time: `${time} - ${calculateEndTime(time, duration)}`
        };

        showToast(
          'reservation_confirmed',
          'Court Reservation Confirmed',
          `Your ${court} booking at ${facility} has been confirmed.`,
          reservationDetails
        );

        // Call the callback to refresh the calendar
        console.log('🔄 Calling onBookingCreated callback...');
        if (onBookingCreated) {
          await onBookingCreated();
          console.log('✅ Calendar refresh complete');
        } else {
          console.warn('⚠️ No onBookingCreated callback provided');
        }

        onClose();
      } else {
        // Show rule violations inline if available
        if (result.ruleViolations && result.ruleViolations.length > 0) {
          setRuleViolations(result.ruleViolations);
        } else {
          setRuleViolations([]);
        }
        if (result.warnings && result.warnings.length > 0) {
          setRuleWarnings(result.warnings);
        }
        if (result.isPrimeTime !== undefined) {
          setIsPrimeTime(result.isPrimeTime);
        }
        // Only show generic toast if no specific violations
        if (!result.ruleViolations || result.ruleViolations.length === 0) {
          showToast('error', 'Booking Failed', result.error || 'Failed to create booking. Please try again.');
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      showToast('error', 'Booking Failed', 'An error occurred while creating your booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateEndTime = (startTime: string, durationHours: string) => {
    const [time, period] = startTime.split(' ');
    const timeParts = time.split(':');
    let hours = parseInt(timeParts[0]);
    let minutes = timeParts[1] ? parseInt(timeParts[1]) : 0; // Default to 0 if no minutes
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Add duration (handle fractional hours)
    const durationFloat = parseFloat(durationHours);
    hours += Math.floor(durationFloat);
    minutes += (durationFloat % 1) * 60;
    
    // Handle minutes overflow
    if (minutes >= 60) {
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }
    
    // Convert back to 12-hour format
    const endPeriod = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours === 12 ? 12 : hours;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${endPeriod}`;
  };

  const getTimeRangeForSelectedSlots = () => {
    if (!selectedSlots || selectedSlots.length === 0) return null;

    // Sort slots by time
    const sortedSlots = [...selectedSlots].sort((a, b) => {
      const timeA = a.time;
      const timeB = b.time;
      return timeA.localeCompare(timeB);
    });

    const firstSlot = sortedSlots[0];
    const lastSlot = sortedSlots[sortedSlots.length - 1];

    return {
      start: firstSlot.time,
      end: calculateEndTime(lastSlot.time, '0.25') // Each slot is 15 minutes
    };
  };

  const timeRange = getTimeRangeForSelectedSlots();

  // Format date for display (YYYY-MM-DD -> readable format)
  const formatDateForDisplay = (dateStr: string): string => {
    if (dateStr.includes('-') && dateStr.split('-').length === 3) {
      // Already in YYYY-MM-DD format
      const [year, month, day] = dateStr.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    return dateStr; // Already formatted or unknown format
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book Court</DialogTitle>
          <DialogDescription>
            Complete your reservation details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Court & Facility Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{facility}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{formatDateForDisplay(date)}</span>
            </div>
            <div className="bg-green-50 p-3 rounded-md border border-green-200">
              <div className="flex items-center gap-2 text-green-800">
                <Clock className="h-4 w-4" />
                <span className="font-medium">{court}</span>
              </div>
              <div className="text-sm text-green-600 mt-1">
                {selectedSlots && selectedSlots.length > 1 ? (
                  <>
                    <div className="font-medium mb-1">{selectedSlots.length} consecutive slots selected</div>
                    <div className="text-xs">
                      {timeRange ? `${timeRange.start} - ${timeRange.end}` : 'Multiple time slots'}
                    </div>
                  </>
                ) : (
                  `${time} - ${calculateEndTime(time, duration)}`
                )}
              </div>
            </div>
          </div>

          {/* Rule Violations */}
          {ruleViolations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Booking could not be completed
              </div>
              <ul className="space-y-1">
                {ruleViolations.map((v, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">-</span>
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rule Warnings */}
          {ruleWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <Info className="h-4 w-4" />
                Heads up
              </div>
              <ul className="space-y-1">
                {ruleWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">-</span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prime Time Badge */}
          {isPrimeTime && (
            <div className="flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 text-purple-700 rounded-md px-3 py-2">
              <Clock className="h-4 w-4" />
              This slot is during prime time
            </div>
          )}

          {/* Duration - Hide for multi-slot selections since duration is predetermined */}
          {(!selectedSlots || selectedSlots.length <= 1) && (
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
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
          )}

          {/* Booking Type Dropdown */}
          <div className="space-y-2">
            <Label>Type (Optional)</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger>
                <SelectValue placeholder="Select booking type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BOOKING_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any special requests or notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Booking...' : 'Book Court'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}