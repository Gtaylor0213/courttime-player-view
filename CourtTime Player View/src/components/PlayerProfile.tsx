import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ArrowLeft, Save, User, Building2, Plus, CheckCircle, Clock, XCircle } from 'lucide-react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { useAuth } from '../contexts/AuthContext';
import { playerProfileApi, facilitiesApi } from '../api/client';
import { toast } from 'sonner';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

interface PlayerProfileProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToPlayerDashboard?: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToCalendar?: () => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function PlayerProfile({
  onBack,
  onLogout,
  onNavigateToProfile = () => {},
  onNavigateToPlayerDashboard = () => {},
  onNavigateToClub = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToCalendar = () => {},
  sidebarCollapsed = false,
  onToggleSidebar
}: PlayerProfileProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Facility search
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  const [facilitySearchResults, setFacilitySearchResults] = useState<any[]>([]);
  const [isSearchingFacilities, setIsSearchingFacilities] = useState(false);
  const [requestingMembership, setRequestingMembership] = useState<string | null>(null);

  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    skillLevel: '',
    ntrpRating: null as number | null,
    playingHand: '',
    playingStyle: '',
    preferredCourtSurface: '',
    bio: '',
    yearsPlaying: null as number | null,
    memberFacilities: [] as any[]
  });

  useEffect(() => {
    if (user?.id) {
      loadProfile();
    }
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await playerProfileApi.getProfile(user.id);

      if (response.success && response.data?.profile) {
        const profile = response.data.profile;
        setProfileData({
          fullName: profile.fullName || '',
          email: profile.email || '',
          skillLevel: profile.skillLevel || '',
          ntrpRating: profile.ntrpRating || null,
          playingHand: profile.playingHand || '',
          playingStyle: profile.playingStyle || '',
          preferredCourtSurface: profile.preferredCourtSurface || '',
          bio: profile.bio || '',
          yearsPlaying: profile.yearsPlaying || null,
          memberFacilities: profile.memberFacilities || []
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);
      const updates = {
        skillLevel: profileData.skillLevel || undefined,
        ntrpRating: profileData.ntrpRating || undefined,
        playingHand: profileData.playingHand || undefined,
        playingStyle: profileData.playingStyle || undefined,
        preferredCourtSurface: profileData.preferredCourtSurface || undefined,
        bio: profileData.bio || undefined,
        yearsPlaying: profileData.yearsPlaying || undefined
      };

      const response = await playerProfileApi.updateProfile(user.id, updates);

      if (response.success) {
        toast.success('Profile updated successfully');
        setIsEditing(false);
        loadProfile(); // Reload to get updated data
      } else {
        toast.error(response.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleFacilitySearch = async (query: string) => {
    setFacilitySearchQuery(query);

    if (query.length === 0) {
      setFacilitySearchResults([]);
      return;
    }

    if (query.length >= 2) {
      setIsSearchingFacilities(true);

      try {
        const response = await facilitiesApi.search(query);

        if (response.success && response.data?.facilities) {
          setFacilitySearchResults(response.data.facilities);
        } else {
          setFacilitySearchResults([]);
        }
      } catch (error) {
        console.error('Error searching facilities:', error);
        setFacilitySearchResults([]);
      } finally {
        setIsSearchingFacilities(false);
      }
    }
  };

  const handleRequestMembership = async (facilityId: string, facilityName: string) => {
    if (!user?.id) return;

    // Check if already a member
    const isAlreadyMember = profileData.memberFacilities.some(
      (f: any) => f.facilityId === facilityId
    );

    if (isAlreadyMember) {
      toast.info('You are already a member of this facility');
      return;
    }

    setRequestingMembership(facilityId);

    try {
      const response = await playerProfileApi.requestMembership(user.id, facilityId, 'Full');

      if (response.success) {
        toast.success(`Membership request sent to ${facilityName}`);
        setFacilitySearchQuery('');
        setFacilitySearchResults([]);
        loadProfile(); // Reload to show pending membership
      } else {
        toast.error(response.error || 'Failed to request membership');
      }
    } catch (error) {
      console.error('Error requesting membership:', error);
      toast.error('Failed to request membership');
    } finally {
      setRequestingMembership(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'suspended':
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'suspended':
      case 'expired':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getInitials = () => {
    return profileData.fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
        currentPage="profile"
      />

      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        <header className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-6">
                <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <div className="h-6 w-px bg-gray-300"></div>
                <img src={logoImage} alt="CourtTime" className="h-8 w-auto" />
                <h1 className="text-xl font-medium">Player Profile</h1>
              </div>

              <div className="flex items-center gap-4">
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setIsEditing(true)} className="bg-blue-600 hover:bg-blue-700">
                    Edit Profile
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Picture & Basic Info */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="text-center">
                  <div className="relative mx-auto">
                    <Avatar className="h-32 w-32 mx-auto">
                      <AvatarFallback className="text-2xl">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <CardTitle className="mt-4">{profileData.fullName}</CardTitle>
                  <CardDescription className="capitalize">
                    {profileData.skillLevel ? `${profileData.skillLevel} Level` : 'No skill level set'}
                  </CardDescription>
                  {profileData.ntrpRating && (
                    <div className="text-sm text-gray-600 mt-1">
                      NTRP: {profileData.ntrpRating}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="text-center space-y-2">
                  <div className="text-sm text-gray-600">
                    <User className="h-4 w-4 inline mr-1" />
                    {profileData.email}
                  </div>
                </CardContent>
              </Card>

              {/* Facility Memberships */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Facility Memberships
                  </CardTitle>
                  <CardDescription>
                    {profileData.memberFacilities.length === 0
                      ? 'You are not a member of any facility yet'
                      : `${profileData.memberFacilities.length} membership${profileData.memberFacilities.length !== 1 ? 's' : ''}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {profileData.memberFacilities.length > 0 ? (
                    <div className="space-y-3">
                      {profileData.memberFacilities.map((facility: any) => (
                        <div
                          key={facility.facilityId}
                          className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <div className="font-medium">{facility.facilityName}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            {facility.membershipType}
                            {facility.isFacilityAdmin && ' • Admin'}
                          </div>
                          <div className={`text-xs mt-2 px-2 py-1 rounded-full inline-flex items-center gap-1 ${getStatusColor(facility.status)}`}>
                            {getStatusIcon(facility.status)}
                            <span className="capitalize">{facility.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">Request membership to a facility to access courts and features</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Profile Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Playing Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Playing Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="skillLevel">Skill Level</Label>
                      <Select
                        value={profileData.skillLevel}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, skillLevel: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select skill level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Beginner">Beginner</SelectItem>
                          <SelectItem value="Intermediate">Intermediate</SelectItem>
                          <SelectItem value="Advanced">Advanced</SelectItem>
                          <SelectItem value="Professional">Professional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ntrpRating">NTRP Rating</Label>
                      <Input
                        id="ntrpRating"
                        type="number"
                        step="0.5"
                        min="1"
                        max="7"
                        value={profileData.ntrpRating || ''}
                        onChange={(e) => setProfileData(prev => ({
                          ...prev,
                          ntrpRating: e.target.value ? parseFloat(e.target.value) : null
                        }))}
                        disabled={!isEditing}
                        placeholder="e.g. 3.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="playingHand">Playing Hand</Label>
                      <Select
                        value={profileData.playingHand}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, playingHand: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select hand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Right">Right</SelectItem>
                          <SelectItem value="Left">Left</SelectItem>
                          <SelectItem value="Both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="yearsPlaying">Years Playing</Label>
                      <Input
                        id="yearsPlaying"
                        type="number"
                        value={profileData.yearsPlaying || ''}
                        onChange={(e) => setProfileData(prev => ({
                          ...prev,
                          yearsPlaying: e.target.value ? parseInt(e.target.value) : null
                        }))}
                        disabled={!isEditing}
                        placeholder="e.g. 5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="playingStyle">Playing Style</Label>
                      <Select
                        value={profileData.playingStyle}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, playingStyle: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baseline">Baseline</SelectItem>
                          <SelectItem value="Serve & Volley">Serve & Volley</SelectItem>
                          <SelectItem value="All-Court">All-Court</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="courtSurface">Preferred Court Surface</Label>
                      <Select
                        value={profileData.preferredCourtSurface}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, preferredCourtSurface: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select surface" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Hard">Hard</SelectItem>
                          <SelectItem value="Clay">Clay</SelectItem>
                          <SelectItem value="Grass">Grass</SelectItem>
                          <SelectItem value="Synthetic">Synthetic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={profileData.bio}
                      onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="Tell us about yourself and your tennis journey..."
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Request Membership */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Request Facility Membership
                  </CardTitle>
                  <CardDescription>
                    Search for facilities and request membership to access their courts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="facilitySearch">Search Facilities</Label>
                      <Input
                        id="facilitySearch"
                        placeholder="Search by name, location, or type..."
                        value={facilitySearchQuery}
                        onChange={(e) => handleFacilitySearch(e.target.value)}
                      />
                    </div>

                    {isSearchingFacilities && (
                      <div className="text-sm text-gray-500">Searching...</div>
                    )}

                    {facilitySearchResults.length > 0 && (
                      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                        {facilitySearchResults.map((facility) => {
                          const isAlreadyMember = profileData.memberFacilities.some(
                            (f: any) => f.facilityId === facility.id
                          );

                          return (
                            <div
                              key={facility.id}
                              className="p-4 hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-medium">{facility.name}</div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    {facility.type}
                                  </div>
                                  {facility.description && (
                                    <div className="text-sm text-gray-500 mt-1">
                                      {facility.description}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleRequestMembership(facility.id, facility.name)}
                                  disabled={isAlreadyMember || requestingMembership === facility.id}
                                  variant={isAlreadyMember ? "outline" : "default"}
                                >
                                  {isAlreadyMember ? 'Member' :
                                   requestingMembership === facility.id ? 'Requesting...' :
                                   'Request'}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {facilitySearchQuery.length >= 2 && !isSearchingFacilities && facilitySearchResults.length === 0 && (
                      <div className="text-sm text-gray-500 text-center py-4">
                        No facilities found matching "{facilitySearchQuery}"
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
