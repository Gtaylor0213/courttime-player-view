import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Calendar, Clock, MapPin, AlertCircle, Info, Repeat } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi, facilitiesApi } from '../api/client';
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

// Generate all 15-min time slots from 6 AM to 9 PM in 12h format
const ALL_TIME_SLOTS: string[] = [];
for (let hour = 6; hour <= 21; hour++) {
  for (let minute = 0; minute < 60; minute += 15) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    ALL_TIME_SLOTS.push(`${displayHour}:${minute.toString().padStart(2, '0')} ${period}`);
  }
}

function convertTo24Hour(time12h: string): string {
  const [t, period] = time12h.split(' ');
  let [hours, minutes] = t.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`;
}

function timeSlotIndex(time12h: string): number {
  const idx = ALL_TIME_SLOTS.indexOf(time12h);
  return idx >= 0 ? idx : 0;
}

function addMinutesTo12h(time12h: string, mins: number): string {
  const [t, period] = time12h.split(' ');
  let [hours, minutes] = t.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const totalMins = hours * 60 + minutes + mins;
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  const newPeriod = newH >= 12 ? 'PM' : 'AM';
  const displayH = newH > 12 ? newH - 12 : newH === 0 ? 12 : newH;
  return `${displayH}:${newM.toString().padStart(2, '0')} ${newPeriod}`;
}

function durationMinutesBetween(start12h: string, end12h: string): number {
  const s = convertTo24Hour(start12h);
  const e = convertTo24Hour(end12h);
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export function BookingWizard({ isOpen, onClose, court, courtId, date, time, facility, facilityId, selectedSlots, onBookingCreated }: BookingWizardProps) {
  const [startTime, setStartTime] = useState(time);
  const [endTime, setEndTime] = useState(() => {
    if (selectedSlots && selectedSlots.length > 1) {
      const sorted = [...selectedSlots].sort((a, b) => a.time.localeCompare(b.time));
      return addMinutesTo12h(sorted[sorted.length - 1].time, 15);
    }
    return addMinutesTo12h(time, 60);
  });
  const [bookingType, setBookingType] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleViolations, setRuleViolations] = useState<RuleViolation[]>([]);
  const [ruleWarnings, setRuleWarnings] = useState<RuleWarning[]>([]);
  const [isPrimeTime, setIsPrimeTime] = useState(false);
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [facilityCourts, setFacilityCourts] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);
  const { showToast } = useNotifications();
  const { user } = useAuth();

  // Fetch all courts for this facility when wizard opens
  useEffect(() => {
    if (isOpen && facilityId) {
      facilitiesApi.getCourts(facilityId).then(res => {
        if (res.success && res.data?.courts) {
          setFacilityCourts(res.data.courts.filter((c: any) => c.status === 'available'));
        }
      });
    }
  }, [isOpen, facilityId]);

  // Build the primary court set from drag selection
  const dragSelectedCourts = useMemo(() => {
    if (!selectedSlots || selectedSlots.length === 0) return [{ court, courtId }];
    const seen = new Map<string, string>();
    for (const slot of selectedSlots) {
      if (!seen.has(slot.courtId)) {
        seen.set(slot.courtId, slot.court);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ court: name, courtId: id }));
  }, [selectedSlots, court, courtId]);

  // Merge drag-selected courts + manually checked additional courts
  const selectedCourts = useMemo(() => {
    const merged = new Map<string, string>();
    for (const c of dragSelectedCourts) {
      merged.set(c.courtId, c.court);
    }
    for (const id of additionalCourtIds) {
      if (!merged.has(id)) {
        const fc = facilityCourts.find(c => c.id === id);
        if (fc) merged.set(fc.id, fc.name);
      }
    }
    return Array.from(merged.entries()).map(([id, name]) => ({ court: name, courtId: id }));
  }, [dragSelectedCourts, additionalCourtIds, facilityCourts]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedSlots && selectedSlots.length > 1) {
        const sorted = [...selectedSlots].sort((a, b) => a.time.localeCompare(b.time));
        setStartTime(sorted[0].time);
        setEndTime(addMinutesTo12h(sorted[sorted.length - 1].time, 15));
      } else {
        setStartTime(time);
        setEndTime(addMinutesTo12h(time, 60));
      }
      setBookingType('');
      setNotes('');
      setRuleViolations([]);
      setRuleWarnings([]);
      setIsPrimeTime(false);
      setAdvancedBooking(false);
      setRecurringDays([]);
      setRecurringEndDate('');
      setAdditionalCourtIds([]);
    }
  }, [selectedSlots, isOpen, time]);

  // End time options: only times after the selected start time
  const endTimeOptions = useMemo(() => {
    const startIdx = timeSlotIndex(startTime);
    return ALL_TIME_SLOTS.slice(startIdx + 1);
  }, [startTime]);

  // Computed duration label
  const durationMins = useMemo(() => durationMinutesBetween(startTime, endTime), [startTime, endTime]);
  const durationLabel = useMemo(() => {
    if (durationMins <= 0) return '';
    const h = Math.floor(durationMins / 60);
    const m = durationMins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  }, [durationMins]);

  const toggleRecurringDay = (day: string) => {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleAdditionalCourt = (id: string) => {
    setAdditionalCourtIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Courts available to add (exclude the primary/drag-selected courts)
  const availableAdditionalCourts = useMemo(() => {
    const dragIds = new Set(dragSelectedCourts.map(c => c.courtId));
    return facilityCourts.filter(c => !dragIds.has(c.id));
  }, [facilityCourts, dragSelectedCourts]);

  const getDayOfWeek = (d: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  };

  const generateRecurringDates = (): string[] => {
    if (!advancedBooking || recurringDays.length === 0 || !recurringEndDate) {
      return [date];
    }
    const dates: string[] = [];
    const start = new Date(date + 'T00:00:00');
    const end = new Date(recurringEndDate + 'T00:00:00');
    const current = new Date(start);
    while (current <= end) {
      if (recurringDays.includes(getDayOfWeek(current))) {
        const y = current.getFullYear();
        const mo = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${mo}-${dd}`);
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      showToast('error', 'Error', 'You must be logged in to book a court.');
      return;
    }

    if (durationMins <= 0) {
      showToast('error', 'Error', 'End time must be after start time.');
      return;
    }

    if (advancedBooking) {
      if (recurringDays.length === 0) {
        showToast('error', 'Error', 'Please select at least one day of the week for recurring bookings.');
        return;
      }
      if (!recurringEndDate) {
        showToast('error', 'Error', 'Please select an end date for recurring bookings.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const parseDateStr = (dateStr: string): string => {
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
        if (dateStr.includes('T')) return dateStr.split('T')[0];
        const parsed = new Date(dateStr + ' 12:00:00');
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      };

      const startTime24 = convertTo24Hour(startTime);
      const endTime24 = convertTo24Hour(endTime);
      const datesToBook = generateRecurringDates().map(d => parseDateStr(d));

      // Create bookings for each court × each date
      const bookingRequests = selectedCourts.flatMap(c =>
        datesToBook.map(bookingDate => ({
          courtId: c.courtId,
          courtName: c.court,
          userId: user.id,
          facilityId,
          bookingDate,
          startTime: startTime24,
          endTime: endTime24,
          durationMinutes: durationMins,
          bookingType: bookingType || undefined,
          notes: notes || undefined
        }))
      );

      const results = await Promise.all(
        bookingRequests.map(({ courtName, ...req }) =>
          bookingApi.create(req)
        )
      );

      const successfulBookings = results.filter(r => r.success);
      const failedBookings = results.filter(r => !r.success);
      const totalRequests = bookingRequests.length;

      if (successfulBookings.length > 0) {
        const courtLabel = selectedCourts.length > 1
          ? `${selectedCourts.length} courts`
          : court;
        const msg = totalRequests > 1
          ? `${successfulBookings.length} of ${totalRequests} bookings created for ${courtLabel} at ${facility}.`
          : `Your ${court} booking at ${facility} has been confirmed.`;

        showToast(
          'reservation_confirmed',
          'Court Reservation Confirmed',
          msg,
          { facility, court, date, time: `${startTime} - ${endTime}` }
        );

        if (onBookingCreated) {
          await onBookingCreated();
        }

        if (failedBookings.length > 0) {
          const violations = failedBookings
            .filter(r => r.ruleViolations && r.ruleViolations.length > 0)
            .flatMap(r => r.ruleViolations!);
          if (violations.length > 0) {
            setRuleViolations(violations);
          } else {
            showToast('error', 'Some Bookings Failed', `${failedBookings.length} booking(s) could not be created.`);
          }
        } else {
          onClose();
        }
      } else {
        const firstResult = results[0];
        if (firstResult?.ruleViolations && firstResult.ruleViolations.length > 0) {
          setRuleViolations(firstResult.ruleViolations);
        } else {
          setRuleViolations([]);
        }
        if (firstResult?.warnings && firstResult.warnings.length > 0) {
          setRuleWarnings(firstResult.warnings);
        }
        if (firstResult?.isPrimeTime !== undefined) {
          setIsPrimeTime(firstResult.isPrimeTime);
        }
        if (!firstResult?.ruleViolations || firstResult.ruleViolations.length === 0) {
          showToast('error', 'Booking Failed', firstResult?.error || 'Failed to create booking. Please try again.');
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      showToast('error', 'Booking Failed', 'An error occurred while creating your booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (dateStr.includes('-') && dateStr.split('-').length === 3) {
      const [year, month, day] = dateStr.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    return dateStr;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                <span className="font-medium">
                  {selectedCourts.length > 1
                    ? `${selectedCourts.length} Courts: ${selectedCourts.map(c => c.court).join(', ')}`
                    : court}
                </span>
              </div>
              <div className="text-sm text-green-600 mt-1">
                {startTime} - {endTime} ({durationLabel})
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

          {/* Start Time */}
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Select value={startTime} onValueChange={(val) => {
              setStartTime(val);
              // Auto-adjust end time if it's now before or equal to start
              if (timeSlotIndex(val) >= timeSlotIndex(endTime)) {
                setEndTime(addMinutesTo12h(val, 60));
              }
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>End Time</Label>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {endTimeOptions.map((slot) => (
                  <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {/* Recurring Booking */}
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="recurring-booking"
              checked={advancedBooking}
              onCheckedChange={(checked) => setAdvancedBooking(checked === true)}
            />
            <Label htmlFor="recurring-booking" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              Recurring Booking
            </Label>
          </div>

          {advancedBooking && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Days of the Week</Label>
                <div className="grid grid-cols-4 gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <Checkbox
                        id={`bw-day-${day}`}
                        checked={recurringDays.includes(day)}
                        onCheckedChange={() => toggleRecurringDay(day)}
                      />
                      <Label htmlFor={`bw-day-${day}`} className="text-xs cursor-pointer">
                        {day.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bw-recurring-end" className="text-sm font-medium">
                  Repeat Until
                </Label>
                <Input
                  id="bw-recurring-end"
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  min={date}
                  className="w-full"
                />
              </div>

              {recurringDays.length > 0 && recurringEndDate && (
                <div className="text-xs text-gray-600 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-medium">Will create bookings:</span>
                  <div className="mt-1">
                    Every {recurringDays.join(', ')} from {new Date(date + 'T00:00:00').toLocaleDateString()} to {new Date(recurringEndDate + 'T00:00:00').toLocaleDateString()}
                  </div>
                  <div className="mt-1 font-medium">
                    Total bookings: {generateRecurringDates().length * selectedCourts.length}
                    {selectedCourts.length > 1 && ` (${generateRecurringDates().length} dates × ${selectedCourts.length} courts)`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Courts */}
          {availableAdditionalCourts.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Select Additional Courts
              </Label>
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2">
                {availableAdditionalCourts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`bw-court-${c.id}`}
                      checked={additionalCourtIds.includes(c.id)}
                      onCheckedChange={() => toggleAdditionalCourt(c.id)}
                    />
                    <Label htmlFor={`bw-court-${c.id}`} className="text-sm cursor-pointer">
                      {c.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              {isSubmitting ? 'Booking...' : selectedCourts.length > 1 ? `Book ${selectedCourts.length} Courts` : 'Book Court'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
