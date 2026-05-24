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

export function AdminsStep() {
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
      <div>
        <h3 className="text-lg font-semibold mb-4">Additional Administrators (Optional)</h3>
        <p className="text-sm text-gray-600 mb-6">
          Invite other administrators to help manage your facility. You can also do this later from the admin dashboard.
        </p>
      </div>

      <Button
        type="button"
        onClick={addAdminInvite}
        variant="outline"
        className="w-full"
      >
        <Mail className="h-4 w-4 mr-2" />
        Add Admin Invitation
      </Button>

      {formData.adminInvites.length > 0 && (
        <div className="space-y-3 mt-6">
          <h4 className="font-semibold">Admin Invitations ({formData.adminInvites.length})</h4>
          {formData.adminInvites.map((invite) => (
            <div key={invite.id} className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  value={invite.email}
                  onChange={(e) => updateAdminInvite(invite.id, e.target.value)}
                  placeholder="admin@email.com"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAdminInvite(invite.id)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {formData.adminInvites.length === 0 && (
        <Alert>
          <AlertDescription>
            You can skip this step and invite administrators later from your facility dashboard.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
