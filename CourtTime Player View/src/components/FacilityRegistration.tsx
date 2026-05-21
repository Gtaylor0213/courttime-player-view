import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Alert, AlertDescription } from './ui/alert';
import {
  ArrowLeft, ArrowRight, Building, MapPin, Clock, FileText,
  Plus, Trash2, Check, AlertCircle, Upload, Mail, User, Users,
  Grid3X3, ShieldCheck, Phone, CreditCard, Tag, LogIn, UserPlus, Camera
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useAuth } from '../contexts/AuthContext';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import { toast } from 'sonner';
import {
  parseWhitelistCsv,
  parseWhitelistWorkbook,
} from '../../shared/utils/parseWhitelistSpreadsheet';
import { facilitiesApi, paymentsApi } from '../api/client';
import {
  getAmountForCourts,
  formatAnnualPrice,
  formatAnnualPricePerYear,
  PER_COURT_CENTS,
  MIN_SUBSCRIPTION_CENTS,
  MAX_SUBSCRIPTION_CENTS,
} from '../services/subscriptionPricing';
import {
  facilityRegistrationCompleteDeepLink,
  isMobileFacilityRegistrationSource,
  MOBILE_FACILITY_REGISTRATION_SOURCE,
} from '../../shared/utils/mobileFacilityRegistration';
import { FACILITY_TYPE_OPTIONS } from '../../shared/constants/facilityTypes';
import { mergeRegistrationFormData } from '../../shared/utils/facilityRegistrationForm';
import { RulesStep } from './facility-registration/RulesStep';
import { RulesConfig, RuleEntry, DEFAULT_RULES_CONFIG } from './facility-registration/rule-defaults';
import {
  PaidCourtBookingFields,
  parseBookingFeeDollars,
  type PaidCourtFormFields,
} from './admin/PaidCourtBookingFields';
import {
  CourtScheduleEditor,
  type CourtScheduleDay,
} from './admin/CourtScheduleEditor';
import {
  buildCourtScheduleRowsFromFacilityOperatingHours,
  courtScheduleRowsToOperatingHoursMap,
  formatGroupedOperatingHoursSummary,
} from '../../shared/utils/operatingHours';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberChange,
  normalizeCourtNameAndNumber,
} from '../../shared/utils/courtNaming';
import { CourtTypeField } from './admin/CourtTypeField';
import { validateStoredCourtType } from '../../shared/constants/courtTypes';

interface Court extends PaidCourtFormFields {
  id: string;
  name: string;
  courtNumber: number;
  surfaceType: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  courtType: string;
  isIndoor: boolean;
  hasLights: boolean;
  canSplit: boolean;
  operatingSchedule: CourtScheduleDay[];
  splitConfig?: {
    splitNames: string[];
    splitType: 'Tennis' | 'Pickleball';
  };
}

interface AdminInvite {
  id: string;
  email: string;
  status: 'pending' | 'sent';
}

interface FacilityContact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface SecondaryFacilityLocation {
  id: string;
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
}

// US State abbreviations
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const ERROR_FIELD_TARGETS: Record<string, string> = {
  step1Mode: 'step1ModeSelection',
  primaryContactName: 'primaryContactName',
  primaryContactPhone: 'primaryContactPhone',
  primaryContactEmail: 'primaryContactEmail',
  generalRules: 'generalRules',
  restrictionType: 'restrictionTypeGroup',
  courts: 'courtsSection',
};

function parsedHasCreateAccountFields(data: {
  adminEmail?: string;
  adminPassword?: string;
  adminFirstName?: string;
  adminLastName?: string;
}): boolean {
  return !!(
    data.adminEmail?.trim() &&
    data.adminPassword &&
    data.adminFirstName?.trim() &&
    data.adminLastName?.trim()
  );
}

function getRegistrationPathWithMobileSource(isMobile: boolean): string {
  if (!isMobile) return window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  params.set('source', MOBILE_FACILITY_REGISTRATION_SOURCE);
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

export function FacilityRegistration() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, user, login } = useAuth();
  const isMobileRegistration = isMobileFacilityRegistrationSource(
    new URLSearchParams(window.location.search).get('source')
  );

  // Step 1 mode: choose between creating new account or logging in
  const [step1Mode, setStep1Mode] = useState<'choose' | 'create' | 'login' | 'loggedIn'>('choose');
  const [loggedInDuringRegistration, setLoggedInDuringRegistration] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [formData, setFormData] = useState({
    // Step 1: Facility Administrator Account (if not logged in)
    adminFirstName: '',
    adminLastName: '',
    adminEmail: user?.email || '',
    adminPhone: '',
    adminPassword: '',
    adminConfirmPassword: '',
    adminStreetAddress: '',
    adminCity: '',
    adminState: '',
    adminZipCode: '',

    // Admin profile fields (available for both create and login paths)
    adminProfilePicture: '',
    adminSkillLevel: '',
    adminUstaRating: '',
    adminBio: '',

    // Step 2: Facility Information
    facilityName: '',
    facilityType: '',
    primaryLocationLabel: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    description: '',
    facilityImage: null as File | null,
    facilityImagePreview: '',
    facilityImageBase64: '',

    // Primary Contact (auto-filled from admin account if applicable)
    primaryContact: {
      name: user?.fullName || '',
      email: user?.email || '',
      phone: '',
    },

    // Secondary Contacts
    secondaryContacts: [] as Array<{ id: string; name: string; email: string; phone: string }>,
    secondaryLocations: [] as SecondaryFacilityLocation[],

    // Address Whitelist
    addressWhitelistFile: null as File | null,
    addressWhitelistFileName: '',
    parsedAddresses: [] as Array<{ streetAddress: string; city?: string; state?: string; zipCode?: string; householdName?: string; lastName?: string }>,

    // Operating Hours
    operatingHours: {
      monday: { open: '08:00', close: '20:00', closed: false },
      tuesday: { open: '08:00', close: '20:00', closed: false },
      wednesday: { open: '08:00', close: '20:00', closed: false },
      thursday: { open: '08:00', close: '20:00', closed: false },
      friday: { open: '08:00', close: '20:00', closed: false },
      saturday: { open: '09:00', close: '18:00', closed: false },
      sunday: { open: '09:00', close: '18:00', closed: false },
    },

    // Timezone
    timezone: 'America/New_York',

    // Step 3: Courts (now before Rules)
    rulesConfig: { ...DEFAULT_RULES_CONFIG } as RulesConfig,
    enableTermsAndConditions: false,
    termsAndConditions: '',

    // Step 4: Courts (will be filled dynamically)
    courts: [] as Court[],

    // Step 5: Additional Admins
    adminInvites: [] as AdminInvite[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingErrorField, setPendingErrorField] = useState<string | null>(null);
  const [courtFormMode, setCourtFormMode] = useState<'individual' | 'bulk'>('individual');
  const [bulkCourtData, setBulkCourtData] = useState({
    count: '1',
    startingNumber: '1',
    surfaceType: 'Hard' as const,
    courtType: 'Tennis' as const,
    isIndoor: false,
    hasLights: false,
  });

  // Payment state
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<{
    valid: boolean;
    promoCodeId?: string;
    discountType?: string;
    finalAmountCents?: number;
    message?: string;
  } | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentWaived, setPaymentWaived] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [autoSubmitAfterPayment, setAutoSubmitAfterPayment] = useState(false);
  const [registrationSessionReady, setRegistrationSessionReady] = useState(
    () => new URLSearchParams(window.location.search).get('payment') !== 'success'
  );
  const handleSubmitRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Pre-authenticated = user was already logged in before visiting registration (skip Step 1)
  // loggedInDuringRegistration = user logged in via Step 1 login form (still shows Step 1)
  const preAuthenticated = !!user && !loggedInDuringRegistration;
  const totalSteps = preAuthenticated ? 6 : 7; // +1 for Payment step

  const persistRegistrationToSession = () => {
    const merged = mergeRegistrationFormData(formData);
    const { facilityImage: _fi, addressWhitelistFile: _af, facilityImagePreview: _fp, ...serializable } = merged;
    sessionStorage.setItem('facilityRegistrationData', JSON.stringify(serializable));
    sessionStorage.setItem('facilityRegistrationStep', String(currentStep));
    sessionStorage.setItem('facilityRegistrationStep1Mode', step1Mode);
    sessionStorage.setItem('facilityRegistrationLoggedInDuring', loggedInDuringRegistration ? 'true' : 'false');
    sessionStorage.setItem('facilityRegistrationPromo', promoCode);
    if (paymentWaived) {
      sessionStorage.setItem('facilityRegistrationWaived', 'true');
    }
  };

  const restoreRegistrationFromSession = (): boolean => {
    const savedData = sessionStorage.getItem('facilityRegistrationData');
    const savedStep = sessionStorage.getItem('facilityRegistrationStep');
    const savedStep1Mode = sessionStorage.getItem('facilityRegistrationStep1Mode');
    const savedLoggedInDuring = sessionStorage.getItem('facilityRegistrationLoggedInDuring') === 'true';
    const savedPromo = sessionStorage.getItem('facilityRegistrationPromo');
    const wasWaived = sessionStorage.getItem('facilityRegistrationWaived') === 'true';

    if (!savedData) return false;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(savedData);
      setFormData(prev => ({ ...prev, ...parsed }));
    } catch {
      return false;
    }

    if (savedStep) {
      setCurrentStep(parseInt(savedStep, 10));
    }
    if (savedPromo) {
      setPromoCode(savedPromo);
    }
    if (wasWaived) {
      setPaymentWaived(true);
    }
    if (savedLoggedInDuring) {
      setLoggedInDuringRegistration(true);
    }

    if (savedStep1Mode === 'create' || savedStep1Mode === 'login' || savedStep1Mode === 'loggedIn') {
      setStep1Mode(savedStep1Mode);
    } else if (parsedHasCreateAccountFields(parsed)) {
      setStep1Mode('create');
    }

    setRegistrationSessionReady(true);
    return true;
  };

  const clearRegistrationSession = () => {
    sessionStorage.removeItem('facilityRegistrationData');
    sessionStorage.removeItem('facilityRegistrationStep');
    sessionStorage.removeItem('facilityRegistrationStep1Mode');
    sessionStorage.removeItem('facilityRegistrationLoggedInDuring');
    sessionStorage.removeItem('facilityRegistrationPromo');
    sessionStorage.removeItem('facilityRegistrationWaived');
    sessionStorage.removeItem('facilityRegistrationPaymentSessionId');
  };

  // Handle return from Stripe Checkout redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
      setRegistrationSessionReady(false);
      const restored = restoreRegistrationFromSession();
      if (!restored) {
        setRegistrationSessionReady(true);
      }

      // Verify the session with the backend
      paymentsApi.verifySession(sessionId).then(result => {
        const verification = result.data?.data || result.data;
        const wasWaived = sessionStorage.getItem('facilityRegistrationWaived') === 'true';
        if (result.success && verification?.verified) {
          setPaymentSessionId(sessionId);
          sessionStorage.setItem('facilityRegistrationPaymentSessionId', sessionId);
          setPaymentComplete(true);
          setAutoSubmitAfterPayment(true);
          toast.success(wasWaived ? 'Card saved! Finishing registration...' : 'Payment successful! Finishing registration...');
        } else {
          toast.error('Payment verification failed. Please try again.');
        }
      });

      window.history.replaceState(
        {},
        '',
        getRegistrationPathWithMobileSource(isMobileRegistration)
      );
    } else if (paymentStatus === 'cancelled') {
      restoreRegistrationFromSession();
      toast.info('Payment was cancelled. You can try again.');
      window.history.replaceState(
        {},
        '',
        getRegistrationPathWithMobileSource(isMobileRegistration)
      );
    }
  }, [isMobileRegistration]);

  useEffect(() => {
    if (!pendingErrorField) return;

    let frameOne = 0;
    let frameTwo = 0;

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        const targetId = ERROR_FIELD_TARGETS[pendingErrorField] ?? pendingErrorField;
        const element = document.getElementById(targetId);

        if (!element) {
          setPendingErrorField(null);
          return;
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const focusTarget =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLButtonElement
            ? element
            : element.querySelector<HTMLElement>(
                'input, textarea, button, [role="combobox"], [tabindex]:not([tabindex="-1"])',
              );

        focusTarget?.focus({ preventScroll: true });
        setPendingErrorField(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
    };
  }, [currentStep, pendingErrorField]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleOperatingHoursChange = (day: string, field: 'open' | 'close' | 'closed', value: any) => {
    setFormData(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day as keyof typeof prev.operatingHours],
          [field]: value
        }
      }
    }));
  };

  const buildDefaultCourtSchedule = (
    operatingHours: typeof formData.operatingHours = formData.operatingHours
  ): CourtScheduleDay[] =>
    buildCourtScheduleRowsFromFacilityOperatingHours(operatingHours).map((row) => ({
      day_of_week: row.day_of_week,
      is_open: row.is_open,
      open_time: row.open_time,
      close_time: row.close_time,
      prime_time_start: row.prime_time_start,
      prime_time_end: row.prime_time_end,
    }));

  const updateCourtScheduleDay = (
    courtId: string,
    dayOfWeek: number,
    field: string,
    value: unknown
  ) => {
    setFormData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) => {
        if (court.id !== courtId) return court;
        const base =
          court.operatingSchedule?.length === 7
            ? court.operatingSchedule
            : buildDefaultCourtSchedule(prev.operatingHours);
        return {
          ...court,
          operatingSchedule: base.map((day) =>
            day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
          ),
        };
      }),
    }));
  };

  const resetCourtScheduleToFacilityDefaults = (courtId: string) => {
    setFormData((prev) => ({
      ...prev,
      courts: prev.courts.map((court) =>
        court.id === courtId
          ? { ...court, operatingSchedule: buildDefaultCourtSchedule(prev.operatingHours) }
          : court
      ),
    }));
  };

  const renderFacilityOperatingHours = (description?: string) => (
    <div>
      <h4 className="font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Court hours (default for all courts)
      </h4>
      {description && <p className="text-sm text-gray-600 mb-3">{description}</p>}
      <div className="space-y-3">
        {Object.keys(formData.operatingHours).map((day) => {
          const hours = formData.operatingHours[day as keyof typeof formData.operatingHours];
          return (
            <div key={day} className="rounded-lg border bg-white p-3 sm:border-0 sm:bg-transparent sm:p-0 sm:rounded-none space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
              <div className="w-full sm:w-28 font-medium capitalize text-sm">{day}</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1 min-w-0">
                <Input
                  type="time"
                  value={hours.open}
                  onChange={(e) => handleOperatingHoursChange(day, 'open', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
                <span className="text-gray-500 text-sm">to</span>
                <Input
                  type="time"
                  value={hours.close}
                  onChange={(e) => handleOperatingHoursChange(day, 'close', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
                <div className="flex items-center gap-2 sm:ml-4 pt-1 sm:pt-0">
                  <Switch
                    checked={hours.closed}
                    onCheckedChange={(checked) => handleOperatingHoursChange(day, 'closed', checked)}
                  />
                  <Label className="text-sm">Closed</Label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // --- Rules config handlers ---
  const handleRulesChange = (updates: Partial<RulesConfig>) => {
    setFormData(prev => ({
      ...prev,
      rulesConfig: { ...prev.rulesConfig, ...updates },
    }));

    if (updates.generalRules !== undefined && errors.generalRules) {
      setErrors(prev => ({ ...prev, generalRules: '' }));
    }

    if (updates.restrictionType !== undefined && errors.restrictionType) {
      setErrors(prev => ({ ...prev, restrictionType: '' }));
    }
  };

  const handleRuleEntryChange = (ruleCode: string, updates: Partial<RuleEntry>) => {
    setFormData(prev => ({
      ...prev,
      rulesConfig: {
        ...prev.rulesConfig,
        rules: {
          ...prev.rulesConfig.rules,
          [ruleCode]: { ...prev.rulesConfig.rules[ruleCode], ...updates },
        },
      },
    }));
  };

  const handleRuleConfigFieldChange = (ruleCode: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rulesConfig: {
        ...prev.rulesConfig,
        rules: {
          ...prev.rulesConfig.rules,
          [ruleCode]: {
            ...prev.rulesConfig.rules[ruleCode],
            config: { ...prev.rulesConfig.rules[ruleCode].config, [field]: value },
          },
        },
      },
    }));
  };

  const getRuleEntry = (rulesConfig: RulesConfig, ruleCode: string): RuleEntry => (
    rulesConfig.rules[ruleCode] || { enabled: false, config: {} }
  );

  const hasValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    return String(value).trim() !== '';
  };

  const toStringOrBlank = (value: unknown): string => (
    hasValue(value) ? String(value).trim() : ''
  );

  const formatHoursFromMinutes = (value: unknown): string => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    const hours = minutes / 60;
    return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
  };

  const buildRegistrationBookingRules = (rulesConfig: RulesConfig) => {
    const daysInAdvanceRule = getRuleEntry(rulesConfig, 'ACC-005');
    const maxReservationDurationRule = getRuleEntry(rulesConfig, 'CRT-005');
    const weeklyIndividualRule = getRuleEntry(rulesConfig, 'ACC-002');
    const maxAccountsPerAddressRule = getRuleEntry(rulesConfig, 'HH-001');
    const householdRule = getRuleEntry(rulesConfig, 'HH-003');

    const daysInAdvance = daysInAdvanceRule.enabled
      ? toStringOrBlank(daysInAdvanceRule.config.max_days_ahead)
      : '';
    const maxReservationDurationMinutes = maxReservationDurationRule.enabled
      ? toStringOrBlank(maxReservationDurationRule.config.max_duration_minutes)
      : '';
    const courtsPerWeekUser = weeklyIndividualRule.enabled
      ? toStringOrBlank(weeklyIndividualRule.config.max_per_week)
      : '';
    const courtsPerDayUserEnabled = !!weeklyIndividualRule.config.max_per_day_enabled;
    const courtsPerDayUser = courtsPerDayUserEnabled
      ? toStringOrBlank(weeklyIndividualRule.config.max_per_day)
      : '';
    const courtsPerWeekHousehold = householdRule.enabled
      ? toStringOrBlank(
          householdRule.config.max_per_week_household ?? householdRule.config.max_prime_per_week_household
        )
      : '';
    const courtsPerDayHouseholdEnabled = !!householdRule.config.max_per_day_household_enabled;
    const courtsPerDayHousehold = courtsPerDayHouseholdEnabled
      ? toStringOrBlank(householdRule.config.max_per_day_household)
      : '';
    const householdMaxMembers = maxAccountsPerAddressRule.enabled
      ? toStringOrBlank(maxAccountsPerAddressRule.config.max_members)
      : '';

    return {
      generalRules: rulesConfig.generalRules,
      restrictionType: rulesConfig.restrictionType,
      householdMaxMembersEnabled: !!maxAccountsPerAddressRule.enabled,
      householdMaxMembers,
      daysInAdvanceEnabled: !!daysInAdvanceRule.enabled,
      daysInAdvance,
      maxReservationDurationEnabled: !!maxReservationDurationRule.enabled,
      maxReservationDurationMinutes,
      courtsPerWeekUserEnabled: !!weeklyIndividualRule.enabled,
      courtsPerWeekUser,
      courtsPerWeekHouseholdEnabled: !!householdRule.enabled,
      courtsPerWeekHousehold,
      courtsPerDayUserEnabled,
      courtsPerDayUser,
      courtsPerDayHouseholdEnabled,
      courtsPerDayHousehold,
      maxBookingsPerWeek: courtsPerWeekUser,
      maxBookingsPerWeekUnlimited: !weeklyIndividualRule.enabled,
      maxBookingDurationHours: formatHoursFromMinutes(maxReservationDurationMinutes),
      maxBookingDurationUnlimited: !maxReservationDurationRule.enabled,
      advanceBookingDays: daysInAdvance,
      advanceBookingDaysUnlimited: !daysInAdvanceRule.enabled,
      restrictionsApplyToAdmins: false,
      adminMaxBookingsPerWeek: '',
      adminMaxBookingsUnlimited: true,
      adminMaxBookingDurationHours: '',
      adminMaxDurationUnlimited: true,
      adminAdvanceBookingDays: '',
      adminAdvanceBookingUnlimited: true,
      hasPeakHours: rulesConfig.hasPeakHours,
      peakHoursApplyToAdmins: false,
      peakHoursSlots: rulesConfig.peakHoursSlots,
      peakHoursRestrictions: {
        maxBookingsPerWeek: '',
        maxBookingsUnlimited: true,
        maxDurationHours: '',
        maxDurationUnlimited: true,
      },
      hasWeekendPolicy: rulesConfig.hasWeekendPolicy,
      weekendPolicyApplyToAdmins: false,
      weekendPolicy: {
        maxBookingsPerWeekend: '',
        maxBookingsUnlimited: true,
        maxDurationHours: '',
        maxDurationUnlimited: true,
        advanceBookingDays: '',
        advanceBookingUnlimited: true,
      },
    };
  };

  // Handle primary contact changes
  const handlePrimaryContactChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      primaryContact: {
        ...prev.primaryContact,
        [field]: value
      }
    }));

    const errorKeyByField: Record<string, string> = {
      name: 'primaryContactName',
      phone: 'primaryContactPhone',
      email: 'primaryContactEmail',
    };

    const errorKey = errorKeyByField[field];
    if (errorKey && errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  // Add a secondary contact
  const addSecondaryContact = () => {
    const newContact = {
      id: `contact-${Date.now()}`,
      name: '',
      email: '',
      phone: '',
    };
    setFormData(prev => ({
      ...prev,
      secondaryContacts: [...prev.secondaryContacts, newContact]
    }));
  };

  // Update a secondary contact
  const updateSecondaryContact = (contactId: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      secondaryContacts: prev.secondaryContacts.map(contact =>
        contact.id === contactId ? { ...contact, [field]: value } : contact
      )
    }));
  };

  // Remove a secondary contact
  const removeSecondaryContact = (contactId: string) => {
    setFormData(prev => ({
      ...prev,
      secondaryContacts: prev.secondaryContacts.filter(contact => contact.id !== contactId)
    }));
  };

  const addSecondaryLocation = () => {
    const newLocation: SecondaryFacilityLocation = {
      id: `location-${Date.now()}`,
      locationName: '',
      streetAddress: '',
      city: '',
      state: '',
      zipCode: '',
      phone: '',
    };

    setFormData(prev => ({
      ...prev,
      secondaryLocations: [...prev.secondaryLocations, newLocation],
    }));
  };

  const updateSecondaryLocation = (
    locationId: string,
    field: keyof Omit<SecondaryFacilityLocation, 'id'>,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      secondaryLocations: prev.secondaryLocations.map((location) =>
        location.id === locationId ? { ...location, [field]: value } : location
      ),
    }));
  };

  const removeSecondaryLocation = (locationId: string) => {
    setFormData(prev => ({
      ...prev,
      secondaryLocations: prev.secondaryLocations.filter(location => location.id !== locationId)
    }));
  };

  // Handle facility image upload
  const handleFacilityImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setFormData(prev => ({
        ...prev,
        facilityImage: file,
        facilityImagePreview: previewUrl
      }));
      // Convert to base64 for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          facilityImageBase64: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove facility image
  const removeFacilityImage = () => {
    if (formData.facilityImagePreview) {
      URL.revokeObjectURL(formData.facilityImagePreview);
    }
    setFormData(prev => ({
      ...prev,
      facilityImage: null,
      facilityImagePreview: '',
      facilityImageBase64: ''
    }));
  };

  // Handle admin profile picture upload
  const handleAdminProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        handleInputChange('adminProfilePicture', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle login during facility registration
  const handleRegistrationLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both email and password');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const success = await login(loginEmail, loginPassword);
      if (success) {
        setLoggedInDuringRegistration(true);
        setStep1Mode('loggedIn');
        toast.success('Logged in successfully!');
      } else {
        setLoginError('Invalid email or password');
      }
    } catch (error: any) {
      setLoginError(error.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Pre-fill formData after login during registration
  useEffect(() => {
    if (user && loggedInDuringRegistration) {
      setFormData(prev => ({
        ...prev,
        adminEmail: user.email || prev.adminEmail,
        adminFirstName: user.firstName || prev.adminFirstName,
        adminLastName: user.lastName || prev.adminLastName,
        adminPhone: user.phone || prev.adminPhone,
        adminStreetAddress: user.streetAddress || prev.adminStreetAddress,
        adminCity: user.city || prev.adminCity,
        adminState: user.state || prev.adminState,
        adminZipCode: user.zipCode || prev.adminZipCode,
        adminProfilePicture: user.profileImageUrl || prev.adminProfilePicture,
        adminSkillLevel: user.skillLevel || prev.adminSkillLevel,
        adminUstaRating: user.ustaRating || prev.adminUstaRating,
        adminBio: user.bio || prev.adminBio,
        primaryContact: {
          name: user.fullName || prev.primaryContact.name,
          email: user.email || prev.primaryContact.email,
          phone: user.phone || prev.primaryContact.phone,
        },
      }));
    }
  }, [user, loggedInDuringRegistration]);

  // Handle address whitelist file upload
  const handleAddressWhitelistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
        toast.error('Please select a CSV or Excel (.xlsx, .xls) file');
        return;
      }
      setFormData(prev => ({
        ...prev,
        addressWhitelistFile: file,
        addressWhitelistFileName: file.name
      }));

      if (ext === 'csv') {
        // Parse CSV as text
        const reader = new FileReader();
        reader.onloadend = () => {
          const text = reader.result as string;
          const addresses = parseWhitelistCsv(text);
          setFormData(prev => ({ ...prev, parsedAddresses: addresses }));
          if (addresses.length > 0) {
            toast.success(`Parsed ${addresses.length} address${addresses.length !== 1 ? 'es' : ''} from file`);
          } else {
            toast.error('No addresses found in file');
          }
        };
        reader.readAsText(file);
      } else {
        // Parse Excel with xlsx
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const addresses = parseWhitelistWorkbook(reader.result as ArrayBuffer);
            setFormData(prev => ({ ...prev, parsedAddresses: addresses }));
            if (addresses.length > 0) {
              toast.success(`Parsed ${addresses.length} address${addresses.length !== 1 ? 'es' : ''} from file`);
            } else {
              toast.error('No addresses found in file');
            }
          } catch (error) {
            console.error('Error parsing Excel:', error);
            toast.error('Failed to read Excel file. Check the format and try again.');
          }
        };
        reader.readAsArrayBuffer(file);
      }
    }
  };

  // Remove address whitelist file
  const removeAddressWhitelist = () => {
    setFormData(prev => ({
      ...prev,
      addressWhitelistFile: null,
      addressWhitelistFileName: '',
      parsedAddresses: []
    }));
  };

  const addPeakHourSlot = () => {
    setFormData(prev => {
      const newSlot = {
        id: `slot-${Date.now()}`,
        startTime: '17:00',
        endTime: '20:00',
        days: [],
        appliesToAllCourts: true,
        selectedCourtIds: [],
        rules: {
          maxBookingsPerDay: '1',
          maxBookingsPerDayUnlimited: false,
          maxBookingsPerDayHousehold: '2',
          maxBookingsPerDayHouseholdUnlimited: false,
          maxBookingsPerWeek: '2',
          maxBookingsPerWeekUnlimited: false,
          maxBookingsPerWeekHousehold: '2',
          maxBookingsPerWeekHouseholdUnlimited: false,
          maxDurationHours: '1.5',
          maxDurationUnlimited: false,
        }
      };
      return {
        ...prev,
        rulesConfig: {
          ...prev.rulesConfig,
          peakHoursSlots: [...prev.rulesConfig.peakHoursSlots, newSlot]
        }
      };
    });
  };

  const removePeakHourSlot = (slotId: string) => {
    setFormData(prev => {
      return {
        ...prev,
        rulesConfig: {
          ...prev.rulesConfig,
          peakHoursSlots: prev.rulesConfig.peakHoursSlots.filter(slot => slot.id !== slotId)
        }
      };
    });
  };

  const updatePeakHourSlot = (slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setFormData(prev => {
      const newSlots = prev.rulesConfig.peakHoursSlots.map(slot =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      );
      return {
        ...prev,
        rulesConfig: {
          ...prev.rulesConfig,
          peakHoursSlots: newSlots
        }
      };
    });
  };

  const togglePeakHourSlotDay = (slotId: string, day: number) => {
    setFormData(prev => {
      const newSlots = prev.rulesConfig.peakHoursSlots.map(slot => {
        if (slot.id !== slotId) return slot;
        const hasDay = slot.days.includes(day);
        const days = hasDay ? slot.days.filter(d => d !== day) : [...slot.days, day];
        return { ...slot, days };
      });
      return {
        ...prev,
        rulesConfig: {
          ...prev.rulesConfig,
          peakHoursSlots: newSlots,
        }
      };
    });
  };

  const updatePeakHourSlotRule = (
    slotId: string,
    field:
      | 'maxBookingsPerDay'
      | 'maxBookingsPerDayUnlimited'
      | 'maxBookingsPerDayHousehold'
      | 'maxBookingsPerDayHouseholdUnlimited'
      | 'maxBookingsPerWeek'
      | 'maxBookingsPerWeekUnlimited'
      | 'maxBookingsPerWeekHousehold'
      | 'maxBookingsPerWeekHouseholdUnlimited'
      | 'maxDurationHours'
      | 'maxDurationUnlimited',
    value: string | boolean
  ) => {
    setFormData(prev => {
      const newSlots = prev.rulesConfig.peakHoursSlots.map(slot =>
        slot.id === slotId
          ? { ...slot, rules: { ...slot.rules, [field]: value } }
          : slot
      );
      return {
        ...prev,
        rulesConfig: {
          ...prev.rulesConfig,
          peakHoursSlots: newSlots,
        }
      };
    });
  };

  // Validate a single step and return errors (without setting state)
  const getStepErrors = (
    step: number,
    dataSource: typeof formData = formData
  ): Record<string, string> => {
    const stepErrors: Record<string, string> = {};

    if (!preAuthenticated && step === 1) {
      // Validate Step 1 based on mode (after Stripe redirect step1Mode may reset — infer from form data)
      const effectiveStep1Mode =
        step1Mode === 'choose' && parsedHasCreateAccountFields(dataSource)
          ? 'create'
          : step1Mode;

      if (effectiveStep1Mode === 'choose' || effectiveStep1Mode === 'login') {
        stepErrors.step1Mode = 'Please create an account or log in to continue';
      } else if (effectiveStep1Mode === 'create') {
        // Validate new account creation fields
        if (!dataSource.adminFirstName.trim()) stepErrors.adminFirstName = 'First name is required';
        if (!dataSource.adminLastName.trim()) stepErrors.adminLastName = 'Last name is required';
        if (!dataSource.adminEmail.trim()) stepErrors.adminEmail = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(dataSource.adminEmail)) stepErrors.adminEmail = 'Email is invalid';
        if (!dataSource.adminPhone.trim()) stepErrors.adminPhone = 'Phone number is required';
        if (!dataSource.adminPassword) stepErrors.adminPassword = 'Password is required';
        else if (dataSource.adminPassword.length < 8) stepErrors.adminPassword = 'Password must be at least 8 characters';
        if (dataSource.adminPassword !== dataSource.adminConfirmPassword) {
          stepErrors.adminConfirmPassword = 'Passwords do not match';
        }
        if (!dataSource.adminStreetAddress.trim()) stepErrors.adminStreetAddress = 'Street address is required';
        if (!dataSource.adminCity.trim()) stepErrors.adminCity = 'City is required';
        if (!dataSource.adminState) stepErrors.adminState = 'State is required';
        if (!dataSource.adminZipCode.trim()) stepErrors.adminZipCode = 'ZIP code is required';
      }
      // 'loggedIn' mode: no required fields (all profile completion is optional)
    }

    const facilityStep = preAuthenticated ? 1 : 2;
    if (step === facilityStep) {
      // Validate Facility Information
      if (!dataSource.facilityName.trim()) stepErrors.facilityName = 'Facility name is required';
      if (!dataSource.facilityType) stepErrors.facilityType = 'Facility type is required';
      if (!dataSource.streetAddress.trim()) stepErrors.streetAddress = 'Street address is required';
      if (!dataSource.city.trim()) stepErrors.city = 'City is required';
      if (!dataSource.state) stepErrors.state = 'State is required';
      if (!dataSource.zipCode.trim()) stepErrors.zipCode = 'ZIP code is required';
      if (!dataSource.phone.trim()) stepErrors.phone = 'Facility phone number is required';
      if (!dataSource.email.trim()) stepErrors.email = 'Facility email is required';
      else if (!/\S+@\S+\.\S+/.test(dataSource.email)) stepErrors.email = 'Facility email is invalid';
      // Validate primary contact
      if (!dataSource.primaryContact.name.trim()) stepErrors.primaryContactName = 'Primary contact name is required';
      if (!dataSource.primaryContact.email.trim()) stepErrors.primaryContactEmail = 'Primary contact email is required';
      else if (!/\S+@\S+\.\S+/.test(dataSource.primaryContact.email)) stepErrors.primaryContactEmail = 'Primary contact email is invalid';
      if (!dataSource.primaryContact.phone.trim()) stepErrors.primaryContactPhone = 'Primary contact phone is required';
    }

    const courtsStep = preAuthenticated ? 2 : 3;
    if (step === courtsStep) {
      // Validate Courts
      if (dataSource.courts.length === 0) {
        stepErrors.courts = 'At least one court is required';
      } else {
        for (const court of dataSource.courts) {
          if (court.requirePayment && !parseBookingFeeDollars(court.bookingFeeDollars)) {
            stepErrors.courts = `Enter a booking fee for ${court.name} or turn off paid court booking`;
            break;
          }
          if (court.enableGuestFee && !parseBookingFeeDollars(court.guestFeeDollars)) {
            stepErrors.courts = `Enter a guest fee amount for ${court.name}`;
            break;
          }
        }
      }
    }

    const rulesStep = preAuthenticated ? 3 : 4;
    if (step === rulesStep) {
      if (!dataSource.rulesConfig.generalRules.trim()) stepErrors.generalRules = 'General rules are required';
      if (!dataSource.rulesConfig.restrictionType) stepErrors.restrictionType = 'Please select how restrictions apply';

      const daysInAdvanceRule = getRuleEntry(dataSource.rulesConfig, 'ACC-005');
      const maxReservationDurationRule = getRuleEntry(dataSource.rulesConfig, 'CRT-005');
      const weeklyIndividualRule = getRuleEntry(dataSource.rulesConfig, 'ACC-002');
      const householdRule = getRuleEntry(dataSource.rulesConfig, 'HH-003');

      if (daysInAdvanceRule.enabled && !hasValue(daysInAdvanceRule.config.max_days_ahead)) {
        stepErrors.daysInAdvance = 'Enter a days-in-advance value or turn that rule off';
      }

      if (maxReservationDurationRule.enabled && !hasValue(maxReservationDurationRule.config.max_duration_minutes)) {
        stepErrors.maxReservationDurationMinutes = 'Enter a max reservation duration or turn that rule off';
      }

      if (weeklyIndividualRule.enabled && !hasValue(weeklyIndividualRule.config.max_per_week)) {
        stepErrors.courtsPerWeekUser = 'Enter an individual weekly limit or turn that rule off';
      }

      if (weeklyIndividualRule.config.max_per_day_enabled && !hasValue(weeklyIndividualRule.config.max_per_day)) {
        stepErrors.courtsPerDayUser = 'Enter an individual daily limit or turn that rule off';
      }

      if (
        householdRule.enabled &&
        !hasValue(householdRule.config.max_per_week_household ?? householdRule.config.max_prime_per_week_household)
      ) {
        stepErrors.courtsPerWeekHousehold = 'Enter a household weekly limit or turn that rule off';
      }

      if (householdRule.config.max_per_day_household_enabled && !hasValue(householdRule.config.max_per_day_household)) {
        stepErrors.courtsPerDayHousehold = 'Enter a household daily limit or turn that rule off';
      }
    }

    return stepErrors;
  };

  // Check if a step has any validation errors
  const stepHasErrors = (step: number): boolean => {
    return Object.keys(getStepErrors(step)).length > 0;
  };

  // Validate all steps and return combined errors with the first invalid step
  const validateAllSteps = (
    dataSource: typeof formData = formData
  ): {
    isValid: boolean;
    errors: Record<string, string>;
    firstInvalidStep: number | null;
    firstInvalidField: string | null;
  } => {
    const allErrors: Record<string, string> = {};
    let firstInvalidStep: number | null = null;
    let firstInvalidField: string | null = null;

    for (let step = 1; step <= totalSteps; step++) {
      const stepErrors = getStepErrors(step, dataSource);
      if (Object.keys(stepErrors).length > 0) {
        Object.assign(allErrors, stepErrors);
        if (firstInvalidStep === null) {
          firstInvalidStep = step;
          firstInvalidField = Object.keys(stepErrors)[0] ?? null;
        }
      }
    }

    return {
      isValid: Object.keys(allErrors).length === 0,
      errors: allErrors,
      firstInvalidStep,
      firstInvalidField
    };
  };

  // Navigate to a specific step (always allowed)
  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      setErrors({}); // Clear errors when navigating
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    // Block Next on step 1 if not in a valid completed state
    if (!preAuthenticated && currentStep === 1) {
      if (step1Mode === 'choose') {
        toast.error('Please choose to create a new account or log in to an existing one');
        return;
      }
      if (step1Mode === 'login') {
        toast.error('Please complete the login to continue');
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const addCourt = () => {
    const newCourt: Court = {
      id: `court-${Date.now()}`,
      name: `Court ${formData.courts.length + 1}`,
      courtNumber: formData.courts.length + 1,
      surfaceType: 'Hard',
      courtType: 'Tennis',
      isIndoor: false,
      hasLights: false,
      canSplit: false,
      requirePayment: false,
      bookingFeeDollars: '',
      enableGuestFee: false,
      guestFeeCents: null,
      guestFeeDollars: '',
      operatingSchedule: buildDefaultCourtSchedule(),
    };
    setFormData(prev => ({
      ...prev,
      courts: [...prev.courts, newCourt]
    }));

    if (errors.courts) {
      setErrors(prev => ({ ...prev, courts: '' }));
    }
  };

  const addBulkCourts = () => {
    const courtTypeError = validateStoredCourtType(bulkCourtData.courtType);
    if (courtTypeError) {
      toast.error(courtTypeError);
      return;
    }

    const count = parseInt(bulkCourtData.count);
    const startNum = parseInt(bulkCourtData.startingNumber);

    if (isNaN(count) || count < 1 || count > 50) {
      toast.error('Please enter a valid count (1-50)');
      return;
    }

    const newCourts: Court[] = [];
    for (let i = 0; i < count; i++) {
      const courtNumber = startNum + i;
      newCourts.push({
        id: `court-${Date.now()}-${i}`,
        name: `Court ${courtNumber}`,
        courtNumber,
        surfaceType: bulkCourtData.surfaceType,
        courtType: bulkCourtData.courtType,
        isIndoor: bulkCourtData.isIndoor,
        hasLights: bulkCourtData.hasLights,
        canSplit: false,
        requirePayment: false,
        bookingFeeDollars: '',
        enableGuestFee: false,
        guestFeeCents: null,
        guestFeeDollars: '',
        operatingSchedule: buildDefaultCourtSchedule(),
      });
    }

    setFormData(prev => ({
      ...prev,
      courts: [...prev.courts, ...newCourts]
    }));

    if (errors.courts) {
      setErrors(prev => ({ ...prev, courts: '' }));
    }

    toast.success(`Added ${count} courts successfully`);
    setCourtFormMode('individual');
  };

  const updateCourt = (courtId: string, updates: Partial<Court>) => {
    setFormData(prev => ({
      ...prev,
      courts: prev.courts.map(court => {
        if (court.id !== courtId) return court;

        let merged = { ...court, ...updates };
        if (updates.courtNumber !== undefined) {
          merged = { ...merged, ...courtFieldsAfterNumberChange(updates.courtNumber, court.name) };
        }
        if (updates.name !== undefined) {
          merged = {
            ...merged,
            ...courtFieldsAfterNameChange(updates.name, merged.courtNumber),
          };
        }

        // Initialize splitConfig when canSplit is enabled
        if (updates.canSplit && !court.splitConfig) {
          return {
            ...merged,
            splitConfig: { splitNames: [], splitType: 'Pickleball' as const }
          };
        }

        return merged;
      })
    }));
  };

  const removeCourt = (courtId: string) => {
    setFormData(prev => ({
      ...prev,
      courts: prev.courts.filter(court => court.id !== courtId)
    }));
  };

  const addAdminInvite = () => {
    const newInvite: AdminInvite = {
      id: `invite-${Date.now()}`,
      email: '',
      status: 'pending'
    };
    setFormData(prev => ({
      ...prev,
      adminInvites: [...prev.adminInvites, newInvite]
    }));
  };

  const updateAdminInvite = (inviteId: string, email: string) => {
    setFormData(prev => ({
      ...prev,
      adminInvites: prev.adminInvites.map(invite =>
        invite.id === inviteId ? { ...invite, email } : invite
      )
    }));
  };

  const removeAdminInvite = (inviteId: string) => {
    setFormData(prev => ({
      ...prev,
      adminInvites: prev.adminInvites.filter(invite => invite.id !== inviteId)
    }));
  };

  const handleSubmit = async () => {
    const submitFormData = mergeRegistrationFormData(formData);

    // Validate ALL steps before submission
    const validation = validateAllSteps(submitFormData);

    if (!validation.isValid) {
      setErrors(validation.errors);
      if (validation.firstInvalidField) {
        setPendingErrorField(validation.firstInvalidField);
      }
      if (validation.firstInvalidStep !== null) {
        setCurrentStep(validation.firstInvalidStep);
        toast.error('Please complete all required fields before submitting');
      }
      return;
    }

    setIsSubmitting(true);

    try {
      const bookingRulesPayload = buildRegistrationBookingRules(submitFormData.rulesConfig);
      // Merged session data (e.g. after Stripe return) — must match validation payload
      const fd = submitFormData;

      // Prepare registration data
      const registrationData = {
        // Facility Administrator Account (if creating new user — not logged in)
        ...(user ? {} : {
          adminEmail: fd.adminEmail,
          adminPassword: fd.adminPassword,
          adminFullName: `${fd.adminFirstName} ${fd.adminLastName}`.trim(),
          adminFirstName: fd.adminFirstName,
          adminLastName: fd.adminLastName,
          adminPhone: fd.adminPhone,
          adminStreetAddress: fd.adminStreetAddress,
          adminCity: fd.adminCity,
          adminState: fd.adminState,
          adminZipCode: fd.adminZipCode,
        }),

        // Admin profile fields (for both new and existing users)
        ...(fd.adminProfilePicture && { adminProfilePicture: fd.adminProfilePicture }),
        ...(fd.adminSkillLevel && { adminSkillLevel: fd.adminSkillLevel }),
        ...(fd.adminUstaRating && { adminUstaRating: fd.adminUstaRating }),
        ...(fd.adminBio && { adminBio: fd.adminBio }),

        // Facility Information
        facilityName: fd.facilityName,
        facilityType: fd.facilityType,
        primaryLocationLabel: fd.primaryLocationLabel.trim() || undefined,
        streetAddress: fd.streetAddress,
        city: fd.city,
        state: fd.state,
        zipCode: fd.zipCode,
        phone: fd.primaryContact.phone || fd.phone,
        email: fd.primaryContact.email || fd.email,
        contactName: fd.primaryContact.name,
        description: fd.description,
        facilityImage: fd.facilityImageBase64 || undefined,

        // Contacts
        primaryContact: {
          name: fd.primaryContact.name,
          email: fd.primaryContact.email,
          phone: fd.primaryContact.phone,
        },
        secondaryContacts: fd.secondaryContacts
          .filter(c => c.name.trim())
          .map(c => ({
            name: c.name,
            email: c.email || undefined,
            phone: c.phone || undefined,
          })),
        secondaryLocations: fd.secondaryLocations
          .filter((location) =>
            location.locationName.trim() &&
            location.streetAddress.trim() &&
            location.city.trim() &&
            location.state.trim() &&
            location.zipCode.trim()
          )
          .map((location) => ({
            locationName: location.locationName.trim(),
            streetAddress: location.streetAddress.trim(),
            city: location.city.trim(),
            state: location.state.trim(),
            zipCode: location.zipCode.trim(),
            phone: location.phone.trim() || undefined,
          })),

        // Operating Hours
        operatingHours: fd.operatingHours,
        timezone: fd.timezone,

        // Facility Rules
        generalRules: fd.rulesConfig.generalRules,
        termsAndConditions: fd.enableTermsAndConditions && fd.termsAndConditions.trim()
          ? fd.termsAndConditions.trim()
          : undefined,
        termsAttachments: fd.enableTermsAndConditions && fd.termsAndConditions.trim()
          ? []
          : [],
        requiredReviewSeconds: 0,
        bookingRules: bookingRulesPayload,

        // Restriction settings - map from rules engine entries for backward compatibility
        restrictionType: fd.rulesConfig.restrictionType,
        maxBookingsPerWeek:
          bookingRulesPayload.courtsPerWeekUserEnabled && hasValue(bookingRulesPayload.courtsPerWeekUser)
            ? bookingRulesPayload.courtsPerWeekUser
            : '-1',
        maxBookingDurationHours:
          bookingRulesPayload.maxReservationDurationEnabled && hasValue(bookingRulesPayload.maxBookingDurationHours)
            ? bookingRulesPayload.maxBookingDurationHours
            : '-1',
        advanceBookingDays:
          bookingRulesPayload.daysInAdvanceEnabled && hasValue(bookingRulesPayload.daysInAdvance)
            ? bookingRulesPayload.daysInAdvance
            : '-1',

        // Facility admins always bypass booking rules.
        restrictionsApplyToAdmins: false,
        adminRestrictions: undefined,

        // Peak hours policy - with per-day time slots
        peakHoursPolicy: fd.rulesConfig.hasPeakHours ? {
          enabled: true,
          applyToAdmins: false,
          timeSlots: fd.rulesConfig.peakHoursSlots.map((slot) => ({
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            days: slot.days,
            appliesToAllCourts: slot.appliesToAllCourts,
            selectedCourtIds: slot.selectedCourtIds,
            rules: {
              max_bookings_per_day: slot.rules.maxBookingsPerDayUnlimited ? -1 : parseInt(slot.rules.maxBookingsPerDay, 10),
              max_bookings_per_day_household: slot.rules.maxBookingsPerDayHouseholdUnlimited ? -1 : parseInt(slot.rules.maxBookingsPerDayHousehold, 10),
              max_bookings_per_week: slot.rules.maxBookingsPerWeekUnlimited ? -1 : parseInt(slot.rules.maxBookingsPerWeek, 10),
              max_bookings_per_week_household: slot.rules.maxBookingsPerWeekHouseholdUnlimited ? -1 : parseInt(slot.rules.maxBookingsPerWeekHousehold, 10),
              max_duration_hours: slot.rules.maxDurationUnlimited ? -1 : parseFloat(slot.rules.maxDurationHours),
            },
          })),
        } : undefined,

        // Weekend policy
        weekendPolicy: fd.rulesConfig.hasWeekendPolicy ? {
          enabled: true,
          applyToAdmins: false,
          maxBookingsPerWeekend: fd.rulesConfig.weekendPolicy.maxBookingsUnlimited ? -1 : parseInt(fd.rulesConfig.weekendPolicy.maxBookingsPerWeekend),
          maxDurationHours: fd.rulesConfig.weekendPolicy.maxDurationUnlimited ? -1 : parseFloat(fd.rulesConfig.weekendPolicy.maxDurationHours),
          advanceBookingDays: fd.rulesConfig.weekendPolicy.advanceBookingUnlimited ? -1 : parseInt(fd.rulesConfig.weekendPolicy.advanceBookingDays),
        } : undefined,

        // Rules engine configs for facility_rule_configs table
        ruleConfigs: Object.entries(fd.rulesConfig.rules)
          .filter(([key]) => /^(ACC|CRT|HH)-\d{3}$/.test(key))
          .map(([ruleCode, entry]) => ({
            ruleCode,
            isEnabled:
              entry.enabled ||
              (ruleCode === 'ACC-002' && !!entry.config.max_per_day_enabled) ||
              (ruleCode === 'HH-003' && !!entry.config.max_per_day_household_enabled),
            ruleConfig: entry.config,
          })),

        // Courts
        courts: fd.courts.map(court => {
          const wantsPayment = Boolean(court.requirePayment);
          const hasGuestFee = Boolean(court.enableGuestFee);
          const { name, courtNumber } = normalizeCourtNameAndNumber({
            name: court.name,
            courtNumber: court.courtNumber,
          });
          return {
            name,
            courtNumber,
            surfaceType: court.surfaceType,
            courtType: court.courtType,
            isIndoor: court.isIndoor,
            hasLights: court.hasLights,
            canSplit: court.canSplit,
            splitConfig: court.splitConfig,
            requirePayment: wantsPayment,
            bookingAmountCents: wantsPayment
              ? parseBookingFeeDollars(court.bookingFeeDollars)
              : null,
            guestFeeCents: hasGuestFee
              ? parseBookingFeeDollars(court.guestFeeDollars)
              : null,
            operatingSchedule: court.operatingSchedule,
          };
        }),

        // Admin Invites
        adminInvites: fd.adminInvites.filter(invite => invite.email),

        // Address Whitelist
        hoaAddresses: fd.parsedAddresses.length > 0 ? fd.parsedAddresses : undefined,

        // Existing user ID (if already logged in)
        existingUserId: user?.id,

        // Payment info
        paymentSessionId:
          paymentSessionId ||
          sessionStorage.getItem('facilityRegistrationPaymentSessionId') ||
          undefined,
        promoCode: paymentWaived ? promoCode : undefined,
        paymentAmountCents: paymentWaived ? 0 : (promoValidation?.valid ? promoValidation.finalAmountCents : getAmountForCourts(fd.courts.length)),
        paymentWaived,
        customPricing: false,
      };

      // Call the API to register the facility
      const result = await facilitiesApi.register(registrationData);

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      // Auto-login the new user
      const backendResponse = result.data as any;
      const facilityId = backendResponse.facility?.id;
      if (backendResponse.user && facilityId) {
        // Build user data with facility associations
        const userData = {
          ...backendResponse.user,
          userType: 'admin',
          memberFacilities: [facilityId],
          adminFacilities: [facilityId],
        };

        localStorage.setItem('auth_user', JSON.stringify(userData));
        if (backendResponse.token) {
          localStorage.setItem('auth_token', backendResponse.token);
        }

        clearRegistrationSession();

        if (isMobileRegistration && backendResponse.token && facilityId) {
          toast.success('Facility registered! Returning to the CourtTime app…');
          setTimeout(() => {
            window.location.href = facilityRegistrationCompleteDeepLink({
              token: backendResponse.token,
              facilityId,
            });
          }, 800);
          return;
        }

        toast.success('Facility registered successfully! Logging you in...');

        // Navigate to the admin dashboard
        setTimeout(() => {
          window.location.href = '/calendar';
        }, 1000);
      } else {
        clearRegistrationSession();
        toast.success('Facility registered successfully!');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }

    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (!autoSubmitAfterPayment || !paymentComplete || !registrationSessionReady || isSubmitting) return;
    setAutoSubmitAfterPayment(false);
    const timer = window.setTimeout(() => {
      void handleSubmitRef.current();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [autoSubmitAfterPayment, paymentComplete, registrationSessionReady, isSubmitting]);

  // Get step label based on step number and user status
  const getStepLabel = (stepNumber: number): string => {
    if (!preAuthenticated) {
      // Not pre-authenticated - 7 steps (includes account step)
      switch (stepNumber) {
        case 1: return 'Your Account';
        case 2: return 'Facility Info';
        case 3: return 'Courts';
        case 4: return 'Rules';
        case 5: return 'Admins';
        case 6: return 'Review';
        case 7: return 'Payment';
        default: return '';
      }
    } else {
      // Pre-authenticated - 6 steps (skip account step)
      switch (stepNumber) {
        case 1: return 'Facility Info';
        case 2: return 'Courts';
        case 3: return 'Rules';
        case 4: return 'Admins';
        case 5: return 'Review';
        case 6: return 'Payment';
        default: return '';
      }
    }
  };

  const renderProgressBar = () => {
    const progressPercent = totalSteps > 1
      ? ((currentStep - 1) / (totalSteps - 1)) * 100
      : 100;

    return (
      <div className="mb-6 md:mb-8">
        <div className="md:hidden space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-green-700 whitespace-nowrap">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-gray-600 text-right truncate">
              {getStepLabel(currentStep)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-green-700 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
            role="tablist"
            aria-label="Registration steps"
          >
            {Array.from({ length: totalSteps }).map((_, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === currentStep;
              const isVisited = stepNumber < currentStep;
              const label = getStepLabel(stepNumber);

              return (
                <button
                  key={stepNumber}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => goToStep(stepNumber)}
                  className={`snap-start shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'border-green-700 bg-green-700 text-white'
                      : isVisited
                        ? 'border-green-800 bg-green-50 text-green-800'
                        : 'border-gray-300 bg-white text-gray-600'
                  }`}
                  title={`Go to step ${stepNumber}: ${label}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                    {isVisited ? <Check className="h-3 w-3" /> : stepNumber}
                  </span>
                  <span className="max-w-[7rem] truncate sm:max-w-none">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">
            Tap a step to jump ahead. All required fields must be completed before you submit.
          </p>
        </div>

        <div className="hidden md:block">
          <div className="flex justify-between mb-2">
            {Array.from({ length: totalSteps }).map((_, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === currentStep;
              const isVisited = stepNumber < currentStep;

              let bgColor = 'white';
              let borderColor = '#d1d5db';
              let textColor = '#6b7280';

              if (isCurrent) {
                bgColor = '#15803d';
                borderColor = '#15803d';
                textColor = 'white';
              } else if (isVisited) {
                bgColor = '#166534';
                borderColor = '#166534';
                textColor = 'white';
              }

              return (
                <div key={stepNumber} className="flex-1 flex items-start min-w-0">
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => goToStep(stepNumber)}
                      onKeyDown={(e) => e.key === 'Enter' && goToStep(stepNumber)}
                      className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer hover:scale-105 font-medium shrink-0"
                      style={{
                        backgroundColor: bgColor,
                        borderColor: borderColor,
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        borderRadius: '9999px',
                        color: textColor,
                      }}
                      title={`Go to step ${stepNumber}: ${getStepLabel(stepNumber)}`}
                    >
                      {isVisited ? <Check className="h-5 w-5" /> : stepNumber}
                    </div>
                    <div
                      className="text-xs mt-2 text-center px-0.5 leading-tight truncate w-full max-w-[5.5rem]"
                      style={{ color: isCurrent ? '#15803d' : '#6b7280', fontWeight: isCurrent ? 600 : 400 }}
                    >
                      {getStepLabel(stepNumber)}
                    </div>
                  </div>
                  {stepNumber < totalSteps && (
                    <div
                      className="flex-1 mx-2 mt-5 transition-colors min-w-[8px]"
                      style={{ backgroundColor: isVisited ? '#166534' : '#d1d5db', height: '2px' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-center text-gray-500">
            Click any step above to navigate. All required fields must be completed before registration.
          </p>
        </div>
      </div>
    );
  };

  // Payment handlers
  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return;
    setIsValidatingPromo(true);
    try {
      const result = await paymentsApi.validatePromo(promoCode.trim(), formData.courts.length);
      if (result.success && result.data) {
        // Unwrap apiRequest double-wrap
        const promo = result.data?.data || result.data;
        setPromoValidation(promo);
      } else {
        setPromoValidation({ valid: false, message: result.error || 'Invalid promo code' });
      }
    } catch {
      setPromoValidation({ valid: false, message: 'Error validating promo code' });
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleClearPromo = () => {
    setPromoCode('');
    setPromoValidation(null);
    setPaymentWaived(false);
  };

  const handlePayWithStripe = async () => {
    setIsProcessingPayment(true);
    try {
      const returnBase =
        window.location.origin + getRegistrationPathWithMobileSource(isMobileRegistration);
      const tierAmount = getAmountForCourts(formData.courts.length);
      const finalAmount = promoValidation?.valid ? (promoValidation.finalAmountCents ?? tierAmount) : tierAmount;
      const paymentJoiner = returnBase.includes('?') ? '&' : '?';

      const result = await paymentsApi.createCheckoutSession({
        facilityName: formData.facilityName,
        courtCount: formData.courts.length,
        amountCents: finalAmount,
        promoCode: promoValidation?.valid ? promoCode : undefined,
        successUrl: `${returnBase}${paymentJoiner}payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${returnBase}${paymentJoiner}payment=cancelled`,
      });

      if (result.success && result.data) {
        // Unwrap apiRequest double-wrap: server returns { data: { sessionUrl, ... } }
        const payment = result.data?.data || result.data;
        if (payment.sessionUrl) {
          persistRegistrationToSession();
          if (payment.waived) {
            sessionStorage.setItem('facilityRegistrationWaived', 'true');
          }
          window.location.href = payment.sessionUrl;
        } else if (payment.waived) {
          // Dev mode — no Stripe, promo fully waives
          setPaymentWaived(true);
          setPaymentComplete(true);
        } else {
          // Dev mode — no Stripe keys, auto-complete payment
          setPaymentSessionId(payment.sessionId || 'dev_auto');
          setPaymentComplete(true);
          toast.success('Payment completed (dev mode)');
        }
      } else {
        toast.error(result.error || 'Failed to start payment');
      }
    } catch (error: any) {
      toast.error(error.message || 'Payment error');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const renderPaymentStep = () => {
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
  };

  // Shared profile fields section used in both "create" and "loggedIn" modes
  const renderProfileFields = () => (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="text-lg font-medium">Player Profile (Optional)</h3>
      <p className="text-sm text-gray-500">These fields are optional and can be updated later in your profile settings.</p>

      {/* Profile Picture */}
      <div>
        <Label>Profile Picture</Label>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-2">
          <Avatar className="h-16 w-16">
            {formData.adminProfilePicture ? (
              <AvatarImage src={formData.adminProfilePicture} alt="Profile" />
            ) : null}
            <AvatarFallback className="text-lg">
              {(formData.adminFirstName || user?.firstName || '?')[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('adminProfilePicInput')?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              {formData.adminProfilePicture ? 'Change' : 'Upload'}
            </Button>
            {formData.adminProfilePicture && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleInputChange('adminProfilePicture', '')}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            id="adminProfilePicInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAdminProfilePictureChange}
          />
        </div>
      </div>

      {/* Skill Level & USTA Rating */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="adminSkillLevel">Skill Level</Label>
          <Select
            value={formData.adminSkillLevel}
            onValueChange={(value) => handleInputChange('adminSkillLevel', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select skill level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
              <SelectItem value="Expert">Expert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="adminUstaRating">USTA/NTRP Rating</Label>
          <Select
            value={formData.adminUstaRating}
            onValueChange={(value) => handleInputChange('adminUstaRating', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2.0">2.0</SelectItem>
              <SelectItem value="2.5">2.5</SelectItem>
              <SelectItem value="3.0">3.0</SelectItem>
              <SelectItem value="3.5">3.5</SelectItem>
              <SelectItem value="4.0">4.0</SelectItem>
              <SelectItem value="4.5">4.5</SelectItem>
              <SelectItem value="5.0">5.0</SelectItem>
              <SelectItem value="5.5">5.5</SelectItem>
              <SelectItem value="6.0">6.0</SelectItem>
              <SelectItem value="6.5">6.5</SelectItem>
              <SelectItem value="7.0">7.0</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bio */}
      <div>
        <Label htmlFor="adminBio">Bio</Label>
        <Textarea
          id="adminBio"
          value={formData.adminBio}
          onChange={(e) => {
            if (e.target.value.length <= 500) {
              handleInputChange('adminBio', e.target.value);
            }
          }}
          placeholder="Tell us a little about yourself..."
          rows={3}
        />
        <p className="text-xs text-gray-400 mt-1">{formData.adminBio.length}/500 characters</p>
      </div>
    </div>
  );

  const renderStep1AdminAccount = () => {
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

            {renderProfileFields()}
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
          {renderProfileFields()}
        </div>
      </div>
    );
  };

  const renderStep2FacilityInfo = () => (
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

      {renderFacilityOperatingHours(
        'Sets the weekly open and close times for every court. You can customize individual courts later under Facility Management → Court Management.'
      )}


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

  const renderRulesStep = () => (
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
            The file should have "Address" and "Last Name" columns (one entry per row). Members will be auto-approved when their address and last name match an entry on this list. Configure max accounts per address in the Max Accounts Per Address section above.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const renderStep4Courts = () => (
    <div id="courtsSection" className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Court Setup</h3>
        <p className="text-sm text-gray-600 mb-6">
          Add each court with its own operating hours, plus optional paid booking and guest fees. New courts
          start from the facility hours you set on the previous step — adjust each court below as needed.
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
                    type="number"
                    value={court.courtNumber}
                    onChange={(e) =>
                      updateCourt(court.id, {
                        courtNumber: parseInt(e.target.value, 10) || 1,
                      })
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
                  peakStartLabel="Prime Start"
                  peakEndLabel="Prime End"
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

  const renderStep5Admins = () => (
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

  const renderStep6Review = () => {
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
        `${slot.startTime || '--:--'}-${slot.endTime || '--:--'}`,
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
                  {court.requirePayment && court.bookingFeeDollars && (
                    <> · Paid ${court.bookingFeeDollars}</>
                  )}
                  {court.enableGuestFee && court.guestFeeDollars && (
                    <> · Guest fee ${court.guestFeeDollars}</>
                  )}
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
  };

  return (
    <div className="facility-registration min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-3 py-4 sm:p-4 pb-24 sm:pb-4">
      <Card className="w-full max-w-4xl shadow-sm">
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex flex-col items-center mb-4 sm:mb-6">
            <Button variant="ghost" onClick={() => navigate('/login')} className="self-start mb-3 sm:mb-4 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <img src={logoImage} alt="CourtTime" className="h-12 sm:h-16" />
          </div>
          <CardTitle className="text-xl sm:text-2xl">Facility Registration</CardTitle>
          <CardDescription>
            Register your tennis or pickleball facility with CourtTime
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {renderProgressBar()}

          <div className="mt-6 sm:mt-8">
            {!preAuthenticated && currentStep === 1 && renderStep1AdminAccount()}
            {(preAuthenticated ? currentStep === 1 : currentStep === 2) && renderStep2FacilityInfo()}
            {(preAuthenticated ? currentStep === 2 : currentStep === 3) && renderStep4Courts()}
            {(preAuthenticated ? currentStep === 3 : currentStep === 4) && renderRulesStep()}
            {(preAuthenticated ? currentStep === 4 : currentStep === 5) && renderStep5Admins()}
            {(preAuthenticated ? currentStep === 5 : currentStep === 6) && renderStep6Review()}
            {(preAuthenticated ? currentStep === 6 : currentStep === 7) && renderPaymentStep()}
          </div>

          <div className="facility-reg-nav sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 mt-6 sm:mt-8 bg-gray-50/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t sm:border-t-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between z-10">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {currentStep < totalSteps ? (
              <Button type="button" onClick={handleNext} className="w-full sm:w-auto">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || (!paymentComplete && !paymentWaived)}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? 'Submitting...' : 'Complete Registration'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
