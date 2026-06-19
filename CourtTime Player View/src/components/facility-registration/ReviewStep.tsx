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
import { COURT_FEES_MODE_OPTIONS } from './courtFees';
import {
  courtScheduleRowsToOperatingHoursMap,
  formatGroupedOperatingHoursSummary,
  formatWallTimeRange12Hour,
} from '../../../shared/utils/operatingHours';

export function ReviewStep() {
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

    const bookingRulesReview = buildRegistrationBookingRules(formData.rulesConfig);
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const reviewRuleRows = [
      {
        label: 'Days in Advance',
        enabled: bookingRulesReview.daysInAdvanceEnabled,
        value: bookingRulesReview.daysInAdvance ? `${bookingRulesReview.daysInAdvance} day(s)` : '',
      },
      {
        label: 'Max Reservation Duration',
        enabled: bookingRulesReview.maxReservationDurationEnabled,
        value: bookingRulesReview.maxBookingDurationHours
          ? `${bookingRulesReview.maxBookingDurationHours} hour(s)`
          : '',
      },
      {
        label: 'Courts Per Week (Individual)',
        enabled: bookingRulesReview.courtsPerWeekUserEnabled,
        value: bookingRulesReview.courtsPerWeekUser,
      },
      {
        label: 'Courts Per Day (Individual)',
        enabled: bookingRulesReview.courtsPerDayUserEnabled,
        value: bookingRulesReview.courtsPerDayUser,
      },
      {
        label: 'Courts Per Week (Household)',
        enabled: bookingRulesReview.courtsPerWeekHouseholdEnabled,
        value: bookingRulesReview.courtsPerWeekHousehold,
      },
      {
        label: 'Courts Per Day (Household)',
        enabled: bookingRulesReview.courtsPerDayHouseholdEnabled,
        value: bookingRulesReview.courtsPerDayHousehold,
      },
    ];
    const peakHoursSummaries = formData.rulesConfig.peakHoursSlots.map((slot, index) => {
      const days = slot.days
        .slice()
        .sort((a, b) => a - b)
        .map((day) => dayLabels[day] || '?')
        .join(', ');
      const parts = [
        formatWallTimeRange12Hour(slot.startTime, slot.endTime),
        days || 'No days selected',
      ];
      return `Slot ${index + 1}: ${parts.join(' · ')}`;
    });

    return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Review & Submit</h3>
        <p className="text-sm text-gray-600 mb-6">
          Please review your facility information before submitting.
        </p>
      </div>

      {!preAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Administrator Account
              {loggedInDuringRegistration && (
                <Badge variant="secondary" className="text-xs">Existing Account</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {loggedInDuringRegistration && user ? (
              <>
                <div><span className="font-medium">Name:</span> {user.fullName}</div>
                <div><span className="font-medium">Email:</span> {user.email}</div>
                {user.phone && <div><span className="font-medium">Phone:</span> {user.phone}</div>}
              </>
            ) : (
              <>
                <div><span className="font-medium">Name:</span> {formData.adminFirstName} {formData.adminLastName}</div>
                <div><span className="font-medium">Email:</span> {formData.adminEmail}</div>
                <div><span className="font-medium">Phone:</span> {formData.adminPhone}</div>
                <div><span className="font-medium">Address:</span> {formData.adminStreetAddress}, {formData.adminCity}, {formData.adminState} {formData.adminZipCode}</div>
              </>
            )}
            {formData.adminSkillLevel && <div><span className="font-medium">Skill Level:</span> {formData.adminSkillLevel}</div>}
            {formData.adminUstaRating && <div><span className="font-medium">USTA Rating:</span> {formData.adminUstaRating}</div>}
            {formData.adminBio && <div><span className="font-medium">Bio:</span> {formData.adminBio}</div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facility Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {formData.facilityImagePreview && (
            <div className="mb-4">
              <span className="font-medium block mb-2">Facility Image:</span>
              <img
                src={formData.facilityImagePreview}
                alt="Facility preview"
                className="w-full max-w-md h-48 object-cover rounded-lg border"
              />
            </div>
          )}
          <div><span className="font-medium">Name:</span> {formData.facilityName}</div>
          <div><span className="font-medium">Type:</span> {formData.facilityType}</div>
          {formData.primaryLocationLabel && <div><span className="font-medium">Primary Address Label:</span> {formData.primaryLocationLabel}</div>}
          <div><span className="font-medium">Address:</span> {formData.streetAddress}, {formData.city}, {formData.state} {formData.zipCode}</div>
          <div><span className="font-medium">Phone:</span> {formData.phone}</div>
          <div><span className="font-medium">Email:</span> {formData.email}</div>
          {formData.description && <div><span className="font-medium">Description:</span> {formData.description}</div>}
          {formData.enableTermsAndConditions && formData.termsAndConditions.trim() && (
            <div>
              <span className="font-medium">Terms & Conditions:</span>
              <p className="text-gray-600 mt-1 whitespace-pre-line">{formData.termsAndConditions}</p>
            </div>
          )}
          {formData.addressWhitelistFileName && <div><span className="font-medium">Address Whitelist:</span> {formData.addressWhitelistFileName}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium text-gray-700 mb-1">Primary Contact</div>
            <div className="pl-3 space-y-1 text-gray-600">
              <div>{formData.primaryContact.name}</div>
              <div>{formData.primaryContact.email}</div>
              <div>{formData.primaryContact.phone}</div>
            </div>
          </div>
          {formData.secondaryContacts.length > 0 && (
            <div>
              <div className="font-medium text-gray-700 mb-1">Secondary Contacts</div>
              {formData.secondaryContacts.map((contact, index) => (
                <div key={contact.id} className="pl-3 space-y-1 text-gray-600 mb-2">
                  <div className="text-xs text-gray-500">Contact {index + 1}</div>
                  <div>{contact.name}</div>
                  <div>{contact.email}</div>
                  <div>{contact.phone}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Courts ({formData.courts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {(formData.courtFeesMode !== 'none' || formData.courtFeesBallMachineEnabled) && (
            <div className="mb-4 pb-4 border-b border-gray-100 text-sm text-gray-600">
              <span className="font-medium text-gray-900">Fees (all courts): </span>
              {formData.courtFeesMode !== 'none' &&
                COURT_FEES_MODE_OPTIONS.find((option) => option.value === formData.courtFeesMode)?.label}
              {(formData.courtFeesMode === 'paid_booking' || formData.courtFeesMode === 'both') &&
                formData.courtFeesBookingDollars && (
                  <> · Paid ${formData.courtFeesBookingDollars}/hr</>
                )}
              {(formData.courtFeesMode === 'guest_fee' || formData.courtFeesMode === 'both') &&
                formData.courtFeesGuestDollars && (
                  <> · Guest fee ${formData.courtFeesGuestDollars}</>
                )}
              {formData.courtFeesBallMachineEnabled && formData.courtFeesBallMachineDollars && (
                <> · Ball machine ${formData.courtFeesBallMachineDollars}/hr</>
              )}
            </div>
          )}
          <div className="space-y-2 text-sm">
            {formData.courts.map((court) => {
              const schedule =
                court.operatingSchedule?.length === 7
                  ? court.operatingSchedule
                  : buildDefaultCourtSchedule();
              const hoursSummary = formatGroupedOperatingHoursSummary(
                courtScheduleRowsToOperatingHoursMap(schedule)
              );
              return (
              <div key={court.id} className="flex flex-col gap-1 py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium">{court.name}</span>
                {hoursSummary && (
                  <span className="text-gray-600 text-sm">{hoursSummary}</span>
                )}
                <span className="text-gray-600 text-sm">
                  {court.surfaceType} · {court.courtType} · {court.isIndoor ? 'Indoor' : 'Outdoor'}
                  {court.canSplit && ` · Splits into ${court.splitConfig?.splitNames.join(', ')}`}
                </span>
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {formData.rulesConfig.generalRules && (
            <div>
              <span className="font-medium">General Rules:</span>
              <p className="text-gray-600 mt-1 whitespace-pre-line">{formData.rulesConfig.generalRules}</p>
            </div>
          )}
          <div><span className="font-medium">Restriction Type:</span> {formData.rulesConfig.restrictionType === 'account' ? 'Per Account' : 'Per Address'}</div>

          <div className="mt-2">
            <span className="font-medium block mb-1">Rules From Setup:</span>
            <div className="space-y-1 pl-2">
              {reviewRuleRows.map((rule) => (
                <div key={rule.label} className="text-gray-600">
                  <span className="text-gray-800">{rule.label}:</span>{' '}
                  {rule.enabled
                    ? (rule.value || 'Configured')
                    : 'Off'}
                </div>
              ))}
            </div>
          </div>

          {formData.rulesConfig.hasPeakHours && (
            <div>
              <span className="font-medium">Peak Hours:</span>{' '}
              {peakHoursSummaries.length > 0 ? `${peakHoursSummaries.length} slot(s) configured` : 'Enabled with no slots yet'}
              {peakHoursSummaries.length > 0 && (
                <div className="space-y-1 pl-2 mt-1 text-gray-600">
                  {peakHoursSummaries.map((summary) => (
                    <div key={summary}>{summary}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {formData.rulesConfig.hasWeekendPolicy && (
            <div><span className="font-medium">Weekend Policy:</span> Custom weekend limits configured</div>
          )}
        </CardContent>
      </Card>

      {formData.adminInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin Invitations ({formData.adminInvites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {formData.adminInvites.map((invite) => (
                <div key={invite.id}>{invite.email}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          By submitting this registration, you confirm that all information provided is accurate and you agree to the terms of service.
        </AlertDescription>
      </Alert>
    </div>
    );
}
