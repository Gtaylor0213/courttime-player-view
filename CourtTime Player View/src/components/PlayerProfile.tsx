import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ArrowLeft, Camera, Save, User, Mail, Phone, Shield, Bell } from 'lucide-react';
import { UnifiedSidebar } from './UnifiedSidebar';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

interface PlayerProfileProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToPlayerDashboard?: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToHittingPartner?: () => void;
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
  selectedFacilityId,
  onFacilityChange,
  sidebarCollapsed = false,
  onToggleSidebar
}: PlayerProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@email.com',
    phoneNumber: '+1 (555) 123-4567',
    password: '••••••••',
    skillLevel: 'intermediate',
    profilePicture: '',
    notificationPreferences: {
      emailBookingConfirmations: true,
      smsReminders: true,
      promotionalEmails: false,
      weeklyDigest: true,
      maintenanceUpdates: true
    }
  });

  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNotificationChange = (field: string, value: boolean) => {
    setProfileData(prev => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    // In a real app, this would save to the backend
    setIsEditing(false);
    console.log('Profile saved:', profileData);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileData(prev => ({
          ...prev,
          profilePicture: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const facilities = [
    { id: 'sunrise-valley', name: 'Sunrise Valley HOA', type: 'Tennis & Pickleball' },
    { id: 'downtown-tennis', name: 'Downtown Tennis Center', type: 'Tennis' },
    { id: 'riverside-tennis', name: 'Riverside Tennis Club', type: 'Tennis' },
    { id: 'westside-pickleball', name: 'Westside Pickleball Club', type: 'Pickleball' },
    { id: 'eastgate-sports', name: 'Eastgate Sports Complex', type: 'Tennis & Pickleball' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onBack}
        onNavigateToClub={onNavigateToClub}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="profile"
      />

      {/* Main Content */}
      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        {/* Header */}
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
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
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

        {/* Profile Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Picture & Basic Info */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="text-center">
                <div className="relative mx-auto">
                  <Avatar className="h-32 w-32 mx-auto">
                    {profileData.profilePicture ? (
                      <AvatarImage src={profileData.profilePicture} />
                    ) : (
                      <AvatarFallback className="text-2xl">
                        {profileData.firstName[0]}{profileData.lastName[0]}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {isEditing && (
                    <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors">
                      <Camera className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                <CardTitle className="mt-4">
                  {profileData.firstName} {profileData.lastName}
                </CardTitle>
                <CardDescription className="capitalize">
                  {profileData.skillLevel} Level
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4" />
                  <span>Member since January 2024</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profile Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    disabled={!isEditing}
                  />
                </div>

                <div>
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    value={profileData.phoneNumber}
                    onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    disabled={!isEditing}
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={profileData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    disabled={!isEditing}
                    placeholder={isEditing ? 'Enter new password' : ''}
                  />
                  {isEditing && (
                    <p className="text-sm text-gray-500 mt-1">Leave blank to keep current password</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="skillLevel">Skill Level</Label>
                  <Select
                    value={profileData.skillLevel}
                    onValueChange={(value) => handleInputChange('skillLevel', value)}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose how you'd like to receive updates and notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="emailBooking">Email Booking Confirmations</Label>
                      <p className="text-sm text-gray-500">Receive email confirmations for new bookings</p>
                    </div>
                    <Switch
                      id="emailBooking"
                      checked={profileData.notificationPreferences.emailBookingConfirmations}
                      onCheckedChange={(checked) => handleNotificationChange('emailBookingConfirmations', checked)}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="smsReminders">SMS Reminders</Label>
                      <p className="text-sm text-gray-500">Get text reminders before your court time</p>
                    </div>
                    <Switch
                      id="smsReminders"
                      checked={profileData.notificationPreferences.smsReminders}
                      onCheckedChange={(checked) => handleNotificationChange('smsReminders', checked)}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="promotionalEmails">Promotional Emails</Label>
                      <p className="text-sm text-gray-500">Receive offers and promotions from facilities</p>
                    </div>
                    <Switch
                      id="promotionalEmails"
                      checked={profileData.notificationPreferences.promotionalEmails}
                      onCheckedChange={(checked) => handleNotificationChange('promotionalEmails', checked)}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="weeklyDigest">Weekly Activity Digest</Label>
                      <p className="text-sm text-gray-500">Summary of your weekly court activity</p>
                    </div>
                    <Switch
                      id="weeklyDigest"
                      checked={profileData.notificationPreferences.weeklyDigest}
                      onCheckedChange={(checked) => handleNotificationChange('weeklyDigest', checked)}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="maintenanceUpdates">Maintenance Updates</Label>
                      <p className="text-sm text-gray-500">Notifications about court closures and maintenance</p>
                    </div>
                    <Switch
                      id="maintenanceUpdates"
                      checked={profileData.notificationPreferences.maintenanceUpdates}
                      onCheckedChange={(checked) => handleNotificationChange('maintenanceUpdates', checked)}
                      disabled={!isEditing}
                    />
                  </div>
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