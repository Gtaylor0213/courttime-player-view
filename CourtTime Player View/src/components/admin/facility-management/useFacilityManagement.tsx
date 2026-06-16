import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { RULE_METADATA, CATEGORIES, getRulesByCategory, RuleMeta } from '../../facility-registration/rule-defaults';
import { Button } from '../../ui/button';
import { CardFooter } from '../../ui/card';
import { Info, Save, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppContext } from '../../../contexts/AppContext';
import {
  parseLocalDate,
  toDatetimeLocalInput,
  normalizeLocalDatetimeForStorage,
} from '../../../utils/dateUtils';
import {
  facilitiesApi,
  adminApi,
  courtConfigApi,
  rulesApi,
  facilityLocationsApi,
  stripeConnectApi,
  isStripeConnectReadyFromResponse,
} from '../../../api/client';
import {
  formatCentsToDollars,
  parseBookingFeeDollars,
} from '../PaidCourtBookingFields';
import { validateStoredCourtType } from '../../../../shared/constants/courtTypes';
import {
  courtScheduleRowsToOperatingHoursMap,
  extractCourtScheduleFromApiResponse,
  formatGroupedOperatingHoursSummary,
  type OperatingHoursMap,
} from '../../../../shared/utils/operatingHours';
import {
  formatStandardCourtName,
  isCourtNumberEmpty,
  normalizeCourtNameAndNumber,
} from '../../../../shared/utils/courtNaming';
import { normalizeFacilityType } from '../../../../shared/constants/facilityTypes';
import {
  confirmCourtAddPaymentFromUrl,
  getCourtAddReturnUrl,
  handleCourtAddPaymentResponse,
} from '../../../utils/courtAddPayment';
import {
  type BookingRules,
  type Court,
  type FacilityContact,
  type FacilityData,
  type PeakHourSlot,
  defaultBookingRules,
  defaultOperatingHours,
} from './facilityManagementTypes';

const isUnlimitedRuleValue = (value: unknown) => value === -1 || value === '-1';

const toRuleInputValue = (value: unknown, fallback: string) => {
  if (isUnlimitedRuleValue(value) || value == null || value === '') {
    return fallback;
  }

  return String(value);
};

const normalizePeakHoursRestrictions = (rules: any = {}): BookingRules['peakHoursRestrictions'] => {
  const maxBookingsPerWeekRaw = rules.maxBookingsPerWeek ?? rules.max_bookings_per_week;
  const maxDurationHoursRaw = rules.maxDurationHours ?? rules.max_duration_hours;

  return {
    maxBookingsPerWeek: toRuleInputValue(
      maxBookingsPerWeekRaw,
      defaultBookingRules.peakHoursRestrictions.maxBookingsPerWeek
    ),
    maxBookingsUnlimited: rules.maxBookingsUnlimited === true || isUnlimitedRuleValue(maxBookingsPerWeekRaw),
    maxDurationHours: toRuleInputValue(
      maxDurationHoursRaw,
      defaultBookingRules.peakHoursRestrictions.maxDurationHours
    ),
    maxDurationUnlimited: rules.maxDurationUnlimited === true || isUnlimitedRuleValue(maxDurationHoursRaw),
  };
};

export function useFacilityManagement(activeTab: string) {
  const { user } = useAuth();
  const { selectedFacilityId: currentFacilityId } = useAppContext();

const [isEditing, setIsEditing] = useState(false);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [originalData, setOriginalData] = useState<FacilityData | null>(null);
const [expandedPeakHourSlots, setExpandedPeakHourSlots] = useState<Record<string, boolean>>({});
const [facilityData, setFacilityData] = useState<FacilityData>({
  name: '',
  type: '',
  primaryLocationLabel: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: '',
  description: '',
  operatingHours: defaultOperatingHours,
  timezone: 'America/New_York',
  logoUrl: '',
  facilityImage: null,
  facilityImagePreview: '',
  primaryContact: {
    name: '',
    email: '',
    phone: '',
  },
  secondaryContacts: [],
  bookingRules: defaultBookingRules,
});

// Court management state
const [courts, setCourts] = useState<Court[]>([]);
const [courtsLoading, setCourtsLoading] = useState(false);
const [editingCourt, setEditingCourt] = useState<Court | null>(null);
const [isAddingNewCourt, setIsAddingNewCourt] = useState(false);
const [courtSaving, setCourtSaving] = useState(false);
const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
const [stripeStatusLoading, setStripeStatusLoading] = useState(false);

const loadStripeStatus = async () => {
  if (!currentFacilityId) return;
  setStripeStatusLoading(true);
  try {
    const res = await stripeConnectApi.getStatus(currentFacilityId);
    setStripeOnboarded(isStripeConnectReadyFromResponse(res));
  } catch (err) {
    console.error('Stripe Connect status check failed:', err);
    setStripeOnboarded(null);
  } finally {
    setStripeStatusLoading(false);
  }
};

// Court schedule config state
const [configuringCourtId, setConfiguringCourtId] = useState<string | null>(null);
const [courtSchedule, setCourtSchedule] = useState<any[]>([]);
const [courtScheduleLoading, setCourtScheduleLoading] = useState(false);
const [courtScheduleSaving, setCourtScheduleSaving] = useState(false);
const [courtOperatingHours, setCourtOperatingHours] = useState<Record<string, OperatingHoursMap>>({});
const [courtHoursLoading, setCourtHoursLoading] = useState(false);
const facilityCourtEditPanelRef = useRef<HTMLDivElement | null>(null);

// Blackout state
const [blackouts, setBlackouts] = useState<any[]>([]);
const [blackoutsLoading, setBlackoutsLoading] = useState(false);
const [editingBlackout, setEditingBlackout] = useState<any | null>(null);
const [isAddingBlackout, setIsAddingBlackout] = useState(false);
const [blackoutSaving, setBlackoutSaving] = useState(false);


// Secondary facility locations
interface SecondaryLocation {
  id: string;
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
}
const [secondaryLocations, setSecondaryLocations] = useState<SecondaryLocation[]>([]);
const [addingSecondaryLocation, setAddingSecondaryLocation] = useState(false);
const [newSecondaryLocation, setNewSecondaryLocation] = useState({
  locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: ''
});
const [savingSecondaryLocation, setSavingSecondaryLocation] = useState(false);
const [editingSecondaryLocationId, setEditingSecondaryLocationId] = useState<string | null>(null);
const [editingSecondaryLocation, setEditingSecondaryLocation] = useState({
  locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: ''
});
useEffect(() => {
  if (currentFacilityId) {
    // loadFacilityData must complete before loadFacilityRules to avoid race condition
    loadFacilityData().then(() => loadFacilityRules());
    loadCourts();
    loadBlackouts();
    loadSecondaryLocations();
  }
}, [currentFacilityId]);

useEffect(() => {
  if (!editingCourt || isAddingNewCourt) return;
  facilityCourtEditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}, [editingCourt?.id, isAddingNewCourt]);

useEffect(() => {
  if (activeTab === 'courts' && currentFacilityId) {
    void loadStripeStatus();
  }
}, [activeTab, currentFacilityId]);

useEffect(() => {
  if (activeTab !== 'courts') return;
  const params = new URLSearchParams(window.location.search);
  void confirmCourtAddPaymentFromUrl(params, currentFacilityId || undefined).then((confirmed) => {
    if (confirmed && currentFacilityId) {
      void loadCourts();
    }
  });
}, [activeTab, currentFacilityId]);

const loadFacilityData = async () => {
  if (!currentFacilityId) {
    toast.error('No facility selected');
    return;
  }

  try {
    setLoading(true);
    const response = await facilitiesApi.getById(currentFacilityId);

    if (response.success && response.data?.facility) {
      const facility = response.data.facility;
      // Parse address - try to extract components if stored as single string
      let streetAddress = facility.streetAddress || '';
      let city = facility.city || '';
      let state = facility.state || '';
      let zipCode = facility.zipCode || '';

      // If address is stored as a single field, try to parse it
      if (!streetAddress && facility.address) {
        const addressParts = facility.address.split(',').map((p: string) => p.trim());
        if (addressParts.length >= 1) streetAddress = addressParts[0];
        if (addressParts.length >= 2) city = addressParts[1];
        if (addressParts.length >= 3) {
          // Try to parse "State ZIP" format
          const stateZip = addressParts[2].split(' ').filter((p: string) => p);
          if (stateZip.length >= 1) state = stateZip[0];
          if (stateZip.length >= 2) zipCode = stateZip[1];
        }
      }

      // Parse operating hours - handle different formats
      let parsedOperatingHours = defaultOperatingHours;
      if (facility.operatingHours) {
        if (typeof facility.operatingHours === 'object') {
          // Check if it's already in the new format
          const firstDay = Object.values(facility.operatingHours)[0];
          if (firstDay && typeof firstDay === 'object' && 'open' in (firstDay as object)) {
            parsedOperatingHours = facility.operatingHours;
          } else {
            // Convert from string format to object format
            Object.keys(facility.operatingHours).forEach(day => {
              const hours = facility.operatingHours[day];
              if (typeof hours === 'string') {
                if (hours.toLowerCase() === 'closed') {
                  parsedOperatingHours[day as keyof typeof parsedOperatingHours] = { open: '08:00', close: '20:00', closed: true };
                } else {
                  const [open, close] = hours.split(' - ');
                  parsedOperatingHours[day as keyof typeof parsedOperatingHours] = {
                    open: open || '08:00',
                    close: close || '20:00',
                    closed: false
                  };
                }
              }
            });
          }
        }
      }

      // Parse booking rules from facility data
      const rawPeakHoursSlots = facility.peakHoursPolicy?.timeSlots || [];
      const dayNameToNumber: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6
      };
      const normalizedPeakHoursSlots: PeakHourSlot[] = Array.isArray(rawPeakHoursSlots)
        ? rawPeakHoursSlots.map((slot: any) => normalizePeakHoursSlot(slot))
        : Object.entries(rawPeakHoursSlots).flatMap(([dayName, slots]: [string, any]) =>
            (Array.isArray(slots) ? slots : []).map((slot: any) => normalizePeakHoursSlot({ ...slot, days: [dayNameToNumber[dayName]] }))
          );

      let parsedSimplified: any = null;
      try {
        parsedSimplified = facility.bookingRules
          ? (typeof facility.bookingRules === 'string' ? JSON.parse(facility.bookingRules) : facility.bookingRules)
          : null;
      } catch {
        parsedSimplified = null;
      }

      // Detect admin-saved JSON: previously only a few keys triggered the "flat" path. Payloads from
      // normalizeBookingRulesPayload often omit those (e.g. only userLimits + courtsPerDayUser), which
      // incorrectly fell through to the legacy branch and replaced caps with defaults (1/day, 8/hh week).
      const hasFlatSavedRules =
        !!parsedSimplified &&
        typeof parsedSimplified === 'object' &&
        ('daysInAdvanceEnabled' in parsedSimplified ||
          'maxBookingsPerWeekUnlimited' in parsedSimplified ||
          'peakHoursSlots' in parsedSimplified ||
          'hasPeakHours' in parsedSimplified ||
          'peakHoursRestrictions' in parsedSimplified ||
          'courtsPerWeekUserEnabled' in parsedSimplified ||
          'courtsPerWeekUser' in parsedSimplified ||
          'courtsPerWeekHouseholdEnabled' in parsedSimplified ||
          'courtsPerWeekHousehold' in parsedSimplified ||
          'courtsPerDayUserEnabled' in parsedSimplified ||
          'courtsPerDayUser' in parsedSimplified ||
          'courtsPerDayHouseholdEnabled' in parsedSimplified ||
          'courtsPerDayHousehold' in parsedSimplified ||
          'userLimits' in parsedSimplified);
      const normalizeDurationMinutes = (rawMinutes: any, rawHours: any, fallback: number) => {
        const mins = Number(rawMinutes);
        if (Number.isFinite(mins) && mins > 0) {
          // Legacy flat payloads may store hour-like values (e.g. "2") in this field.
          return mins <= 12 ? Math.round(mins * 60) : Math.round(mins);
        }
        const hours = Number(rawHours);
        if (Number.isFinite(hours) && hours > 0) {
          return Math.round(hours * 60);
        }
        return fallback;
      };
      const hasPositiveRuleValue = (value: any) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
      };
      const normalizeDurationInputValue = (rawMinutes: any, rawHours: any) => {
        if (hasPositiveRuleValue(rawMinutes)) {
          const mins = Number(rawMinutes);
          return String(mins <= 12 ? Math.round(mins * 60) : Math.round(mins));
        }
        if (hasPositiveRuleValue(rawHours)) {
          return String(Math.round(Number(rawHours) * 60));
        }
        return '';
      };

      const bookingRules: BookingRules = hasFlatSavedRules
        ? {
            ...defaultBookingRules,
            ...parsedSimplified,
            restrictionsApplyToAdmins: false,
            peakHoursApplyToAdmins: false,
            weekendPolicyApplyToAdmins: false,
            generalRules: facility.generalRules || parsedSimplified?.generalRules || '',
            restrictionType: parsedSimplified?.restrictionType || facility.restrictionType || defaultBookingRules.restrictionType,
            peakHoursSlots: Array.isArray(parsedSimplified?.peakHoursSlots)
              ? parsedSimplified.peakHoursSlots.map((slot: any) => normalizePeakHoursSlot(slot))
              : normalizedPeakHoursSlots,
            peakHoursRestrictions: normalizePeakHoursRestrictions(parsedSimplified?.peakHoursRestrictions),
            weekendPolicy: {
              ...defaultBookingRules.weekendPolicy,
              ...(parsedSimplified?.weekendPolicy || {}),
            },
            allowedBookingTypes: Array.isArray(parsedSimplified?.allowedBookingTypes)
              ? parsedSimplified.allowedBookingTypes
              : defaultBookingRules.allowedBookingTypes,
            maxReservationDurationEnabled:
              typeof parsedSimplified?.maxReservationDurationEnabled === 'boolean'
                ? parsedSimplified.maxReservationDurationEnabled
                : typeof parsedSimplified?.maxReservationDuration === 'object' &&
                    parsedSimplified.maxReservationDuration !== null &&
                    typeof (parsedSimplified.maxReservationDuration as { enabled?: boolean }).enabled === 'boolean'
                  ? !!(parsedSimplified.maxReservationDuration as { enabled: boolean }).enabled
                  : typeof parsedSimplified?.maxBookingDurationUnlimited === 'boolean'
                    ? !parsedSimplified.maxBookingDurationUnlimited
                    : hasPositiveRuleValue(
                        parsedSimplified?.maxReservationDurationMinutes ??
                          parsedSimplified?.maxReservationDuration?.limit ??
                          parsedSimplified?.maxBookingDurationHours
                      ),
            maxReservationDurationMinutes: normalizeDurationInputValue(
              parsedSimplified?.maxReservationDurationMinutes ??
                parsedSimplified?.maxReservationDuration?.limit,
              parsedSimplified?.maxBookingDurationHours
            ),
            courtsPerWeekUserEnabled:
              parsedSimplified?.courtsPerWeekUserEnabled ??
              parsedSimplified?.userLimits?.perWeekIndividual?.enabled ??
              hasPositiveRuleValue(
                parsedSimplified?.courtsPerWeekUser ??
                  parsedSimplified?.userLimits?.perWeekIndividual?.limit ??
                  parsedSimplified?.maxBookingsPerWeek
              ),
            courtsPerWeekUser: String(
              parsedSimplified?.courtsPerWeekUser ??
                parsedSimplified?.userLimits?.perWeekIndividual?.limit ??
                defaultBookingRules.courtsPerWeekUser
            ),
            courtsPerWeekHouseholdEnabled:
              parsedSimplified?.courtsPerWeekHouseholdEnabled ??
              parsedSimplified?.userLimits?.perWeekHousehold?.enabled ??
              hasPositiveRuleValue(
                parsedSimplified?.courtsPerWeekHousehold ??
                  parsedSimplified?.userLimits?.perWeekHousehold?.limit
              ),
            courtsPerWeekHousehold: String(
              parsedSimplified?.courtsPerWeekHousehold ??
                parsedSimplified?.userLimits?.perWeekHousehold?.limit ??
                defaultBookingRules.courtsPerWeekHousehold
            ),
            courtsPerDayUserEnabled:
              parsedSimplified?.courtsPerDayUserEnabled ??
              parsedSimplified?.userLimits?.perDayIndividual?.enabled ??
              hasPositiveRuleValue(
                parsedSimplified?.courtsPerDayUser ??
                  parsedSimplified?.userLimits?.perDayIndividual?.limit
              ),
            courtsPerDayUser: String(
              parsedSimplified?.courtsPerDayUser ??
                parsedSimplified?.userLimits?.perDayIndividual?.limit ??
                defaultBookingRules.courtsPerDayUser
            ),
            courtsPerDayHouseholdEnabled:
              parsedSimplified?.courtsPerDayHouseholdEnabled ??
              parsedSimplified?.userLimits?.perDayHousehold?.enabled ??
              hasPositiveRuleValue(
                parsedSimplified?.courtsPerDayHousehold ??
                  parsedSimplified?.userLimits?.perDayHousehold?.limit
              ),
            courtsPerDayHousehold: String(
              parsedSimplified?.courtsPerDayHousehold ??
                parsedSimplified?.userLimits?.perDayHousehold?.limit ??
                defaultBookingRules.courtsPerDayHousehold
            ),
            maxBookingsPerWeek: String(
              parsedSimplified?.maxBookingsPerWeek ??
                parsedSimplified?.courtsPerWeekUser ??
                parsedSimplified?.userLimits?.perWeekIndividual?.limit ??
                defaultBookingRules.maxBookingsPerWeek
            ),
            maxBookingsPerWeekUnlimited:
              typeof parsedSimplified?.maxBookingsPerWeekUnlimited === 'boolean'
                ? parsedSimplified.maxBookingsPerWeekUnlimited
                : typeof parsedSimplified?.courtsPerWeekUserEnabled === 'boolean'
                  ? !parsedSimplified.courtsPerWeekUserEnabled
                  : typeof parsedSimplified?.userLimits?.perWeekIndividual?.enabled === 'boolean'
                    ? !parsedSimplified.userLimits.perWeekIndividual.enabled
                    : defaultBookingRules.maxBookingsPerWeekUnlimited,
            // Saved JSON uses nested `daysInAdvance: { enabled, limit }`; spreading parsedSimplified
            // otherwise leaves an object here and the number input renders empty.
            daysInAdvanceEnabled:
              typeof parsedSimplified?.daysInAdvanceEnabled === 'boolean'
                ? parsedSimplified.daysInAdvanceEnabled
                : typeof parsedSimplified?.daysInAdvance === 'object' &&
                    parsedSimplified.daysInAdvance !== null &&
                    typeof (parsedSimplified.daysInAdvance as { enabled?: boolean }).enabled === 'boolean'
                  ? !!(parsedSimplified.daysInAdvance as { enabled: boolean }).enabled
                  : typeof parsedSimplified?.advanceBookingDaysUnlimited === 'boolean'
                    ? !parsedSimplified.advanceBookingDaysUnlimited
                    : hasPositiveRuleValue(
                        typeof parsedSimplified?.daysInAdvance === 'object'
                          ? parsedSimplified?.daysInAdvance?.limit
                          : parsedSimplified?.daysInAdvance ?? parsedSimplified?.advanceBookingDays
                      ),
            daysInAdvance: (() => {
              const nested = parsedSimplified?.daysInAdvance;
              if (nested && typeof nested === 'object' && nested !== null && 'limit' in nested) {
                const lim = (nested as { limit?: unknown }).limit;
                if (lim !== undefined && lim !== null && String(lim).trim() !== '') {
                  return String(lim);
                }
              }
              if (
                parsedSimplified?.daysInAdvance !== undefined &&
                parsedSimplified?.daysInAdvance !== null &&
                typeof parsedSimplified.daysInAdvance !== 'object'
              ) {
                return String(parsedSimplified.daysInAdvance);
              }
              const adv = parsedSimplified?.advanceBookingDays;
              if (adv !== undefined && adv !== null && String(adv).trim() !== '') {
                return String(adv);
              }
              return defaultBookingRules.daysInAdvance;
            })(),
          }
        : {
            generalRules: facility.generalRules || '',
            restrictionType: parsedSimplified?.restrictionType || facility.restrictionType || 'account',
            daysInAdvanceEnabled: parsedSimplified?.daysInAdvance?.enabled ?? defaultBookingRules.daysInAdvanceEnabled,
            daysInAdvance: String(parsedSimplified?.daysInAdvance?.limit ?? defaultBookingRules.daysInAdvance),
            maxReservationDurationEnabled: parsedSimplified?.maxReservationDuration?.enabled ?? defaultBookingRules.maxReservationDurationEnabled,
            maxReservationDurationMinutes: String(
              normalizeDurationMinutes(
                parsedSimplified?.maxReservationDuration?.limit,
                facility.maxBookingDurationHours,
                Number(defaultBookingRules.maxReservationDurationMinutes) || 120
              )
            ),
            courtsPerWeekUserEnabled:
              parsedSimplified?.courtsPerWeekUserEnabled ??
              parsedSimplified?.userLimits?.perWeekIndividual?.enabled ??
              defaultBookingRules.courtsPerWeekUserEnabled,
            courtsPerWeekUser: String(
              parsedSimplified?.courtsPerWeekUser ??
                parsedSimplified?.userLimits?.perWeekIndividual?.limit ??
                defaultBookingRules.courtsPerWeekUser
            ),
            courtsPerWeekHouseholdEnabled:
              parsedSimplified?.courtsPerWeekHouseholdEnabled ??
              parsedSimplified?.userLimits?.perWeekHousehold?.enabled ??
              defaultBookingRules.courtsPerWeekHouseholdEnabled,
            courtsPerWeekHousehold: String(
              parsedSimplified?.courtsPerWeekHousehold ??
                parsedSimplified?.userLimits?.perWeekHousehold?.limit ??
                defaultBookingRules.courtsPerWeekHousehold
            ),
            courtsPerDayUserEnabled:
              parsedSimplified?.courtsPerDayUserEnabled ??
              parsedSimplified?.userLimits?.perDayIndividual?.enabled ??
              defaultBookingRules.courtsPerDayUserEnabled,
            courtsPerDayUser: String(
              parsedSimplified?.courtsPerDayUser ??
                parsedSimplified?.userLimits?.perDayIndividual?.limit ??
                defaultBookingRules.courtsPerDayUser
            ),
            courtsPerDayHouseholdEnabled:
              parsedSimplified?.courtsPerDayHouseholdEnabled ??
              parsedSimplified?.userLimits?.perDayHousehold?.enabled ??
              defaultBookingRules.courtsPerDayHouseholdEnabled,
            courtsPerDayHousehold: String(
              parsedSimplified?.courtsPerDayHousehold ??
                parsedSimplified?.userLimits?.perDayHousehold?.limit ??
                defaultBookingRules.courtsPerDayHousehold
            ),
            maxBookingsPerWeek: String(
              parsedSimplified?.maxBookingsPerWeek ??
                parsedSimplified?.courtsPerWeekUser ??
                parsedSimplified?.userLimits?.perWeekIndividual?.limit ??
                (facility.maxBookingsPerWeek === -1 ? '3' : String(facility.maxBookingsPerWeek || '3'))
            ),
            maxBookingsPerWeekUnlimited:
              typeof parsedSimplified?.maxBookingsPerWeekUnlimited === 'boolean'
                ? parsedSimplified.maxBookingsPerWeekUnlimited
                : typeof parsedSimplified?.courtsPerWeekUserEnabled === 'boolean'
                  ? !parsedSimplified.courtsPerWeekUserEnabled
                  : typeof parsedSimplified?.userLimits?.perWeekIndividual?.enabled === 'boolean'
                    ? !parsedSimplified.userLimits.perWeekIndividual.enabled
                    : facility.maxBookingsPerWeek === -1,
            maxBookingDurationHours: facility.maxBookingDurationHours === -1 ? '2' : String(facility.maxBookingDurationHours || '2'),
            maxBookingDurationUnlimited: facility.maxBookingDurationHours === -1,
            advanceBookingDays: facility.advanceBookingDays === -1 ? '14' : String(facility.advanceBookingDays || '14'),
            advanceBookingDaysUnlimited: facility.advanceBookingDays === -1,
            restrictionsApplyToAdmins: false,
            adminMaxBookingsPerWeek: String(facility.adminRestrictions?.maxBookingsPerWeek || '10'),
            adminMaxBookingsUnlimited: facility.adminRestrictions?.maxBookingsPerWeek === -1,
            adminMaxBookingDurationHours: String(facility.adminRestrictions?.maxBookingDurationHours || '4'),
            adminMaxDurationUnlimited: facility.adminRestrictions?.maxBookingDurationHours === -1,
            adminAdvanceBookingDays: String(facility.adminRestrictions?.advanceBookingDays || '30'),
            adminAdvanceBookingUnlimited: facility.adminRestrictions?.advanceBookingDays === -1,
            hasPeakHours: !!facility.peakHoursPolicy?.enabled,
            peakHoursApplyToAdmins: false,
            peakHoursSlots: normalizedPeakHoursSlots,
            peakHoursRestrictions: normalizePeakHoursRestrictions({
              maxBookingsPerWeek: facility.peakHoursPolicy?.maxBookingsPerWeek,
              maxDurationHours: facility.peakHoursPolicy?.maxDurationHours,
            }),
            hasWeekendPolicy: !!facility.weekendPolicy?.enabled,
            weekendPolicyApplyToAdmins: false,
            weekendPolicy: {
              maxBookingsPerWeekend: String(facility.weekendPolicy?.maxBookingsPerWeekend || '2'),
              maxBookingsUnlimited: facility.weekendPolicy?.maxBookingsPerWeekend === -1,
              maxDurationHours: String(facility.weekendPolicy?.maxDurationHours || '2'),
              maxDurationUnlimited: facility.weekendPolicy?.maxDurationHours === -1,
              advanceBookingDays: String(facility.weekendPolicy?.advanceBookingDays || '7'),
              advanceBookingUnlimited: facility.weekendPolicy?.advanceBookingDays === -1,
            },
            // Rules engine fields - defaults until loadFacilityRules overlays actual values
            maxActiveReservationsEnabled: defaultBookingRules.maxActiveReservationsEnabled,
            maxActiveReservations: defaultBookingRules.maxActiveReservations,
            maxHoursPerWeekEnabled: defaultBookingRules.maxHoursPerWeekEnabled,
            maxHoursPerWeek: defaultBookingRules.maxHoursPerWeek,
            noOverlappingReservations: defaultBookingRules.noOverlappingReservations,
            minimumLeadTimeEnabled: defaultBookingRules.minimumLeadTimeEnabled,
            minimumLeadTimeMinutes: defaultBookingRules.minimumLeadTimeMinutes,
            strikeSystemEnabled: defaultBookingRules.strikeSystemEnabled,
            strikeThreshold: defaultBookingRules.strikeThreshold,
            strikeWindowDays: defaultBookingRules.strikeWindowDays,
            strikeLockoutDays: defaultBookingRules.strikeLockoutDays,
            courtWeeklyCapEnabled: defaultBookingRules.courtWeeklyCapEnabled,
            courtWeeklyCap: defaultBookingRules.courtWeeklyCap,
            courtReleaseTimeEnabled: defaultBookingRules.courtReleaseTimeEnabled,
            courtReleaseTime: defaultBookingRules.courtReleaseTime,
            courtReleaseDaysAhead: defaultBookingRules.courtReleaseDaysAhead,
            householdMaxMembersEnabled: defaultBookingRules.householdMaxMembersEnabled,
            householdMaxMembers: defaultBookingRules.householdMaxMembers,
            householdMaxActiveEnabled: defaultBookingRules.householdMaxActiveEnabled,
            householdMaxActive: defaultBookingRules.householdMaxActive,
            householdPrimeCapEnabled: defaultBookingRules.householdPrimeCapEnabled,
            householdPrimeCap: defaultBookingRules.householdPrimeCap,
          };

      const data: FacilityData = {
        name: facility.name || '',
        type: normalizeFacilityType(facility.type || facility.facilityType) || 'Tennis Facility',
        primaryLocationLabel: facility.primaryLocationLabel || '',
        streetAddress,
        city,
        state,
        zipCode,
        phone: facility.phone || '',
        email: facility.email || '',
        description: facility.description || '',
        operatingHours: parsedOperatingHours,
        timezone: facility.timezone || 'America/New_York',
        logoUrl: facility.logoUrl || '',
        facilityImage: null,
        facilityImagePreview: facility.logoUrl || '',
        primaryContact: facility.primaryContact || {
          name: facility.contactName || '',
          email: facility.email || '',
          phone: facility.phone || '',
        },
        secondaryContacts: (facility.secondaryContacts || []).map((c: { name: string; email: string; phone: string }, i: number) => ({
          id: `contact-${i}`,
          ...c,
        })),
        bookingRules,
      };
      setFacilityData(data);
      setOriginalData(data);
      setExpandedPeakHourSlots({});
    } else {
      toast.error(response.error || 'Failed to load facility data');
    }
  } catch (error: any) {
    console.error('Error loading facility:', error);
    toast.error('Failed to load facility data');
  } finally {
    setLoading(false);
  }
};

const performSave = async (options?: { closeEditor?: boolean; toastMessage?: string }) => {
  if (!currentFacilityId) return;

  const closeEditor = options?.closeEditor ?? true;
  const toastMessage = options?.toastMessage;

  try {
    setSaving(true);
    const { facilityImage: _facilityImage, ...serializableFacility } = facilityData;
    const payload = {
      ...serializableFacility,
      bookingRules: {
        ...facilityData.bookingRules,
        // Keep legacy and current weekly-limit fields aligned so all
        // backend enforcement paths use the same updated value.
        maxBookingsPerWeek: facilityData.bookingRules.courtsPerWeekUser,
        maxBookingsPerWeekUnlimited: !facilityData.bookingRules.courtsPerWeekUserEnabled,
        advanceBookingDays: facilityData.bookingRules.daysInAdvance,
        advanceBookingDaysUnlimited: !facilityData.bookingRules.daysInAdvanceEnabled,
        restrictionsApplyToAdmins: false,
        peakHoursApplyToAdmins: false,
        weekendPolicyApplyToAdmins: false,
      },
    };
    const response = await adminApi.updateFacility(currentFacilityId, payload);

    if (response.success) {
      const rulesOk = await syncBookingRulesToEngine(payload.bookingRules);
      if (rulesOk) {
        toast.success(toastMessage ?? 'Facility updated successfully');
      } else {
        toast.error('Facility saved, but booking rules failed to sync to the rules engine. Try again or contact support.');
      }
      if (closeEditor) {
        setIsEditing(false);
      }
      setOriginalData(payload);
      setFacilityData((prev) => ({
        ...payload,
        facilityImage: closeEditor ? null : prev.facilityImage,
      }));
    } else {
      toast.error(response.error || 'Failed to update facility');
    }
  } catch (error: any) {
    console.error('Error saving facility:', error);
    toast.error('Failed to update facility');
  } finally {
    setSaving(false);
  }
};

const handleSave = () => {
  void performSave({ closeEditor: true });
};

const handleCancel = () => {
  if (originalData) {
    setFacilityData(originalData);
  }
  setIsEditing(false);
};

const formatTo12Hour = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${m.toString().padStart(2, '0')} ${period}` : `${h12} ${period}`;
};

const getHoursDisplay = (day: string) => {
  if (!facilityData.operatingHours || !facilityData.operatingHours[day]) {
    return 'Not set';
  }
  const hours = facilityData.operatingHours[day];
  if (typeof hours === 'string') return hours;
  if (hours.closed) return 'Closed';
  return `${formatTo12Hour(hours.open)} - ${formatTo12Hour(hours.close)}`;
};

// Handle operating hours changes
const handleOperatingHoursChange = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
  setFacilityData(prev => ({
    ...prev,
    operatingHours: {
      ...prev.operatingHours,
      [day]: {
        ...prev.operatingHours[day],
        [field]: value
      }
    }
  }));
};

// Primary contact handlers
const handlePrimaryContactChange = (field: string, value: string) => {
  setFacilityData(prev => ({
    ...prev,
    primaryContact: {
      ...prev.primaryContact,
      [field]: value
    }
  }));
};

// Secondary contacts handlers
const addSecondaryContact = () => {
  const newContact: FacilityContact = {
    id: `contact-${Date.now()}`,
    name: '',
    email: '',
    phone: '',
  };
  setFacilityData(prev => ({
    ...prev,
    secondaryContacts: [...prev.secondaryContacts, newContact]
  }));
};

const updateSecondaryContact = (contactId: string, field: string, value: string) => {
  setFacilityData(prev => ({
    ...prev,
    secondaryContacts: prev.secondaryContacts.map(contact =>
      contact.id === contactId ? { ...contact, [field]: value } : contact
    )
  }));
};

const removeSecondaryContact = (contactId: string) => {
  setFacilityData(prev => ({
    ...prev,
    secondaryContacts: prev.secondaryContacts.filter(contact => contact.id !== contactId)
  }));
};

// Booking rules handlers
const handleBookingRulesChange = (field: string, value: string | boolean) => {
  setFacilityData(prev => ({
    ...prev,
    bookingRules: {
      ...prev.bookingRules,
      [field]: value
    }
  }));
};

const handleWeekendPolicyChange = (field: string, value: string | boolean) => {
  setFacilityData(prev => ({
    ...prev,
    bookingRules: {
      ...prev.bookingRules,
      weekendPolicy: {
        ...prev.bookingRules.weekendPolicy,
        [field]: value
      }
    }
  }));
};

// Peak hours slot handlers
const defaultPeakHoursSlotRules: PeakHourSlot['rules'] = {
  maxBookingsPerDay: '1',
  maxBookingsPerDayUnlimited: false,
  maxBookingsPerDayHousehold: '1',
  maxBookingsPerDayHouseholdUnlimited: false,
  maxBookingsPerWeek: '2',
  maxBookingsPerWeekUnlimited: false,
  maxBookingsPerWeekHousehold: '2',
  maxBookingsPerWeekHouseholdUnlimited: false,
  maxDurationHours: '1.5',
  maxDurationUnlimited: false,
};

const normalizePeakHoursSlot = (slot: any): PeakHourSlot => {
  const slotRules = slot?.rules ?? slot ?? {};
  const maxBookingsPerDayRaw = slotRules.maxBookingsPerDay ?? slotRules.max_bookings_per_day;
  const maxBookingsPerDayHouseholdRaw = slotRules.maxBookingsPerDayHousehold ?? slotRules.max_bookings_per_day_household;
  const maxBookingsPerWeekRaw = slotRules.maxBookingsPerWeek ?? slotRules.max_bookings_per_week;
  const maxBookingsPerWeekHouseholdRaw = slotRules.maxBookingsPerWeekHousehold ?? slotRules.max_bookings_per_week_household;
  const maxDurationHoursRaw = slotRules.maxDurationHours ?? slotRules.max_duration_hours;
  return {
  id: slot.id || `slot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  startTime: slot.startTime || slot.start_time || '17:00',
  endTime: slot.endTime || slot.end_time || '20:00',
  days: Array.isArray(slot.days)
    ? slot.days.filter((d: unknown) => typeof d === 'number')
    : [],
  appliesToAllCourts: slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false,
  selectedCourtIds: Array.isArray(slot.selectedCourtIds)
    ? slot.selectedCourtIds
    : (Array.isArray(slot.selected_court_ids) ? slot.selected_court_ids : []),
  rules: {
    maxBookingsPerDay: toRuleInputValue(maxBookingsPerDayRaw, defaultPeakHoursSlotRules.maxBookingsPerDay),
    maxBookingsPerDayUnlimited: slotRules.maxBookingsPerDayUnlimited === true || isUnlimitedRuleValue(maxBookingsPerDayRaw),
    maxBookingsPerDayHousehold: toRuleInputValue(maxBookingsPerDayHouseholdRaw, defaultPeakHoursSlotRules.maxBookingsPerDayHousehold),
    maxBookingsPerDayHouseholdUnlimited:
      slotRules.maxBookingsPerDayHouseholdUnlimited === true || isUnlimitedRuleValue(maxBookingsPerDayHouseholdRaw),
    maxBookingsPerWeek: toRuleInputValue(maxBookingsPerWeekRaw, defaultPeakHoursSlotRules.maxBookingsPerWeek),
    maxBookingsPerWeekUnlimited: slotRules.maxBookingsPerWeekUnlimited === true || isUnlimitedRuleValue(maxBookingsPerWeekRaw),
    maxBookingsPerWeekHousehold: toRuleInputValue(maxBookingsPerWeekHouseholdRaw, defaultPeakHoursSlotRules.maxBookingsPerWeekHousehold),
    maxBookingsPerWeekHouseholdUnlimited:
      slotRules.maxBookingsPerWeekHouseholdUnlimited === true || isUnlimitedRuleValue(maxBookingsPerWeekHouseholdRaw),
    maxDurationHours: toRuleInputValue(maxDurationHoursRaw, defaultPeakHoursSlotRules.maxDurationHours),
    maxDurationUnlimited: slotRules.maxDurationUnlimited === true || isUnlimitedRuleValue(maxDurationHoursRaw),
  }
  };
};

const updatePeakHoursSlot = (slotId: string, updater: (slot: PeakHourSlot) => PeakHourSlot) => {
  setFacilityData(prev => {
    const newSlots = prev.bookingRules.peakHoursSlots.map(slot => slot.id === slotId ? updater(slot) : slot);
    return {
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        peakHoursSlots: newSlots
      }
    };
  });
};

const addPeakHourSlot = () => {
  setFacilityData(prev => {
    const newSlot: PeakHourSlot = {
      id: `slot-${Date.now()}`,
      startTime: '17:00',
      endTime: '20:00',
      days: [1, 2, 3, 4, 5],
      appliesToAllCourts: true,
      selectedCourtIds: [],
      rules: { ...defaultPeakHoursSlotRules },
    };
    setExpandedPeakHourSlots((expanded) => ({ ...expanded, [newSlot.id]: true }));
    return {
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        peakHoursSlots: [...prev.bookingRules.peakHoursSlots, newSlot]
      }
    };
  });
};

const removePeakHourSlot = (slotId: string) => {
  setFacilityData(prev => {
    return {
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        peakHoursSlots: prev.bookingRules.peakHoursSlots.filter(slot => slot.id !== slotId)
      }
    };
  });
  setExpandedPeakHourSlots((prev) => {
    const updated = { ...prev };
    delete updated[slotId];
    return updated;
  });
};

const updatePeakHourSlotTime = (slotId: string, field: 'startTime' | 'endTime', value: string) => {
  updatePeakHoursSlot(slotId, (slot) => ({ ...slot, [field]: value }));
};

const updatePeakHourSlotRule = (
  slotId: string,
  field: keyof PeakHourSlot['rules'],
  value: string | boolean
) => {
  updatePeakHoursSlot(slotId, (slot) => ({
    ...slot,
    rules: {
      ...slot.rules,
      [field]: value
    }
  }));
};

const togglePeakHourSlotExpanded = (slotId: string) => {
  setExpandedPeakHourSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
};

const setPeakHourSlotCourtMode = (slotId: string, allCourts: boolean) => {
  updatePeakHoursSlot(slotId, (slot) => ({
    ...slot,
    appliesToAllCourts: allCourts,
    selectedCourtIds: allCourts ? [] : slot.selectedCourtIds
  }));
};

const togglePeakHourSlotCourt = (slotId: string, courtId: string) => {
  updatePeakHoursSlot(slotId, (slot) => {
    const selected = slot.selectedCourtIds.includes(courtId)
      ? slot.selectedCourtIds.filter((id) => id !== courtId)
      : [...slot.selectedCourtIds, courtId];
    return {
      ...slot,
      selectedCourtIds: selected
    };
  });
};

const togglePeakHourSlotDay = (slotId: string, day: number) => {
  updatePeakHoursSlot(slotId, (slot) => {
    const days = slot.days.includes(day)
      ? slot.days.filter((d) => d !== day)
      : [...slot.days, day].sort((a, b) => a - b);
    return {
      ...slot,
      days
    };
  });
};

// Secondary location CRUD
const loadSecondaryLocations = async () => {
  if (!currentFacilityId) return;
  try {
    const response = await facilityLocationsApi.getAll(currentFacilityId);
    if (response.success && response.data?.locations) {
      setSecondaryLocations(response.data.locations.map((location: any) => ({
        id: location.id || location.locationId || location.location_id,
        locationName: location.locationName || location.location_name || '',
        streetAddress: location.streetAddress || location.street_address || '',
        city: location.city || '',
        state: location.state || '',
        zipCode: location.zipCode || location.zip_code || '',
        phone: location.phone || '',
      })));
    }
  } catch (error) {
    console.error('Error loading secondary locations:', error);
  }
};

const handleAddSecondaryLocation = async () => {
  if (!currentFacilityId) return;
  if (!newSecondaryLocation.locationName || !newSecondaryLocation.streetAddress ||
      !newSecondaryLocation.city || !newSecondaryLocation.state || !newSecondaryLocation.zipCode) {
    toast.error('Location name and full address are required');
    return;
  }
  setSavingSecondaryLocation(true);
  try {
    const response = await facilityLocationsApi.add(currentFacilityId, newSecondaryLocation);
    if (response.success) {
      toast.success('Secondary location added');
      setNewSecondaryLocation({ locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: '' });
      setAddingSecondaryLocation(false);
      loadSecondaryLocations();
    } else {
      toast.error(response.error || 'Failed to add location');
    }
  } catch (error) {
    toast.error('Failed to add location');
  } finally {
    setSavingSecondaryLocation(false);
  }
};

const handleRemoveSecondaryLocation = async (locationId: string) => {
  if (!currentFacilityId) return;
  if (!confirm('Remove this secondary location?')) return;
  try {
    const response = await facilityLocationsApi.remove(currentFacilityId, locationId);
    if (response.success) {
      toast.success('Location removed');
      loadSecondaryLocations();
    } else {
      toast.error(response.error || 'Failed to remove location');
    }
  } catch (error) {
    toast.error('Failed to remove location');
  }
};

const startEditingSecondaryLocation = (location: SecondaryLocation) => {
  setAddingSecondaryLocation(false);
  setEditingSecondaryLocationId(location.id);
  setEditingSecondaryLocation({
    locationName: location.locationName || '',
    streetAddress: location.streetAddress || '',
    city: location.city || '',
    state: location.state || '',
    zipCode: location.zipCode || '',
    phone: location.phone || '',
  });
};

const cancelEditingSecondaryLocation = () => {
  setEditingSecondaryLocationId(null);
  setEditingSecondaryLocation({
    locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: ''
  });
};

const handleUpdateSecondaryLocation = async () => {
  if (!currentFacilityId || !editingSecondaryLocationId) return;
  if (!editingSecondaryLocation.locationName || !editingSecondaryLocation.streetAddress ||
    !editingSecondaryLocation.city || !editingSecondaryLocation.state || !editingSecondaryLocation.zipCode) {
    toast.error('Location name and full address are required');
    return;
  }
  setSavingSecondaryLocation(true);
  try {
    const response = await facilityLocationsApi.update(currentFacilityId, editingSecondaryLocationId, editingSecondaryLocation);
    if (response.success) {
      toast.success('Location updated');
      cancelEditingSecondaryLocation();
      loadSecondaryLocations();
    } else {
      toast.error(response.error || 'Failed to update location');
    }
  } catch (error) {
    toast.error('Failed to update location');
  } finally {
    setSavingSecondaryLocation(false);
  }
};


const loadCourtOperatingHours = async (courtList: Court[]) => {
  if (!courtList.length) {
    setCourtOperatingHours({});
    return;
  }
  setCourtHoursLoading(true);
  try {
    const results = await Promise.all(
      courtList.map(async (court) => {
        try {
          const response = await courtConfigApi.getSchedule(court.id);
          const schedule = extractCourtScheduleFromApiResponse(response.data);
          if (response.success && schedule.length > 0) {
            return {
              courtId: court.id,
              hours: courtScheduleRowsToOperatingHoursMap(schedule),
            };
          }
        } catch {
          /* omit on failure */
        }
        return { courtId: court.id, hours: {} as OperatingHoursMap };
      })
    );
    const byCourtId: Record<string, OperatingHoursMap> = {};
    results.forEach(({ courtId, hours }) => {
      byCourtId[courtId] = hours;
    });
    setCourtOperatingHours(byCourtId);
  } finally {
    setCourtHoursLoading(false);
  }
};

const refreshCourtHoursSummary = async (courtId: string) => {
  try {
    const response = await courtConfigApi.getSchedule(courtId);
    const schedule = extractCourtScheduleFromApiResponse(response.data);
    if (response.success && schedule.length > 0) {
      setCourtOperatingHours((prev) => ({
        ...prev,
        [courtId]: courtScheduleRowsToOperatingHoursMap(schedule),
      }));
    }
  } catch {
    /* keep existing summary */
  }
};

// Court management functions
const loadCourts = async () => {
  if (!currentFacilityId) return;

  try {
    setCourtsLoading(true);
    setCourtOperatingHours({});
    const response = await facilitiesApi.getCourts(currentFacilityId);

    if (response.success && response.data?.courts) {
      const normalized = response.data.courts.map((c: any) => ({
          ...c,
          status: c.status === 'active' ? 'available' : c.status === 'inactive' ? 'closed' : c.status,
          requirePayment: c.requirePayment === true || c.require_payment === true,
          bookingAmountCents:
            c.bookingAmountCents != null
              ? Number(c.bookingAmountCents)
              : c.booking_amount_cents != null
                ? Number(c.booking_amount_cents)
                : null,
          bookingFeeDollars: formatCentsToDollars(
            c.bookingAmountCents ?? c.booking_amount_cents
          ),
          guestFeeCents:
            c.guestFeeCents != null
              ? Number(c.guestFeeCents)
              : c.guest_fee_cents != null
                ? Number(c.guest_fee_cents)
                : null,
          guestFeeDollars: formatCentsToDollars(
            c.guestFeeCents ?? c.guest_fee_cents
          ),
          enableGuestFee: Boolean(c.guestFeeCents ?? c.guest_fee_cents),
        }));
      setCourts(normalized);
      void loadCourtOperatingHours(normalized);
    } else {
      toast.error(response.error || 'Failed to load courts');
    }
  } catch (error: any) {
    console.error('Error loading courts:', error);
    toast.error('Failed to load courts');
  } finally {
    setCourtsLoading(false);
  }
};

const handleAddNewCourt = () => {
  const maxNumber = courts.length > 0 ? Math.max(...courts.map((c) => c.courtNumber)) : 0;
  const nextNumber = maxNumber + 1;
  setEditingCourt({
    id: '',
    name: formatStandardCourtName(nextNumber),
    courtNumber: nextNumber,
    courtType: 'Tennis',
    surfaceType: 'Hard Court',
    isIndoor: false,
    hasLights: false,
    isWalkUp: false,
    requirePayment: false,
    bookingFeeDollars: '',
    enableGuestFee: false,
    guestFeeCents: null,
    guestFeeDollars: '',
    status: 'available',
    canSplit: false,
  });
  void loadStripeStatus();
  setIsAddingNewCourt(true);
};

const handleEditCourt = (court: Court) => {
  setEditingCourt({
    ...court,
    requirePayment: court.requirePayment === true,
    bookingFeeDollars:
      court.bookingFeeDollars || formatCentsToDollars(court.bookingAmountCents),
    enableGuestFee: Boolean(court.guestFeeCents),
    guestFeeDollars:
      court.guestFeeDollars || formatCentsToDollars(court.guestFeeCents),
  });
  void loadStripeStatus();
  setIsAddingNewCourt(false);
};

const handleSaveCourt = async () => {
  if (!editingCourt || !currentFacilityId) return;

  const courtTypeError = validateStoredCourtType(editingCourt.courtType);
  if (courtTypeError) {
    toast.error(courtTypeError);
    return;
  }
  if (isCourtNumberEmpty(editingCourt.courtNumber)) {
    toast.error('Court number is required');
    return;
  }

  const wantsPayment = Boolean(editingCourt.requirePayment);
  const existingCourt =
    !isAddingNewCourt && editingCourt.id
      ? courts.find((c) => c.id === editingCourt.id)
      : undefined;
  const wasPaid = existingCourt?.requirePayment === true;
  const turningOnPaidBooking = wantsPayment && !wasPaid;
  const bookingAmountCents =
    parseBookingFeeDollars(editingCourt.bookingFeeDollars) ??
    (wantsPayment ? existingCourt?.bookingAmountCents ?? null : null);
  if (wantsPayment && !bookingAmountCents) {
    toast.error('Enter a booking fee when paid court booking is enabled');
    return;
  }
  const guestFeeCents = parseBookingFeeDollars(editingCourt.guestFeeDollars);
  const hasGuestFee = Boolean(editingCourt.enableGuestFee);
  if (hasGuestFee && !guestFeeCents) {
    toast.error('Enter a valid guest fee amount');
    return;
  }
  if (turningOnPaidBooking && stripeOnboarded === false) {
    toast.error('Complete Stripe Connect setup on the Member Payments page before enabling paid courts');
    return;
  }
  if (wantsPayment && !turningOnPaidBooking && stripeOnboarded === false) {
    toast.info(
      'Court details saved. Stripe Connect must be set up before members can be charged for bookings.'
    );
  }
  if (hasGuestFee && stripeOnboarded === false) {
    toast.info('Guest fee saved, but Stripe Connect must be set up before members can be charged');
  }

  try {
    setCourtSaving(true);

    const { name: courtName, courtNumber } = normalizeCourtNameAndNumber({
      name: editingCourt.name,
      courtNumber: editingCourt.courtNumber,
    });

    const paymentPayload = {
      requirePayment: wantsPayment,
      bookingAmountCents: wantsPayment ? bookingAmountCents ?? null : null,
      bookingFeeDollars: wantsPayment ? editingCourt.bookingFeeDollars : '',
      guestFeeCents: hasGuestFee ? guestFeeCents : null,
      guestFeeDollars: hasGuestFee ? editingCourt.guestFeeDollars : '',
    };

    let response;
    if (isAddingNewCourt || !editingCourt.id) {
      response = await adminApi.createCourt(currentFacilityId, {
        name: courtName,
        courtNumber,
        surfaceType: editingCourt.surfaceType,
        courtType: editingCourt.courtType,
        isIndoor: editingCourt.isIndoor,
        hasLights: editingCourt.hasLights,
        isWalkUp: editingCourt.isWalkUp,
        canSplit: editingCourt.canSplit,
        splitConfig: editingCourt.splitConfig,
        returnUrl: getCourtAddReturnUrl(),
        ...paymentPayload,
      });
    } else {
      // Update existing court
      response = await adminApi.updateCourt(editingCourt.id, {
        name: courtName,
        courtNumber,
        surfaceType: editingCourt.surfaceType,
        courtType: editingCourt.courtType,
        isIndoor: editingCourt.isIndoor,
        hasLights: editingCourt.hasLights,
        isWalkUp: editingCourt.isWalkUp,
        status: editingCourt.status,
        canSplit: editingCourt.canSplit,
        splitConfig: editingCourt.splitConfig,
        ...paymentPayload,
      });
    }

    if (response.success) {
      if (isAddingNewCourt || !editingCourt.id) {
        const paymentResult = await handleCourtAddPaymentResponse(response, {
          onDevConfirm: async (sessionId) => {
            const confirmRes = await adminApi.createCourt(currentFacilityId, {
              name: courtName,
              courtNumber,
              surfaceType: editingCourt.surfaceType,
              courtType: editingCourt.courtType,
              isIndoor: editingCourt.isIndoor,
              hasLights: editingCourt.hasLights,
              isWalkUp: editingCourt.isWalkUp,
              canSplit: editingCourt.canSplit,
              splitConfig: editingCourt.splitConfig,
              paymentSessionId: sessionId,
              ...paymentPayload,
            });
            if (!confirmRes.success) {
              throw new Error(confirmRes.error || 'Failed to confirm court payment');
            }
          },
        });
        if (paymentResult === 'redirected') return;
        if (paymentResult === 'failed') return;
      }
      toast.success(isAddingNewCourt ? 'Court created successfully' : 'Court updated successfully');
      setEditingCourt(null);
      setIsAddingNewCourt(false);
      await loadCourts();
    } else {
      toast.error(response.error || 'Failed to save court');
    }
  } catch (error: any) {
    console.error('Error saving court:', error);
    toast.error('Failed to save court');
  } finally {
    setCourtSaving(false);
  }
};

const handleCancelCourtEdit = () => {
  setEditingCourt(null);
  setIsAddingNewCourt(false);
};

const handleDeleteCourt = async (id: string) => {
  if (
    !confirm(
      'Delete this court permanently? This removes the court from your facility and deletes related bookings and schedule settings.'
    )
  ) {
    return;
  }

  try {
    const response = await adminApi.deleteCourt(id);
    if (response.success) {
      toast.success('Court deleted');
      await loadCourts();
    } else {
      toast.error(response.error || 'Failed to delete court');
    }
  } catch (error: any) {
    console.error('Error deleting court:', error);
    toast.error('Failed to delete court');
  }
};

// Court schedule config functions
const loadCourtSchedule = async (courtId: string) => {
  try {
    setCourtScheduleLoading(true);
    const response = await courtConfigApi.getSchedule(courtId);
    if (response.success && response.data?.schedule) {
      setCourtSchedule(response.data.schedule);
    }
  } catch (error) {
    console.error('Error loading court schedule:', error);
    toast.error('Failed to load court schedule');
  } finally {
    setCourtScheduleLoading(false);
  }
};

const handleToggleCourtConfig = async (courtId: string) => {
  if (configuringCourtId === courtId) {
    setConfiguringCourtId(null);
    setCourtSchedule([]);
    return;
  }
  setConfiguringCourtId(courtId);
  await loadCourtSchedule(courtId);
};

const updateCourtScheduleDay = (dayOfWeek: number, field: string, value: any) => {
  setCourtSchedule(prev => prev.map(day =>
    day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
  ));
};

const updateAllScheduleDays = (field: string, value: any) => {
  setCourtSchedule(prev => prev.map(day => ({ ...day, [field]: value })));
};

const saveCourtSchedule = async () => {
  if (!configuringCourtId) return;
  try {
    setCourtScheduleSaving(true);
    const response = await courtConfigApi.updateSchedule(configuringCourtId, courtSchedule);
    if (response.success) {
      toast.success('Court schedule saved');
      await refreshCourtHoursSummary(configuringCourtId);
    } else {
      toast.error(response.error || 'Failed to save schedule');
    }
  } catch (error) {
    console.error('Error saving court schedule:', error);
    toast.error('Failed to save court schedule');
  } finally {
    setCourtScheduleSaving(false);
  }
};

// Blackout functions
const loadBlackouts = async () => {
  if (!currentFacilityId) return;
  try {
    setBlackoutsLoading(true);
    const response = await courtConfigApi.getFacilityBlackouts(currentFacilityId);
    if (response.success && response.data?.blackouts) {
      setBlackouts(response.data.blackouts);
    }
  } catch (error) {
    console.error('Error loading blackouts:', error);
  } finally {
    setBlackoutsLoading(false);
  }
};

const handleAddBlackout = () => {
  setEditingBlackout({
    courtId: null,
    blackoutType: 'maintenance',
    title: '',
    description: '',
    startDatetime: '',
    endDatetime: '',
  });
  setIsAddingBlackout(true);
};

const handleSaveBlackout = async () => {
  if (!editingBlackout || !currentFacilityId) return;
  const blackoutPayload = {
    ...editingBlackout,
    startDatetime: normalizeLocalDatetimeForStorage(editingBlackout.startDatetime),
    endDatetime: normalizeLocalDatetimeForStorage(editingBlackout.endDatetime),
  };
  try {
    setBlackoutSaving(true);
    if (editingBlackout.id) {
      const response = await courtConfigApi.updateBlackout(editingBlackout.id, blackoutPayload);
      if (!response.success) {
        toast.error(response.error || 'Failed to update blackout');
        return;
      }
      toast.success('Blackout updated');
    } else {
      const response = await courtConfigApi.createBlackout({
        ...blackoutPayload,
        facilityId: currentFacilityId,
      });
      if (!response.success) {
        toast.error(response.error || 'Failed to create blackout');
        return;
      }
      toast.success('Blackout created');
    }
    setEditingBlackout(null);
    setIsAddingBlackout(false);
    await loadBlackouts();
  } catch (error) {
    console.error('Error saving blackout:', error);
    toast.error('Failed to save blackout');
  } finally {
    setBlackoutSaving(false);
  }
};

const handleDeleteBlackout = async (blackoutId: string) => {
  if (!confirm('Are you sure you want to delete this blackout?')) return;
  try {
    const response = await courtConfigApi.deleteBlackout(blackoutId);
    if (response.success) {
      toast.success('Blackout deleted');
      await loadBlackouts();
    } else {
      toast.error(response.error || 'Failed to delete blackout');
    }
  } catch (error) {
    console.error('Error deleting blackout:', error);
    toast.error('Failed to delete blackout');
  }
};

// Rules engine sync
const syncBookingRulesToEngine = async (rulesSnapshot?: FacilityData['bookingRules']) => {
  if (!currentFacilityId) return false;
  const rules = rulesSnapshot ?? facilityData.bookingRules;
  const ruleConfigs: Array<{
    ruleCode: string;
    isEnabled: boolean;
    ruleConfig?: Record<string, any>;
  }> = [];
  try {
    // Sync all metadata-mapped rule cards so admin edits are enforced by the rules engine.
    // Peak-hours aggregate rules are handled separately below to preserve existing behavior.
    const skippedCodes = new Set(['ACC-010', 'CRT-001', 'CRT-002']);
    const mappedCodes = Object.keys(RULE_STATE_MAP).filter((code) => !skippedCodes.has(code));

    for (const code of mappedCodes) {
      if (code === 'ACC-005') {
        const advanceEnabled = !!rules.daysInAdvanceEnabled;
        const raw = rules.daysInAdvance;
        const parsed =
          raw === undefined || raw === null || String(raw).trim() === ''
            ? NaN
            : parseInt(String(raw).trim(), 10);
        const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
        ruleConfigs.push({
          ruleCode: 'ACC-005',
          isEnabled: advanceEnabled,
          ruleConfig: { max_days_ahead: limit },
        });
        continue;
      }

      const map = RULE_STATE_MAP[code];
      if (!map) continue;

      const enabledRaw = getNestedValue(rules, map.enabledField);
      const isEnabled = map.invertEnabled ? !enabledRaw : !!enabledRaw;
      const ruleConfig: Record<string, any> = {};

      for (const [configKey, fieldInfo] of Object.entries(map.configMap)) {
        const rawValue = getNestedValue(rules, fieldInfo.field);
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;
        const numericValue = Number(rawValue);
        const normalizedValue = fieldInfo.toDb
          ? fieldInfo.toDb(Number.isFinite(numericValue) ? numericValue : 0)
          : rawValue;
        ruleConfig[configKey] = normalizedValue;
      }

      // Normalize max duration from admin entry.
      // Some legacy states stored "2" in maxReservationDurationMinutes to mean 2 hours.
      if (code === 'CRT-005') {
        const rawMinutes = Number(rules.maxReservationDurationMinutes);
        if (Number.isFinite(rawMinutes) && rawMinutes > 0) {
          ruleConfig.max_duration_minutes = rawMinutes <= 12 ? Math.round(rawMinutes * 60) : Math.round(rawMinutes);
        } else {
          const rawHours = Number(rules.maxBookingDurationHours);
          if (Number.isFinite(rawHours) && rawHours > 0) {
            ruleConfig.max_duration_minutes = Math.round(rawHours * 60);
          }
        }
      }

      // Preserve expected default fields for common rules when values are missing.
      if (code === 'ACC-002') {
        // Mirror Booking Management: weekly individual + daily individual caps share ACC-002.
        // Previously only weekly was synced here, so bulk update stripped max_per_day_* right after
        // PATCH saved them — daily limits never stuck in the rules engine.
        const weeklyEnabled = !!rules.courtsPerWeekUserEnabled;
        const weeklyLimit = parseInt(String(rules.courtsPerWeekUser), 10) || 1;
        const dailyEnabled =
          !!rules.courtsPerDayUserEnabled && (parseInt(String(rules.courtsPerDayUser), 10) || 0) > 0;
        const dailyLimit = Math.max(1, parseInt(String(rules.courtsPerDayUser), 10) || 1);
        const ruleOn = weeklyEnabled || dailyEnabled;
        const ruleConfig: Record<string, any> = {
          window_type: 'calendar_week',
          include_canceled: false,
        };
        if (weeklyEnabled && weeklyLimit > 0) {
          ruleConfig.max_per_week = weeklyLimit;
        }
        ruleConfig.max_per_day_enabled = dailyEnabled;
        ruleConfig.max_per_day = dailyEnabled ? dailyLimit : 0;
        ruleConfigs.push({
          ruleCode: code,
          isEnabled: ruleOn,
          ruleConfig,
        });
        continue;
      }
      if (code === 'ACC-003' && ruleConfig.window_type === undefined) {
        ruleConfig.window_type = 'calendar_week';
      }
      if (code === 'ACC-010' && ruleConfig.window_type === undefined) {
        ruleConfig.window_type = 'calendar_week';
      }
      if (code === 'CRT-008' && ruleConfig.allowed_types === undefined) {
        ruleConfig.allowed_types = Array.isArray(rules.allowedBookingTypes) ? rules.allowedBookingTypes : [];
      }
      if (code === 'CRT-010' && ruleConfig.window_type === undefined) {
        ruleConfig.window_type = 'calendar_week';
      }

      ruleConfigs.push({
        ruleCode: code,
        isEnabled,
        ruleConfig,
      });
    }

    // Preserve existing Peak Hours Policy behavior.
    if (rules.hasPeakHours) {
      const peakWindows = rules.peakHoursSlots.map((slot) => ({
        id: slot.id,
        days: slot.days,
        start_time: slot.startTime,
        end_time: slot.endTime,
        applies_to_all_courts: slot.appliesToAllCourts !== false,
        selected_court_ids: slot.appliesToAllCourts ? [] : (slot.selectedCourtIds || []),
        rules: {
          max_bookings_per_day: slot.rules.maxBookingsPerDayUnlimited ? -1 : (parseInt(slot.rules.maxBookingsPerDay) || 1),
          max_bookings_per_day_household: slot.rules.maxBookingsPerDayHouseholdUnlimited ? -1 : (parseInt(slot.rules.maxBookingsPerDayHousehold) || 1),
          max_bookings_per_week: slot.rules.maxBookingsPerWeekUnlimited ? -1 : (parseInt(slot.rules.maxBookingsPerWeek) || 2),
          max_bookings_per_week_household: slot.rules.maxBookingsPerWeekHouseholdUnlimited ? -1 : (parseInt(slot.rules.maxBookingsPerWeekHousehold) || 2),
          max_duration_hours: slot.rules.maxDurationUnlimited ? -1 : (parseFloat(slot.rules.maxDurationHours) || 1.5),
        }
      }));
      ruleConfigs.push({
        ruleCode: 'CRT-001',
        isEnabled: true,
        ruleConfig: { peak_windows: peakWindows },
      });
      ruleConfigs.push({
        ruleCode: 'ACC-010',
        isEnabled: !rules.peakHoursRestrictions.maxBookingsUnlimited,
        ruleConfig: {
          max_prime_per_week: parseInt(rules.peakHoursRestrictions.maxBookingsPerWeek) || 2,
          window_type: 'calendar_week'
        }
      });
      ruleConfigs.push({
        ruleCode: 'CRT-002',
        isEnabled: !rules.peakHoursRestrictions.maxDurationUnlimited,
        ruleConfig: {
          max_minutes_prime: (parseFloat(rules.peakHoursRestrictions.maxDurationHours) || 1.5) * 60
        }
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-010', isEnabled: false });
      ruleConfigs.push({ ruleCode: 'CRT-002', isEnabled: false });
      ruleConfigs.push({ ruleCode: 'CRT-001', isEnabled: false });
    }

    const response = await rulesApi.bulkUpdate(currentFacilityId, ruleConfigs);
    if (!response.success) {
      console.error('Error syncing peak rules to engine:', response.error);
      toast.error('Failed to save Peak Hours policy.');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error syncing rules to engine:', error);
    toast.error('Failed to sync booking rules.');
    return false;
  }
};

const loadFacilityRules = async () => {
  if (!currentFacilityId) return;
  try {
    const response = await rulesApi.getEffectiveRules(currentFacilityId);
    if (response.success && response.data?.rules) {
      const ruleMap = new Map(response.data.rules.map((r: any) => [r.rule_code, r]));
      setFacilityData(prev => {
        const updated = { ...prev, bookingRules: { ...prev.bookingRules } };

        // Do not overlay Booking Management or Peak Policy fields from the rules engine here.
        // Those values are loaded from `facilities.booking_rules` in loadFacilityData() and are the
        // source of truth for the admin UI. Pushing engine state on top caused toggles and numbers
        // to jump (partial ACC-002, CRT round-trip, coercion) without the user editing anything.
        // Save already runs syncBookingRulesToEngine() so the DB stays aligned when admins save.

        // Overlay only metadata-driven rule cards (strikes, buffers, etc.), not booking_rules mirrors.
        const skippedCodes = new Set([
          'ACC-002',
          'ACC-005',
          'ACC-010',
          'CRT-001',
          'CRT-002',
          'CRT-005',
        ]);
        for (const [code, map] of Object.entries(RULE_STATE_MAP)) {
          if (skippedCodes.has(code)) continue;
          const effective = ruleMap.get(code) as any;
          if (!effective) continue;
          // Only apply explicit facility overrides. Otherwise keep persisted booking_rules values.
          if (!effective.facilityConfig) continue;

          const enabledValue = map.invertEnabled ? !effective.isEnabled : !!effective.isEnabled;
          if (map.enabledField.includes('.')) {
            const [parent, child] = map.enabledField.split('.');
            (updated.bookingRules as any)[parent] = {
              ...(updated.bookingRules as any)[parent],
              [child]: enabledValue,
            };
          } else {
            (updated.bookingRules as any)[map.enabledField] = enabledValue;
          }

          for (const [configKey, fieldInfo] of Object.entries(map.configMap)) {
            if (effective.effectiveConfig?.[configKey] === undefined) continue;
            const raw = effective.effectiveConfig[configKey];
            const mappedValue = fieldInfo.fromDb ? fieldInfo.fromDb(raw) : raw;
            const normalized = String(mappedValue);
            if (fieldInfo.field.includes('.')) {
              const [parent, child] = fieldInfo.field.split('.');
              (updated.bookingRules as any)[parent] = {
                ...(updated.bookingRules as any)[parent],
                [child]: normalized,
              };
            } else {
              (updated.bookingRules as any)[fieldInfo.field] = normalized;
            }
          }
        }

        return updated;
      });
    }
  } catch (error) {
    console.error('Error loading facility rules:', error);
  }
};

// ── Rule-to-state mapping for metadata-driven rule cards ──
const RULE_STATE_MAP: Record<string, {
  enabledField: string;
  invertEnabled?: boolean; // true = "unlimited" toggle (enabled in UI = disabled rule)
  configMap: Record<string, { field: string; fromDb?: (v: any) => any; toDb?: (v: any) => any }>;
}> = {
  'ACC-001': { enabledField: 'maxActiveReservationsEnabled', configMap: { max_active_reservations: { field: 'maxActiveReservations' } } },
  'ACC-002': { enabledField: 'maxBookingsPerWeekUnlimited', invertEnabled: true, configMap: { max_per_week: { field: 'maxBookingsPerWeek' } } },
  'ACC-003': { enabledField: 'maxHoursPerWeekEnabled', configMap: { max_minutes_per_week: { field: 'maxHoursPerWeek', fromDb: (v: number) => v / 60, toDb: (v: number) => v * 60 } } },
  'ACC-004': { enabledField: 'noOverlappingReservations', configMap: {} },
  'ACC-005': { enabledField: 'daysInAdvanceEnabled', configMap: { max_days_ahead: { field: 'daysInAdvance' } } },
  'ACC-009': { enabledField: 'strikeSystemEnabled', configMap: { strike_threshold: { field: 'strikeThreshold' }, strike_window_days: { field: 'strikeWindowDays' }, lockout_days: { field: 'strikeLockoutDays' } } },
  'ACC-010': { enabledField: 'peakHoursRestrictions.maxBookingsUnlimited', invertEnabled: true, configMap: { max_prime_per_week: { field: 'peakHoursRestrictions.maxBookingsPerWeek' } } },
  'CRT-002': { enabledField: 'peakHoursRestrictions.maxDurationUnlimited', invertEnabled: true, configMap: { max_minutes_prime: { field: 'peakHoursRestrictions.maxDurationHours', fromDb: (v: number) => v / 60, toDb: (v: number) => v * 60 } } },
  'CRT-005': { enabledField: 'maxReservationDurationEnabled', configMap: { max_duration_minutes: { field: 'maxReservationDurationMinutes', fromDb: (v: number) => v, toDb: (v: number) => v } } },
  'CRT-008': { enabledField: 'allowedBookingTypesEnabled', configMap: {} },
  'CRT-010': { enabledField: 'courtWeeklyCapEnabled', configMap: { max_per_week_per_account: { field: 'courtWeeklyCap' } } },
  'CRT-011': { enabledField: 'courtReleaseTimeEnabled', configMap: { release_time_local: { field: 'courtReleaseTime' }, days_ahead: { field: 'courtReleaseDaysAhead' } } },
  'HH-001': { enabledField: 'householdMaxMembersEnabled', configMap: { max_members: { field: 'householdMaxMembers' } } },
  'HH-002': { enabledField: 'householdMaxActiveEnabled', configMap: { max_active_household: { field: 'householdMaxActive' } } },
  'HH-003': { enabledField: 'householdPrimeCapEnabled', configMap: { max_prime_per_week_household: { field: 'householdPrimeCap' } } },
};

// Helper to get nested field value
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((o, k) => o?.[k], obj);
};

const getRuleEnabled = (code: string): boolean => {
  const map = RULE_STATE_MAP[code];
  if (!map) return false;
  const val = getNestedValue(facilityData.bookingRules, map.enabledField);
  return map.invertEnabled ? !val : !!val;
};

const setRuleEnabled = (code: string, enabled: boolean) => {
  const map = RULE_STATE_MAP[code];
  if (!map) return;
  const val = map.invertEnabled ? !enabled : enabled;
  if (map.enabledField.includes('.')) {
    const [parent, child] = map.enabledField.split('.');
    setFacilityData(prev => ({
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        [parent]: { ...(prev.bookingRules as any)[parent], [child]: val },
      },
    }));
  } else {
    handleBookingRulesChange(map.enabledField, val);
  }
};

const getRuleConfigValue = (code: string, configKey: string): any => {
  const map = RULE_STATE_MAP[code];
  if (!map) return '';
  const fieldInfo = map.configMap[configKey];
  if (!fieldInfo) return '';
  const raw = getNestedValue(facilityData.bookingRules, fieldInfo.field);
  return fieldInfo.fromDb ? fieldInfo.fromDb(Number(raw) || 0) : (raw ?? '');
};

const setRuleConfigValue = (code: string, configKey: string, value: any) => {
  const map = RULE_STATE_MAP[code];
  if (!map) return;
  const fieldInfo = map.configMap[configKey];
  if (!fieldInfo) return;
  const dbVal = fieldInfo.toDb ? fieldInfo.toDb(Number(value) || 0) : value;
  if (fieldInfo.field.includes('.')) {
    const [parent, child] = fieldInfo.field.split('.');
    setFacilityData(prev => ({
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        [parent]: { ...(prev.bookingRules as any)[parent], [child]: String(dbVal) },
      },
    }));
  } else {
    handleBookingRulesChange(fieldInfo.field, String(dbVal));
  }
};

// Render an InstructionCard
const renderInstructionCard = (text: string) => (
  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3 mb-4">
    <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
    <p className="text-sm text-green-800">{text}</p>
  </div>
);

// Render a single rule card matching the registration style
const renderRuleCard = (meta: RuleMeta) => {
  const enabled = getRuleEnabled(meta.code);
  return (
    <div key={meta.code} className="p-3 border rounded-lg space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex-1 mr-3">
          <Label className="font-medium text-sm">{meta.name}</Label>
          <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
        </div>
        <Switch
          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
          checked={enabled}
          onCheckedChange={(checked: boolean) => setRuleEnabled(meta.code, checked)}
          disabled={!isEditing}
        />
      </div>
      {enabled && meta.fields.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {meta.fields.map((field) => (
            <div key={field.key} className="flex items-center gap-2">
              <Label className="text-xs text-gray-600 whitespace-nowrap">{field.label}:</Label>
              {field.type === 'time' ? (
                <Input
                  type="time"
                  className="w-28 h-8 text-sm"
                  value={getRuleConfigValue(meta.code, field.key) || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRuleConfigValue(meta.code, field.key, e.target.value)}
                  disabled={!isEditing}
                />
              ) : field.type === 'select' ? (
                <select
                  className="h-8 text-sm border rounded px-2"
                  value={String(getRuleConfigValue(meta.code, field.key) ?? '')}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRuleConfigValue(meta.code, field.key, e.target.value === 'true')}
                  disabled={!isEditing}
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-20 h-8 text-sm"
                    min={field.min}
                    max={field.max}
                    step={field.step || 1}
                    value={getRuleConfigValue(meta.code, field.key)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRuleConfigValue(meta.code, field.key, parseFloat(e.target.value))}
                    disabled={!isEditing}
                  />
                  {field.suffix && (
                    <span className="text-xs text-gray-500">{field.suffix}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Render a full rule category card
const renderRuleCategoryCard = (
  category: 'account' | 'cancellation' | 'court' | 'household',
  icon: React.ElementType
) => {
  const categoryInfo = CATEGORIES[category];
  const categoryRules = getRulesByCategory(category);
  // Skip CRT-003 (tier system removed)
  const filteredRules = categoryRules.filter(r => r.code !== 'CRT-003');
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {React.createElement(icon, { className: 'h-5 w-5' })}
          {categoryInfo.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {renderInstructionCard(categoryInfo.instruction)}
        {filteredRules.map(renderRuleCard)}
      </CardContent>
    </Card>
  );
};

const getCourtStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'available':
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'maintenance':
      return 'bg-yellow-100 text-yellow-800';
    case 'closed':
    case 'inactive':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const formatCourtStatus = (status: string) => {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const renderSectionSaveFooter = (sectionLabel: string) =>
  isEditing ? (
    <CardFooter className="justify-end border-t">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void performSave({
            closeEditor: false,
            toastMessage: `${sectionLabel} saved`,
          });
        }}
        disabled={saving}
        title="Saves your current pending edits for this facility (same as Save Changes at the top)."
      >
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving...' : `Save ${sectionLabel}`}
      </Button>
    </CardFooter>
  ) : null;

const renderTabFooterSaveBar = () =>
  isEditing ? (
    <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t">
      <Button variant="outline" onClick={handleCancel} disabled={saving}>
        <X className="h-4 w-4 mr-2" />
        Cancel
      </Button>
      <Button onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  ) : null;

  return {
    user,
    currentFacilityId,
    isEditing,
    setIsEditing,
    loading,
    saving,
    facilityData,
    setFacilityData,
    originalData,
    expandedPeakHourSlots,
    courts,
    courtsLoading,
    editingCourt,
    setEditingCourt,
    isAddingNewCourt,
    courtSaving,
    stripeOnboarded,
    stripeStatusLoading,
    configuringCourtId,
    setConfiguringCourtId,
    courtSchedule,
    courtScheduleLoading,
    courtScheduleSaving,
    courtOperatingHours,
    courtHoursLoading,
    facilityCourtEditPanelRef,
    blackouts,
    blackoutsLoading,
    editingBlackout,
    setEditingBlackout,
    isAddingBlackout,
    setIsAddingBlackout,
    blackoutSaving,
    secondaryLocations,
    addingSecondaryLocation,
    setAddingSecondaryLocation,
    newSecondaryLocation,
    setNewSecondaryLocation,
    savingSecondaryLocation,
    editingSecondaryLocationId,
    editingSecondaryLocation,
    setEditingSecondaryLocation,
    handleSave,
    handleCancel,
    getHoursDisplay,
    handleOperatingHoursChange,
    handlePrimaryContactChange,
    addSecondaryContact,
    updateSecondaryContact,
    removeSecondaryContact,
    handleBookingRulesChange,
    handleWeekendPolicyChange,
    addPeakHourSlot,
    removePeakHourSlot,
    updatePeakHourSlotTime,
    updatePeakHourSlotRule,
    togglePeakHourSlotExpanded,
    setPeakHourSlotCourtMode,
    togglePeakHourSlotCourt,
    togglePeakHourSlotDay,
    cancelEditingSecondaryLocation,
    handleAddSecondaryLocation,
    handleRemoveSecondaryLocation,
    startEditingSecondaryLocation,
    handleUpdateSecondaryLocation,
    handleAddNewCourt,
    handleEditCourt,
    handleSaveCourt,
    handleCancelCourtEdit,
    handleDeleteCourt,
    handleToggleCourtConfig,
    updateCourtScheduleDay,
    updateAllScheduleDays,
    saveCourtSchedule,
    handleAddBlackout,
    handleSaveBlackout,
    handleDeleteBlackout,
    renderInstructionCard,
    renderRuleCategoryCard,
    getCourtStatusColor,
    formatCourtStatus,
    renderSectionSaveFooter,
    renderTabFooterSaveBar,
    performSave,
  };
}

export type UseFacilityManagementReturn = ReturnType<typeof useFacilityManagement>;
