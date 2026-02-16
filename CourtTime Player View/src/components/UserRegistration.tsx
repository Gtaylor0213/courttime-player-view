import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { ArrowLeft, User, Mail, Phone, Bell, Building, Check, AlertCircle, Camera, Search, MapPin, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useAuth } from '../contexts/AuthContext';
import { facilitiesApi, playerProfileApi } from '../api/client';
import { toast } from 'sonner';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

export function UserRegistration() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();

  // Facility search states
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  const [facilitySearchResults, setFacilitySearchResults] = useState<any[]>([]);
  const [isSearchingFacilities, setIsSearchingFacilities] = useState(false);
  const [selectedFacilities, setSelectedFacilities] = useState<any[]>([]);
  const [membershipRequestStatus, setMembershipRequestStatus] = useState<{ [key: string]: 'none' | 'requesting' | 'sent' }>({});

  const [formData, setFormData] = useState({
    // Personal Information
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    profilePicture: '',

    // Address Information
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',

    // Skill Level (Optional)
    skillLevel: '',
    ustaRating: '',
    bio: '',

    // Notification Preferences
    notificationPreferences: {
      emailBookingConfirmations: true,
      smsReminders: true,
      promotionalEmails: false,
      weeklyDigest: true,
      maintenanceUpdates: true
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleNotificationChange = (field: string, value: boolean) => {
    setFormData(prev => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [field]: value
      }
    }));
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
          const facilities = response.data.facilities.map((facility: any) => ({
            id: facility.id,
            name: facility.name,
            type: facility.type || 'Tennis Facility',
            location: facility.location || 'Location not specified',
            description: facility.description || '',
            courts: facility.courts || 0,
            members: facility.members || 0,
            requiresApproval: facility.requiresApproval ?? true
          }));
          setFacilitySearchResults(facilities);
        }
      } catch (error) {
        console.error('Error searching facilities:', error);
        toast.error('Failed to search facilities');
      } finally {
        setIsSearchingFacilities(false);
      }
    }
  };

  const handleMembershipRequest = (facility: any) => {
    setMembershipRequestStatus(prev => ({ ...prev, [facility.id]: 'requesting' }));

    // Just mark as selected for now - will request membership after registration completes
    setTimeout(() => {
      setMembershipRequestStatus(prev => ({ ...prev, [facility.id]: 'sent' }));
      setSelectedFacilities(prev => [...prev, facility]);
    }, 500);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({
          ...prev,
          profilePicture: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validateStep = (step: number) => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!formData.email.trim()) newErrors.email = 'Email is required';
      if (!formData.email.includes('@')) newErrors.email = 'Please enter a valid email';
      if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';
      if (!formData.streetAddress.trim()) newErrors.streetAddress = 'Street address is required';
      if (!formData.city.trim()) newErrors.city = 'City is required';
      if (!formData.state.trim()) newErrors.state = 'State is required';
      if (!formData.zipCode.trim()) newErrors.zipCode = 'ZIP code is required';
      if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(1)) return;

    setIsSubmitting(true);

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      // Register the user account
      const success = await register(
        formData.email,
        formData.password,
        fullName,
        'player',
        {
          phone: formData.phoneNumber,
          streetAddress: formData.streetAddress,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          skillLevel: formData.skillLevel,
          ustaRating: formData.ustaRating,
          bio: formData.bio,
          profilePicture: formData.profilePicture,
          notificationPreferences: formData.notificationPreferences
        }
      );

      if (success) {
        toast.success('Account created successfully!');

        // Request membership to selected facilities
        if (selectedFacilities.length > 0) {
          const storedUser = localStorage.getItem('auth_user');
          const userId = storedUser ? JSON.parse(storedUser).id : null;

          if (userId) {
            let requestCount = 0;
            for (const facility of selectedFacilities) {
              try {
                const result = await playerProfileApi.requestMembership(userId, facility.id);
                if (result.success) requestCount++;
              } catch (err) {
                console.error(`Failed to request membership for ${facility.id}:`, err);
              }
            }
            if (requestCount > 0) {
              toast.info(`Membership ${requestCount === 1 ? 'request' : 'requests'} sent to ${requestCount} ${requestCount === 1 ? 'facility' : 'facilities'}`);
            }
          }
        }

        navigate('/calendar');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      toast.error('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Profile Picture */}
            <div className="flex justify-center">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  {formData.profilePicture ? (
                    <AvatarImage src={formData.profilePicture} />
                  ) : (
                    <AvatarFallback className="text-lg">
                      {formData.firstName[0]?.toUpperCase()}{formData.lastName[0]?.toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <label className="absolute bottom-0 right-0 bg-green-600 text-white p-2 rounded-full cursor-pointer hover:bg-green-700 transition-colors">
                  <Camera className="h-3 w-3" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && <p className="text-sm text-red-500 mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && <p className="text-sm text-red-500 mt-1">{errors.lastName}</p>}
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number *
              </Label>
              <Input
                id="phone"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="+1 (555) 123-4567"
                className={errors.phoneNumber ? 'border-red-500' : ''}
              />
              {errors.phoneNumber && <p className="text-sm text-red-500 mt-1">{errors.phoneNumber}</p>}
            </div>

            {/* Address Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address Information
              </h3>

              <div>
                <Label htmlFor="streetAddress">Street Address *</Label>
                <Input
                  id="streetAddress"
                  value={formData.streetAddress}
                  onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                  placeholder="123 Main Street"
                  className={errors.streetAddress ? 'border-red-500' : ''}
                />
                {errors.streetAddress && <p className="text-sm text-red-500 mt-1">{errors.streetAddress}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="City"
                    className={errors.city ? 'border-red-500' : ''}
                  />
                  {errors.city && <p className="text-sm text-red-500 mt-1">{errors.city}</p>}
                </div>

                <div>
                  <Label htmlFor="state">State *</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleInputChange('state', value)}
                  >
                    <SelectTrigger className={errors.state ? 'border-red-500' : ''}>
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AL">AL</SelectItem>
                      <SelectItem value="AK">AK</SelectItem>
                      <SelectItem value="AZ">AZ</SelectItem>
                      <SelectItem value="AR">AR</SelectItem>
                      <SelectItem value="CA">CA</SelectItem>
                      <SelectItem value="CO">CO</SelectItem>
                      <SelectItem value="CT">CT</SelectItem>
                      <SelectItem value="DE">DE</SelectItem>
                      <SelectItem value="FL">FL</SelectItem>
                      <SelectItem value="GA">GA</SelectItem>
                      <SelectItem value="HI">HI</SelectItem>
                      <SelectItem value="ID">ID</SelectItem>
                      <SelectItem value="IL">IL</SelectItem>
                      <SelectItem value="IN">IN</SelectItem>
                      <SelectItem value="IA">IA</SelectItem>
                      <SelectItem value="KS">KS</SelectItem>
                      <SelectItem value="KY">KY</SelectItem>
                      <SelectItem value="LA">LA</SelectItem>
                      <SelectItem value="ME">ME</SelectItem>
                      <SelectItem value="MD">MD</SelectItem>
                      <SelectItem value="MA">MA</SelectItem>
                      <SelectItem value="MI">MI</SelectItem>
                      <SelectItem value="MN">MN</SelectItem>
                      <SelectItem value="MS">MS</SelectItem>
                      <SelectItem value="MO">MO</SelectItem>
                      <SelectItem value="MT">MT</SelectItem>
                      <SelectItem value="NE">NE</SelectItem>
                      <SelectItem value="NV">NV</SelectItem>
                      <SelectItem value="NH">NH</SelectItem>
                      <SelectItem value="NJ">NJ</SelectItem>
                      <SelectItem value="NM">NM</SelectItem>
                      <SelectItem value="NY">NY</SelectItem>
                      <SelectItem value="NC">NC</SelectItem>
                      <SelectItem value="ND">ND</SelectItem>
                      <SelectItem value="OH">OH</SelectItem>
                      <SelectItem value="OK">OK</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                      <SelectItem value="PA">PA</SelectItem>
                      <SelectItem value="RI">RI</SelectItem>
                      <SelectItem value="SC">SC</SelectItem>
                      <SelectItem value="SD">SD</SelectItem>
                      <SelectItem value="TN">TN</SelectItem>
                      <SelectItem value="TX">TX</SelectItem>
                      <SelectItem value="UT">UT</SelectItem>
                      <SelectItem value="VT">VT</SelectItem>
                      <SelectItem value="VA">VA</SelectItem>
                      <SelectItem value="WA">WA</SelectItem>
                      <SelectItem value="WV">WV</SelectItem>
                      <SelectItem value="WI">WI</SelectItem>
                      <SelectItem value="WY">WY</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.state && <p className="text-sm text-red-500 mt-1">{errors.state}</p>}
                </div>

                <div>
                  <Label htmlFor="zipCode">ZIP Code *</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                    placeholder="12345"
                    className={errors.zipCode ? 'border-red-500' : ''}
                  />
                  {errors.zipCode && <p className="text-sm text-red-500 mt-1">{errors.zipCode}</p>}
                </div>
              </div>
            </div>

            {/* Skill Level (Optional) */}
            <div className="pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="skillLevel">Skill Level (Optional)</Label>
                  <Select
                    value={formData.skillLevel}
                    onValueChange={(value) => handleInputChange('skillLevel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your skill level" />
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
                    value={formData.ustaRating}
                    onValueChange={(value) => handleInputChange('ustaRating', value)}
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
                  <p className="text-xs text-gray-500 mt-1">National Tennis Rating Program (NTRP)</p>
                </div>
              </div>

              {/* Bio */}
              <div className="mt-4">
                <Label htmlFor="bio">Bio (Optional)</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell us about yourself, your playing style, or what you're looking for in hitting partners..."
                  className="h-24 resize-none"
                  maxLength={500}
                />
                <p className="text-sm text-gray-500 mt-1">{formData.bio.length}/500 characters</p>
              </div>
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={errors.password ? 'border-red-500' : ''}
                />
                {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
                <p className="text-sm text-gray-500 mt-1">Minimum 8 characters</p>
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className={errors.confirmPassword ? 'border-red-500' : ''}
                />
                {errors.confirmPassword && <p className="text-sm text-red-500 mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            {/* Facility Search & Membership Request */}
            <div>
              <h3 className="flex items-center gap-2 mb-4">
                <Building className="h-5 w-5" />
                Request Facility Membership (Optional)
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Search for facilities in your area and request membership to start booking courts.
              </p>

              <div>
                <Label htmlFor="facilitySearch" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search Facilities
                </Label>
                <Input
                  id="facilitySearch"
                  value={facilitySearchQuery}
                  onChange={(e) => handleFacilitySearch(e.target.value)}
                  placeholder="Search by facility name, location, or type..."
                  className="mb-2"
                />
                <p className="text-sm text-gray-500">
                  You can request membership to multiple facilities at once.
                </p>
              </div>

              {/* Search Results */}
              {isSearchingFacilities && (
                <div className="text-center py-4">
                  <AlertCircle className="h-6 w-6 animate-spin mx-auto mb-2 text-green-600" />
                  <p className="text-sm text-gray-600">Searching facilities...</p>
                </div>
              )}

              {facilitySearchResults.length > 0 && !isSearchingFacilities && (
                <div className="space-y-3 max-h-96 overflow-y-auto mt-4">
                  {facilitySearchResults.map((facility) => {
                    const status = membershipRequestStatus[facility.id] || 'none';
                    const isSelected = selectedFacilities.some(f => f.id === facility.id);

                    return (
                      <Card
                        key={facility.id}
                        className={`transition-all ${
                          isSelected ? 'ring-2 ring-green-500 bg-green-50' : ''
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{facility.name}</h4>
                              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {facility.location}
                              </p>
                              <p className="text-sm text-gray-500 mt-1">{facility.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" />
                                  {facility.courts} courts
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {facility.members} members
                                </span>
                                <span className={`px-2 py-0.5 rounded-full ${
                                  facility.type === 'Private Club'
                                    ? 'bg-purple-100 text-purple-700'
                                    : facility.type === 'Public Facility'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {facility.type}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {status === 'none' && (
                                <Button
                                  onClick={() => handleMembershipRequest(facility)}
                                  size="sm"
                                  variant="outline"
                                >
                                  {facility.requiresApproval ? 'Request' : 'Join'}
                                </Button>
                              )}

                              {status === 'requesting' && (
                                <div className="flex items-center gap-2 text-green-600">
                                  <AlertCircle className="h-4 w-4 animate-pulse" />
                                  <span className="text-xs">Sending...</span>
                                </div>
                              )}

                              {status === 'sent' && (
                                <div className="flex items-center gap-2 text-green-600">
                                  <Check className="h-4 w-4" />
                                  <span className="text-xs font-medium">
                                    {facility.requiresApproval ? 'Requested' : 'Joined'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {facilitySearchQuery.length >= 2 && facilitySearchResults.length === 0 && !isSearchingFacilities && (
                <div className="text-center py-8 text-gray-500">
                  <Building className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No facilities found matching "{facilitySearchQuery}"</p>
                  <p className="text-sm">Try searching with different keywords.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Notification Preferences */}
            <div>
              <h3 className="flex items-center gap-2 mb-4">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Choose how you'd like to receive updates and notifications
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailBooking">Email Booking Confirmations</Label>
                    <p className="text-sm text-gray-500">Receive email confirmations for new bookings</p>
                  </div>
                  <Switch
                    id="emailBooking"
                    checked={formData.notificationPreferences.emailBookingConfirmations}
                    onCheckedChange={(checked) => handleNotificationChange('emailBookingConfirmations', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="smsReminders">SMS Reminders</Label>
                    <p className="text-sm text-gray-500">Get text reminders before your court time</p>
                  </div>
                  <Switch
                    id="smsReminders"
                    checked={formData.notificationPreferences.smsReminders}
                    onCheckedChange={(checked) => handleNotificationChange('smsReminders', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="promotionalEmails">Promotional Emails</Label>
                    <p className="text-sm text-gray-500">Receive offers and promotions from facilities</p>
                  </div>
                  <Switch
                    id="promotionalEmails"
                    checked={formData.notificationPreferences.promotionalEmails}
                    onCheckedChange={(checked) => handleNotificationChange('promotionalEmails', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="weeklyDigest">Weekly Activity Digest</Label>
                    <p className="text-sm text-gray-500">Summary of your weekly court activity</p>
                  </div>
                  <Switch
                    id="weeklyDigest"
                    checked={formData.notificationPreferences.weeklyDigest}
                    onCheckedChange={(checked) => handleNotificationChange('weeklyDigest', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="maintenanceUpdates">Maintenance Updates</Label>
                    <p className="text-sm text-gray-500">Notifications about court closures and maintenance</p>
                  </div>
                  <Switch
                    id="maintenanceUpdates"
                    checked={formData.notificationPreferences.maintenanceUpdates}
                    onCheckedChange={(checked) => handleNotificationChange('maintenanceUpdates', checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Logo Only */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-20">
            <Button variant="ghost" onClick={() => navigate('/login')} className="flex items-center gap-2 hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Button>
            <div className="flex-1 flex justify-center">
              <img src={logoImage} alt="CourtTime" className="h-16 w-auto" />
            </div>
          </div>
        </div>
      </header>

      {/* Registration Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <div className="flex">
            {/* Vertical Progress Steps - Inside Card Left Side */}
            <div className="w-48 border-r bg-gray-50 p-4">
              <div className="flex flex-col items-center gap-5 pt-3">
                {/* Step 1 */}
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium border-2 transition-all duration-200 mb-2 ${
                      1 <= currentStep
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-400 border-gray-300'
                    }`}
                  >
                    1
                  </div>
                  <p className={`text-sm font-medium ${currentStep >= 1 ? 'text-green-600' : 'text-gray-500'}`}>
                    Personal Information
                  </p>
                </div>

                {/* Vertical Progress Line */}
                <div className="flex justify-center">
                  <div className="w-0.5 h-12 bg-gray-200">
                    <div
                      className="w-full bg-green-600 transition-all duration-300"
                      style={{ height: `${currentStep >= 2 ? '100' : '0'}%` }}
                    />
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium border-2 transition-all duration-200 mb-2 ${
                      2 <= currentStep
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-400 border-gray-300'
                    }`}
                  >
                    2
                  </div>
                  <p className={`text-sm font-medium ${currentStep >= 2 ? 'text-green-600' : 'text-gray-500'}`}>
                    Facilities & Notifications
                  </p>
                </div>
              </div>
            </div>

            {/* Registration Form - Right Side */}
            <div className="flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {currentStep === 1 ? 'Personal Information' : 'Facilities & Notifications'}
                </CardTitle>
                <CardDescription>
                  {currentStep === 1 && 'Enter your personal information and address to create your account'}
                  {currentStep === 2 && 'Optional facility membership requests and notification preferences'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderStepContent()}

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8">
                  <div>
                    {currentStep > 1 && (
                      <Button variant="outline" onClick={handleBack}>
                        Previous
                      </Button>
                    )}
                  </div>
                  <div>
                    {currentStep < 2 ? (
                      <Button onClick={handleNext}>
                        Next Step
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
