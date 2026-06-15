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
  courtFieldsAfterNumberInputChange,
  courtNumberInputDisplayValue,
} from '../../../shared/utils/courtNaming';
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

export function CourtsStep() {
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
    tennisCourtsScheduleTemplate, updateTennisCourtsScheduleTemplateDay,
    updateAllTennisCourtsScheduleTemplateDays, applyTennisCourtsScheduleToAll,
    addAdminInvite, updateAdminInvite, removeAdminInvite,
    preAuthenticated, loggedInDuringRegistration, buildRegistrationBookingRules,
    promoCode, setPromoCode, promoValidation, setPromoValidation,
    paymentComplete, paymentWaived, isValidatingPromo, isProcessingPayment,
    handleValidatePromo, handleClearPromo, handlePayWithStripe,
    US_STATES,
  } = useRegistration();

  return (
    <div id="courtsSection" className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Court Setup</h3>
        <p className="text-sm text-gray-600 mb-6">
          Set shared hours for all tennis courts below, then fine-tune any court individually.
          Pickleball and other court types keep their own schedules.
        </p>
      </div>

      {errors.courts && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errors.courts}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Button
          type="button"
          variant={courtFormMode === 'individual' ? 'default' : 'outline'}
          onClick={() => setCourtFormMode('individual')}
          className="flex-1"
        >
          Add Individual Court
        </Button>
        <Button
          type="button"
          variant={courtFormMode === 'bulk' ? 'default' : 'outline'}
          onClick={() => setCourtFormMode('bulk')}
          className="flex-1"
        >
          Bulk Create Courts
        </Button>
      </div>

      {courtFormMode === 'individual' && (
        <Button
          type="button"
          onClick={addCourt}
          variant="outline"
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Court
        </Button>
      )}

      {courtFormMode === 'bulk' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bulk Create Identical Courts</CardTitle>
            <CardDescription>
              Create multiple courts with the same properties
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Number of Courts</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={bulkCourtData.count}
                  onChange={(e) => setBulkCourtData(prev => ({ ...prev, count: e.target.value }))}
                />
              </div>
              <div>
                <Label>Starting Court Number</Label>
                <Input
                  type="number"
                  min="1"
                  value={bulkCourtData.startingNumber}
                  onChange={(e) => setBulkCourtData(prev => ({ ...prev, startingNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>Surface Type</Label>
                <Select
                  value={bulkCourtData.surfaceType}
                  onValueChange={(value: any) => setBulkCourtData(prev => ({ ...prev, surfaceType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hard">Hard</SelectItem>
                    <SelectItem value="Clay">Clay</SelectItem>
                    <SelectItem value="Grass">Grass</SelectItem>
                    <SelectItem value="Synthetic">Synthetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CourtTypeField
                id="bulkCourtType"
                value={bulkCourtData.courtType}
                onChange={(courtType) =>
                  setBulkCourtData((prev) => ({ ...prev, courtType }))
                }
              />
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={bulkCourtData.isIndoor}
                  onCheckedChange={(checked) => setBulkCourtData(prev => ({ ...prev, isIndoor: checked }))}
                />
                <Label>Indoor</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={bulkCourtData.hasLights}
                  onCheckedChange={(checked) => setBulkCourtData(prev => ({ ...prev, hasLights: checked }))}
                />
                <Label>Has Lights</Label>
              </div>
            </div>
            <Button type="button" onClick={addBulkCourts} className="w-full">
              Create {bulkCourtData.count} Court{parseInt(bulkCourtData.count) !== 1 ? 's' : ''}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-green-200 bg-green-50/40">
        <CardHeader>
          <CardTitle className="text-base">Tennis courts — shared schedule</CardTitle>
          <CardDescription>
            Set hours once for every court with type Tennis. Use &quot;Apply to all tennis courts&quot; to
            update existing courts, or edit each court&apos;s schedule below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CourtScheduleEditor
            schedule={tennisCourtsScheduleTemplate}
            onUpdateDay={updateTennisCourtsScheduleTemplateDay}
            onUpdateAllDays={updateAllTennisCourtsScheduleTemplateDays}
          />
          <Button type="button" onClick={applyTennisCourtsScheduleToAll}>
            Apply to all tennis courts
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4 mt-6">
        <h4 className="font-semibold">Courts ({formData.courts.length})</h4>
        {formData.courts.map((court) => (
          <Card key={court.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <div className="font-semibold">{court.name}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCourt(court.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Court Name</Label>
                  <p className="text-xs text-gray-500">Shown on the calendar — any label you want.</p>
                  <Input
                    value={court.name}
                    onChange={(e) => updateCourt(court.id, { name: e.target.value })}
                    placeholder="e.g. Center Court"
                  />
                </div>
                <div>
                  <Label>Court Number</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={courtNumberInputDisplayValue(court.courtNumber)}
                    onChange={(e) =>
                      updateCourt(court.id, courtFieldsAfterNumberInputChange(e.target.value, court.name))
                    }
                  />
                </div>
                <div>
                  <Label>Surface Type</Label>
                  <Select
                    value={court.surfaceType}
                    onValueChange={(value: any) => updateCourt(court.id, { surfaceType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hard">Hard</SelectItem>
                      <SelectItem value="Clay">Clay</SelectItem>
                      <SelectItem value="Grass">Grass</SelectItem>
                      <SelectItem value="Synthetic">Synthetic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CourtTypeField
                  id={`courtType-${court.id}`}
                  value={court.courtType}
                  onChange={(courtType) => updateCourt(court.id, { courtType })}
                />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={court.isIndoor}
                      onCheckedChange={(checked) => updateCourt(court.id, { isIndoor: checked })}
                    />
                    <Label className="text-sm">Indoor</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={court.hasLights}
                      onCheckedChange={(checked) => updateCourt(court.id, { hasLights: checked })}
                    />
                    <Label className="text-sm">Lights</Label>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Switch
                    checked={court.canSplit}
                    onCheckedChange={(checked) => updateCourt(court.id, { canSplit: checked })}
                  />
                  <Label className="text-sm">Can be split into multiple courts</Label>
                </div>

                {court.canSplit && (
                  <div className="ml-6 mt-3 p-4 bg-gray-50 rounded-lg">
                    <Label className="text-sm mb-2 block">Split Configuration</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Split Names (comma-separated)</Label>
                        <Input
                          placeholder="3a, 3b"
                          defaultValue={court.splitConfig?.splitNames.join(', ') || ''}
                          key={court.id + '-splitnames'}
                          onBlur={(e) => {
                            const names = e.target.value.split(',').map(n => n.trim()).filter(Boolean);
                            updateCourt(court.id, {
                              splitConfig: { ...court.splitConfig, splitNames: names } as any
                            });
                          }}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Split Type</Label>
                        <Select
                          value={court.splitConfig?.splitType || 'Pickleball'}
                          onValueChange={(value: any) => {
                            updateCourt(court.id, {
                              splitConfig: { ...court.splitConfig, splitType: value } as any
                            });
                          }}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Tennis">Tennis</SelectItem>
                            <SelectItem value="Pickleball">Pickleball</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Split courts share booking conflicts with the parent court
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 border-t pt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h5 className="text-sm font-medium">Operating hours</h5>
                    <p className="text-xs text-gray-500">
                      Weekly schedule for this court only
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => resetCourtScheduleToFacilityDefaults(court.id)}
                  >
                    Use facility default hours
                  </Button>
                </div>
                <CourtScheduleEditor
                  schedule={
                    court.operatingSchedule?.length === 7
                      ? court.operatingSchedule
                      : buildDefaultCourtSchedule()
                  }
                  onUpdateDay={(dayOfWeek, field, value) =>
                    updateCourtScheduleDay(court.id, dayOfWeek, field, value)
                  }
                />
              </div>

              <PaidCourtBookingFields
                court={court}
                onChange={(patch) => updateCourt(court.id, patch)}
                stripeOnboarded={false}
                stripeStatusLoading={false}
                paymentsTabHint="Member Payments (after registration)"
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
