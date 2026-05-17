import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Users, Star, Calendar, Clipboard, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { facilitiesApi, playerProfileApi, facilityLocationsApi, courtConfigApi } from '../api/client';
import { sortCourtsForDisplay } from '../../shared/utils/courtDisplayOrder';
import { safeDisplayText } from '../../shared/utils/safeDisplayText';
import {
  courtScheduleRowsToOperatingHoursMap,
  groupOperatingHoursForCompactDisplay,
  type OperatingHoursMap,
} from '../../shared/utils/operatingHours';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface FacilityData {
  id: string;
  name: string;
  type: string;
  description: string;
  primaryLocationLabel?: string;
  streetAddress: string;
  address?: string; // Legacy field
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website?: string;
  operatingHours: any;
  logoUrl?: string;
  memberCount?: number;
  // Booking rules (shown to admitted members only)
  generalRules?: string;
  bookingRules?: any;
  advanceBookingDays?: number;
  peakHoursPolicy?: any;
  courts: {
    id: string;
    name: string;
    courtNumber: number;
    courtType: string;
    surfaceType: string;
    isIndoor: boolean;
    hasLights: boolean;
    status: string;
  }[];
}

function CourtWeeklyHours({ hours }: { hours: OperatingHoursMap }) {
  if (!hours || Object.keys(hours).length === 0) {
    return <p className="text-xs text-gray-500 mt-2">Hours not available</p>;
  }
  const groups = groupOperatingHoursForCompactDisplay(hours, 'full');
  return (
    <div className="mt-2 pt-2 border-t border-gray-200 text-left">
      <p className="text-xs font-medium text-gray-500 mb-1">Court Hours</p>
      <div className="space-y-0.5">
        {groups.map((row, idx) => (
          <div key={`${row.dayRangeLabel}-${idx}`} className="flex justify-between text-xs gap-2">
            <span className="text-gray-600 shrink-0">{row.dayRangeLabel}</span>
            <span className={row.closed ? 'text-gray-400 italic' : 'text-gray-700'}>
              {row.hoursLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClubInfo() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [facility, setFacility] = useState<FacilityData | null>(null);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [secondaryLocations, setSecondaryLocations] = useState<any[]>([]);
  const [courtOperatingHours, setCourtOperatingHours] = useState<Record<string, OperatingHoursMap>>({});
  const [courtHoursLoading, setCourtHoursLoading] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadFacilityData();
    }
  }, [clubId, user?.id]);

  const loadCourtOperatingHours = async (courts: FacilityData['courts']) => {
    if (!courts.length) {
      setCourtOperatingHours({});
      return;
    }
    setCourtHoursLoading(true);
    try {
      const results = await Promise.all(
        courts.map(async (court) => {
          try {
            const response = await courtConfigApi.getSchedule(court.id);
            if (response.success && Array.isArray(response.data?.schedule)) {
              return {
                courtId: court.id,
                hours: courtScheduleRowsToOperatingHoursMap(response.data.schedule),
              };
            }
          } catch {
            /* omit court hours on failure */
          }
          return { courtId: court.id, hours: {} as OperatingHoursMap };
        })
      );
      const byCourtId: Record<string, OperatingHoursMap> = {};
      results.forEach(({ courtId, hours }) => {
        byCourtId[courtId] = hours;
      });
      setCourtOperatingHours(byCourtId);
    } finally {
      setCourtHoursLoading(false);
    }
  };

  const loadFacilityData = async () => {
    try {
      setLoading(true);
      setCourtOperatingHours({});

      // Load user's member facilities to check if they're a member
      if (user?.id) {
        const profileResponse = await playerProfileApi.getProfile(user.id);

        // Check for facilities in the API response (handles both data.profile and direct profile)
        let facilities = profileResponse.data?.profile?.memberFacilities
          || profileResponse.data?.memberFacilities
          || [];

        // If API didn't return facilities, fall back to AuthContext
        if (facilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
          // Create facility objects from IDs
          facilities = user.memberFacilities.map(facilityId => ({
            facilityId,
            facilityName: '',
            membershipType: 'Member',
            status: 'active'
          }));
        }

        setMemberFacilities(facilities);

        // Check if user is a member of this facility (from API response or AuthContext fallback)
        const isActiveMember = facilities.some(
          (f: any) => f.facilityId === clubId && f.status === 'active'
        ) || (user.memberFacilities && user.memberFacilities.includes(clubId));
        setIsMember(isActiveMember);
      }

      const facilityResponse = await facilitiesApi.getById(clubId);
      if (facilityResponse.success && facilityResponse.data?.facility) {
        const rawFacility = facilityResponse.data.facility;

        // Parse address - handle both new separate fields and legacy single address field
        let streetAddress = rawFacility.streetAddress || '';
        let city = rawFacility.city || '';
        let state = rawFacility.state || '';
        let zipCode = rawFacility.zipCode || '';

        // If address is stored as a single field, try to parse it
        if (!streetAddress && rawFacility.address && typeof rawFacility.address === 'string') {
          const addressParts = rawFacility.address.split(',').map((p: string) => p.trim());
          if (addressParts.length >= 1) streetAddress = addressParts[0];
          if (addressParts.length >= 2) city = addressParts[1];
          if (addressParts.length >= 3) {
            const stateZip = addressParts[2].split(' ').filter((p: string) => p);
            if (stateZip.length >= 1) state = stateZip[0];
            if (stateZip.length >= 2) zipCode = stateZip[1];
          }
        }

        // Parse bookingRules JSON if stored as a string
        let parsedBookingRules = rawFacility.bookingRules;
        if (typeof parsedBookingRules === 'string') {
          try { parsedBookingRules = JSON.parse(parsedBookingRules); } catch { parsedBookingRules = null; }
        }
        if (parsedBookingRules && typeof parsedBookingRules === 'object' && parsedBookingRules.peakHoursSlots != null) {
          const ph = parsedBookingRules.peakHoursSlots;
          if (typeof ph === 'string' && ph.trim()) {
            try {
              const p = JSON.parse(ph);
              if (Array.isArray(p)) parsedBookingRules.peakHoursSlots = p;
            } catch { /* keep string */ }
          }
        }

        let operatingHours = rawFacility.operatingHours ?? {};
        if (typeof operatingHours === 'string' && operatingHours.trim()) {
          try {
            operatingHours = JSON.parse(operatingHours);
          } catch {
            operatingHours = {};
          }
        }
        if (operatingHours == null || typeof operatingHours !== 'object') {
          operatingHours = {};
        }

        const facilityData: FacilityData = {
          id: rawFacility.id,
          name: rawFacility.name || '',
          type: rawFacility.type || rawFacility.facilityType || 'Tennis Facility',
          description: rawFacility.description || '',
          primaryLocationLabel: rawFacility.primaryLocationLabel || '',
          streetAddress,
          city,
          state,
          zipCode,
          phone: rawFacility.phone || '',
          email: rawFacility.email || '',
          website: rawFacility.website || '',
          operatingHours,
          logoUrl: rawFacility.logoUrl || '',
          memberCount: rawFacility.memberCount,
          generalRules: rawFacility.generalRules || '',
          bookingRules: parsedBookingRules,
          advanceBookingDays: rawFacility.advanceBookingDays,
          peakHoursPolicy: rawFacility.peakHoursPolicy,
          courts: [],
        };

        setFacility(facilityData);

        // Load secondary locations (members only — loaded here but only rendered if isMember)
        try {
          const locResponse = await facilityLocationsApi.getAll(clubId!);
          if (locResponse.success && locResponse.data?.locations) {
            setSecondaryLocations(locResponse.data.locations);
          }
        } catch { /* silently ignore if not available */ }

        // Load courts for this facility
        const courtsResponse = await facilitiesApi.getCourts(clubId);
        if (courtsResponse.success && courtsResponse.data?.courts) {
          // Filter to only show available/active courts (exclude maintenance/closed)
          const activeCourts = courtsResponse.data.courts.filter(
            (court: any) => court.status === 'active' || court.status === 'available' || !court.status
          );
          const sortedCourts = sortCourtsForDisplay(activeCourts);
          setFacility(prev => prev ? { ...prev, courts: sortedCourts } : null);
          await loadCourtOperatingHours(sortedCourts);
        } else {
          setCourtOperatingHours({});
        }
      }
    } catch (error) {
      console.error('Error loading facility data:', error);
      toast.error('Failed to load facility information');
    } finally {
      setLoading(false);
    }
  };

  const renderRuleValue = (value: any): string | null => {
    const s = safeDisplayText(value);
    return s === '' ? null : s;
  };

  const renderSafeText = (value: any): string => safeDisplayText(value);

  /** Hours label for max booking duration; aligns with admin `maxReservationDuration` (minutes) and legacy flat keys. */
  const getMaxBookingDurationHoursLabel = (bookingRules: any): string | null => {
    if (!bookingRules || typeof bookingRules !== 'object') return null;
    const mrd = bookingRules.maxReservationDuration;
    if (mrd && typeof mrd === 'object') {
      if (mrd.enabled === false) return null;
      const limitMin = Number(mrd.limit);
      if (Number.isFinite(limitMin) && limitMin > 0 && mrd.enabled !== false) {
        const hours = limitMin / 60;
        const label = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
        return renderRuleValue(label);
      }
    }
    if (bookingRules.maxReservationDurationEnabled === false) return null;
    if (bookingRules.maxReservationDurationEnabled === true) {
      const flatMin = Number(bookingRules.maxReservationDurationMinutes);
      if (Number.isFinite(flatMin) && flatMin > 0) {
        const totalMin = flatMin <= 12 ? Math.round(flatMin * 60) : Math.round(flatMin);
        const hours = totalMin / 60;
        const label = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
        return renderRuleValue(label);
      }
    }
    if (bookingRules.maxBookingDurationUnlimited === true) return null;
    if (bookingRules.maxBookingDurationUnlimited === false) {
      return renderRuleValue(bookingRules.maxBookingDurationHours);
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading facility information...</div>
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="mb-2">Club not found</h2>
            <p className="text-gray-600 mb-4">The requested club information could not be found.</p>
            <Button onClick={() => navigate('/calendar')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canViewClubDescription = Boolean(
    user?.adminFacilities?.includes(clubId!) ||
      memberFacilities.some((f: any) => f.facilityId === clubId && f.status === 'active') ||
      (user?.memberFacilities?.includes(clubId!) ?? false)
  );

  const facilityName = safeDisplayText(facility.name) || 'Club';
  const facilityType = safeDisplayText(facility.type) || 'Tennis Facility';
  const peakHoursSlotsList = (() => {
    const raw = facility.bookingRules?.peakHoursSlots;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  const maxBookingDurationHoursDisplay = getMaxBookingDurationHoursLabel(facility.bookingRules);

  return (
    <>
        {/* Content */}
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-medium text-gray-900">Club Information</h1>
            <NotificationBell />
          </div>
          {/* Non-Member Notice */}
          {!isMember && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900 mb-1">Not a Member</h3>
                    <p className="text-sm text-green-800 mb-3">
                      You're viewing information for a facility you're not currently a member of. Request membership to access courts and book sessions.
                    </p>
                    <Button
                      onClick={() => navigate('/profile')}
                      size="sm"
                    >
                      Request Membership
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Club Header */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/3">
                  {facility.logoUrl ? (
                    <img
                      src={facility.logoUrl}
                      alt={`${facilityName} logo`}
                      className="w-full h-48 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center text-white">
                      <div className="text-center">
                        <Users className="h-16 w-16 mx-auto mb-2" />
                        <p className="font-medium">{facilityName}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="md:w-2/3">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-semibold mb-2">{facilityName}</h1>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary">{facilityType}</Badge>
                        {facility.memberCount && (
                          <Badge variant="outline">
                            <Users className="h-3 w-3 mr-1" />
                            {facility.memberCount} members
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {facility.courts?.length || 0} courts
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {canViewClubDescription ? (
                    facility.description ? (
                      <p className="text-gray-600 mb-4">{safeDisplayText(facility.description)}</p>
                    ) : null
                  ) : (
                    <p className="text-gray-500 mb-4">Join this facility to view the club description</p>
                  )}

                  {/* Quick Actions */}
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => navigate('/calendar')}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Book Court
                    </Button>
                    <Button variant="outline" onClick={() => navigate(`/bulletin-board?clubId=${facility.id}&clubName=${encodeURIComponent(facilityName)}`)}>
                      <Clipboard className="h-4 w-4 mr-2" />
                      Bulletin Board
                    </Button>
                    {safeDisplayText(facility.phone) && (
                      <Button variant="outline" onClick={() => window.open(`tel:${safeDisplayText(facility.phone)}`)}>
                        <Phone className="h-4 w-4 mr-2" />
                        Call Club
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(safeDisplayText(facility.streetAddress) || safeDisplayText(facility.city)) && (
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-3 mt-1" />
                    <div>
                      {safeDisplayText(facility.primaryLocationLabel) && (
                        <p className="text-sm font-bold text-gray-900">
                          {safeDisplayText(facility.primaryLocationLabel)}
                        </p>
                      )}
                      {safeDisplayText(facility.streetAddress) && (
                        <p className="text-sm text-gray-600">{safeDisplayText(facility.streetAddress)}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        {[safeDisplayText(facility.city), safeDisplayText(facility.state)].filter(Boolean).join(', ')}
                        {safeDisplayText(facility.zipCode) && ` ${safeDisplayText(facility.zipCode)}`}
                      </p>
                    </div>
                  </div>
                )}
                {safeDisplayText(facility.phone) && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={`tel:${safeDisplayText(facility.phone)}`} className="text-green-600 hover:underline">
                      {safeDisplayText(facility.phone)}
                    </a>
                  </div>
                )}
                {safeDisplayText(facility.email) && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={`mailto:${safeDisplayText(facility.email)}`} className="text-green-600 hover:underline">
                      {safeDisplayText(facility.email)}
                    </a>
                  </div>
                )}
                {safeDisplayText(facility.website) && (
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={safeDisplayText(facility.website)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                      {safeDisplayText(facility.website)}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Additional Locations (members only) */}
            {isMember && secondaryLocations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Additional Locations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {secondaryLocations.map((loc: any) => (
                    <div key={loc.id} className="space-y-0.5">
                      <p className="text-sm font-bold text-gray-900">{safeDisplayText(loc.locationName)}</p>
                      <p className="text-sm text-gray-600">{safeDisplayText(loc.streetAddress)}</p>
                      <p className="text-sm text-gray-600">
                        {safeDisplayText(loc.city)}, {safeDisplayText(loc.state)} {safeDisplayText(loc.zipCode)}
                      </p>
                      {safeDisplayText(loc.phone) && <p className="text-sm text-gray-500">{safeDisplayText(loc.phone)}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Operating Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Operating Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                {facility.operatingHours && typeof facility.operatingHours === 'object' && Object.keys(facility.operatingHours).length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                      const hours = facility.operatingHours[day];
                      let hoursDisplay = 'Closed';
                      if (hours != null && hours !== '') {
                        if (typeof hours === 'string') {
                          hoursDisplay = safeDisplayText(hours) || 'Closed';
                        } else if (typeof hours === 'object') {
                          const h = hours as Record<string, unknown>;
                          const closedRaw = h.closed;
                          const closedTruthy =
                            closedRaw === true ||
                            closedRaw === 1 ||
                            (typeof closedRaw === 'string' &&
                              ['true', 'yes', '1'].includes(closedRaw.trim().toLowerCase()));
                          if (closedTruthy) {
                            hoursDisplay = 'Closed';
                          } else {
                            const open = h.open ?? h.openTime ?? h.open_time;
                            const close = h.close ?? h.closeTime ?? h.close_time;
                            if (open != null && close != null) {
                              const fmt = (t: unknown) => {
                                const s = safeDisplayText(t).trim();
                                if (!s) return '';
                                const [hh, mm] = s.split(':').map(Number);
                                if (!Number.isFinite(hh)) return s;
                                const period = hh >= 12 ? 'PM' : 'AM';
                                const h12 = hh % 12 || 12;
                                return Number.isFinite(mm)
                                  ? `${h12}:${String(mm).padStart(2, '0')} ${period}`
                                  : `${h12} ${period}`;
                              };
                              const a = fmt(open);
                              const b = fmt(close);
                              if (a && b) hoursDisplay = `${a} - ${b}`;
                            }
                          }
                        } else {
                          hoursDisplay = safeDisplayText(hours) || 'Closed';
                        }
                      }
                      return (
                        <div key={day} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                          <span className="font-medium capitalize text-gray-700">{day}</span>
                          <span className="text-gray-600">{hoursDisplay}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Hours not available</p>
                )}
              </CardContent>
            </Card>

            {/* Booking Rules — members only */}
            {isMember && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Booking Rules &amp; Policies
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* General rules text */}
                  {facility.generalRules && (
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{renderSafeText(facility.generalRules)}</p>
                    </div>
                  )}
                  {/* Structured rules from booking configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {(facility.bookingRules?.advanceBookingDaysUnlimited === false && renderRuleValue(facility.bookingRules?.advanceBookingDays)) && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-gray-700 min-w-[180px]">Book up to:</span>
                        <span className="text-gray-600">{renderRuleValue(facility.bookingRules.advanceBookingDays)} days in advance</span>
                      </div>
                    )}
                    {maxBookingDurationHoursDisplay && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-gray-700 min-w-[180px]">Max booking duration:</span>
                        <span className="text-gray-600">{maxBookingDurationHoursDisplay} hours</span>
                      </div>
                    )}
                    {(facility.bookingRules?.maxBookingsPerWeekUnlimited === false && renderRuleValue(facility.bookingRules?.maxBookingsPerWeek)) && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-gray-700 min-w-[180px]">Max bookings per week:</span>
                        <span className="text-gray-600">{renderRuleValue(facility.bookingRules.maxBookingsPerWeek)}</span>
                      </div>
                    )}
                    {facility.bookingRules?.noOverlappingReservations && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-gray-700 min-w-[180px]">Overlapping bookings:</span>
                        <span className="text-gray-600">Not allowed</span>
                      </div>
                    )}
                  </div>
                  {/* Peak hours */}
                  {facility.bookingRules?.hasPeakHours && peakHoursSlotsList.length > 0 && (
                    <div>
                      <p className="font-medium text-gray-700 mb-2">Peak Hours</p>
                      <div className="space-y-2">
                        {peakHoursSlotsList.map((slot: any, idx: number) => {
                          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          const dayList = Array.isArray(slot.days) ? slot.days : [];
                          const days = dayList.map((d: number) => dayNames[d]).join(', ');
                          const fmt = (t: unknown) => {
                            const s = safeDisplayText(t).trim();
                            if (!s) return '';
                            const [h, m] = s.split(':').map(Number);
                            if (!Number.isFinite(h)) return s;
                            const period = h >= 12 ? 'PM' : 'AM';
                            return Number.isFinite(m)
                              ? `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
                              : `${h % 12 || 12} ${period}`;
                          };
                          return (
                            <div key={idx} className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                              <p className="font-medium text-amber-800">{fmt(slot.startTime)} – {fmt(slot.endTime)}{days ? ` · ${days}` : ''}</p>
                              {!slot.rules?.maxBookingsPerDayUnlimited && slot.rules?.maxBookingsPerDay && (
                                <p className="text-amber-700 mt-1">Max {renderSafeText(slot.rules.maxBookingsPerDay)} booking(s) per day during peak hours</p>
                              )}
                              {!slot.rules?.maxDurationUnlimited && slot.rules?.maxDurationHours && (
                                <p className="text-amber-700">Max duration: {renderSafeText(slot.rules.maxDurationHours)} hours</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!facility.generalRules && !facility.bookingRules && (
                    <p className="text-sm text-gray-500">No booking rules have been configured for this facility.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Courts */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Courts ({facility.courts?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {facility.courts && facility.courts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {facility.courts.map((court) => (
                      <div key={court.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="text-center">
                          <p className="font-medium text-sm">{safeDisplayText(court.name)}</p>
                          <Badge variant="outline" className="mt-1 text-[10px]">{safeDisplayText(court.courtType)}</Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            {safeDisplayText(court.surfaceType)} • {court.isIndoor ? 'Indoor' : 'Outdoor'}
                            {court.hasLights && ' • Lights'}
                          </p>
                        </div>
                        {courtHoursLoading ? (
                          <p className="text-xs text-gray-400 mt-2 text-center">Loading hours...</p>
                        ) : (
                          <CourtWeeklyHours hours={courtOperatingHours[court.id] || {}} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No courts information available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
    </>
  );
}