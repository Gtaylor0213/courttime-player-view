import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Calendar, Clock, MapPin, AlertCircle, Info, Repeat } from 'lucide-react';
import { RuleViolationDialog } from './RuleViolationDialog';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi, facilitiesApi } from '../api/client';
import { BOOKING_TYPES, RESERVATION_LABEL_TYPE_KEYS } from '../constants/bookingTypes';
import { parseLocalDate } from '../utils/dateUtils';

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
  const [existingBookings, setExistingBookings] = useState<Record<string, Set<string>>>({});
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

  // Fetch existing bookings to determine court availability
  useEffect(() => {
    if (!isOpen || !facilityId || !date) return;
    bookingApi.getByFacility(facilityId, date).then(res => {
      if (res.success && res.data?.bookings) {
        const map: Record<string, Set<string>> = {};
        for (const b of res.data.bookings) {
          const name = b.courtName || b.court_name;
          if (!map[name]) map[name] = new Set();
          // Add all 15-min slots this booking covers
          const [sh, sm] = (b.startTime || b.start_time || '').split(':').map(Number);
          const [eh, em] = (b.endTime || b.end_time || '').split(':').map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            let t = sh * 60 + (sm || 0);
            const end = eh * 60 + (em || 0);
            while (t < end) {
              const hh = Math.floor(t / 60);
              const mm = t % 60;
              map[name].add(`${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
              t += 15;
            }
          }
        }
        setExistingBookings(map);
      }
    });
  }, [isOpen, facilityId, date]);

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

  // Courts available to add (exclude primary/drag-selected, only show available during selected time)
  const availableAdditionalCourts = useMemo(() => {
    const dragIds = new Set(dragSelectedCourts.map(c => c.courtId));
    const others = facilityCourts.filter(c => !dragIds.has(c.id));

    if (!startTime || !endTime) return others;

    // Build the set of 15-min slots for the selected time range
    const start24 = convertTo24Hour(startTime);
    const end24 = convertTo24Hour(endTime);
    const [sh, sm] = start24.split(':').map(Number);
    const [eh, em] = end24.split(':').map(Number);
    const slots: string[] = [];
    let t = sh * 60 + sm;
    const endMin = eh * 60 + em;
    while (t < endMin) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      slots.push(`${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
      t += 15;
    }

    return others.filter(c => {
      const booked = existingBookings[c.name];
      if (!booked) return true;
      return !slots.some(s => booked.has(s));
    });
  }, [facilityCourts, dragSelectedCourts, startTime, endTime, existingBookings]);

  const getDayOfWeek = (d: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  };

  const generateRecurringDates = (): string[] => {
    if (!advancedBooking || recurringDays.length === 0 || !recurringEndDate) {
      return [date];
    }
    const dates: string[] = [];
    const start = parseLocalDate(date);
    const end = parseLocalDate(recurringEndDate);
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
      <DialogContent className="sm:max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto top-4 translate-y-0">
        <DialogHeader>
          <DialogTitle>Book Court</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Court & Facility Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{facility}</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDateForDisplay(date)}</span>
            </div>
            <div className="bg-green-50 p-2.5 rounded-md border border-green-200">
              <div className="flex items-center gap-2 text-green-800">
                <Clock className="h-4 w-4" />
                <span className="font-medium">
                  {selectedCourts.length > 1
                    ? `${selectedCourts.length} Courts: ${selectedCourts.map(c => c.court).join(', ')}`
                    : court}
                </span>
              </div>
              <div className="text-sm text-green-600 mt-0.5">
                {startTime} - {endTime} ({durationLabel})
              </div>
            </div>
          </div>

          {/* Rule Violations Dialog */}
          <RuleViolationDialog
            open={ruleViolations.length > 0}
            onClose={() => setRuleViolations([])}
            violations={ruleViolations}
          />

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

          {/* Start Time + End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={(val) => {
                setStartTime(val);
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
            <div className="space-y-1.5">
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
          </div>

          {/* Booking Type Dropdown */}
          <div className="space-y-2">
            <Label>Type (Optional)</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger>
                <SelectValue placeholder="Select booking type..." />
              </SelectTrigger>
              <SelectContent>
                {RESERVATION_LABEL_TYPE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>{BOOKING_TYPES[key].label}</SelectItem>
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
              rows={2}
            />
          </div>

          {/* Recurring Booking - Admin only */}
          {user?.userType === 'admin' && (
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
          )}

          {advancedBooking && user?.userType === 'admin' && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Days of the Week</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    Every {recurringDays.join(', ')} from {parseLocalDate(date).toLocaleDateString()} to {parseLocalDate(recurringEndDate).toLocaleDateString()}
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
                Add Additional Court
              </Label>
              <Select
                value=""
                onValueChange={(value) => toggleAdditionalCourt(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a court to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableAdditionalCourts
                    .filter(c => !additionalCourtIds.includes(c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {additionalCourtIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {additionalCourtIds.map(id => {
                    const c = facilityCourts.find(fc => fc.id === id);
                    return c ? (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-800 border border-green-200 rounded-md text-xs">
                        {c.name}
                        <button type="button" onClick={() => toggleAdditionalCourt(id)} className="hover:text-red-600">×</button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
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
