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

export function FacilityRulesTab(props: Props) {
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
<TabsContent value="rules" className="space-y-6">
  <div className="flex justify-end">
    {!isEditing ? (
      <Button onClick={() => setIsEditing(true)}>
        <Edit className="h-4 w-4 mr-2" />
        Edit Rules
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

  <div className="space-y-6">
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" />
          General Rules
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Set general facility policies and member expectations shown to users during booking.
          </p>
        </div>
        <div>
          <Label>General Usage Rules</Label>
          <Textarea
            value={facilityData.bookingRules.generalRules}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleBookingRulesChange('generalRules', e.target.value)}
            placeholder="Enter your facility's general booking rules"
            className="min-h-[100px] mt-1"
            disabled={!isEditing}
          />
        </div>
      </CardContent>
      {renderSectionSaveFooter('general rules')}
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Restriction Type
        </CardTitle>
        <CardDescription>Controls whether household limits are enforced</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Choose whether booking limits apply per individual account or are shared by household.
          </p>
        </div>
        <Label>Restriction Type</Label>
        <Select
          value={facilityData.bookingRules.restrictionType}
          onValueChange={(value) => handleBookingRulesChange('restrictionType', value as 'account' | 'address')}
          disabled={!isEditing}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="account">Per Account</SelectItem>
            <SelectItem value="address">Per Address</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
      {renderSectionSaveFooter('restriction type')}
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Max Accounts Per Address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            {RULE_METADATA.find((m) => m.code === 'HH-001')?.description ??
              'Limits how many member accounts can join from the same street address. When off, there is no limit.'}
            {' '}This rule is separate from the address whitelist.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label>Enable</Label>
          <Switch
            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
            checked={facilityData.bookingRules.householdMaxMembersEnabled}
            onCheckedChange={(v: boolean) => handleBookingRulesChange('householdMaxMembersEnabled', v)}
            disabled={!isEditing}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-gray-600 whitespace-nowrap">Max Accounts:</Label>
          <Input
            type="number"
            min="1"
            max="50"
            className="w-24"
            value={facilityData.bookingRules.householdMaxMembers}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleBookingRulesChange('householdMaxMembers', e.target.value)
            }
            disabled={!isEditing || !facilityData.bookingRules.householdMaxMembersEnabled}
          />
        </div>
      </CardContent>
      {renderSectionSaveFooter('max accounts per address')}
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Days in Advance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Define how far in advance members are allowed to reserve a court.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label>Enable</Label>
          <Switch
            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
            checked={facilityData.bookingRules.daysInAdvanceEnabled}
            onCheckedChange={(v: boolean) => handleBookingRulesChange('daysInAdvanceEnabled', v)}
            disabled={!isEditing}
          />
        </div>
        <Input type="number" min="0" value={facilityData.bookingRules.daysInAdvance} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('daysInAdvance', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.daysInAdvanceEnabled} />
      </CardContent>
      {renderSectionSaveFooter('days in advance')}
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Max Reservation Duration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Control the maximum length of a single reservation.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label>Enable</Label>
          <Switch
            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
            checked={facilityData.bookingRules.maxReservationDurationEnabled}
            onCheckedChange={(v: boolean) => handleBookingRulesChange('maxReservationDurationEnabled', v)}
            disabled={!isEditing}
          />
        </div>
        {(() => {
          const totalMinutes = Number(facilityData.bookingRules.maxReservationDurationMinutes) || 0;
          const displayValue = String(totalMinutes / 60);
          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={displayValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isFinite(n)) {
                    handleBookingRulesChange('maxReservationDurationMinutes', '0');
                    return;
                  }
                  const minutes = Math.round(n * 60);
                  handleBookingRulesChange('maxReservationDurationMinutes', String(minutes));
                }}
                disabled={!isEditing || !facilityData.bookingRules.maxReservationDurationEnabled}
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">hours</span>
            </div>
          );
        })()}
      </CardContent>
      {renderSectionSaveFooter('max reservation duration')}
    </Card>

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          User-Based Limits
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Courts Per Week (Individual)</Label>
          <div className="flex gap-2 items-center">
            <Switch
              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
              checked={facilityData.bookingRules.courtsPerWeekUserEnabled}
              onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerWeekUserEnabled', v)}
              disabled={!isEditing}
            />
            <Input type="number" min="1" value={facilityData.bookingRules.courtsPerWeekUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerWeekUser', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerWeekUserEnabled} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Courts Per Day (Individual)</Label>
          <div className="flex gap-2 items-center">
            <Switch
              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
              checked={facilityData.bookingRules.courtsPerDayUserEnabled}
              onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerDayUserEnabled', v)}
              disabled={!isEditing}
            />
            <Input type="number" min="1" value={facilityData.bookingRules.courtsPerDayUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerDayUser', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerDayUserEnabled} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Courts Per Week (Household)</Label>
          <div className="flex gap-2 items-center">
            <Switch
              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
              checked={facilityData.bookingRules.courtsPerWeekHouseholdEnabled}
              onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerWeekHouseholdEnabled', v)}
              disabled={!isEditing}
            />
            <Input type="number" min="1" value={facilityData.bookingRules.courtsPerWeekHousehold} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerWeekHousehold', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerWeekHouseholdEnabled} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Courts Per Day (Household)</Label>
          <div className="flex gap-2 items-center">
            <Switch
              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
              checked={facilityData.bookingRules.courtsPerDayHouseholdEnabled}
              onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerDayHouseholdEnabled', v)}
              disabled={!isEditing}
            />
            <Input type="number" min="1" value={facilityData.bookingRules.courtsPerDayHousehold} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerDayHousehold', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerDayHouseholdEnabled} />
          </div>
        </div>
      </CardContent>
      {renderSectionSaveFooter('user-based limits')}
    </Card>

    {/* Peak Hours Policy */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Peak Hours Policy
          </span>
          <Switch
            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
            checked={facilityData.bookingRules.hasPeakHours}
            onCheckedChange={(checked: boolean) => handleBookingRulesChange('hasPeakHours', checked)}
            disabled={!isEditing}
          />
        </CardTitle>
        <CardDescription>Set different restrictions during peak hours</CardDescription>
      </CardHeader>
      {facilityData.bookingRules.hasPeakHours && (
        <CardContent className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
            <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">
              Configure peak-hour time slots and custom restrictions that apply during those windows.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Peak Hours Slots</h4>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={() => addPeakHourSlot()}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Peak Hours Slot
                </Button>
              )}
            </div>
            {facilityData.bookingRules.peakHoursSlots.length > 0 ? (
              <div className="space-y-2">
                {facilityData.bookingRules.peakHoursSlots.map((slot) => {
                  return (
                    <div key={slot.id} className="border rounded-md p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={slot.startTime}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlotTime(slot.id, 'startTime', e.target.value)}
                          disabled={!isEditing}
                          className="w-32"
                        />
                        <span>to</span>
                        <Input
                          type="time"
                          value={slot.endTime}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlotTime(slot.id, 'endTime', e.target.value)}
                          disabled={!isEditing}
                          className="w-32"
                        />
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePeakHourSlot(slot.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2 p-3 bg-gray-50 rounded-md">
                        <Label className="text-sm">Applies To Days</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border rounded p-2 bg-white">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => (
                            <label key={label} className="inline-flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={slot.days.includes(day)}
                                disabled={!isEditing}
                                onChange={() => togglePeakHourSlotDay(slot.id, day)}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <div className="space-y-2 pt-1">
                          <Label className="text-sm">Max Reservation Duration</Label>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Enable</Label>
                            <Switch
                              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                              checked={!slot.rules.maxDurationUnlimited}
                              onCheckedChange={(checked: boolean) =>
                                updatePeakHourSlotRule(slot.id, 'maxDurationUnlimited', !checked)
                              }
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0.5"
                              step="0.5"
                              className="w-24 h-8"
                              value={slot.rules.maxDurationUnlimited ? '' : slot.rules.maxDurationHours}
                              disabled={!isEditing || slot.rules.maxDurationUnlimited}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                updatePeakHourSlotRule(slot.id, 'maxDurationHours', e.target.value)
                              }
                            />
                            <span className="text-xs text-gray-500 whitespace-nowrap">hours</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          <Label className="text-sm md:col-span-2">User-Based Limits</Label>
                          <div className="space-y-1">
                            <Label className="text-xs">Courts Per Day (Individual)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                checked={!slot.rules.maxBookingsPerDayUnlimited}
                                onCheckedChange={(checked: boolean) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayUnlimited', !checked)
                                }
                                disabled={!isEditing}
                              />
                              <Input
                                type="number"
                                min="1"
                                className="w-24 h-8"
                                value={slot.rules.maxBookingsPerDayUnlimited ? '' : slot.rules.maxBookingsPerDay}
                                disabled={!isEditing || slot.rules.maxBookingsPerDayUnlimited}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerDay', e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Courts Per Week (Individual)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                checked={!slot.rules.maxBookingsPerWeekUnlimited}
                                onCheckedChange={(checked: boolean) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekUnlimited', !checked)
                                }
                                disabled={!isEditing}
                              />
                              <Input
                                type="number"
                                min="1"
                                className="w-24 h-8"
                                value={slot.rules.maxBookingsPerWeekUnlimited ? '' : slot.rules.maxBookingsPerWeek}
                                disabled={!isEditing || slot.rules.maxBookingsPerWeekUnlimited}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeek', e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Courts Per Week (Household)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                checked={!slot.rules.maxBookingsPerWeekHouseholdUnlimited}
                                onCheckedChange={(checked: boolean) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHouseholdUnlimited', !checked)
                                }
                                disabled={!isEditing}
                              />
                              <Input
                                type="number"
                                min="1"
                                className="w-24 h-8"
                                value={slot.rules.maxBookingsPerWeekHouseholdUnlimited ? '' : slot.rules.maxBookingsPerWeekHousehold}
                                disabled={!isEditing || slot.rules.maxBookingsPerWeekHouseholdUnlimited}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHousehold', e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Courts Per Day (Household)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                checked={!slot.rules.maxBookingsPerDayHouseholdUnlimited}
                                onCheckedChange={(checked: boolean) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHouseholdUnlimited', !checked)
                                }
                                disabled={!isEditing}
                              />
                              <Input
                                type="number"
                                min="1"
                                className="w-24 h-8"
                                value={slot.rules.maxBookingsPerDayHouseholdUnlimited ? '' : slot.rules.maxBookingsPerDayHousehold}
                                disabled={!isEditing || slot.rules.maxBookingsPerDayHouseholdUnlimited}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHousehold', e.target.value)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No peak hours slots configured.</p>
            )}
          </div>
        </CardContent>
      )}
      {renderSectionSaveFooter('peak hours policy')}
    </Card>

                </div>
  {renderTabFooterSaveBar()}
</TabsContent>

  );
}
