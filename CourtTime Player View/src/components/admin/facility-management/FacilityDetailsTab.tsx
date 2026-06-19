import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Building2, Clock, MapPin, Phone, Mail, Save, Edit, X, Plus, Trash2, Image, User, Users,
  Upload, Shield, AlertTriangle, Zap, Home, FileText, Calendar, ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TabsContent } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import { toast } from 'sonner';
import { RULE_METADATA, CATEGORIES } from '../../facility-registration/rule-defaults';
import { getFacilityTypeSelectOptions } from '../../../../shared/constants/facilityTypes';
import { CourtScheduleEditor } from '../CourtScheduleEditor';
import { FacilityCourtFormBody } from './FacilityCourtFormBody';
import { US_STATES } from './usStates';
import type { UseFacilityManagementReturn } from './useFacilityManagement';
import {
  parseLocalDate,
  toDatetimeLocalInput,
} from '../../../utils/dateUtils';
import { formatGroupedOperatingHoursSummary } from '../../../../shared/utils/operatingHours';

type Props = UseFacilityManagementReturn;

export function FacilityDetailsTab(props: Props) {
  const {
    isEditing, setIsEditing, saving, facilityData, setFacilityData,
    handleSave, handleCancel, getHoursDisplay, handleOperatingHoursChange,
    handlePrimaryContactChange, addSecondaryContact, updateSecondaryContact,
    removeSecondaryContact, renderSectionSaveFooter, renderTabFooterSaveBar,
    secondaryLocations, addingSecondaryLocation, setAddingSecondaryLocation,
    newSecondaryLocation, setNewSecondaryLocation, savingSecondaryLocation,
    editingSecondaryLocationId, editingSecondaryLocation, setEditingSecondaryLocation,
    cancelEditingSecondaryLocation, handleAddSecondaryLocation, handleRemoveSecondaryLocation,
    startEditingSecondaryLocation, handleUpdateSecondaryLocation,
    handleBookingRulesChange, handleWeekendPolicyChange, addPeakHourSlot, removePeakHourSlot,
    updatePeakHourSlotTime, updatePeakHourSlotRule, togglePeakHourSlotExpanded,
    setPeakHourSlotCourtMode, togglePeakHourSlotCourt, togglePeakHourSlotDay,
    expandedPeakHourSlots, courts, courtsLoading, editingCourt, setEditingCourt,
    isAddingNewCourt, courtSaving, stripeOnboarded, stripeStatusLoading,
    configuringCourtId, courtSchedule, courtScheduleLoading, courtScheduleSaving,
    courtOperatingHours, courtHoursLoading, facilityCourtEditPanelRef,
    blackouts, blackoutsLoading, editingBlackout, setEditingBlackout,
    isAddingBlackout, blackoutSaving, handleAddNewCourt, handleEditCourt,
    handleSaveCourt, handleCancelCourtEdit, handleDeleteCourt, handleToggleCourtConfig,
    updateCourtScheduleDay, updateAllScheduleDays, saveCourtSchedule,
    handleAddBlackout, handleSaveBlackout, handleDeleteBlackout,
    renderRuleCategoryCard, getCourtStatusColor, formatCourtStatus, performSave,
  } = props;

  return (
<TabsContent value="details" className="space-y-6">
  <div className="flex justify-end">
    {!isEditing ? (
      <Button onClick={() => setIsEditing(true)}>
        <Edit className="h-4 w-4 mr-2" />
        Edit Details
      </Button>
    ) : (
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    )}
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Basic Information */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Basic Information
        </CardTitle>
        <CardDescription>General facility details and contact information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Facility Name</Label>
          <Input
            id="name"
            value={facilityData.name}
            onChange={(e) => setFacilityData({ ...facilityData, name: e.target.value })}
            disabled={!isEditing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Facility Type</Label>
          <Select
            value={facilityData.type}
            onValueChange={(value) => setFacilityData({ ...facilityData, type: value })}
            disabled={!isEditing}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select facility type" />
            </SelectTrigger>
            <SelectContent>
              {getFacilityTypeSelectOptions(facilityData.type).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={facilityData.description}
            onChange={(e) => setFacilityData({ ...facilityData, description: e.target.value })}
            disabled={!isEditing}
            rows={4}
          />
        </div>
      </CardContent>
      {renderSectionSaveFooter('basic information')}
    </Card>

    {/* Facility Logo/Image */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Facility Logo
        </CardTitle>
        <CardDescription>Upload your facility's logo or image</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          {(facilityData.facilityImagePreview || facilityData.logoUrl) ? (
            <div className="relative">
              <img
                src={facilityData.facilityImagePreview || facilityData.logoUrl}
                alt="Facility Logo"
                className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                onError={() => {
                  // A previously saved blob: URL (or otherwise unreachable URL)
                  // can no longer be loaded. Clear it so we show the empty-state
                  // placeholder instead of a broken-image icon.
                  if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                    URL.revokeObjectURL(facilityData.facilityImagePreview);
                  }
                  setFacilityData(prev => ({
                    ...prev,
                    logoUrl: prev.logoUrl && prev.logoUrl.startsWith('blob:') ? '' : prev.logoUrl,
                    facilityImagePreview: '',
                    facilityImage: null,
                  }));
                }}
              />
              {isEditing && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                  onClick={() => {
                    if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                      URL.revokeObjectURL(facilityData.facilityImagePreview);
                    }
                    setFacilityData({ ...facilityData, logoUrl: '', facilityImagePreview: '', facilityImage: null });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <div className="w-32 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
              <Building2 className="h-12 w-12 text-gray-400" />
            </div>
          )}
          {isEditing && (
            <div className="w-full">
              <input
                type="file"
                accept="image/*"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (!file.type.startsWith('image/')) {
                    toast.error('Please select an image file');
                    e.target.value = '';
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error('Image size must be less than 5MB');
                    e.target.value = '';
                    return;
                  }

                  if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                    URL.revokeObjectURL(facilityData.facilityImagePreview);
                  }

                  // Read as a base64 data URL so the logo persists across
                  // reloads. (Blob URLs are only valid in the tab that
                  // created them, which caused saved logos to break.)
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const dataUrl = reader.result as string;
                    setFacilityData(prev => ({
                      ...prev,
                      facilityImage: file,
                      facilityImagePreview: dataUrl,
                      logoUrl: dataUrl,
                    }));
                  };
                  reader.onerror = () => {
                    toast.error('Failed to read image file');
                  };
                  reader.readAsDataURL(file);

                  e.target.value = '';
                }}
                className="hidden"
                id="facilityLogo"
              />
              <label htmlFor="facilityLogo">
                <Button variant="outline" asChild className="w-full cursor-pointer">
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {facilityData.facilityImagePreview ? 'Change Image' : 'Upload Image'}
                  </span>
                </Button>
              </label>
              <p className="text-xs text-gray-500 text-center mt-2">PNG, JPG up to 5MB</p>
            </div>
          )}
        </div>
      </CardContent>
      {renderSectionSaveFooter('facility logo')}
    </Card>

    {/* Location Information */}
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location
        </CardTitle>
        <CardDescription>Facility address</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="primaryLocationLabel">Primary Address Label</Label>
          <Input
            id="primaryLocationLabel"
            value={facilityData.primaryLocationLabel}
            onChange={(e) => setFacilityData({ ...facilityData, primaryLocationLabel: e.target.value })}
            disabled={!isEditing}
            placeholder="Main Campus"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="streetAddress">Street Address</Label>
          <Input
            id="streetAddress"
            value={facilityData.streetAddress}
            onChange={(e) => setFacilityData({ ...facilityData, streetAddress: e.target.value })}
            disabled={!isEditing}
            placeholder="123 Main Street"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={facilityData.city}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFacilityData({ ...facilityData, city: e.target.value })}
              disabled={!isEditing}
              placeholder="City"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Select
              value={facilityData.state}
              onValueChange={(value: string) => setFacilityData({ ...facilityData, state: value })}
              disabled={!isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zipCode">ZIP Code</Label>
            <Input
              id="zipCode"
              value={facilityData.zipCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFacilityData({ ...facilityData, zipCode: e.target.value })}
              disabled={!isEditing}
              placeholder="12345"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Number
            </Label>
            <Input
              id="phone"
              value={facilityData.phone}
              onChange={(e) => setFacilityData({ ...facilityData, phone: e.target.value })}
              disabled={!isEditing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={facilityData.email}
              onChange={(e) => setFacilityData({ ...facilityData, email: e.target.value })}
              disabled={!isEditing}
            />
          </div>
        </div>
      </CardContent>
      {renderSectionSaveFooter('location details')}
    </Card>

    {/* Secondary Facility Locations */}
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Additional Locations
            </CardTitle>
            <CardDescription>Add a second campus or branch with a custom name</CardDescription>
          </div>
          {!addingSecondaryLocation && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                cancelEditingSecondaryLocation();
                setAddingSecondaryLocation(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Location
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {secondaryLocations.length > 0 && (
          <div className="space-y-3">
            {secondaryLocations.map((loc) => (
              <div key={loc.id} className="p-3 border rounded-lg bg-gray-50">
                {editingSecondaryLocationId === loc.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2 space-y-1">
                        <Label>Location Name</Label>
                        <Input
                          value={editingSecondaryLocation.locationName}
                          onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, locationName: e.target.value }))}
                          placeholder="North Campus"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label>Street Address</Label>
                        <Input
                          value={editingSecondaryLocation.streetAddress}
                          onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, streetAddress: e.target.value }))}
                          placeholder="123 Main St"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>City</Label>
                        <Input
                          value={editingSecondaryLocation.city}
                          onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>State</Label>
                          <Select
                            value={editingSecondaryLocation.state}
                            onValueChange={(value) => setEditingSecondaryLocation(prev => ({ ...prev, state: value }))}
                          >
                            <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                            <SelectContent>
                              {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>ZIP Code</Label>
                          <Input
                            value={editingSecondaryLocation.zipCode}
                            onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, zipCode: e.target.value }))}
                            placeholder="12345"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Phone</Label>
                        <Input
                          value={editingSecondaryLocation.phone}
                          onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="(555) 000-0000"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleUpdateSecondaryLocation} disabled={savingSecondaryLocation}>
                        <Save className="h-4 w-4 mr-1" />
                        {savingSecondaryLocation ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditingSecondaryLocation}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{loc.locationName}</p>
                      <p className="text-sm text-gray-600">{loc.streetAddress}</p>
                      <p className="text-sm text-gray-600">{loc.city}, {loc.state} {loc.zipCode}</p>
                      {loc.phone && <p className="text-sm text-gray-500">{loc.phone}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditingSecondaryLocation(loc)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleRemoveSecondaryLocation(loc.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {addingSecondaryLocation && (
          <div className="border rounded-lg p-4 bg-green-50 space-y-3">
            <p className="text-sm font-medium text-gray-800">New Location</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2 space-y-1">
                <Label>Location Name <span className="text-gray-400">(e.g. "North Campus")</span></Label>
                <Input
                  value={newSecondaryLocation.locationName}
                  onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, locationName: e.target.value }))}
                  placeholder="North Campus"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>Street Address</Label>
                <Input
                  value={newSecondaryLocation.streetAddress}
                  onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, streetAddress: e.target.value }))}
                  placeholder="123 Main St"
                />
              </div>
              <div className="space-y-1">
                <Label>City</Label>
                <Input
                  value={newSecondaryLocation.city}
                  onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>State</Label>
                  <Select
                    value={newSecondaryLocation.state}
                    onValueChange={(v) => setNewSecondaryLocation(prev => ({ ...prev, state: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ZIP Code</Label>
                  <Input
                    value={newSecondaryLocation.zipCode}
                    onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, zipCode: e.target.value }))}
                    placeholder="12345"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Phone <span className="text-gray-400">(optional)</span></Label>
                <Input
                  value={newSecondaryLocation.phone}
                  onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAddSecondaryLocation} disabled={savingSecondaryLocation}>
                <Save className="h-4 w-4 mr-1" />
                {savingSecondaryLocation ? 'Saving...' : 'Save Location'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingSecondaryLocation(false); setNewSecondaryLocation({ locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: '' }); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {secondaryLocations.length === 0 && !addingSecondaryLocation && (
          <p className="text-sm text-gray-500">No additional locations. Click "Add Location" to add a second campus or branch.</p>
        )}
      </CardContent>
    </Card>

    {/* Court hours (facility setup — syncs to Court Management) */}
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Court hours
        </CardTitle>
        <CardDescription>
          Weekly open and close times for the facility calendar and for every court&apos;s schedule. Saving updates Court Management for all courts (prime-time and slot settings you set per court are kept). You can still fine-tune each court under the Court Management tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Timezone Selector */}
        <div className="mb-6">
          <Label className="text-sm font-medium mb-2 block">Timezone</Label>
          {isEditing ? (
            <Select
              value={facilityData.timezone}
              onValueChange={(value: string) => setFacilityData({ ...facilityData, timezone: value })}
            >
              <SelectTrigger className="w-72">
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
          ) : (
            <p className="text-sm text-gray-600">{facilityData.timezone}</p>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
              <div key={day} className="flex flex-col gap-3 p-3 bg-gray-50 rounded-lg sm:flex-row sm:items-center sm:gap-4">
                <div className="font-medium capitalize sm:w-28">{day}</div>
                <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex sm:flex-1 sm:items-center sm:gap-2">
                  <div className="space-y-1 sm:space-y-0">
                    <Label className="text-xs text-gray-600 sm:hidden">Start time</Label>
                    <Input
                      type="time"
                      value={facilityData.operatingHours[day]?.open || '08:00'}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'open', e.target.value)}
                      disabled={facilityData.operatingHours[day]?.closed}
                      className="w-full sm:w-32"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-0">
                    <Label className="text-xs text-gray-600 sm:hidden">End time</Label>
                    <Input
                      type="time"
                      value={facilityData.operatingHours[day]?.close || '20:00'}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'close', e.target.value)}
                      disabled={facilityData.operatingHours[day]?.closed}
                      className="w-full sm:w-32"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <Switch
                    id={`closed-${day}`}
                    checked={facilityData.operatingHours[day]?.closed || false}
                    onCheckedChange={(checked: boolean) => handleOperatingHoursChange(day, 'closed', checked)}
                  />
                  <Label htmlFor={`closed-${day}`} className="text-sm text-gray-600">Closed</Label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
              <div key={day} className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium capitalize text-sm mb-1">{day}</div>
                <div className="text-sm text-gray-600">{getHoursDisplay(day)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {renderSectionSaveFooter('operating hours & timezone')}
    </Card>

    {/* Primary Contact */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Primary Contact
        </CardTitle>
        <CardDescription>Main point of contact for the facility</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="primaryContactName">Contact Name</Label>
          <Input
            id="primaryContactName"
            value={facilityData.primaryContact.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('name', e.target.value)}
            disabled={!isEditing}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primaryContactEmail">Email</Label>
          <Input
            id="primaryContactEmail"
            type="email"
            value={facilityData.primaryContact.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('email', e.target.value)}
            disabled={!isEditing}
            placeholder="email@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primaryContactPhone">Phone</Label>
          <Input
            id="primaryContactPhone"
            value={facilityData.primaryContact.phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('phone', e.target.value)}
            disabled={!isEditing}
            placeholder="(555) 555-5555"
          />
        </div>
      </CardContent>
      {renderSectionSaveFooter('primary contact')}
    </Card>

    {/* Secondary Contacts */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Secondary Contacts
        </CardTitle>
        <CardDescription>Additional contacts for the facility</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {facilityData.secondaryContacts.length === 0 ? (
          <p className="text-gray-500 text-sm">No secondary contacts added</p>
        ) : (
          facilityData.secondaryContacts.map((contact, index) => (
            <div key={contact.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">Contact {index + 1}</span>
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSecondaryContact(contact.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Name"
                  value={contact.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'name', e.target.value)}
                  disabled={!isEditing}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={contact.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'email', e.target.value)}
                  disabled={!isEditing}
                />
                <Input
                  placeholder="Phone"
                  value={contact.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'phone', e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>
          ))
        )}
        {isEditing && (
          <Button variant="outline" onClick={addSecondaryContact} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Secondary Contact
          </Button>
        )}
      </CardContent>
      {renderSectionSaveFooter('secondary contacts')}
    </Card>

  </div>
  {renderTabFooterSaveBar()}
</TabsContent>

  );
}
