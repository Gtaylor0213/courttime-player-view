import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Alert, AlertDescription } from '../ui/alert';
import {
  ArrowLeft, Building, MapPin, Clock, FileText,
  Plus, Trash2, Check, AlertCircle, Upload, Mail, User, Users,
  Phone, CreditCard, Tag, LogIn, UserPlus, Camera, Grid3X3,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { FACILITY_TYPE_OPTIONS } from '../../../shared/constants/facilityTypes';
import { RulesStep } from './RulesStep';
import { PaidCourtBookingFields } from '../admin/PaidCourtBookingFields';
import { CourtScheduleEditor } from '../admin/CourtScheduleEditor';
import { CourtTypeField } from '../admin/CourtTypeField';
import {
  getAmountForCourts,
  formatAnnualPrice,
  PER_COURT_CENTS,
  MIN_SUBSCRIPTION_CENTS,
  MAX_SUBSCRIPTION_CENTS,
} from '../../services/subscriptionPricing';
import { useRegistration } from './RegistrationContext';
import { AdminProfileFields } from './AdminProfileFields';
import { FacilityOperatingHoursSection } from './FacilityOperatingHoursSection';

export function AdminAccountStep() {
  const {
    formData, errors, user, step1Mode, setStep1Mode, loginEmail, setLoginEmail,
    loginPassword, setLoginPassword, loginError, isLoggingIn, handleRegistrationLogin,
    handleInputChange, handlePrimaryContactChange, handleFacilityImageChange,
    removeFacilityImage, addSecondaryLocation, updateSecondaryLocation,
    removeSecondaryLocation, addSecondaryContact, updateSecondaryContact,
    removeSecondaryContact, handleOperatingHoursChange, handleRulesChange,
    handleRuleEntryChange, handleRuleConfigFieldChange, addPeakHourSlot,
    removePeakHourSlot, updatePeakHourSlot, togglePeakHourSlotDay,
    updatePeakHourSlotRule, handleAddressWhitelistChange, removeAddressWhitelist,
    courtFormMode, setCourtFormMode, bulkCourtData, setBulkCourtData,
    addCourt, addBulkCourts, updateCourt, removeCourt, updateCourtScheduleDay,
    resetCourtScheduleToFacilityDefaults, buildDefaultCourtSchedule,
    addAdminInvite, updateAdminInvite, removeAdminInvite,
    preAuthenticated, loggedInDuringRegistration, buildRegistrationBookingRules,
    promoCode, setPromoCode, promoValidation, setPromoValidation,
    paymentComplete, paymentWaived, isValidatingPromo, isProcessingPayment,
    handleValidatePromo, handleClearPromo, handlePayWithStripe,
    US_STATES,
  } = useRegistration();

    // Choose mode — two clickable cards
    if (step1Mode === 'choose') {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Facility Administrator Account</h3>
            <p className="text-sm text-gray-600 mb-6">
              As the facility creator, you will be the primary administrator. Choose how you'd like to set up your account.
            </p>
          </div>

          <div
            id="step1ModeSelection"
            className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
              errors.step1Mode ? 'rounded-lg border border-red-500 p-2' : ''
            }`}
          >
            <Card
              className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all"
              onClick={() => setStep1Mode('create')}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <UserPlus className="h-8 w-8 text-blue-600" />
                </div>
                <h4 className="text-lg font-semibold mb-2">Create New Account</h4>
                <p className="text-sm text-gray-500">
                  New to CourtTime? Create a fresh administrator account.
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-green-500 hover:shadow-md transition-all"
              onClick={() => setStep1Mode('login')}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <LogIn className="h-8 w-8 text-green-600" />
                </div>
                <h4 className="text-lg font-semibold mb-2">Login to Existing Account</h4>
                <p className="text-sm text-gray-500">
                  Already have a CourtTime account? Log in to use it.
                </p>
              </CardContent>
            </Card>
          </div>
          {errors.step1Mode && <p className="text-sm text-red-500">{errors.step1Mode}</p>}
        </div>
      );
    }

    // Login mode — email + password form
    if (step1Mode === 'login') {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setStep1Mode('choose'); setLoginError(''); }}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to options
            </Button>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Login to Your Account</h3>
            <p className="text-sm text-gray-600 mb-6">
              Enter your existing CourtTime credentials to continue.
            </p>
          </div>

          <div className="max-w-md space-y-4">
            <div>
              <Label htmlFor="loginEmail" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <Input
                id="loginEmail"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="your@email.com"
                onKeyDown={(e) => e.key === 'Enter' && handleRegistrationLogin()}
              />
            </div>

            <div>
              <Label htmlFor="loginPasswordField">Password</Label>
              <Input
                id="loginPasswordField"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                onKeyDown={(e) => e.key === 'Enter' && handleRegistrationLogin()}
              />
            </div>

            {loginError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleRegistrationLogin}
              disabled={isLoggingIn}
              className="w-full"
            >
              {isLoggingIn ? 'Logging in...' : 'Log In'}
            </Button>
          </div>
        </div>
      );
    }

    // Logged-in mode — confirmation card + profile completion
    if (step1Mode === 'loggedIn' && user) {
      return (
        <div className="space-y-6">
          {/* Logged in confirmation */}
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-800">Logged in as {user.fullName}</p>
                <p className="text-sm text-green-600">{user.email}</p>
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-gray-600">
            You can optionally update your profile information below, or click Next to continue.
          </p>

          {/* Optional profile fields pre-filled from user data */}
          <div className="space-y-4">
            {/* Phone & Address (editable) */}
            <div>
              <Label htmlFor="adminPhoneLoggedIn" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </Label>
              <Input
                id="adminPhoneLoggedIn"
                value={formData.adminPhone}
                onChange={(e) => handleInputChange('adminPhone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address Information
              </h3>

              <div>
                <Label htmlFor="adminStreetAddressLoggedIn">Street Address</Label>
                <Input
                  id="adminStreetAddressLoggedIn"
                  value={formData.adminStreetAddress}
                  onChange={(e) => handleInputChange('adminStreetAddress', e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="adminCityLoggedIn">City</Label>
                  <Input
                    id="adminCityLoggedIn"
                    value={formData.adminCity}
                    onChange={(e) => handleInputChange('adminCity', e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="adminStateLoggedIn">State</Label>
                  <Select
                    value={formData.adminState}
                    onValueChange={(value) => handleInputChange('adminState', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="adminZipCodeLoggedIn">ZIP Code</Label>
                  <Input
                    id="adminZipCodeLoggedIn"
                    value={formData.adminZipCode}
                    onChange={(e) => handleInputChange('adminZipCode', e.target.value)}
                    placeholder="12345"
                  />
                </div>
              </div>
            </div>

            <AdminProfileFields />
          </div>
        </div>
      );
    }

    // Create mode — original form + new profile fields
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep1Mode('choose')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to options
          </Button>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Create Facility Administrator Account</h3>
          <p className="text-sm text-gray-600 mb-6">
            As the facility creator, you will be the primary administrator with full access to manage your facility.
          </p>
        </div>

        <div className="space-y-4">
          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="adminFirstName">First Name *</Label>
              <Input
                id="adminFirstName"
                value={formData.adminFirstName}
                onChange={(e) => handleInputChange('adminFirstName', e.target.value)}
                className={errors.adminFirstName ? 'border-red-500' : ''}
              />
              {errors.adminFirstName && <p className="text-sm text-red-500 mt-1">{errors.adminFirstName}</p>}
            </div>
            <div>
              <Label htmlFor="adminLastName">Last Name *</Label>
              <Input
                id="adminLastName"
                value={formData.adminLastName}
                onChange={(e) => handleInputChange('adminLastName', e.target.value)}
                className={errors.adminLastName ? 'border-red-500' : ''}
              />
              {errors.adminLastName && <p className="text-sm text-red-500 mt-1">{errors.adminLastName}</p>}
            </div>
          </div>

          {/* Contact */}
          <div>
            <Label htmlFor="adminEmail" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address *
            </Label>
            <Input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => handleInputChange('adminEmail', e.target.value)}
              className={errors.adminEmail ? 'border-red-500' : ''}
            />
            {errors.adminEmail && <p className="text-sm text-red-500 mt-1">{errors.adminEmail}</p>}
          </div>

          <div>
            <Label htmlFor="adminPhone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Number *
            </Label>
            <Input
              id="adminPhone"
              value={formData.adminPhone}
              onChange={(e) => handleInputChange('adminPhone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className={errors.adminPhone ? 'border-red-500' : ''}
            />
            {errors.adminPhone && <p className="text-sm text-red-500 mt-1">{errors.adminPhone}</p>}
          </div>

          {/* Password */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="adminPassword">Password *</Label>
              <Input
                id="adminPassword"
                type="password"
                value={formData.adminPassword}
                onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                placeholder="Minimum 8 characters"
                className={errors.adminPassword ? 'border-red-500' : ''}
              />
              {errors.adminPassword && <p className="text-sm text-red-500 mt-1">{errors.adminPassword}</p>}
            </div>
            <div>
              <Label htmlFor="adminConfirmPassword">Confirm Password *</Label>
              <Input
                id="adminConfirmPassword"
                type="password"
                value={formData.adminConfirmPassword}
                onChange={(e) => handleInputChange('adminConfirmPassword', e.target.value)}
                placeholder="Re-enter password"
                className={errors.adminConfirmPassword ? 'border-red-500' : ''}
              />
              {errors.adminConfirmPassword && <p className="text-sm text-red-500 mt-1">{errors.adminConfirmPassword}</p>}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address Information
            </h3>

            <div>
              <Label htmlFor="adminStreetAddress">Street Address *</Label>
              <Input
                id="adminStreetAddress"
                value={formData.adminStreetAddress}
                onChange={(e) => handleInputChange('adminStreetAddress', e.target.value)}
                placeholder="123 Main Street"
                className={errors.adminStreetAddress ? 'border-red-500' : ''}
              />
              {errors.adminStreetAddress && <p className="text-sm text-red-500 mt-1">{errors.adminStreetAddress}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="adminCity">City *</Label>
                <Input
                  id="adminCity"
                  value={formData.adminCity}
                  onChange={(e) => handleInputChange('adminCity', e.target.value)}
                  placeholder="City"
                  className={errors.adminCity ? 'border-red-500' : ''}
                />
                {errors.adminCity && <p className="text-sm text-red-500 mt-1">{errors.adminCity}</p>}
              </div>
              <div>
                <Label htmlFor="adminState">State *</Label>
                <Select
                  value={formData.adminState}
                  onValueChange={(value) => handleInputChange('adminState', value)}
                >
                  <SelectTrigger className={errors.adminState ? 'border-red-500' : ''}>
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.adminState && <p className="text-sm text-red-500 mt-1">{errors.adminState}</p>}
              </div>
              <div>
                <Label htmlFor="adminZipCode">ZIP Code *</Label>
                <Input
                  id="adminZipCode"
                  value={formData.adminZipCode}
                  onChange={(e) => handleInputChange('adminZipCode', e.target.value)}
                  placeholder="12345"
                  className={errors.adminZipCode ? 'border-red-500' : ''}
                />
                {errors.adminZipCode && <p className="text-sm text-red-500 mt-1">{errors.adminZipCode}</p>}
              </div>
            </div>
          </div>

          {/* Profile fields */}
          <AdminProfileFields />
        </div>
      </div>
    );
}
