import { parseBookingFeeDollars } from '../admin/PaidCourtBookingFields';
import { isCourtNumberEmpty } from '../../../shared/utils/courtNaming';
import type { Step1Mode, RegistrationFormData } from './registrationTypes';
import { parsedHasCreateAccountFields } from './registrationPath';
import { getRuleEntry, hasValue } from './registrationRules';

export const ERROR_FIELD_TARGETS: Record<string, string> = {
  step1Mode: 'step1ModeSelection',
  primaryContactName: 'primaryContactName',
  primaryContactPhone: 'primaryContactPhone',
  primaryContactEmail: 'primaryContactEmail',
  generalRules: 'generalRules',
  restrictionType: 'restrictionTypeGroup',
  courts: 'courtsSection',
};

export function getStepErrors(
  step: number,
  dataSource: RegistrationFormData,
  options: {
    preAuthenticated: boolean;
    step1Mode: Step1Mode;
  }
): Record<string, string> {
  const { preAuthenticated, step1Mode } = options;
  const stepErrors: Record<string, string> = {};

  if (!preAuthenticated && step === 1) {
    const effectiveStep1Mode =
      step1Mode === 'choose' && parsedHasCreateAccountFields(dataSource)
        ? 'create'
        : step1Mode;

    if (effectiveStep1Mode === 'choose' || effectiveStep1Mode === 'login') {
      stepErrors.step1Mode = 'Please create an account or log in to continue';
    } else if (effectiveStep1Mode === 'create') {
      if (!dataSource.adminFirstName.trim()) stepErrors.adminFirstName = 'First name is required';
      if (!dataSource.adminLastName.trim()) stepErrors.adminLastName = 'Last name is required';
      if (!dataSource.adminEmail.trim()) stepErrors.adminEmail = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(dataSource.adminEmail)) stepErrors.adminEmail = 'Email is invalid';
      if (!dataSource.adminPhone.trim()) stepErrors.adminPhone = 'Phone number is required';
      if (!dataSource.adminPassword) stepErrors.adminPassword = 'Password is required';
      else if (dataSource.adminPassword.length < 8) {
        stepErrors.adminPassword = 'Password must be at least 8 characters';
      }
      if (dataSource.adminPassword !== dataSource.adminConfirmPassword) {
        stepErrors.adminConfirmPassword = 'Passwords do not match';
      }
      if (!dataSource.adminStreetAddress.trim()) stepErrors.adminStreetAddress = 'Street address is required';
      if (!dataSource.adminCity.trim()) stepErrors.adminCity = 'City is required';
      if (!dataSource.adminState) stepErrors.adminState = 'State is required';
      if (!dataSource.adminZipCode.trim()) stepErrors.adminZipCode = 'ZIP code is required';
    }
  }

  const facilityStep = preAuthenticated ? 1 : 2;
  if (step === facilityStep) {
    if (!dataSource.facilityName.trim()) stepErrors.facilityName = 'Facility name is required';
    if (!dataSource.facilityType) stepErrors.facilityType = 'Facility type is required';
    if (!dataSource.streetAddress.trim()) stepErrors.streetAddress = 'Street address is required';
    if (!dataSource.city.trim()) stepErrors.city = 'City is required';
    if (!dataSource.state) stepErrors.state = 'State is required';
    if (!dataSource.zipCode.trim()) stepErrors.zipCode = 'ZIP code is required';
    if (!dataSource.phone.trim()) stepErrors.phone = 'Facility phone number is required';
    if (!dataSource.email.trim()) stepErrors.email = 'Facility email is required';
    else if (!/\S+@\S+\.\S+/.test(dataSource.email)) stepErrors.email = 'Facility email is invalid';
    if (!dataSource.primaryContact.name.trim()) stepErrors.primaryContactName = 'Primary contact name is required';
    if (!dataSource.primaryContact.email.trim()) stepErrors.primaryContactEmail = 'Primary contact email is required';
    else if (!/\S+@\S+\.\S+/.test(dataSource.primaryContact.email)) {
      stepErrors.primaryContactEmail = 'Primary contact email is invalid';
    }
    if (!dataSource.primaryContact.phone.trim()) stepErrors.primaryContactPhone = 'Primary contact phone is required';
  }

  const courtsStep = preAuthenticated ? 2 : 3;
  if (step === courtsStep) {
    if (dataSource.courts.length === 0) {
      stepErrors.courts = 'At least one court is required';
    } else {
      for (const court of dataSource.courts) {
        if (isCourtNumberEmpty(court.courtNumber)) {
          stepErrors.courts = `Enter a court number for ${court.name || 'each court'}`;
          break;
        }
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
}

export function stepHasErrors(
  step: number,
  formData: RegistrationFormData,
  options: { preAuthenticated: boolean; step1Mode: Step1Mode }
): boolean {
  return Object.keys(getStepErrors(step, formData, options)).length > 0;
}

export function validateAllSteps(
  dataSource: RegistrationFormData,
  totalSteps: number,
  options: { preAuthenticated: boolean; step1Mode: Step1Mode }
): {
  isValid: boolean;
  errors: Record<string, string>;
  firstInvalidStep: number | null;
  firstInvalidField: string | null;
} {
  const allErrors: Record<string, string> = {};
  let firstInvalidStep: number | null = null;
  let firstInvalidField: string | null = null;

  for (let step = 1; step <= totalSteps; step++) {
    const stepErrors = getStepErrors(step, dataSource, options);
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
    firstInvalidField,
  };
}
