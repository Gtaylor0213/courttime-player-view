import React from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Users, Star, Calendar, Clipboard } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';

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

interface Club {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  hours: string;
  memberCount: number;
  rating: number;
  image: string;
  courts: {
    type: string;
    count: number;
  }[];
}

// Sample club data
const clubsData: { [key: string]: Club } = {
  'riverside-tennis': {
    id: 'riverside-tennis',
    name: 'Riverside Tennis Club',
    description: 'Premier tennis facility offering world-class courts and professional coaching. Our club has been serving the community for over 30 years with excellent facilities and a welcoming atmosphere.',
    address: '1234 Riverside Drive, Springfield, ST 12345',
    phone: '(555) 123-4567',
    email: 'info@riversidetc.com',
    website: 'www.riversidetc.com',
    hours: 'Mon-Sun: 6:00 AM - 10:00 PM',
    memberCount: 450,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1606151595697-648a9a840cdc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjBjbHViJTIwZmFjaWxpdHl8ZW58MXx8fHwxNzU5Nzk3NTE1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    courts: [
      { type: 'Hard Court', count: 8 },
      { type: 'Clay Court', count: 4 },
      { type: 'Indoor Court', count: 2 }
    ]
  },
  'downtown-racquet': {
    id: 'downtown-racquet',
    name: 'Downtown Racquet Club',
    description: 'Modern urban sports facility featuring state-of-the-art courts and equipment. Located in the heart of downtown, we offer convenient access and flexible membership options.',
    address: '567 Main Street, Downtown, ST 12345',
    phone: '(555) 987-6543',
    email: 'hello@downtownrc.com',
    website: 'www.downtownracquet.com',
    hours: 'Mon-Fri: 5:30 AM - 11:00 PM, Sat-Sun: 7:00 AM - 9:00 PM',
    memberCount: 320,
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1628308256079-9a1684f2cc64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBzcG9ydHMlMjBjZW50ZXIlMjByYWNxdWV0fGVufDF8fHx8MTc1OTc5NzUxOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    courts: [
      { type: 'Hard Court', count: 6 },
      { type: 'Squash Court', count: 3 },
      { type: 'Badminton Court', count: 2 }
    ]
  }
};

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
  const club = clubsData[clubId];

  if (!club) {
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
                  <ImageWithFallback
                    src={club.image}
                    alt={club.name}
                    className="w-full h-48 object-cover rounded-lg bg-gray-100 flex items-center justify-center"
                  />
                </div>
                <div className="md:w-2/3">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="mb-2">{club.name}</h1>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 fill-current" />
                          <span className="ml-1">{club.rating}</span>
                        </div>
                        <Badge variant="secondary">
                          <Users className="h-3 w-3 mr-1" />
                          {club.memberCount} members
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600 mb-4">{club.description}</p>
                  
                  {/* Quick Actions */}
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={onNavigateToCalendar}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Book Court
                    </Button>
                    <Button variant="outline" onClick={() => onNavigateToBulletinBoard(club.id, club.name)}>
                      <Clipboard className="h-4 w-4 mr-2" />
                      Bulletin Board
                    </Button>
                    <Button variant="outline">
                      <Phone className="h-4 w-4 mr-2" />
                      Call Club
                    </Button>
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
                    <p>{club.address}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Phone className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p>{club.phone}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Mail className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p>{club.email}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Globe className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p>{club.website}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p>{club.hours}</p>
                  </div>
                </div>
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
                    <div className="space-y-2">
                      {club.courts.map((court, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span>{court.type}</span>
                          <Badge variant="outline">{court.count} courts</Badge>
                        </div>
                      ))}
                    </div>
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