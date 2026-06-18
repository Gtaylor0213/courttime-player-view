import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  parseWhitelistCsv,
  parseWhitelistWorkbook,
} from '../../../shared/utils/parseWhitelistSpreadsheet';
import { facilitiesApi, paymentsApi } from '../../api/client';
import { getAmountForCourts } from '../../services/subscriptionPricing';
import {
  facilityRegistrationCompleteDeepLink,
  isMobileFacilityRegistrationSource,
} from '../../../shared/utils/mobileFacilityRegistration';
import { mergeRegistrationFormData } from '../../../shared/utils/facilityRegistrationForm';
import { DEFAULT_RULES_CONFIG, RulesConfig, type RuleEntry } from './rule-defaults';
import type { CourtScheduleDay } from '../admin/CourtScheduleEditor';
import {
  buildCourtScheduleRowsFromFacilityOperatingHours,
  courtScheduleRowsToOperatingHoursMap,
  formatGroupedOperatingHoursSummary,
} from '../../../shared/utils/operatingHours';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberChange,
  normalizeCourtNameAndNumber,
} from '../../../shared/utils/courtNaming';
import { validateStoredCourtType } from '../../../shared/constants/courtTypes';
import { parseBookingFeeDollars } from '../admin/PaidCourtBookingFields';
import { useAuth } from '../../contexts/AuthContext';
import { getRegistrationPathWithMobileSource, resolveRegistrationValidationOptions } from './registrationPath';
import { buildRegistrationBookingRules, hasValue } from './registrationRules';
import { validateAllSteps, ERROR_FIELD_TARGETS } from './validation';
import {
  US_STATES,
  type RegistrationCourt,
  type AdminInvite,
  type SecondaryFacilityLocation,
} from './registrationTypes';
import { useRegistrationWizard } from './useRegistrationWizard';

export function useRegistrationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, login } = useAuth();
  const isMobileRegistration = isMobileFacilityRegistrationSource(
    new URLSearchParams(window.location.search).get('source')
  );


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
    courts: [] as RegistrationCourt[],

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
  const wizard = useRegistrationWizard({
    user,
    formData,
    setFormData,
    promoCode,
    paymentWaived,
    promoValidation,
    setPromoCode,
    setPaymentWaived,
    setPromoValidation,
    setPaymentSessionId,
    setPaymentComplete,
    setAutoSubmitAfterPayment,
    setRegistrationSessionReady,
    isMobileRegistration,
    setErrors,
  });

  const {
    currentStep,
    setCurrentStep,
    step1Mode,
    setStep1Mode,
    loggedInDuringRegistration,
    setLoggedInDuringRegistration,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    setLoginError,
    isLoggingIn,
    setIsLoggingIn,
    preAuthenticated,
    totalSteps,
    persistRegistrationToSession,
    clearRegistrationSession,
    getStepLabel,
    goToStep,
    handleNext,
    handleBack,
  } = wizard;


  // Pre-authenticated = user was already logged in before visiting registration (skip Step 1)
  // loggedInDuringRegistration = user logged in via Step 1 login form (still shows Step 1)



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
    setFormData((prev) => {
      const operatingHours = {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day as keyof typeof prev.operatingHours],
          [field]: value,
        },
      };
      const defaultSchedule = buildCourtScheduleRowsFromFacilityOperatingHours(operatingHours).map(
        (row) => ({
          day_of_week: row.day_of_week,
          is_open: row.is_open,
          open_time: row.open_time,
          close_time: row.close_time,
        })
      );
      return {
        ...prev,
        operatingHours,
        courts: prev.courts.map((court) => ({
          ...court,
          operatingSchedule: defaultSchedule.map((scheduleDay) => ({ ...scheduleDay })),
        })),
      };
    });
  };

  const buildDefaultCourtSchedule = (
    operatingHours: typeof formData.operatingHours
  ): CourtScheduleDay[] =>
    buildCourtScheduleRowsFromFacilityOperatingHours(operatingHours).map((row) => ({
      day_of_week: row.day_of_week,
      is_open: row.is_open,
      open_time: row.open_time,
      close_time: row.close_time,
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

  const cloneCourtSchedule = (schedule: CourtScheduleDay[]): CourtScheduleDay[] =>
    schedule.map((day) => ({ ...day }));

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
          try {
            const text = reader.result as string;
            const addresses = parseWhitelistCsv(text);
            setFormData(prev => ({ ...prev, parsedAddresses: addresses }));
            if (addresses.length > 0) {
              toast.success(`Parsed ${addresses.length} address${addresses.length !== 1 ? 'es' : ''} from file`);
            } else {
              toast.error('No addresses found in file');
            }
          } catch (error) {
            console.error('Error parsing CSV:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to read CSV file. Check the format and try again.');
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


  // Navigate to a specific step (always allowed)

  const addCourt = () => {
    setFormData(prev => {
      const newCourt: RegistrationCourt = {
        id: `court-${Date.now()}`,
        name: `RegistrationCourt ${prev.courts.length + 1}`,
        courtNumber: prev.courts.length + 1,
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
        operatingSchedule: buildDefaultCourtSchedule(prev.operatingHours),
      };
      return { ...prev, courts: [...prev.courts, newCourt] };
    });

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

    if (isNaN(startNum) || startNum < 1) {
      toast.error('Please enter a valid starting court number (1 or greater)');
      return;
    }

    setFormData(prev => {
      const scheduleForBulkCourt = buildDefaultCourtSchedule(prev.operatingHours);
      const newCourts: RegistrationCourt[] = [];
      for (let i = 0; i < count; i++) {
        const courtNumber = startNum + i;
        newCourts.push({
          id: `court-${Date.now()}-${i}`,
          name: `RegistrationCourt ${courtNumber}`,
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
          operatingSchedule: cloneCourtSchedule(scheduleForBulkCourt),
        });
      }
      return { ...prev, courts: [...prev.courts, ...newCourts] };
    });

    if (errors.courts) {
      setErrors(prev => ({ ...prev, courts: '' }));
    }

    toast.success(`Added ${count} courts successfully`);
    setCourtFormMode('individual');
  };

  const updateCourt = (courtId: string, updates: Partial<RegistrationCourt>) => {
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
    const validationOptions = resolveRegistrationValidationOptions(submitFormData, {
      user,
      preAuthenticated,
      step1Mode,
      loggedInDuringRegistration,
    });
    const submitTotalSteps = validationOptions.preAuthenticated ? 6 : 7;

    // Validate ALL steps before submission
    const validation = validateAllSteps(submitFormData, submitTotalSteps, validationOptions);

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
      const savedPromoCode =
        promoCode.trim() ||
        sessionStorage.getItem('facilityRegistrationPromo')?.trim() ||
        '';
      let effectivePromoValidation = promoValidation;
      if (!effectivePromoValidation) {
        const savedPromoValidation = sessionStorage.getItem('facilityRegistrationPromoValidation');
        if (savedPromoValidation) {
          try {
            effectivePromoValidation = JSON.parse(savedPromoValidation);
          } catch {
            effectivePromoValidation = null;
          }
        }
      }
      const effectivePaymentWaived =
        paymentWaived || sessionStorage.getItem('facilityRegistrationWaived') === 'true';
      const effectivePaymentSessionId =
        paymentSessionId ||
        sessionStorage.getItem('facilityRegistrationPaymentSessionId') ||
        undefined;

      // Prepare registration data
      const registrationData = {
        // Facility Administrator Account (only when creating a brand-new user).
        // Use step1Mode (restored from session before auto-submit fires) instead of
        // the live `user` object, which may be null on Stripe redirect before auth rehydrates.
        ...(step1Mode === 'create' ? {
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
        } : {}),

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

        // Existing user ID (if already logged in — never sent for the create-account path)
        existingUserId: step1Mode !== 'create' ? user?.id : undefined,

        // Payment info
        paymentSessionId: effectivePaymentSessionId,
        promoCode: savedPromoCode || undefined,
        paymentAmountCents: effectivePaymentWaived
          ? 0
          : (effectivePromoValidation?.valid
            ? (effectivePromoValidation.finalAmountCents ?? getAmountForCourts(fd.courts.length))
            : getAmountForCourts(fd.courts.length)),
        paymentWaived: effectivePaymentWaived,
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









  return {
    user,
    login,
    isMobileRegistration,
    isSubmitting,
    formData,
    errors,
    courtFormMode,
    setCourtFormMode,
    bulkCourtData,
    setBulkCourtData,
    promoCode,
    setPromoCode,
    promoValidation,
    setPromoValidation,
    isValidatingPromo,
    paymentSessionId,
    paymentComplete,
    paymentWaived,
    isProcessingPayment,
    currentStep,
    step1Mode,
    setStep1Mode,
    loggedInDuringRegistration,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    isLoggingIn,
    preAuthenticated,
    totalSteps,
    handleInputChange,
    handleOperatingHoursChange,
    buildDefaultCourtSchedule,
    updateCourtScheduleDay,
    resetCourtScheduleToFacilityDefaults,
    handleRulesChange,
    handleRuleEntryChange,
    handleRuleConfigFieldChange,
    handlePrimaryContactChange,
    addSecondaryContact,
    updateSecondaryContact,
    removeSecondaryContact,
    addSecondaryLocation,
    updateSecondaryLocation,
    removeSecondaryLocation,
    handleFacilityImageChange,
    removeFacilityImage,
    handleAdminProfilePictureChange,
    handleRegistrationLogin,
    handleAddressWhitelistChange,
    removeAddressWhitelist,
    addPeakHourSlot,
    removePeakHourSlot,
    updatePeakHourSlot,
    togglePeakHourSlotDay,
    updatePeakHourSlotRule,
    addCourt,
    addBulkCourts,
    updateCourt,
    removeCourt,
    addAdminInvite,
    updateAdminInvite,
    removeAdminInvite,
    handleSubmit,
    handleValidatePromo,
    handleClearPromo,
    handlePayWithStripe,
    buildRegistrationBookingRules,
    US_STATES,
    getStepLabel,
    goToStep,
    handleNext,
    handleBack,
  };
}

export type RegistrationContextValue = ReturnType<typeof useRegistrationForm>;
