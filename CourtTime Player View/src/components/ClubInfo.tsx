import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Users, Star, Calendar, Clipboard, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { facilitiesApi, playerProfileApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';


interface FacilityData {
  id: string;
  name: string;
  type: string;
  description: string;
  streetAddress: string;
  address?: string; // Legacy field
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website?: string;
  operatingHours: any;
  amenities: string[];
  logoUrl?: string;
  memberCount?: number;
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

export function ClubInfo() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [facility, setFacility] = useState<FacilityData | null>(null);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadFacilityData();
    }
  }, [clubId]);

  const loadFacilityData = async () => {
    try {
      setLoading(true);

      // Load user's member facilities to check if they're a member
      if (user?.id) {
        const profileResponse = await playerProfileApi.getProfile(user.id);
        console.log('ClubInfo - Profile API response:', profileResponse);

        // Check for facilities in the API response (handles both data.profile and direct profile)
        let facilities = profileResponse.data?.profile?.memberFacilities
          || profileResponse.data?.memberFacilities
          || [];

        // If API didn't return facilities, fall back to AuthContext
        if (facilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
          console.log('ClubInfo - Falling back to AuthContext memberFacilities:', user.memberFacilities);
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
        if (!streetAddress && rawFacility.address) {
          const addressParts = rawFacility.address.split(',').map((p: string) => p.trim());
          if (addressParts.length >= 1) streetAddress = addressParts[0];
          if (addressParts.length >= 2) city = addressParts[1];
          if (addressParts.length >= 3) {
            const stateZip = addressParts[2].split(' ').filter((p: string) => p);
            if (stateZip.length >= 1) state = stateZip[0];
            if (stateZip.length >= 2) zipCode = stateZip[1];
          }
        }

        const facilityData: FacilityData = {
          id: rawFacility.id,
          name: rawFacility.name || '',
          type: rawFacility.type || 'Tennis Facility',
          description: rawFacility.description || '',
          streetAddress,
          city,
          state,
          zipCode,
          phone: rawFacility.phone || '',
          email: rawFacility.email || '',
          website: rawFacility.website || '',
          operatingHours: rawFacility.operatingHours || {},
          amenities: rawFacility.amenities || [],
          logoUrl: rawFacility.logoUrl || '',
          memberCount: rawFacility.memberCount,
          courts: [],
        };

        setFacility(facilityData);

        // Load courts for this facility
        const courtsResponse = await facilitiesApi.getCourts(clubId);
        if (courtsResponse.success && courtsResponse.data?.courts) {
          // Filter to only show available/active courts (exclude maintenance/closed)
          const activeCourts = courtsResponse.data.courts.filter(
            (court: any) => court.status === 'active' || court.status === 'available' || !court.status
          );
          setFacility(prev => prev ? { ...prev, courts: activeCourts } : null);
        }
      }
    } catch (error) {
      console.error('Error loading facility data:', error);
      toast.error('Failed to load facility information');
    } finally {
      setLoading(false);
    }
  };

  const formatOperatingHours = (hours: any): string => {
    if (!hours || typeof hours !== 'object') return 'Hours not available';

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const formattedDays = days
      .filter(day => hours[day])
      .map(day => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours[day]}`)
      .join(', ');

    return formattedDays || 'Hours not available';
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

  return (
    <>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium">Club Information</h1>
            <NotificationBell />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-6xl mx-auto">
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
                      className="bg-green-600 hover:bg-green-700"
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
                      alt={`${facility.name} logo`}
                      className="w-full h-48 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center text-white">
                      <div className="text-center">
                        <Users className="h-16 w-16 mx-auto mb-2" />
                        <p className="font-medium">{facility.name}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="md:w-2/3">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-2xl font-semibold mb-2">{facility.name}</h1>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary">{facility.type}</Badge>
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
                  <p className="text-gray-600 mb-4">{facility.description || 'Professional tennis facility'}</p>

                  {/* Quick Actions */}
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => navigate('/calendar')}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Book Court
                    </Button>
                    <Button variant="outline" onClick={() => navigate(`/bulletin-board?clubId=${facility.id}&clubName=${encodeURIComponent(facility.name)}`)}>
                      <Clipboard className="h-4 w-4 mr-2" />
                      Bulletin Board
                    </Button>
                    {facility.phone && (
                      <Button variant="outline" onClick={() => window.open(`tel:${facility.phone}`)}>
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
                {(facility.streetAddress || facility.city) && (
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-3 mt-1" />
                    <div>
                      {facility.streetAddress && <p>{facility.streetAddress}</p>}
                      <p className="text-sm text-gray-600">
                        {[facility.city, facility.state].filter(Boolean).join(', ')}
                        {facility.zipCode && ` ${facility.zipCode}`}
                      </p>
                    </div>
                  </div>
                )}
                {facility.phone && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={`tel:${facility.phone}`} className="text-green-600 hover:underline">
                      {facility.phone}
                    </a>
                  </div>
                )}
                {facility.email && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={`mailto:${facility.email}`} className="text-green-600 hover:underline">
                      {facility.email}
                    </a>
                  </div>
                )}
                {facility.website && (
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 text-gray-400 mr-3" />
                    <a href={facility.website} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                      {facility.website}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      if (hours) {
                        if (typeof hours === 'string') {
                          hoursDisplay = hours;
                        } else if (typeof hours === 'object') {
                          if (hours.closed) {
                            hoursDisplay = 'Closed';
                          } else if (hours.open && hours.close) {
                            hoursDisplay = `${hours.open} - ${hours.close}`;
                          }
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

            {/* Courts */}
            <Card>
              <CardHeader>
                <CardTitle>Available Courts</CardTitle>
              </CardHeader>
              <CardContent>
                {facility.courts && facility.courts.length > 0 ? (
                  <div className="space-y-3">
                    {facility.courts.map((court) => (
                      <div key={court.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{court.name}</p>
                          <p className="text-sm text-gray-600">
                            {court.surfaceType} • {court.isIndoor ? 'Indoor' : 'Outdoor'}
                            {court.hasLights && ' • Lights'}
                          </p>
                        </div>
                        <Badge variant="outline">{court.courtType}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No courts information available</p>
                )}
              </CardContent>
            </Card>

            {/* Amenities */}
            <Card>
              <CardHeader>
                <CardTitle>Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                {facility.amenities && facility.amenities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {facility.amenities.map((amenity, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No amenities listed</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
    </>
  );
}