import type { PaidCourtFormFields } from '../admin/PaidCourtBookingFields';
import type { CourtScheduleDay } from '../admin/CourtScheduleEditor';
import type { CourtFeesMode } from './courtFees';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from './rule-defaults';

export interface RegistrationCourt extends PaidCourtFormFields {
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

export interface AdminInvite {
  id: string;
  email: string;
  status: 'pending' | 'sent';
}

export interface SecondaryFacilityLocation {
  id: string;
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
}

export type Step1Mode = 'choose' | 'create' | 'login' | 'loggedIn';

export interface RegistrationFormData {
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  adminConfirmPassword: string;
  adminStreetAddress: string;
  adminCity: string;
  adminState: string;
  adminZipCode: string;
  adminProfilePicture: string;
  adminSkillLevel: string;
  adminUstaRating: string;
  adminBio: string;
  facilityName: string;
  facilityType: string;
  primaryLocationLabel: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  description: string;
  facilityImage: File | null;
  facilityImagePreview: string;
  facilityImageBase64: string;
  primaryContact: {
    name: string;
    email: string;
    phone: string;
  };
  secondaryContacts: Array<{ id: string; name: string; email: string; phone: string }>;
  secondaryLocations: SecondaryFacilityLocation[];
  addressWhitelistFile: File | null;
  addressWhitelistFileName: string;
  parsedAddresses: Array<{
    streetAddress: string;
    city?: string;
    state?: string;
    zipCode?: string;
    householdName?: string;
    lastName?: string;
  }>;
  operatingHours: {
    monday: { open: string; close: string; closed: boolean };
    tuesday: { open: string; close: string; closed: boolean };
    wednesday: { open: string; close: string; closed: boolean };
    thursday: { open: string; close: string; closed: boolean };
    friday: { open: string; close: string; closed: boolean };
    saturday: { open: string; close: string; closed: boolean };
    sunday: { open: string; close: string; closed: boolean };
  };
  timezone: string;
  rulesConfig: RulesConfig;
  enableTermsAndConditions: boolean;
  termsAndConditions: string;
  courts: RegistrationCourt[];
  courtFeesMode: CourtFeesMode;
  courtFeesBookingDollars: string;
  courtFeesGuestDollars: string;
  adminInvites: AdminInvite[];
}

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
] as const;

export function createInitialRegistrationFormData(user?: {
  email?: string;
  fullName?: string;
} | null): RegistrationFormData {
  return {
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
    adminProfilePicture: '',
    adminSkillLevel: '',
    adminUstaRating: '',
    adminBio: '',
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
    facilityImage: null,
    facilityImagePreview: '',
    facilityImageBase64: '',
    primaryContact: {
      name: user?.fullName || '',
      email: user?.email || '',
      phone: '',
    },
    secondaryContacts: [],
    secondaryLocations: [],
    addressWhitelistFile: null,
    addressWhitelistFileName: '',
    parsedAddresses: [],
    operatingHours: {
      monday: { open: '08:00', close: '20:00', closed: false },
      tuesday: { open: '08:00', close: '20:00', closed: false },
      wednesday: { open: '08:00', close: '20:00', closed: false },
      thursday: { open: '08:00', close: '20:00', closed: false },
      friday: { open: '08:00', close: '20:00', closed: false },
      saturday: { open: '09:00', close: '18:00', closed: false },
      sunday: { open: '09:00', close: '18:00', closed: false },
    },
    timezone: 'America/New_York',
    rulesConfig: { ...DEFAULT_RULES_CONFIG },
    enableTermsAndConditions: false,
    termsAndConditions: '',
    courts: [],
    courtFeesMode: 'none',
    courtFeesBookingDollars: '',
    courtFeesGuestDollars: '',
    adminInvites: [],
  };
}
