import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Clock, MapPin, User, Zap, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi } from '../api/client';
import { BOOKING_TYPES } from '../constants/bookingTypes';

interface QuickReservePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onReserve: (reservation: {
    facility: string;
    court: string;
    date: string;
    time: string;
    duration: string;
    playerName: string;
  }) => void;
  facilities: Array<{
    id: string;
    name: string;
    type: string;
    courts: Array<{ name: string; type: string }>;
  }>;
  selectedFacilityId: string;
}

export function QuickReservePopup({
  isOpen,
  onClose,
  onReserve,
  facilities,
  selectedFacilityId
}: QuickReservePopupProps) {
  const { user } = useAuth();
  const [selectedFacility, setSelectedFacility] = useState(selectedFacilityId);
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>(null);
  const [selectedCourt, setSelectedCourt] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState('1');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingBookings, setExistingBookings] = useState<any>({});
  const [bookingErrors, setBookingErrors] = useState<Array<{ ruleCode: string; ruleName: string; message: string; severity: string }>>([]);
  const [bookingWarnings, setBookingWarnings] = useState<Array<{ ruleCode: string; ruleName: string; message: string }>>([]);
  const [isPrimeTime, setIsPrimeTime] = useState(false);

  // Booking type
  const [bookingType, setBookingType] = useState<string>('');

  // Advanced booking state
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // Initialize with current date and time, reset notes when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();

    // Set current date (using local date to avoid timezone issues)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setSelectedDate(dateStr);

    // Set current time rounded to next 15-minute interval
    const currentMinutes = now.getMinutes();
    const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;

    const nextTime = new Date(now);
    if (roundedMinutes >= 60) {
      nextTime.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      nextTime.setMinutes(roundedMinutes, 0, 0);
    }

    let hours = nextTime.getHours();
    const minutes = nextTime.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;

    setSelectedTime(`${hours}:${minutes.toString().padStart(2, '0')} ${period}`);

    // Reset notes, booking type, advanced booking, and errors when modal opens
    setNotes('');
    setBookingType('');
    setAdvancedBooking(false);
    setRecurringDays([]);
    setRecurringEndDate('');
    setBookingErrors([]);
    setBookingWarnings([]);
    setIsPrimeTime(false);
  }, [isOpen]);

  // Reset court selection when facility changes
  useEffect(() => {
    setSelectedCourt('');
    setSelectedCourtId('');
    setSelectedCourtType(null);
  }, [selectedFacility]);

  const currentFacility = facilities.find(f => f.id === selectedFacility);
  const allCourts = currentFacility?.courts || [];

  // Determine if facility has both types of courts
  const hasTennisCourts = allCourts.some(court => court.type === 'tennis');
  const hasPickleballCourts = allCourts.some(court => court.type === 'pickleball');
  const hasMultipleCourtTypes = hasTennisCourts && hasPickleballCourts;

  // Auto-select court type when there's only one type available
  useEffect(() => {
    if (!hasMultipleCourtTypes && selectedCourtType === null) {
      if (hasTennisCourts && !hasPickleballCourts) {
        setSelectedCourtType('tennis');
      } else if (hasPickleballCourts && !hasTennisCourts) {
        setSelectedCourtType('pickleball');
      }
    }
  }, [hasMultipleCourtTypes, hasTennisCourts, hasPickleballCourts, selectedCourtType]);

  // Filter courts by selected type
  const availableCourts = React.useMemo(() => {
    if (selectedCourtType === null) {
      return allCourts;
    }
    return allCourts.filter(court => court.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  // Fetch bookings when modal opens, facility changes, or date changes
  useEffect(() => {
    const fetchBookings = async () => {
      if (!isOpen || !selectedFacility || !selectedDate) return;

      try {
        const response = await bookingApi.getByFacility(selectedFacility, selectedDate);
        if (response.success && response.data?.bookings) {
          // Transform bookings into a lookup object by court name and time
          const bookingsMap: any = {};
          response.data.bookings.forEach((booking: any) => {
            const courtName = booking.courtName;

            // Convert 24h time to 12h format
            const [hours24, minutes] = booking.startTime.split(':').map(Number);
            const period = hours24 >= 12 ? 'PM' : 'AM';
            const hours12 = hours24 % 12 || 12;
            const startTime12h = `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;

            if (!bookingsMap[courtName]) {
              bookingsMap[courtName] = new Set();
            }

            // Mark all time slots this booking occupies
            const slotsToFill = Math.ceil(booking.durationMinutes / 15);
            for (let i = 0; i < slotsToFill; i++) {
              const slotMinutes = minutes + (i * 15);
              const slotHours24 = hours24 + Math.floor(slotMinutes / 60);
              const actualMinutes = slotMinutes % 60;
              const slotPeriod = slotHours24 >= 12 ? 'PM' : 'AM';
              const slotHours12 = slotHours24 % 12 || 12;
              const slotTime = `${slotHours12}:${actualMinutes.toString().padStart(2, '0')} ${slotPeriod}`;
              bookingsMap[courtName].add(slotTime);
            }
          });
          setExistingBookings(bookingsMap);
        } else {
          setExistingBookings({});
        }
      } catch (error) {
        console.error('Error fetching bookings:', error);
        setExistingBookings({});
      }
    };

    fetchBookings();
  }, [isOpen, selectedFacility, selectedDate]);

  // Auto-select first available court and find soonest available time when court type changes or date changes
  useEffect(() => {
    if (selectedCourtType && availableCourts.length > 0 && selectedDate) {
      // Generate time slots for checking
      const generateTimeSlots = () => {
        const slots = [];
        for (let hour = 6; hour <= 21; hour++) {
          for (let minute = 0; minute < 60; minute += 15) {
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
            const displayMinute = minute.toString().padStart(2, '0');
            slots.push(`${displayHour}:${displayMinute} ${period}`);
          }
        }
        return slots;
      };

      // Generate all time slots that a booking would occupy based on duration
      const generateBookingSlots = (startTime: string, durationHours: string): string[] => {
        const slots: string[] = [];
        const [time, period] = startTime.split(' ');
        const [hourStr, minuteStr] = time.split(':');
        let hour = parseInt(hourStr);
        let minute = parseInt(minuteStr);

        // Convert to 24-hour format for calculation
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;

        const durationMinutes = parseFloat(durationHours) * 60;
        const numSlots = Math.ceil(durationMinutes / 15);

        for (let i = 0; i < numSlots; i++) {
          const slotHour24 = hour + Math.floor((minute + i * 15) / 60);
          const slotMinute = (minute + i * 15) % 60;
          const slotPeriod = slotHour24 >= 12 ? 'PM' : 'AM';
          const slotHour12 = slotHour24 % 12 || 12;
          slots.push(`${slotHour12}:${slotMinute.toString().padStart(2, '0')} ${slotPeriod}`);
        }

        return slots;
      };

      // Check if a court is available for the full duration at a given start time
      const isCourtAvailableForDuration = (court: any, startTime: string): boolean => {
        const courtBookings = existingBookings[court.name] || new Set();
        const bookingSlots = generateBookingSlots(startTime, duration);
        return !bookingSlots.some(slot => courtBookings.has(slot));
      };

      const allTimeSlots = generateTimeSlots();

      // Determine starting time index based on selected date
      const now = new Date();
      const todayYear = now.getFullYear();
      const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
      const todayDay = String(now.getDate()).padStart(2, '0');
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
      const isToday = selectedDate === todayStr;

      let startTimeIndex = 0; // Start from beginning for future dates

      if (isToday) {
        // For today, start from current time rounded up
        const currentMinutes = now.getMinutes();
        const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
        const nextTime = new Date(now);
        if (roundedMinutes >= 60) {
          nextTime.setHours(now.getHours() + 1, 0, 0, 0);
        } else {
          nextTime.setMinutes(roundedMinutes, 0, 0);
        }
        let hours = nextTime.getHours();
        const minutes = nextTime.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
        const currentTimeSlot = `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
        startTimeIndex = allTimeSlots.indexOf(currentTimeSlot);
        if (startTimeIndex === -1) startTimeIndex = 0;
      }

      // Find the SOONEST available time across ALL courts of this type (checking full duration)
      let soonestSlot: { court: any; time: string; timeIndex: number } | null = null;

      // Check each time slot starting from the appropriate time
      for (let i = startTimeIndex; i < allTimeSlots.length; i++) {
        const timeSlot = allTimeSlots[i];

        // Check if ANY court is available for the full duration at this time
        for (const court of availableCourts) {
          if (isCourtAvailableForDuration(court, timeSlot)) {
            // Found an available court at this time for full duration!
            soonestSlot = { court, time: timeSlot, timeIndex: i };
            break;
          }
        }

        // If we found a slot, use it (it's the soonest)
        if (soonestSlot) break;
      }

      if (soonestSlot) {
        // Set the court and time to the soonest available
        setSelectedCourtId(soonestSlot.court.id);
        setSelectedCourt(soonestSlot.court.name);
        setSelectedTime(soonestSlot.time);
      } else {
        // No available slots found, just select first court and first available time
        const firstCourt = availableCourts[0];
        setSelectedCourtId(firstCourt.id);
        setSelectedCourt(firstCourt.name);
        setSelectedTime(allTimeSlots[startTimeIndex] || allTimeSlots[0]);
      }
    } else if (!selectedCourtType) {
      setSelectedCourt('');
      setSelectedCourtId('');
    }
  }, [selectedCourtType, availableCourts, existingBookings, selectedDate, duration]);

  // Calculate which courts are available at the selected time and duration
  const courtsWithAvailability = React.useMemo(() => {
    if (!selectedCourtType || !selectedTime || availableCourts.length === 0) {
      return [];
    }

    // Generate all time slots that this booking would occupy based on duration
    const generateBookingSlots = (startTime: string, durationHours: string): string[] => {
      const slots: string[] = [];
      const [time, period] = startTime.split(' ');
      const [hourStr, minuteStr] = time.split(':');
      let hour = parseInt(hourStr);
      let minute = parseInt(minuteStr);

      // Convert to 24-hour format for calculation
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;

      const durationMinutes = parseFloat(durationHours) * 60;
      const numSlots = Math.ceil(durationMinutes / 15);

      for (let i = 0; i < numSlots; i++) {
        const slotHour24 = hour + Math.floor((minute + i * 15) / 60);
        const slotMinute = (minute + i * 15) % 60;
        const slotPeriod = slotHour24 >= 12 ? 'PM' : 'AM';
        const slotHour12 = slotHour24 % 12 || 12;
        slots.push(`${slotHour12}:${slotMinute.toString().padStart(2, '0')} ${slotPeriod}`);
      }

      return slots;
    };

    const bookingSlots = generateBookingSlots(selectedTime, duration);

    return availableCourts.map(court => {
      const courtBookings = existingBookings[court.name] || new Set();
      // Check if ANY of the booking slots conflict with existing bookings
      const isAvailable = !bookingSlots.some(slot => courtBookings.has(slot));
      return {
        ...court,
        isAvailable
      };
    });
  }, [selectedCourtType, selectedTime, duration, availableCourts, existingBookings]);

  // Generate time slots (15-minute intervals), filtering out fully booked times
  const timeSlots = React.useMemo(() => {
    const allSlots = [];
    for (let hour = 6; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute.toString().padStart(2, '0');
        allSlots.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }

    // If no court type selected, return all slots
    if (!selectedCourtType || availableCourts.length === 0) {
      return allSlots;
    }

    // Filter out times where ALL courts of this type are booked
    return allSlots.filter(timeSlot => {
      // Check if at least one court is available at this time
      for (const court of availableCourts) {
        const courtBookings = existingBookings[court.name] || new Set();
        if (!courtBookings.has(timeSlot)) {
          // At least one court is available at this time
          return true;
        }
      }
      // All courts are booked at this time
      return false;
    });
  }, [selectedCourtType, availableCourts, existingBookings]);

  const toggleRecurringDay = (day: string) => {
    setRecurringDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const getDayOfWeek = (date: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  const generateRecurringDates = (): string[] => {
    if (!advancedBooking || recurringDays.length === 0 || !recurringEndDate) {
      return [selectedDate];
    }

    const dates: string[] = [];
    const start = new Date(selectedDate + 'T00:00:00');
    const end = new Date(recurringEndDate + 'T00:00:00');

    let current = new Date(start);
    while (current <= end) {
      const dayName = getDayOfWeek(current);
      if (recurringDays.includes(dayName)) {
        // Use local date components to avoid timezone issues
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCourt || !selectedCourtId) {
      alert('Please select a court');
      return;
    }

    if (!user?.id) {
      alert('You must be logged in to make a reservation');
      return;
    }

    // Validate advanced booking
    if (advancedBooking) {
      if (recurringDays.length === 0) {
        alert('Please select at least one day of the week for recurring bookings');
        return;
      }
      if (!recurringEndDate) {
        alert('Please select an end date for recurring bookings');
        return;
      }
      if (new Date(recurringEndDate) < new Date(selectedDate)) {
        alert('End date must be on or after the start date');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Convert 12h time to 24h format
      const [time, period] = selectedTime.split(' ');
      let [hours, minutes] = time.split(':').map(Number);

      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      const startTime24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

      // Calculate end time
      const durationMinutes = parseFloat(duration) * 60;
      const endMinutes = minutes + durationMinutes;
      const endHours = hours + Math.floor(endMinutes / 60);
      const actualEndMinutes = endMinutes % 60;
      const endTime24 = `${endHours.toString().padStart(2, '0')}:${actualEndMinutes.toString().padStart(2, '0')}:00`;

      // Generate dates for booking
      const datesToBook = generateRecurringDates();

      // Create bookings for all dates
      const results = await Promise.all(
        datesToBook.map(date =>
          bookingApi.create({
            courtId: selectedCourtId,
            userId: user.id,
            facilityId: selectedFacility,
            bookingDate: date,
            startTime: startTime24,
            endTime: endTime24,
            durationMinutes: Math.round(durationMinutes),
            bookingType: bookingType || undefined,
            notes: notes || undefined
          })
        )
      );

      const failedBookings = results.filter(r => !r.success);
      const successfulBookings = results.filter(r => r.success);

      if (successfulBookings.length > 0) {
        // Call the parent callback to refresh bookings
        const reservation = {
          facility: currentFacility?.name || '',
          court: selectedCourt,
          date: selectedDate,
          time: selectedTime,
          duration,
          playerName: user.name || user.email || 'Player'
        };
        onReserve(reservation);

        if (failedBookings.length > 0) {
          // Collect rule violations from failed bookings
          const violations = failedBookings
            .filter(r => r.ruleViolations && r.ruleViolations.length > 0)
            .flatMap(r => r.ruleViolations!);
          if (violations.length > 0) {
            setBookingErrors(violations);
          } else {
            setBookingErrors([{ ruleCode: '', ruleName: '', message: `${failedBookings.length} bookings failed (possibly due to conflicts).`, severity: 'error' }]);
          }
        }

        onClose();
      } else {
        // Show rule violations from the first failed result
        const firstFailed = failedBookings[0];
        if (firstFailed?.ruleViolations && firstFailed.ruleViolations.length > 0) {
          setBookingErrors(firstFailed.ruleViolations);
          if (firstFailed.warnings) {
            setBookingWarnings(firstFailed.warnings);
          }
          if (firstFailed.isPrimeTime !== undefined) {
            setIsPrimeTime(firstFailed.isPrimeTime);
          }
        } else {
          setBookingErrors([{ ruleCode: '', ruleName: '', message: firstFailed?.error || 'Failed to create booking. There may be conflicts with existing reservations.', severity: 'error' }]);
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      setBookingErrors([{ ruleCode: '', ruleName: '', message: 'An error occurred while creating your booking(s)', severity: 'error' }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDisplayDate = (date: string) => {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateEndTime = (startTime: string, durationHours: string) => {
    const [time, period] = startTime.split(' ');
    const timeParts = time.split(':');
    let hours = parseInt(timeParts[0]);
    let minutes = timeParts[1] ? parseInt(timeParts[1]) : 0;
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Add duration
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

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-green-600" />
            Quick Reserve
          </DialogTitle>
          <DialogDescription>
            Quick Reserve autofills for the soonest possible date and time of reservation.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          <form onSubmit={handleSubmit} id="quick-reserve-form" className="h-full flex flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pb-24">
              {/* Facility Selection */}
              <div className="flex items-center gap-3">
                <Label htmlFor="facility" className="flex items-center gap-2 min-w-[80px]">
                  <MapPin className="h-4 w-4" />
                  Facility
                </Label>
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

          {/* Court Type Filter - Only show if facility has multiple court types */}
          {hasMultipleCourtTypes && (
            <div className="flex items-center gap-3">
              <Label className="min-w-[80px]">Court Type</Label>
              <div className="flex gap-2">
                {hasTennisCourts && (
                  <Button
                    type="button"
                    variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                  >
                    Tennis
                  </Button>
                )}
                {hasPickleballCourts && (
                  <Button
                    type="button"
                    variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball')}
                  >
                    Pickleball
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Date Selection */}
          <div className="flex items-center gap-3">
            <Label htmlFor="date" className="flex items-center gap-2 min-w-[80px]">
              <Calendar className="h-4 w-4" />
              Date
            </Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={(() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              })()}
              required
              className="flex-1"
            />
          </div>

          {/* Time Selection */}
          <div className="flex items-center gap-3">
            <Label htmlFor="time" className="flex items-center gap-2 min-w-[80px]">
              <Clock className="h-4 w-4" />
              Time
            </Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-3">
            <Label htmlFor="duration" className="min-w-[80px]">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="flex-1">
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

          {/* Booking Type Dropdown */}
          <div className="flex items-center gap-3">
            <Label className="min-w-[80px]">Type</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select type (optional)..." />
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
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Available Courts Selection - Show when court type, date, and time are selected */}
          {selectedCourtType && selectedDate && selectedTime && courtsWithAvailability.length > 0 && (
            <div className="space-y-2">
              <Label>Available Courts</Label>
              <div className="grid grid-cols-2 gap-2">
                {courtsWithAvailability.map((court) => (
                  <button
                    key={court.id}
                    type="button"
                    disabled={!court.isAvailable}
                    onClick={() => {
                      if (court.isAvailable) {
                        setSelectedCourtId(court.id);
                        setSelectedCourt(court.name);
                      }
                    }}
                    className={`
                      p-3 rounded-md border-2 text-left transition-all
                      ${court.isAvailable
                        ? selectedCourtId === court.id
                          ? 'border-green-600 bg-green-50 text-green-800'
                          : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50 cursor-pointer'
                        : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    <div className="font-medium text-sm">{court.name}</div>
                    <div className={`text-xs ${court.isAvailable ? 'text-green-600' : 'text-red-500'}`}>
                      {court.isAvailable ? 'Available' : 'Booked'}
                    </div>
                  </button>
                ))}
              </div>
              {!selectedCourtId && (
                <p className="text-xs text-amber-600">Please select a court above</p>
              )}
            </div>
          )}

          {/* Advanced Booking Checkbox */}
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="advanced-booking"
              checked={advancedBooking}
              onCheckedChange={(checked) => setAdvancedBooking(checked === true)}
            />
            <Label htmlFor="advanced-booking" className="text-sm font-medium cursor-pointer">
              Advanced Booking (Recurring)
            </Label>
          </div>

          {/* Recurring Options - Show when Advanced Booking is checked */}
          {advancedBooking && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              {/* Days of the Week */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Days of the Week</Label>
                <div className="grid grid-cols-4 gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <Checkbox
                        id={`day-${day}`}
                        checked={recurringDays.includes(day)}
                        onCheckedChange={() => toggleRecurringDay(day)}
                      />
                      <Label htmlFor={`day-${day}`} className="text-xs cursor-pointer">
                        {day.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label htmlFor="recurring-end-date" className="text-sm font-medium">
                  Repeat Until
                </Label>
                <Input
                  id="recurring-end-date"
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  min={selectedDate}
                  className="w-full"
                />
              </div>

              {/* Recurring Summary */}
              {recurringDays.length > 0 && recurringEndDate && (
                <div className="text-xs text-gray-600 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-medium">Will create bookings:</span>
                  <div className="mt-1">
                    Every {recurringDays.join(', ')} from {new Date(selectedDate + 'T00:00:00').toLocaleDateString()} to {new Date(recurringEndDate + 'T00:00:00').toLocaleDateString()}
                  </div>
                  <div className="mt-1 font-medium">
                    Total bookings: {generateRecurringDates().length}
                  </div>
                </div>
              )}
            </div>
          )}

              {/* Rule Violations */}
              {bookingErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 text-red-800 font-medium text-sm">
                    <AlertCircle className="h-4 w-4" />
                    Booking could not be completed
                  </div>
                  <ul className="space-y-1">
                    {bookingErrors.map((v, i) => (
                      <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">-</span>
                        <span>{v.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rule Warnings */}
              {bookingWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                    <Info className="h-4 w-4" />
                    Heads up
                  </div>
                  <ul className="space-y-1">
                    {bookingWarnings.map((w, i) => (
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

              {/* Reservation Summary */}
              {selectedCourt && selectedTime && selectedDate && (
                <div className="bg-green-50 p-3 rounded-md border border-green-200">
                  <div className="text-sm">
                    <div className="font-medium text-green-800 mb-1">Reservation Summary</div>
                    <div className="text-green-700">
                      <div>{currentFacility?.name}</div>
                      <div>{selectedCourt}</div>
                      <div>{formatDisplayDate(selectedDate)}</div>
                      <div>{selectedTime} - {calculateEndTime(selectedTime, duration)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Action Buttons - Fixed footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 bg-white flex-shrink-0">
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
            form="quick-reserve-form"
            disabled={isSubmitting || !selectedCourt}
            className="flex-1"
          >
            {isSubmitting ? 'Reserving...' : 'Quick Reserve'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}