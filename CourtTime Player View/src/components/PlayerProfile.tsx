import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { ReservationManagementModal } from './ReservationManagementModal';
import { ArrowLeft, Save, User, Building2, Plus, CheckCircle, Clock, XCircle, Camera, Calendar, MapPin, AlertTriangle, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import { playerProfileApi, facilitiesApi, strikesApi } from '../api/client';
import { toast } from 'sonner';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

export function PlayerProfile() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Facility search
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  const [facilitySearchResults, setFacilitySearchResults] = useState<any[]>([]);
  const [isSearchingFacilities, setIsSearchingFacilities] = useState(false);
  const [requestingMembership, setRequestingMembership] = useState<string | null>(null);

  // Upcoming reservations
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);

  // Strike history
  const [strikes, setStrikes] = useState<any[]>([]);
  const [lockoutStatuses, setLockoutStatuses] = useState<Record<string, any>>({});
  const [showStrikeHistory, setShowStrikeHistory] = useState(false);

  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    fullName: '',
    email: user?.email || '',
    address: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    skillLevel: '',
    ustaRating: '',
    bio: '',
    profileImageUrl: '',
    memberFacilities: [] as any[]
  });

  useEffect(() => {
    if (user?.id) {
      loadProfile();
    }
  }, [user?.id]);

  // Update profile data when user changes
  useEffect(() => {
    if (user) {
      setProfileData(prev => ({
        ...prev,
        firstName: (user as any).firstName || '',
        lastName: (user as any).lastName || '',
        email: user.email || ''
      }));
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await playerProfileApi.getProfile(user.id);

      if (response.success && response.data?.profile) {
        const profile = response.data.profile;
        setProfileData({
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          fullName: profile.fullName || '',
          email: user?.email || profile.email || '',
          address: profile.address || '',
          streetAddress: profile.streetAddress || '',
          city: profile.city || '',
          state: profile.state || '',
          zipCode: profile.zipCode || '',
          phone: profile.phone || '',
          skillLevel: profile.skillLevel || '',
          ustaRating: profile.ustaRating || '',
          bio: profile.bio || '',
          profileImageUrl: profile.profileImageUrl || '',
          memberFacilities: profile.memberFacilities || []
        });
      }

      // Load upcoming bookings
      const bookingsResponse = await playerProfileApi.getBookings(user.id, true);
      if (bookingsResponse.success && bookingsResponse.data?.bookings) {
        setUpcomingBookings(bookingsResponse.data.bookings);
      }

      // Load strikes
      try {
        const strikesResponse = await strikesApi.getByUser(user.id);
        if (strikesResponse.success && strikesResponse.data?.strikes) {
          setStrikes(strikesResponse.data.strikes);
        }
      } catch {
        // Strikes table may not exist yet — gracefully skip
      }

      // Check lockout status per facility
      if (response.success && response.data?.profile?.memberFacilities) {
        const facilities = response.data.profile.memberFacilities;
        const statuses: Record<string, any> = {};
        for (const fac of facilities) {
          try {
            const lockoutRes = await strikesApi.checkLockout(user.id, fac.facilityId);
            if (lockoutRes.success && lockoutRes.data) {
              statuses[fac.facilityId] = { ...lockoutRes.data, facilityName: fac.facilityName };
            }
          } catch {
            // Skip if not available
          }
        }
        setLockoutStatuses(statuses);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    // Convert to base64 for preview and storage
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setProfileData(prev => ({
        ...prev,
        profileImageUrl: base64String
      }));
      toast.success('Image uploaded! Click Save to update your profile.');
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = () => {
    if (isEditing) {
      fileInputRef.current?.click();
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);
      const updates = {
        firstName: profileData.firstName || undefined,
        lastName: profileData.lastName || undefined,
        address: profileData.address || undefined,
        streetAddress: profileData.streetAddress || undefined,
        city: profileData.city || undefined,
        state: profileData.state || undefined,
        zipCode: profileData.zipCode || undefined,
        phone: profileData.phone || undefined,
        skillLevel: profileData.skillLevel || undefined,
        ustaRating: profileData.ustaRating || undefined,
        bio: profileData.bio || undefined,
        profileImageUrl: profileData.profileImageUrl || undefined
      };

      const response = await playerProfileApi.updateProfile(user.id, updates);

      if (response.success) {
        // Update the AuthContext user with new profile data
        const fullName = `${profileData.firstName} ${profileData.lastName}`.trim() || profileData.fullName;
        await updateProfile({
          fullName: fullName,
          profileImageUrl: profileData.profileImageUrl
        });

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
    const firstName = profileData.firstName || '';
    const lastName = profileData.lastName || '';
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

    // If no first/last name, try to get initials from fullName
    if (!initials && profileData.fullName) {
      const nameParts = profileData.fullName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        return `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase();
      } else if (nameParts.length === 1) {
        return nameParts[0].charAt(0).toUpperCase();
      }
    }

    return initials || 'U';
  };

  const getFullName = () => {
    const name = `${profileData.firstName} ${profileData.lastName}`.trim();
    return name || profileData.fullName || 'No name set';
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    if (compareDate.getTime() === today.getTime()) return 'Today';
    if (compareDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (startTime: string, endTime: string) => {
    const formatTimeOnly = (time: string) => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    };
    return `${formatTimeOnly(startTime)} - ${formatTimeOnly(endTime)}`;
  };

  const getBookingStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const handleReservationClick = (booking: any) => {
    setSelectedReservation(booking);
    setShowReservationModal(true);
  };

  const handleCloseReservationModal = () => {
    setShowReservationModal(false);
    setSelectedReservation(null);
  };

  const handleReservationUpdate = () => {
    loadProfile();
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
    <>
        <header className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-2xl font-medium">Player Profile</h1>

              <div className="flex items-center gap-4">
                <NotificationBell />
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
                  <div className="relative mx-auto w-32 h-32">
                    <Avatar className="h-32 w-32 mx-auto">
                      {profileData.profileImageUrl && (
                        <AvatarImage src={profileData.profileImageUrl} alt={getFullName()} />
                      )}
                      <AvatarFallback className="text-2xl">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <button
                        onClick={handleImageClick}
                        className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors shadow-lg"
                        title="Upload profile picture"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                  <CardTitle className="mt-4">{getFullName()}</CardTitle>
                  <CardDescription className="capitalize">
                    {profileData.skillLevel ? `${profileData.skillLevel} Level` : 'No skill level set'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span>{profileData.email}</span>
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
              {/* Upcoming Reservations */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Upcoming Reservations
                      </CardTitle>
                      <CardDescription>Your scheduled court bookings</CardDescription>
                    </div>
                    {profileData.memberFacilities.length > 0 && (
                      <Button onClick={() => navigate('/calendar')} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Book Court
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {upcomingBookings.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No upcoming bookings</p>
                      <p className="text-sm mt-1">
                        {profileData.memberFacilities.length === 0
                          ? 'Join a facility to start booking courts'
                          : 'Book a court to get started'}
                      </p>
                      {profileData.memberFacilities.length > 0 && (
                        <Button onClick={() => navigate('/calendar')} className="mt-4" size="sm">
                          Book Your First Court
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingBookings.map((booking) => (
                        <div
                          key={booking.id}
                          onClick={() => handleReservationClick(booking)}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-2 h-10 bg-blue-500 rounded-full"></div>
                            <div>
                              <h4 className="font-medium">{booking.courtName}</h4>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {booking.facilityName}
                              </p>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(booking.bookingDate)} • {formatTime(booking.startTime, booking.endTime)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getBookingStatusColor(booking.status)}>
                              {booking.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Account Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    Account Status
                  </CardTitle>
                  <CardDescription>Strike history and account standing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lockout Banners */}
                  {Object.values(lockoutStatuses).some((s: any) => s.isLockedOut) && (
                    <div className="space-y-2">
                      {Object.entries(lockoutStatuses)
                        .filter(([, status]: [string, any]) => status.isLockedOut)
                        .map(([facilityId, status]: [string, any]) => (
                          <div key={facilityId} className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-800">
                                Account locked out at {status.facilityName}
                              </p>
                              {status.lockoutEndsAt && (
                                <p className="text-xs text-red-600 mt-1">
                                  Until {new Date(status.lockoutEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Per-Facility Summary Badges */}
                  {Object.keys(lockoutStatuses).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(lockoutStatuses).map(([facilityId, status]: [string, any]) => {
                        const activeCount = status.activeStrikes || 0;
                        const isLocked = status.isLockedOut;
                        return (
                          <div
                            key={facilityId}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                              isLocked
                                ? 'bg-red-100 text-red-800'
                                : activeCount > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {isLocked ? (
                              <XCircle className="h-3 w-3" />
                            ) : activeCount > 0 ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            {status.facilityName}: {activeCount} active strike{activeCount !== 1 ? 's' : ''}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Strike History */}
                  {strikes.length > 0 ? (
                    <div>
                      <button
                        onClick={() => setShowStrikeHistory(!showStrikeHistory)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors w-full"
                      >
                        {showStrikeHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        Strike History ({strikes.length} total)
                      </button>

                      {showStrikeHistory && (
                        <div className="mt-3 space-y-2">
                          {[...strikes]
                            .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
                            .map((strike) => (
                              <div
                                key={strike.id}
                                className={`p-3 border rounded-lg ${strike.revoked ? 'opacity-50 bg-gray-50' : 'bg-white'}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        strike.strike_type === 'no_show' ? 'destructive' :
                                        strike.strike_type === 'late_cancellation' ? 'secondary' :
                                        'outline'
                                      }
                                      className="text-xs"
                                    >
                                      {strike.strike_type === 'no_show' ? 'No Show' :
                                       strike.strike_type === 'late_cancellation' ? 'Late Cancel' :
                                       'Manual'}
                                    </Badge>
                                    {strike.revoked && (
                                      <span className="text-xs text-gray-500 italic">(Revoked)</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {new Date(strike.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                                {strike.strike_reason && (
                                  <p className="text-sm text-gray-600 mt-1">{strike.strike_reason}</p>
                                )}
                                {(strike.court_name || strike.booking_date) && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    {strike.court_name && `${strike.court_name}`}
                                    {strike.court_name && strike.booking_date && ' • '}
                                    {strike.booking_date && new Date(strike.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-green-500" />
                      <p className="text-sm font-medium text-green-700">No strikes on your account</p>
                      <p className="text-xs text-gray-500 mt-1">Keep up the great work!</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={profileData.firstName}
                        onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={profileData.lastName}
                        onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="Last name"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      disabled={true}
                      placeholder="Email address"
                      className="bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="skillLevel">Skill Level</Label>
                      <Select
                        value={profileData.skillLevel?.toLowerCase() || ''}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, skillLevel: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select skill level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ustaRating">USTA Rating (Optional)</Label>
                      <Select
                        value={profileData.ustaRating || ''}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, ustaRating: value }))}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select USTA rating" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1.5">1.5</SelectItem>
                          <SelectItem value="2.0">2.0</SelectItem>
                          <SelectItem value="2.5">2.5</SelectItem>
                          <SelectItem value="3.0">3.0</SelectItem>
                          <SelectItem value="3.5">3.5</SelectItem>
                          <SelectItem value="4.0">4.0</SelectItem>
                          <SelectItem value="4.5">4.5</SelectItem>
                          <SelectItem value="5.0">5.0</SelectItem>
                          <SelectItem value="5.5">5.5</SelectItem>
                          <SelectItem value="6.0">6.0</SelectItem>
                          <SelectItem value="7.0">7.0</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">National Tennis Rating Program (NTRP) rating</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact & Address */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact & Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="(123) 456-7890"
                    />
                  </div>

                  <div>
                    <Label htmlFor="streetAddress">Street Address</Label>
                    <Input
                      id="streetAddress"
                      value={profileData.streetAddress}
                      onChange={(e) => setProfileData(prev => ({ ...prev, streetAddress: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={profileData.city}
                        onChange={(e) => setProfileData(prev => ({ ...prev, city: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={profileData.state}
                        onChange={(e) => setProfileData(prev => ({ ...prev, state: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zipCode">Zip Code</Label>
                      <Input
                        id="zipCode"
                        value={profileData.zipCode}
                        onChange={(e) => setProfileData(prev => ({ ...prev, zipCode: e.target.value }))}
                        disabled={!isEditing}
                        placeholder="12345"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bio */}
              <Card>
                <CardHeader>
                  <CardTitle>Bio (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="bio">About Me</Label>
                  <Textarea
                    id="bio"
                    value={profileData.bio}
                    onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                    disabled={!isEditing}
                    placeholder="Tell us about yourself and your tennis journey..."
                    rows={6}
                  />
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

      {/* Reservation Management Modal */}
      <ReservationManagementModal
        isOpen={showReservationModal}
        onClose={handleCloseReservationModal}
        reservation={selectedReservation}
        onUpdate={handleReservationUpdate}
      />
    </>
  );
}
