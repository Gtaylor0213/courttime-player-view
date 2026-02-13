import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Calendar, Clock, MapPin, User, Zap, Save, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { useAuth } from '../../contexts/AuthContext';
import { bookingApi, membersApi, facilitiesApi } from '../../api/client';
import { toast } from 'sonner';

interface Member {
  id: string;
  fullName: string;
  email: string;
  membershipType?: string;
}

interface Facility {
  id: string;
  name: string;
  type: string;
  courts: Array<{ id: string; name: string; type: string }>;
}

export function AdminBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Facility and court selection
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>(null);
  const [selectedCourt, setSelectedCourt] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');

  // Date and time
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState('1');

  // Member selection
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');

  // Booking options
  const [notes, setNotes] = useState('');
  const [isMatch, setIsMatch] = useState(false);
  const [isLesson, setIsLesson] = useState(false);
  const [isBallMachine, setIsBallMachine] = useState(false);

  // Advanced booking
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // State
  const [existingBookings, setExistingBookings] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Initialize with current date and time
  useEffect(() => {
    const now = new Date();
    // Use local date components to avoid timezone issues
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
  }, []);

  // Fetch facilities
  useEffect(() => {
    const fetchFacilities = async () => {
      setIsLoadingFacilities(true);
      try {
        const response = await facilitiesApi.getAll();
        if (response.success && response.data?.facilities) {
          // Filter to only facilities user is admin of
          const userFacilities = user?.memberFacilities || [];
          const adminFacilities = response.data.facilities.filter((f: any) =>
            userFacilities.includes(f.id)
          );
          setFacilities(adminFacilities);
          if (adminFacilities.length > 0) {
            setSelectedFacility(adminFacilities[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching facilities:', error);
        toast.error('Failed to load facilities');
      } finally {
        setIsLoadingFacilities(false);
      }
    };

    fetchFacilities();
  }, [user]);

  // Fetch members when facility changes
  useEffect(() => {
    const fetchMembers = async () => {
      if (!selectedFacility) {
        setMembers([]);
        return;
      }

      setIsLoadingMembers(true);
      try {
        const response = await membersApi.getFacilityMembers(selectedFacility, memberSearch);
        if (response.success && response.data?.members) {
          setMembers(response.data.members);
        }
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    const debounceTimer = setTimeout(fetchMembers, 300);
    return () => clearTimeout(debounceTimer);
  }, [selectedFacility, memberSearch]);

  // Reset court selection when facility changes
  useEffect(() => {
    setSelectedCourt('');
    setSelectedCourtId('');
    setSelectedCourtType(null);
    setSelectedMemberId('');
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

  // Fetch bookings when facility or date changes
  useEffect(() => {
    const fetchBookings = async () => {
      if (!selectedFacility || !selectedDate) return;

      try {
        const response = await bookingApi.getByFacility(selectedFacility, selectedDate);
        if (response.success && response.data?.bookings) {
          const bookingsMap: any = {};
          response.data.bookings.forEach((booking: any) => {
            const courtName = booking.courtName;
            const [hours24, minutes] = booking.startTime.split(':').map(Number);
            const period = hours24 >= 12 ? 'PM' : 'AM';
            const hours12 = hours24 % 12 || 12;

            if (!bookingsMap[courtName]) {
              bookingsMap[courtName] = new Set();
            }

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
  }, [selectedFacility, selectedDate]);

  // Auto-select first available court and find soonest available time
  useEffect(() => {
    if (selectedCourtType && availableCourts.length > 0 && selectedDate) {
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

      const generateBookingSlots = (startTime: string, durationHours: string): string[] => {
        const slots: string[] = [];
        const [time, period] = startTime.split(' ');
        const [hourStr, minuteStr] = time.split(':');
        let hour = parseInt(hourStr);
        let minute = parseInt(minuteStr);

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

      const isCourtAvailableForDuration = (court: any, startTime: string): boolean => {
        const courtBookings = existingBookings[court.name] || new Set();
        const bookingSlots = generateBookingSlots(startTime, duration);
        return !bookingSlots.some(slot => courtBookings.has(slot));
      };

      const allTimeSlots = generateTimeSlots();

      const now = new Date();
      // Use local date components to avoid timezone issues
      const todayYear = now.getFullYear();
      const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
      const todayDay = String(now.getDate()).padStart(2, '0');
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
      const isToday = selectedDate === todayStr;

      let startTimeIndex = 0;

      if (isToday) {
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

      let soonestSlot: { court: any; time: string; timeIndex: number } | null = null;

      for (let i = startTimeIndex; i < allTimeSlots.length; i++) {
        const timeSlot = allTimeSlots[i];

        for (const court of availableCourts) {
          if (isCourtAvailableForDuration(court, timeSlot)) {
            soonestSlot = { court, time: timeSlot, timeIndex: i };
            break;
          }
        }

        if (soonestSlot) break;
      }

      if (soonestSlot) {
        setSelectedCourtId(soonestSlot.court.id);
        setSelectedCourt(soonestSlot.court.name);
        setSelectedTime(soonestSlot.time);
      } else {
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

    const generateBookingSlots = (startTime: string, durationHours: string): string[] => {
      const slots: string[] = [];
      const [time, period] = startTime.split(' ');
      const [hourStr, minuteStr] = time.split(':');
      let hour = parseInt(hourStr);
      let minute = parseInt(minuteStr);

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

    if (!selectedCourtType || availableCourts.length === 0) {
      return allSlots;
    }

    return allSlots.filter(timeSlot => {
      for (const court of availableCourts) {
        const courtBookings = existingBookings[court.name] || new Set();
        if (!courtBookings.has(timeSlot)) {
          return true;
        }
      }
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

  const calculateEndTime = (startTime: string, durationHours: string) => {
    const [time, period] = startTime.split(' ');
    const timeParts = time.split(':');
    let hours = parseInt(timeParts[0]);
    let minutes = timeParts[1] ? parseInt(timeParts[1]) : 0;

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    const durationFloat = parseFloat(durationHours);
    hours += Math.floor(durationFloat);
    minutes += (durationFloat % 1) * 60;

    if (minutes >= 60) {
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }

    const endPeriod = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours === 12 ? 12 : hours;

    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${endPeriod}`;
  };

  const formatDisplayDate = (date: string) => {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCourt || !selectedCourtId) {
      toast.error('Please select a court');
      return;
    }

    if (!isWalkIn && !selectedMemberId) {
      toast.error('Please select a member or mark as walk-in');
      return;
    }

    if (isWalkIn && !walkInName.trim()) {
      toast.error('Please enter a name for the walk-in guest');
      return;
    }

    // Validate advanced booking
    if (advancedBooking) {
      if (recurringDays.length === 0) {
        toast.error('Please select at least one day of the week for recurring bookings');
        return;
      }
      if (!recurringEndDate) {
        toast.error('Please select an end date for recurring bookings');
        return;
      }
      if (new Date(recurringEndDate) < new Date(selectedDate)) {
        toast.error('End date must be on or after the start date');
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

      // Build booking type string from checkboxes
      const bookingTypes: string[] = [];
      if (isMatch) bookingTypes.push('Match');
      if (isLesson) bookingTypes.push('Lesson');
      if (isBallMachine) bookingTypes.push('Ball Machine');
      const bookingType = bookingTypes.length > 0 ? bookingTypes.join(', ') : undefined;

      // Build notes with walk-in info if applicable
      let finalNotes = notes;
      if (isWalkIn) {
        finalNotes = `Walk-in: ${walkInName}${notes ? ` - ${notes}` : ''}`;
      }

      // Use selected member ID or admin user ID for walk-ins
      const bookingUserId = isWalkIn ? user?.id : selectedMemberId;

      if (!bookingUserId) {
        toast.error('Unable to determine user for booking');
        return;
      }

      // Create bookings for all dates
      const results = await Promise.all(
        datesToBook.map(date =>
          bookingApi.create({
            courtId: selectedCourtId,
            userId: bookingUserId,
            facilityId: selectedFacility,
            bookingDate: date,
            startTime: startTime24,
            endTime: endTime24,
            durationMinutes: Math.round(durationMinutes),
            bookingType,
            notes: finalNotes || undefined
          })
        )
      );

      const failedBookings = results.filter(r => !r.success);
      const successfulBookings = results.filter(r => r.success);

      if (successfulBookings.length > 0) {
        if (failedBookings.length > 0) {
          toast.success(`${successfulBookings.length} bookings created. ${failedBookings.length} failed (conflicts).`);
        } else {
          toast.success(`${successfulBookings.length} booking(s) created successfully!`);
        }

        // Reset form
        setSelectedMemberId('');
        setIsWalkIn(false);
        setWalkInName('');
        setNotes('');
        setIsMatch(false);
        setIsLesson(false);
        setIsBallMachine(false);
        setAdvancedBooking(false);
        setRecurringDays([]);
        setRecurringEndDate('');
      } else {
        toast.error('Failed to create bookings. There may be conflicts with existing reservations.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('An error occurred while creating the booking(s)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMember = members.find(m => m.id === selectedMemberId);

  return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-600" />
              Create Booking
            </h1>
            <p className="text-gray-600 mt-2">
              Auto-fills for the soonest available date and time. Book a court for a member or walk-in guest.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Booking Details
              </CardTitle>
              <CardDescription>Select facility, member, court, and time</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Facility Selection */}
                <div className="flex items-center gap-3">
                  <Label htmlFor="facility" className="flex items-center gap-2 min-w-[100px]">
                    <MapPin className="h-4 w-4" />
                    Facility
                  </Label>
                  <Select
                    value={selectedFacility}
                    onValueChange={setSelectedFacility}
                    disabled={isLoadingFacilities}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={isLoadingFacilities ? "Loading..." : "Select facility"} />
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

                {/* Member Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Label className="flex items-center gap-2 min-w-[100px]">
                      <User className="h-4 w-4" />
                      Book For
                    </Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="walk-in"
                        checked={isWalkIn}
                        onCheckedChange={(checked) => {
                          setIsWalkIn(checked === true);
                          if (checked) {
                            setSelectedMemberId('');
                          }
                        }}
                      />
                      <Label htmlFor="walk-in" className="text-sm cursor-pointer">
                        Walk-in Guest
                      </Label>
                    </div>
                  </div>

                  {isWalkIn ? (
                    <div className="ml-[112px]">
                      <Input
                        placeholder="Enter guest name"
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="ml-[112px] space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search members..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingMembers ? "Loading members..." : "Select a member"} />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.fullName} ({member.email})
                            </SelectItem>
                          ))}
                          {members.length === 0 && !isLoadingMembers && (
                            <div className="p-2 text-sm text-gray-500">No members found</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Court Type Filter */}
                {hasMultipleCourtTypes && (
                  <div className="flex items-center gap-3">
                    <Label className="min-w-[100px]">Court Type</Label>
                    <div className="flex gap-2">
                      {hasTennisCourts && (
                        <Button
                          type="button"
                          variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                          className={selectedCourtType === 'tennis' ? 'bg-blue-600 hover:bg-blue-700' : ''}
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
                          className={selectedCourtType === 'pickleball' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                        >
                          Pickleball
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Date Selection */}
                <div className="flex items-center gap-3">
                  <Label htmlFor="date" className="flex items-center gap-2 min-w-[100px]">
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
                  <Label htmlFor="time" className="flex items-center gap-2 min-w-[100px]">
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
                  <Label htmlFor="duration" className="min-w-[100px]">Duration</Label>
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

                {/* Booking Type Checkboxes */}
                <div className="flex items-center gap-3">
                  <Label className="min-w-[100px]">Type</Label>
                  <div className="flex gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="booking-match"
                        checked={isMatch}
                        onCheckedChange={(checked) => setIsMatch(checked === true)}
                      />
                      <Label htmlFor="booking-match" className="text-sm cursor-pointer">
                        Match
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="booking-lesson"
                        checked={isLesson}
                        onCheckedChange={(checked) => setIsLesson(checked === true)}
                      />
                      <Label htmlFor="booking-lesson" className="text-sm cursor-pointer">
                        Lesson
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="booking-ball-machine"
                        checked={isBallMachine}
                        onCheckedChange={(checked) => setIsBallMachine(checked === true)}
                      />
                      <Label htmlFor="booking-ball-machine" className="text-sm cursor-pointer">
                        Ball Machine
                      </Label>
                    </div>
                  </div>
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

                {/* Available Courts Selection */}
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
                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer'
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

                {/* Recurring Options */}
                {advancedBooking && (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
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

                    {recurringDays.length > 0 && recurringEndDate && (
                      <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-200">
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

                {/* Reservation Summary */}
                {selectedCourt && selectedTime && selectedDate && (isWalkIn ? walkInName : selectedMember) && (
                  <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                    <div className="text-sm">
                      <div className="font-medium text-blue-800 mb-1">Reservation Summary</div>
                      <div className="text-blue-700 space-y-0.5">
                        <div><span className="font-medium">For:</span> {isWalkIn ? `${walkInName} (Walk-in)` : selectedMember?.fullName}</div>
                        <div><span className="font-medium">Facility:</span> {currentFacility?.name}</div>
                        <div><span className="font-medium">Court:</span> {selectedCourt}</div>
                        <div><span className="font-medium">Date:</span> {formatDisplayDate(selectedDate)}</div>
                        <div><span className="font-medium">Time:</span> {selectedTime} - {calculateEndTime(selectedTime, duration)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !selectedCourt || (!isWalkIn && !selectedMemberId) || (isWalkIn && !walkInName.trim())}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSubmitting ? 'Creating...' : 'Create Booking'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Quick Tips Card */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• The form auto-fills with the soonest available court and time</li>
                <li>• Use walk-in option for guests who aren't members</li>
                <li>• Enable advanced booking to create recurring reservations</li>
                <li>• Courts show real-time availability based on existing bookings</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
