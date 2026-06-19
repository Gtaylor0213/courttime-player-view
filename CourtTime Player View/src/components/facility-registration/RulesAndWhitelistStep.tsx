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

export function RulesAndWhitelistStep() {
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
      <RulesStep
        rulesConfig={formData.rulesConfig}
        onRulesChange={handleRulesChange}
        onRuleEntryChange={handleRuleEntryChange}
        onRuleConfigFieldChange={handleRuleConfigFieldChange}
        onAddPeakHourSlot={addPeakHourSlot}
        onRemovePeakHourSlot={removePeakHourSlot}
        onUpdatePeakHourSlot={updatePeakHourSlot}
        onTogglePeakHourSlotDay={togglePeakHourSlotDay}
        onUpdatePeakHourSlotRule={updatePeakHourSlotRule}
        errors={errors}
      />

      {/* Address Whitelist Upload */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Address Whitelist
          </CardTitle>
          <CardDescription>
            Upload a list of approved addresses and last names for membership verification (optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formData.addressWhitelistFileName ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-5 w-5 text-green-600 shrink-0" />
                <span className="text-sm text-green-700 break-words">{formData.addressWhitelistFileName} ({formData.parsedAddresses.length} addresses)</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeAddressWhitelist}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="h-6 w-6 text-gray-400 mb-1" />
              <span className="text-sm text-gray-500">Upload Address &amp; Last Name List</span>
              <span className="text-xs text-gray-400 mt-1">Excel or CSV file with Address and Last Name columns</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleAddressWhitelistChange}
                className="hidden"
              />
            </label>
          )}
          <p className="text-xs text-gray-500 mt-2">
            The file should have "Address" and "Last Name" columns (one entry per row). Members will be auto-approved when their address and last name match an entry on this list. Configure max accounts per address and booking limits in the Max Accounts Per Address section above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
