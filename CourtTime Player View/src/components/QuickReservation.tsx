import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users, Calendar, Filter } from 'lucide-react';

export function QuickReservation() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedCourtType, setSelectedCourtType] = useState('');
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);
  const [duration, setDuration] = useState('60');

  // Generate calendar days for the current month
  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  const calendarDays = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const timeSlots = [
    { time: '8:00 AM', available: true, court: 'Court 1' },
    { time: '9:00 AM', available: false, court: 'Court 1' },
    { time: '10:00 AM', available: true, court: 'Court 1' },
    { time: '11:00 AM', available: true, court: 'Court 1' },
    { time: '12:00 PM', available: false, court: 'Court 1' },
    { time: '1:00 PM', available: true, court: 'Court 1' },
    { time: '2:00 PM', available: true, court: 'Court 1' },
    { time: '3:00 PM', available: false, court: 'Court 1' },
    { time: '4:00 PM', available: true, court: 'Court 1' },
    { time: '5:00 PM', available: true, court: 'Court 1' },
    { time: '6:00 PM', available: true, court: 'Court 1' },
    { time: '7:00 PM', available: false, court: 'Court 1' },
  ];

  const handleTimeSlotClick = (time: string, available: boolean) => {
    if (!available) return;
    
    if (selectedTimeSlots.includes(time)) {
      setSelectedTimeSlots(selectedTimeSlots.filter(slot => slot !== time));
    } else {
      setSelectedTimeSlots([...selectedTimeSlots, time]);
    }
  };

  const handleDateClick = (day: number | null) => {
    if (day === null) return;
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(newDate);
  };

  const isDateSelected = (day: number | null) => {
    if (day === null) return false;
    return selectedDate.getDate() === day;
  };

  const calculateTotal = () => {
    const basePrice = selectedCourtType === 'tennis' ? 25 : selectedCourtType === 'pickleball' ? 20 : 25;
    const hours = parseInt(duration) / 60;
    return selectedTimeSlots.length * basePrice * hours;
  };

  const facilities = [
    { id: 'sunrise-valley', name: 'Sunrise Valley HOA', type: 'Tennis & Pickleball' },
    { id: 'downtown-tennis', name: 'Downtown Tennis Center', type: 'Tennis' },
    { id: 'riverside-tennis', name: 'Riverside Tennis Club', type: 'Tennis' },
    { id: 'westside-pickleball', name: 'Westside Pickleball Club', type: 'Pickleball' },
    { id: 'eastgate-sports', name: 'Eastgate Sports Complex', type: 'Tennis & Pickleball' }
  ];

  return (
    <>
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => navigate('/calendar')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <h1 className="text-xl font-medium">Quick Reservation</h1>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="outline">Player Mode</Badge>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters & Calendar */}
          <div className="lg:col-span-3">
            {/* Filters */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Booking Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Facility</label>
                    <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select facility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="downtown">Downtown Tennis Center</SelectItem>
                        <SelectItem value="sunrise-valley">Sunrise Valley HOA</SelectItem>
                        <SelectItem value="riverside">Riverside Tennis Club</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">Court Type</label>
                    <Select value={selectedCourtType} onValueChange={setSelectedCourtType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select court type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tennis">Tennis Court</SelectItem>
                        <SelectItem value="pickleball">Pickleball Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Duration</label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calendar */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Select Date
                </CardTitle>
                <CardDescription>
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, index) => (
                    <button
                      key={index}
                      className={`
                        h-10 w-full rounded-md text-sm font-medium transition-colors
                        ${day === null ? 'invisible' : ''}
                        ${isDateSelected(day) 
                          ? 'bg-green-600 text-white'
                          : day && day < currentDate.getDate() 
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'hover:bg-gray-100 text-gray-900'
                        }
                      `}
                      onClick={() => handleDateClick(day)}
                      disabled={day !== null && day < currentDate.getDate()}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Time Slots */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Available Time Slots
                </CardTitle>
                <CardDescription>
                  Select your preferred time slots for {selectedDate.toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {timeSlots.map((slot, index) => (
                    <button
                      key={index}
                      className={`
                        p-3 rounded-lg border text-sm font-medium transition-colors
                        ${!slot.available 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' 
                          : selectedTimeSlots.includes(slot.time)
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-900 border-gray-200 hover:border-green-300 hover:bg-green-50'
                        }
                      `}
                      onClick={() => handleTimeSlotClick(slot.time, slot.available)}
                      disabled={!slot.available}
                    >
                      <div>{slot.time}</div>
                      <div className="text-xs opacity-75">
                        {slot.available ? slot.court : 'Booked'}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Booking Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Booking Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedFacility && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <MapPin className="h-4 w-4" />
                      Facility
                    </div>
                    <p className="font-medium">
                      {selectedFacility === 'downtown' ? 'Downtown Tennis Center' :
                       selectedFacility === 'sunrise-valley' ? 'Sunrise Valley HOA' :
                       selectedFacility === 'riverside' ? 'Riverside Tennis Club' : ''}
                    </p>
                  </div>
                )}

                {selectedCourtType && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Users className="h-4 w-4" />
                      Court Type
                    </div>
                    <p className="font-medium capitalize">{selectedCourtType} Court</p>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Calendar className="h-4 w-4" />
                    Date
                  </div>
                  <p className="font-medium">{selectedDate.toLocaleDateString()}</p>
                </div>

                {selectedTimeSlots.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Clock className="h-4 w-4" />
                      Time Slots
                    </div>
                    <div className="space-y-1">
                      {selectedTimeSlots.map((slot, index) => (
                        <p key={index} className="text-sm font-medium">{slot}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-sm text-gray-600 mb-1">Duration</div>
                  <p className="font-medium">{parseInt(duration) / 60} hour{parseInt(duration) !== 60 ? 's' : ''}</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Slots ({selectedTimeSlots.length})</span>
                    <span>${selectedTimeSlots.length * 25}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Duration multiplier</span>
                    <span>×{parseInt(duration) / 60}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>${calculateTotal()}</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={selectedTimeSlots.length === 0 || !selectedFacility || !selectedCourtType}
                >
                  Confirm Reservation
                </Button>

                <div className="text-xs text-gray-500 text-center">
                  Free cancellation up to 2 hours before booking
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
    </>
  );
}