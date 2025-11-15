import React, { useState, useEffect } from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Users, Star, Calendar, Clipboard } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { facilitiesApi } from '../api/client';
import { toast } from 'sonner';

interface ClubInfoProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToBulletinBoard?: (clubId: string, clubName: string) => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  clubId: string;
}

interface FacilityData {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website: string;
  operatingHours: string;
  memberCount?: number;
  courts: {
    id: string;
    name: string;
    courtType: string;
    surfaceType: string;
    isIndoor: boolean;
  }[];
}

export function ClubInfo({
  onBack,
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToBulletinBoard = () => {},
  selectedFacilityId,
  onFacilityChange,
  sidebarCollapsed,
  onToggleSidebar,
  clubId
}: ClubInfoProps) {
  const [loading, setLoading] = useState(true);
  const [facility, setFacility] = useState<FacilityData | null>(null);

  useEffect(() => {
    if (clubId) {
      loadFacilityData();
    }
  }, [clubId]);

  const loadFacilityData = async () => {
    try {
      setLoading(true);

      const facilityResponse = await facilitiesApi.getById(clubId);
      if (facilityResponse.success && facilityResponse.data?.facility) {
        setFacility(facilityResponse.data.facility);

        // Load courts for this facility
        const courtsResponse = await facilitiesApi.getCourts(clubId);
        if (courtsResponse.success && courtsResponse.data?.courts) {
          setFacility(prev => prev ? { ...prev, courts: courtsResponse.data.courts } : null);
        }
      }
    } catch (error) {
      console.error('Error loading facility data:', error);
      toast.error('Failed to load facility information');
    } finally {
      setLoading(false);
    }
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
      <div className="min-h-screen bg-gray-50 flex">
        <UnifiedSidebar
          userType="player"
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
          onNavigateToCalendar={onNavigateToCalendar}
          onNavigateToClub={onNavigateToClub}
          onNavigateToHittingPartner={onNavigateToHittingPartner}
          onLogout={onLogout}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          currentPage="club-info"
        />

        <div className={`flex-1 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
          <div className="p-8 flex items-center justify-center min-h-screen">
            <Card className="max-w-md">
              <CardContent className="p-6 text-center">
                <h2 className="mb-2">Club not found</h2>
                <p className="text-gray-600 mb-4">The requested club information could not be found.</p>
                <Button onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="club-info"
      />
      
      <div className={`flex-1 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button variant="ghost" onClick={onBack} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1>Club Information</h1>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-6xl mx-auto">
          {/* Club Header */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/3">
                  <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white">
                    <div className="text-center">
                      <Users className="h-16 w-16 mx-auto mb-2" />
                      <p className="font-medium">{facility.name}</p>
                    </div>
                  </div>
                </div>
                <div className="md:w-2/3">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="mb-2">{facility.name}</h1>
                      <div className="flex items-center gap-2 mb-3">
                        {facility.memberCount && (
                          <Badge variant="secondary">
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
                    <Button onClick={onNavigateToCalendar}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Book Court
                    </Button>
                    <Button variant="outline" onClick={() => onNavigateToBulletinBoard(facility.id, facility.name)}>
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
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p>{facility.address}</p>
                    <p className="text-sm text-gray-600">{facility.city}, {facility.state} {facility.zipCode}</p>
                  </div>
                </div>
                {facility.phone && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p>{facility.phone}</p>
                    </div>
                  </div>
                )}
                {facility.email && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p>{facility.email}</p>
                    </div>
                  </div>
                )}
                {facility.website && (
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p>{facility.website}</p>
                    </div>
                  </div>
                )}
                {facility.operatingHours && (
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p>{facility.operatingHours}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Courts & Facilities */}
            <Card>
              <CardHeader>
                <CardTitle>Courts & Facilities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-3">Available Courts</h4>
                    {facility.courts && facility.courts.length > 0 ? (
                      <div className="space-y-2">
                        {facility.courts.map((court) => (
                          <div key={court.id} className="flex justify-between items-center p-2 border border-gray-200 rounded">
                            <div>
                              <p className="font-medium">{court.name}</p>
                              <p className="text-sm text-gray-600">
                                {court.surfaceType} • {court.isIndoor ? 'Indoor' : 'Outdoor'}
                              </p>
                            </div>
                            <Badge variant="outline">{court.courtType}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No courts information available</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}