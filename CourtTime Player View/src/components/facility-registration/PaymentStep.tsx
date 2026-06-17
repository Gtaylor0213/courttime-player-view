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
  formatAnnualPricePerYear,
  PER_COURT_CENTS,
  MIN_SUBSCRIPTION_CENTS,
  MAX_SUBSCRIPTION_CENTS,
} from '../../services/subscriptionPricing';
import { useRegistration } from './RegistrationContext';
import { AdminProfileFields } from './AdminProfileFields';
import { FacilityOperatingHoursSection } from './FacilityOperatingHoursSection';

export function PaymentStep() {
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

    const courtCount = formData.courts.length;
    const baseAmountCents = getAmountForCourts(courtCount);
    const rawAmountCents = courtCount * PER_COURT_CENTS;
    const finalAmountCents = promoValidation?.valid
      ? (promoValidation.finalAmountCents ?? 0)
      : baseAmountCents;
    const isPromoFree = promoValidation?.valid && finalAmountCents === 0;
    const isPaymentRequired = !paymentComplete && !paymentWaived;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Payment</h3>
          <p className="text-sm text-gray-500">Complete payment to activate your facility</p>
        </div>

        <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Facility Registration Fee
              </CardTitle>
              <CardDescription>
                Annual subscription — {formatAnnualPrice(PER_COURT_CENTS)} per court
                (min {formatAnnualPrice(MIN_SUBSCRIPTION_CENTS)}, max {formatAnnualPrice(MAX_SUBSCRIPTION_CENTS)})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pricing summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">
                    {formatAnnualPrice(PER_COURT_CENTS)} × {courtCount} court{courtCount !== 1 ? 's' : ''}
                  </span>
                  <span>{formatAnnualPrice(rawAmountCents)}</span>
                </div>
                {rawAmountCents !== baseAmountCents && (
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>
                      {rawAmountCents < MIN_SUBSCRIPTION_CENTS ? 'Minimum annual fee' : 'Maximum annual fee'}
                    </span>
                    <span>{formatAnnualPrice(baseAmountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Annual fee ({courtCount} court{courtCount !== 1 ? 's' : ''})</span>
                  <span className="font-medium">{formatAnnualPrice(baseAmountCents)}</span>
                </div>
                {promoValidation?.valid && (
                  <div className="flex justify-between items-center text-green-600">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      Promo: {promoCode}
                    </span>
                    <span>-${((baseAmountCents - finalAmountCents) / 100).toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  {finalAmountCents === 0 ? (
                    <span className="text-green-600">$0.00 (Free)</span>
                  ) : (
                    <span>${(finalAmountCents / 100).toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Promo code input */}
              {!paymentComplete && !paymentWaived && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    Promo Code
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        if (promoValidation) setPromoValidation(null);
                      }}
                      placeholder="Enter promo code"
                      disabled={paymentComplete || paymentWaived}
                    />
                    {promoValidation?.valid ? (
                      <Button type="button" variant="outline" onClick={handleClearPromo}>
                        Clear
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleValidatePromo}
                        disabled={!promoCode.trim() || isValidatingPromo}
                      >
                        {isValidatingPromo ? 'Checking...' : 'Apply'}
                      </Button>
                    )}
                  </div>
                  {promoValidation && (
                    <p className={`text-sm ${promoValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {promoValidation.message}
                    </p>
                  )}
                </div>
              )}

              {/* Payment status messages */}
              {paymentComplete && (
                <Alert className="border-green-200 bg-green-50">
                  <Check className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Payment successful! Click "Complete Registration" to finish setting up your facility.
                  </AlertDescription>
                </Alert>
              )}
              {paymentWaived && (
                <Alert className="border-green-200 bg-green-50">
                  <Check className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Promo code applied! Your first year is free. Your card will be charged {formatAnnualPricePerYear(baseAmountCents)} at renewal. Click "Complete Registration" to finish.
                  </AlertDescription>
                </Alert>
              )}

              {/* Pay button */}
              {isPaymentRequired && (
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  onClick={handlePayWithStripe}
                  disabled={isProcessingPayment}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {isProcessingPayment
                    ? 'Processing...'
                    : isPromoFree
                      ? 'Save Card for Annual Renewal'
                      : `Pay $${(finalAmountCents / 100).toFixed(2)}`}
                </Button>
              )}
            </CardContent>
          </Card>
      </div>
    );
}
