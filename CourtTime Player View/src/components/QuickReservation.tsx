import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { facilitiesApi, bookingApi } from '../api/client';
import { ArrowLeft, MapPin, Clock, Calendar, Filter, AlertTriangle } from 'lucide-react';

interface FacilityData {
  id: string;
  name: string;
  type: string;
  status?: string;
  courts: Array<{ id: string; name: string; type: string; status?: string }>;
  operatingHours?: any;
  timezone?: string;
}

export function QuickReservation() {
  const navigate = useNavigate();
  const { selectedFacilityId, setSelectedFacilityId } = useAppContext();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [selectedCourtType, setSelectedCourtType] = useState('all');
  const [facilities, setFacilities] = useState<FacilityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Fetch user's facilities with courts
  useEffect(() => {
    const fetchFacilities = async () => {
      const allFacilityIds = Array.from(new Set([
        ...(user?.memberFacilities || []),
        ...(user?.adminFacilities || []),
      ]));

      if (allFacilityIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const facilitiesData: FacilityData[] = [];

        for (const facilityId of allFacilityIds) {
          const facilityResponse = await facilitiesApi.getById(facilityId);
          if (facilityResponse.success && facilityResponse.data) {
            const facility = facilityResponse.data.facility;

            const courtsResponse = await facilitiesApi.getCourts(facilityId);
            const courts = courtsResponse.success && courtsResponse.data?.courts
              ? courtsResponse.data.courts
                  .filter((court: any) => {
                    const s = (court.status || 'available').toLowerCase();
                    return s === 'available' || s === 'active';
                  })
                  .map((court: any) => ({
                    id: court.id,
                    name: court.name,
                    type: court.courtType?.toLowerCase() || 'tennis',
                    status: court.status,
                  }))
              : [];

            facilitiesData.push({
              id: facility.id,
              name: facility.name,
              type: facility.type || facility.facilityType || 'Tennis Facility',
              status: facility.status || 'active',
              courts,
              operatingHours: facility.operatingHours,
              timezone: facility.timezone || 'America/New_York',
            });
          }
        }

        setFacilities(facilitiesData);
      } catch (error) {
        console.error('Error fetching facilities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFacilities();
  }, [user?.memberFacilities, user?.adminFacilities]);

  // Fetch bookings for selected facility and date
  useEffect(() => {
    const fetchBookings = async () => {
      if (!selectedFacilityId || !selectedDate) return;

      try {
        setLoadingBookings(true);
        const result = await bookingApi.getByFacilityAndDate(selectedFacilityId, selectedDate);
        if (result.success && result.data?.bookings) {
          setBookings(result.data.bookings);
        } else {
          setBookings([]);
        }
      } catch (error) {
        console.error('Error fetching bookings:', error);
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    };

    fetchBookings();
  }, [selectedFacilityId, selectedDate]);

  const currentFacility = facilities.find(f => f.id === selectedFacilityId);
  const isFacilitySuspended = currentFacility?.status === 'suspended' || currentFacility?.status === 'closed';

  // Filter courts by selected type
  const filteredCourts = currentFacility?.courts.filter(court => {
    if (selectedCourtType === 'all') return true;
    return court.type === selectedCourtType;
  }) || [];

  // Get unique court types for filter
  const courtTypes = Array.from(new Set(currentFacility?.courts.map(c => c.type) || []));

  // Get operating hours for selected date
  const getOperatingHours = () => {
    const oh = currentFacility?.operatingHours;
    if (!oh) return { open: '06:00', close: '21:00' };
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const date = new Date(selectedDate + 'T12:00:00');
    const dayName = dayNames[date.getDay()];
    const dayConfig = oh[dayName];
    if (!dayConfig || dayConfig.closed) return null; // facility closed this day
    return { open: dayConfig.open || '06:00', close: dayConfig.close || '21:00' };
  };

  const operatingHours = getOperatingHours();

  // Generate available time slots based on operating hours
  const generateTimeSlots = () => {
    if (!operatingHours) return [];
    const openHour = parseInt(operatingHours.open.split(':')[0], 10);
    const closeHour = parseInt(operatingHours.close.split(':')[0], 10);
    const slots: string[] = [];
    for (let h = openHour; h < closeHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Check if a court is booked at a given time
  const isCourtBookedAt = (courtName: string, timeSlot: string) => {
    const slotMinutes = parseInt(timeSlot.split(':')[0]) * 60 + parseInt(timeSlot.split(':')[1]);
    return bookings.some(b => {
      if (b.courtName !== courtName && b.court_name !== courtName) return false;
      const startParts = (b.startTime || b.start_time || '').split(':');
      const endParts = (b.endTime || b.end_time || '').split(':');
      if (startParts.length < 2 || endParts.length < 2) return false;
      const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      return slotMinutes >= startMin && slotMinutes < endMin;
    });
  };

  // Format time to 12-hour
  const formatTime = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  // Navigate to calendar with the selected facility
  const handleBookSlot = (courtId: string) => {
    setSelectedFacilityId(currentFacility?.id || selectedFacilityId);
    navigate('/calendar');
  };

  // Generate date options (next 14 days)
  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

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
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Facility Status Banner */}
        {isFacilitySuspended && currentFacility && (
          <div className={`mb-4 rounded-lg px-4 py-3 flex items-center gap-3 ${
            currentFacility.status === 'suspended'
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              {currentFacility.status === 'suspended'
                ? `${currentFacility.name} is temporarily suspended. Reservations are not available.`
                : `${currentFacility.name} is closed. Reservations are not available.`
              }
            </span>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Find Available Courts
            </CardTitle>
            <CardDescription>Select your facility, date, and court type to see availability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Facility</label>
                <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Date</label>
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dateOptions.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Court Type</label>
                <Select value={selectedCourtType} onValueChange={setSelectedCourtType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Courts</SelectItem>
                    {courtTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No facility selected */}
        {!currentFacility && facilities.length > 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Select a facility to view court availability.</p>
            </CardContent>
          </Card>
        )}

        {/* Facility closed on this day */}
        {currentFacility && !operatingHours && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">{currentFacility.name} is closed on this day.</p>
            </CardContent>
          </Card>
        )}

        {/* Court Availability */}
        {currentFacility && operatingHours && filteredCourts.length > 0 && (
          <div className="space-y-4">
            {filteredCourts.map(court => {
              const availableSlots = timeSlots.filter(slot => !isCourtBookedAt(court.name, slot));
              const totalSlots = timeSlots.length;
              const availableCount = availableSlots.length;

              return (
                <Card key={court.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{court.name}</h3>
                        <Badge variant="outline" className="capitalize">{court.type}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                          {loadingBookings ? 'Loading...' : `${availableCount}/${totalSlots} slots available`}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => handleBookSlot(court.id)}
                          disabled={isFacilitySuspended || availableCount === 0}
                        >
                          Book on Calendar
                        </Button>
                      </div>
                    </div>

                    {/* Time slot grid */}
                    {!loadingBookings && (
                      <div className="flex flex-wrap gap-1.5">
                        {timeSlots.map(slot => {
                          const booked = isCourtBookedAt(court.name, slot);
                          return (
                            <div
                              key={slot}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                booked
                                  ? 'bg-gray-100 text-gray-400 line-through'
                                  : 'bg-green-50 text-green-700 border border-green-200'
                              }`}
                            >
                              {formatTime(slot)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* No courts */}
        {currentFacility && operatingHours && filteredCourts.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <p>No courts available matching your filters.</p>
            </CardContent>
          </Card>
        )}

        {/* No facilities */}
        {facilities.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No Facility Memberships</p>
              <p className="mt-2">Join a facility to view court availability.</p>
              <Button onClick={() => navigate('/profile')} className="mt-4">
                Request Membership
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
