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

export function FacilityInfoStep() {
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

  return (
    <div className="space-y-6">
      {/* Facility Information Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="h-5 w-5" />
            Facility Information
          </CardTitle>
          <CardDescription>
            Basic details about your tennis or pickleball facility
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Left Column - Address & Contact Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="facilityName">Facility Name *</Label>
                <Input
                  id="facilityName"
                  value={formData.facilityName}
                  onChange={(e) => handleInputChange('facilityName', e.target.value)}
                  placeholder="Sunrise Valley Tennis Courts"
                  className={errors.facilityName ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.facilityName && (
                  <p className="text-sm text-red-600 mt-1">{errors.facilityName}</p>
                )}
              </div>

              <div>
                <Label htmlFor="primaryLocationLabel">Primary Address Label</Label>
                <Input
                  id="primaryLocationLabel"
                  value={formData.primaryLocationLabel}
                  onChange={(e) => handleInputChange('primaryLocationLabel', e.target.value)}
                  placeholder="Main Campus"
                />
              </div>

              <div>
                <Label htmlFor="streetAddress">Street Address *</Label>
                <Input
                  id="streetAddress"
                  value={formData.streetAddress}
                  onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                  placeholder="123 Main Street"
                  className={errors.streetAddress ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.streetAddress && (
                  <p className="text-sm text-red-600 mt-1">{errors.streetAddress}</p>
                )}
              </div>

              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Richmond"
                  className={errors.city ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.city && (
                  <p className="text-sm text-red-600 mt-1">{errors.city}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleInputChange('state', value)}
                  >
                    <SelectTrigger
                      id="state"
                      className={errors.state ? 'border-red-500 focus:ring-red-500' : ''}
                    >
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && (
                    <p className="text-sm text-red-600 mt-1">{errors.state}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="zipCode">ZIP Code *</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                    placeholder="23220"
                    className={errors.zipCode ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                  {errors.zipCode && (
                    <p className="text-sm text-red-600 mt-1">{errors.zipCode}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="phone">Facility Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(804) 555-1234"
                  className={errors.phone ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.phone && (
                  <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Facility Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="info@facility.com"
                  className={errors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-sm text-red-600 mt-1">{errors.email}</p>
                )}
              </div>
            </div>

            {/* Right Column - Image, Type & Description */}
            <div className="space-y-4">
              {/* Facility Image Upload */}
              <div>
                <Label>Facility Image</Label>
                <div className="mt-2">
                  {formData.facilityImagePreview ? (
                    <div className="relative inline-block w-full">
                      <img
                        src={formData.facilityImagePreview}
                        alt="Facility preview"
                        className="w-full h-36 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                        onClick={removeFacilityImage}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">Upload Image</span>
                      <span className="text-xs text-gray-400 mt-1">Max 5MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFacilityImageChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="facilityType">Facility Type *</Label>
                <Select
                  value={formData.facilityType}
                  onValueChange={(value) => handleInputChange('facilityType', value)}
                >
                  <SelectTrigger
                    id="facilityType"
                    className={errors.facilityType ? 'border-red-500 focus:ring-red-500' : ''}
                  >
                    <SelectValue placeholder="Select facility type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FACILITY_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.facilityType && (
                  <p className="text-sm text-red-600 mt-1">{errors.facilityType}</p>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0 pr-0 sm:pr-4">
                    <Label htmlFor="enableTermsAndConditions">Terms & Conditions (Optional)</Label>
                    <p className="text-xs text-gray-500 mt-1">
                      If enabled, paste your terms below. Players must scroll through the full text and accept before they can request to join.
                    </p>
                  </div>
                  <Switch
                    id="enableTermsAndConditions"
                    checked={formData.enableTermsAndConditions}
                    onCheckedChange={(checked) => handleInputChange('enableTermsAndConditions', checked)}
                  />
                </div>

                {formData.enableTermsAndConditions && (
                  <div className="space-y-2">
                    <Label htmlFor="termsAndConditions">Terms (paste text)</Label>
                    <Textarea
                      id="termsAndConditions"
                      value={formData.termsAndConditions}
                      onChange={(e) => handleInputChange('termsAndConditions', e.target.value)}
                      placeholder="Paste your facility terms and conditions (plain text or HTML)..."
                      className="min-h-[180px]"
                    />
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="description">Facility Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Brief description of your facility, amenities, and what makes it special..."
                  rows={4}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Locations (optional satellite / branch addresses) */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Additional Locations
              </CardTitle>
              <CardDescription>
                Add any satellite campuses or branch addresses (optional)
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSecondaryLocation}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Location
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.secondaryLocations.length === 0 && (
            <div className="text-sm text-gray-500 border rounded-md bg-gray-50 p-3">
              No additional locations yet. Click <span className="font-medium">Add Location</span> to add a branch or satellite campus.
            </div>
          )}
          {formData.secondaryLocations.map((location, index) => (
            <div key={location.id} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Location {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSecondaryLocation(location.id)}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">Location Name</Label>
                  <Input
                    value={location.locationName}
                    onChange={(e) => updateSecondaryLocation(location.id, 'locationName', e.target.value)}
                    placeholder="North Campus"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Street Address</Label>
                  <Input
                    value={location.streetAddress}
                    onChange={(e) => updateSecondaryLocation(location.id, 'streetAddress', e.target.value)}
                    placeholder="123 Main Street"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">City</Label>
                  <Input
                    value={location.city}
                    onChange={(e) => updateSecondaryLocation(location.id, 'city', e.target.value)}
                    placeholder="Richmond"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">State</Label>
                    <Select
                      value={location.state}
                      onValueChange={(value) => updateSecondaryLocation(location.id, 'state', value)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">ZIP</Label>
                    <Input
                      value={location.zipCode}
                      onChange={(e) => updateSecondaryLocation(location.id, 'zipCode', e.target.value)}
                      placeholder="23220"
                      className="h-9"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={location.phone}
                    onChange={(e) => updateSecondaryLocation(location.id, 'phone', e.target.value)}
                    placeholder="(804) 555-1234"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Primary Contact Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            Primary Contact
          </CardTitle>
          <CardDescription>
            Main point of contact for facility inquiries
            {user && <span className="text-green-600"> (auto-filled from your account)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primaryContactName">Contact Name *</Label>
              <Input
                id="primaryContactName"
                value={formData.primaryContact.name}
                onChange={(e) => handlePrimaryContactChange('name', e.target.value)}
                placeholder="John Smith"
                className={errors.primaryContactName ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {errors.primaryContactName && (
                <p className="text-sm text-red-600 mt-1">{errors.primaryContactName}</p>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="primaryContactPhone">Phone Number *</Label>
              <Input
                id="primaryContactPhone"
                type="tel"
                value={formData.primaryContact.phone}
                onChange={(e) => handlePrimaryContactChange('phone', e.target.value)}
                placeholder="(804) 555-1234"
                className={errors.primaryContactPhone ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {errors.primaryContactPhone && (
                <p className="text-sm text-red-600 mt-1">{errors.primaryContactPhone}</p>
              )}
            </div>

            <div className="col-span-2">
              <Label htmlFor="primaryContactEmail">Email Address *</Label>
              <Input
                id="primaryContactEmail"
                type="email"
                value={formData.primaryContact.email}
                onChange={(e) => handlePrimaryContactChange('email', e.target.value)}
                placeholder="contact@facility.com"
                className={errors.primaryContactEmail ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {errors.primaryContactEmail && (
                <p className="text-sm text-red-600 mt-1">{errors.primaryContactEmail}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Contacts Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Secondary Contacts
              </CardTitle>
              <CardDescription>
                Additional contacts for facility management (optional)
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSecondaryContact}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Contact
            </Button>
          </div>
        </CardHeader>
        {formData.secondaryContacts.length > 0 && (
          <CardContent className="space-y-4">
            {formData.secondaryContacts.map((contact, index) => (
              <div key={contact.id} className="p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Contact {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSecondaryContact(contact.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={contact.name}
                      onChange={(e) => updateSecondaryContact(contact.id, 'name', e.target.value)}
                      placeholder="Contact name"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => updateSecondaryContact(contact.id, 'phone', e.target.value)}
                      placeholder="(555) 123-4567"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={contact.email}
                      onChange={(e) => updateSecondaryContact(contact.id, 'email', e.target.value)}
                      placeholder="contact@email.com"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Separator className="my-6" />

      <FacilityOperatingHoursSection description={
        'Sets the weekly open and close times for every court. You can customize individual courts later under Facility Management → Court Management.'
      } />


      <div>
        <h4 className="font-semibold mb-4">Timezone</h4>
        <Select
          value={formData.timezone}
          onValueChange={(value: string) => handleInputChange('timezone', value)}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="America/New_York">Eastern (America/New_York)</SelectItem>
            <SelectItem value="America/Chicago">Central (America/Chicago)</SelectItem>
            <SelectItem value="America/Denver">Mountain (America/Denver)</SelectItem>
            <SelectItem value="America/Los_Angeles">Pacific (America/Los_Angeles)</SelectItem>
            <SelectItem value="America/Anchorage">Alaska (America/Anchorage)</SelectItem>
            <SelectItem value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500 mt-1">Used for booking times and calendar display.</p>
      </div>
    </div>
  );
}
