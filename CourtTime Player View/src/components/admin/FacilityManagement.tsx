import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Building2, Clock, MapPin, Phone, Mail, Save, Edit, X, Plus, Trash2, Image, User, Users, FileText, Upload, Shield, AlertTriangle, Zap, Home, Info, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { RULE_METADATA, CATEGORIES, getRulesByCategory, RuleMeta } from '../facility-registration/rule-defaults';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { parseLocalDate } from '../../utils/dateUtils';
import {
  facilitiesApi,
  adminApi,
  courtConfigApi,
  rulesApi,
  facilityLocationsApi,
  stripeConnectApi,
  isStripeConnectReadyFromResponse,
} from '../../api/client';
import {
  PaidCourtBookingFields,
  formatCentsToDollars,
  parseBookingFeeDollars,
  type PaidCourtFormFields,
} from './PaidCourtBookingFields';
import { CourtScheduleEditor } from './CourtScheduleEditor';
import { CourtTypeField } from './CourtTypeField';
import { validateStoredCourtType } from '../../../shared/constants/courtTypes';
import { toast } from 'sonner';
import {
  courtScheduleRowsToOperatingHoursMap,
  extractCourtScheduleFromApiResponse,
  formatGroupedOperatingHoursSummary,
  type OperatingHoursMap,
} from '../../../shared/utils/operatingHours';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberChange,
  formatStandardCourtName,
  normalizeCourtNameAndNumber,
} from '../../../shared/utils/courtNaming';
import * as XLSX from 'xlsx';
import { BillingTab } from './BillingTab';
import {
  getFacilityTypeSelectOptions,
  normalizeFacilityType,
} from '../../../shared/constants/facilityTypes';

// US State abbreviations
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

interface FacilityContact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface PeakHourSlot {
  id: string;
  startTime: string;
  endTime: string;
  days: number[];
  appliesToAllCourts: boolean;
  selectedCourtIds: string[];
  rules: {
    maxBookingsPerDay: string;
    maxBookingsPerDayUnlimited: boolean;
    maxBookingsPerDayHousehold: string;
    maxBookingsPerDayHouseholdUnlimited: boolean;
    maxBookingsPerWeek: string;
    maxBookingsPerWeekUnlimited: boolean;
    maxBookingsPerWeekHousehold: string;
    maxBookingsPerWeekHouseholdUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
  };
}

interface BookingRules {
  generalRules: string;
  restrictionType: 'account' | 'address';
  daysInAdvanceEnabled: boolean;
  daysInAdvance: string;
  maxReservationDurationEnabled: boolean;
  maxReservationDurationMinutes: string;
  courtsPerWeekUserEnabled: boolean;
  courtsPerWeekUser: string;
  courtsPerWeekHouseholdEnabled: boolean;
  courtsPerWeekHousehold: string;
  courtsPerDayUserEnabled: boolean;
  courtsPerDayUser: string;
  courtsPerDayHouseholdEnabled: boolean;
  courtsPerDayHousehold: string;
  maxBookingsPerWeek: string;
  maxBookingsPerWeekUnlimited: boolean;
  maxBookingDurationHours: string;
  maxBookingDurationUnlimited: boolean;
  advanceBookingDays: string;
  advanceBookingDaysUnlimited: boolean;
  restrictionsApplyToAdmins: boolean;
  adminMaxBookingsPerWeek: string;
  adminMaxBookingsUnlimited: boolean;
  adminMaxBookingDurationHours: string;
  adminMaxDurationUnlimited: boolean;
  adminAdvanceBookingDays: string;
  adminAdvanceBookingUnlimited: boolean;
  hasPeakHours: boolean;
  peakHoursApplyToAdmins: boolean;
  peakHoursSlots: PeakHourSlot[];
  peakHoursRestrictions: {
    maxBookingsPerWeek: string;
    maxBookingsUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
  };
  hasWeekendPolicy: boolean;
  weekendPolicyApplyToAdmins: boolean;
  weekendPolicy: {
    maxBookingsPerWeekend: string;
    maxBookingsUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
    advanceBookingDays: string;
    advanceBookingUnlimited: boolean;
  };
  // ACC-001: Max active reservations
  maxActiveReservationsEnabled: boolean;
  maxActiveReservations: string;
  // ACC-003: Max hours per week
  maxHoursPerWeekEnabled: boolean;
  maxHoursPerWeek: string;
  // ACC-004: No overlapping reservations
  noOverlappingReservations: boolean;
  // ACC-006: Minimum lead time
  minimumLeadTimeEnabled: boolean;
  minimumLeadTimeMinutes: string;
  // ACC-009: Strike system
  strikeSystemEnabled: boolean;
  strikeThreshold: string;
  strikeWindowDays: string;
  strikeLockoutDays: string;
  // CRT-008: Allowed booking types
  allowedBookingTypesEnabled: boolean;
  allowedBookingTypes: string[];
  // CRT-010: Court weekly cap
  courtWeeklyCapEnabled: boolean;
  courtWeeklyCap: string;
  // CRT-011: Court release time
  courtReleaseTimeEnabled: boolean;
  courtReleaseTime: string;
  courtReleaseDaysAhead: string;
  // HH-001: Max members per address
  householdMaxMembersEnabled: boolean;
  householdMaxMembers: string;
  // HH-002: Household max active reservations
  householdMaxActiveEnabled: boolean;
  householdMaxActive: string;
  // HH-003: Household peak-hours cap
  householdPrimeCapEnabled: boolean;
  householdPrimeCap: string;
}

interface FacilityData {
  name: string;
  type: string;
  primaryLocationLabel: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  description: string;
  operatingHours: Record<string, { open: string; close: string; closed: boolean }>;
  timezone: string;
  logoUrl: string;
  facilityImage: File | null;
  facilityImagePreview: string;
  // Primary Contact
  primaryContact: {
    name: string;
    email: string;
    phone: string;
  };
  // Secondary Contacts
  secondaryContacts: FacilityContact[];
  // Address Whitelist
  // Booking Rules
  bookingRules: BookingRules;
}

interface Court extends PaidCourtFormFields {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp?: boolean;
  status: 'available' | 'maintenance' | 'closed';
  canSplit?: boolean;
  splitConfig?: {
    splitNames: string[];
    splitType: 'Tennis' | 'Pickleball';
  };
}

function FacilityCourtFormBody({
  editingCourt,
  setEditingCourt,
  idPrefix,
  courtSaving,
  onSave,
  onCancel,
  stripeOnboarded,
  stripeStatusLoading,
}: {
  editingCourt: Court;
  setEditingCourt: React.Dispatch<React.SetStateAction<Court | null>>;
  idPrefix: string;
  courtSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  stripeOnboarded: boolean | null;
  stripeStatusLoading: boolean;
}) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id('courtName')}>Court Name</Label>
          <p className="text-xs text-gray-500">Shown on the calendar — any label you want (not tied to court number).</p>
          <Input
            id={id('courtName')}
            value={editingCourt.name}
            onChange={(e) =>
              setEditingCourt((prev) =>
                prev
                  ? { ...prev, ...courtFieldsAfterNameChange(e.target.value, prev.courtNumber) }
                  : prev
              )
            }
            placeholder="e.g. Center Court"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('courtNumber')}>Court Number</Label>
          <Input
            id={id('courtNumber')}
            type="number"
            value={editingCourt.courtNumber}
            onChange={(e) =>
              setEditingCourt((prev) =>
                prev
                  ? {
                      ...prev,
                      ...courtFieldsAfterNumberChange(
                        parseInt(e.target.value, 10) || 1,
                        prev.name
                      ),
                    }
                  : prev
              )
            }
          />
        </div>
        <CourtTypeField
          id={id('courtType')}
          value={editingCourt.courtType}
          onChange={(courtType) =>
            setEditingCourt((prev) => (prev ? { ...prev, courtType } : prev))
          }
        />
        <div className="space-y-2">
          <Label htmlFor={id('courtSurface')}>Surface Type</Label>
          <Select
            value={editingCourt.surfaceType}
            onValueChange={(value) =>
              setEditingCourt((prev) => (prev ? { ...prev, surfaceType: value } : prev))
            }
          >
            <SelectTrigger id={id('courtSurface')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Hard Court">Hard Court</SelectItem>
              <SelectItem value="Clay Court">Clay Court</SelectItem>
              <SelectItem value="Grass Court">Grass Court</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('courtStatus')}>Status</Label>
          <Select
            value={editingCourt.status}
            onValueChange={(value: 'available' | 'maintenance' | 'closed') =>
              setEditingCourt((prev) => (prev ? { ...prev, status: value } : prev))
            }
          >
            <SelectTrigger id={id('courtStatus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('indoor')}
            checked={editingCourt.isIndoor}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, isIndoor: checked } : prev))
            }
          />
          <Label htmlFor={id('indoor')}>Indoor Court</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('lights')}
            checked={editingCourt.hasLights}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, hasLights: checked } : prev))
            }
          />
          <Label htmlFor={id('lights')}>Has Lights</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('walkUp')}
            checked={editingCourt.isWalkUp === true}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, isWalkUp: checked } : prev))
            }
          />
          <Label htmlFor={id('walkUp')}>Walk-up Court (no online booking)</Label>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center space-x-2 mb-2">
          <Switch
            id={id('canSplit')}
            checked={editingCourt.canSplit || false}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) =>
                prev
                  ? {
                      ...prev,
                      canSplit: checked,
                      splitConfig:
                        checked && !prev.splitConfig
                          ? { splitNames: [], splitType: 'Pickleball' }
                          : prev.splitConfig,
                    }
                  : prev
              )
            }
          />
          <Label htmlFor={id('canSplit')}>Can be split into multiple courts</Label>
        </div>

        {editingCourt.canSplit && (
          <div className="ml-6 mt-3 p-4 bg-gray-50 rounded-lg">
            <Label className="text-sm mb-2 block">Split Configuration</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Split Names (comma-separated)</Label>
                <Input
                  placeholder="3a, 3b"
                  defaultValue={editingCourt.splitConfig?.splitNames.join(', ') || ''}
                  key={idPrefix + '-splitnames'}
                  onBlur={(e) => {
                    const names = e.target.value.split(',').map((n) => n.trim()).filter(Boolean);
                    setEditingCourt((prev) =>
                      prev
                        ? {
                            ...prev,
                            splitConfig: {
                              ...prev.splitConfig,
                              splitNames: names,
                              splitType: prev.splitConfig?.splitType || 'Pickleball',
                            },
                          }
                        : prev
                    );
                  }}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Split Type</Label>
                <Select
                  value={editingCourt.splitConfig?.splitType || 'Pickleball'}
                  onValueChange={(value: 'Tennis' | 'Pickleball') => {
                    setEditingCourt((prev) =>
                      prev
                        ? {
                            ...prev,
                            splitConfig: {
                              ...prev.splitConfig,
                              splitType: value,
                              splitNames: prev.splitConfig?.splitNames || [],
                            },
                          }
                        : prev
                    );
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

      <PaidCourtBookingFields
        court={editingCourt}
        onChange={(patch) => setEditingCourt((prev) => (prev ? { ...prev, ...patch } : prev))}
        stripeOnboarded={stripeOnboarded}
        stripeStatusLoading={stripeStatusLoading}
        paymentsTabHint="Member Payments in the sidebar"
      />

      <div className="flex gap-2 mt-6">
        <Button onClick={onSave} disabled={courtSaving}>
          <Save className="h-4 w-4 mr-2" />
          {courtSaving ? 'Saving...' : 'Save Court'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={courtSaving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </>
  );
}

export function FacilityManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'payments' ? 'details' : tabParam || 'details';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (tabParam !== 'payments') return;
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    const query = next.toString();
    navigate(`/admin/member-payments${query ? `?${query}` : ''}`, { replace: true });
  }, [tabParam, searchParams, navigate]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalData, setOriginalData] = useState<FacilityData | null>(null);
  const defaultBookingRules: BookingRules = {
    generalRules: '',
    restrictionType: 'account',
    daysInAdvanceEnabled: false,
    daysInAdvance: '',
    maxReservationDurationEnabled: false,
    maxReservationDurationMinutes: '',
    courtsPerWeekUserEnabled: false,
    courtsPerWeekUser: '',
    courtsPerWeekHouseholdEnabled: false,
    courtsPerWeekHousehold: '',
    courtsPerDayUserEnabled: false,
    courtsPerDayUser: '',
    courtsPerDayHouseholdEnabled: false,
    courtsPerDayHousehold: '',
    maxBookingsPerWeek: '',
    maxBookingsPerWeekUnlimited: true,
    maxBookingDurationHours: '',
    maxBookingDurationUnlimited: true,
    advanceBookingDays: '',
    advanceBookingDaysUnlimited: true,
    restrictionsApplyToAdmins: false,
    adminMaxBookingsPerWeek: '',
    adminMaxBookingsUnlimited: true,
    adminMaxBookingDurationHours: '',
    adminMaxDurationUnlimited: true,
    adminAdvanceBookingDays: '',
    adminAdvanceBookingUnlimited: true,
    hasPeakHours: false,
    peakHoursApplyToAdmins: false,
    peakHoursSlots: [],
    peakHoursRestrictions: {
      maxBookingsPerWeek: '',
      maxBookingsUnlimited: true,
      maxDurationHours: '',
      maxDurationUnlimited: true,
    },
    hasWeekendPolicy: false,
    weekendPolicyApplyToAdmins: false,
    weekendPolicy: {
      maxBookingsPerWeekend: '',
      maxBookingsUnlimited: true,
      maxDurationHours: '',
      maxDurationUnlimited: true,
      advanceBookingDays: '',
      advanceBookingUnlimited: true,
    },
    maxActiveReservationsEnabled: false,
    maxActiveReservations: '',
    maxHoursPerWeekEnabled: false,
    maxHoursPerWeek: '',
    noOverlappingReservations: false,
    minimumLeadTimeEnabled: false,
    minimumLeadTimeMinutes: '',
    strikeSystemEnabled: false,
    strikeThreshold: '',
    strikeWindowDays: '',
    strikeLockoutDays: '',
    allowedBookingTypesEnabled: false,
    allowedBookingTypes: ['singles', 'doubles', 'lesson', 'clinic', 'open_play', 'tournament', 'practice', 'social', 'other'],
    courtWeeklyCapEnabled: false,
    courtWeeklyCap: '',
    courtReleaseTimeEnabled: false,
    courtReleaseTime: '',
    courtReleaseDaysAhead: '',
    householdMaxMembersEnabled: false,
    householdMaxMembers: '',
    householdMaxActiveEnabled: false,
    householdMaxActive: '',
    householdPrimeCapEnabled: false,
    householdPrimeCap: '',
  };

  const defaultOperatingHours = {
    monday: { open: '08:00', close: '20:00', closed: false },
    tuesday: { open: '08:00', close: '20:00', closed: false },
    wednesday: { open: '08:00', close: '20:00', closed: false },
    thursday: { open: '08:00', close: '20:00', closed: false },
    friday: { open: '08:00', close: '20:00', closed: false },
    saturday: { open: '09:00', close: '18:00', closed: false },
    sunday: { open: '09:00', close: '18:00', closed: false },
  };

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

  const { selectedFacilityId: currentFacilityId } = useAppContext();

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
        // Create new court
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
    try {
      setBlackoutSaving(true);
      if (editingBlackout.id) {
        const response = await courtConfigApi.updateBlackout(editingBlackout.id, editingBlackout);
        if (!response.success) {
          toast.error(response.error || 'Failed to update blackout');
          return;
        }
        toast.success('Blackout updated');
      } else {
        const response = await courtConfigApi.createBlackout({
          ...editingBlackout,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <h1 className="text-2xl font-bold text-green-800 shrink-0">Facility Management</h1>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList>
                  <TabsTrigger value="details" className="px-4">Facility Details</TabsTrigger>
                  <TabsTrigger value="rules" className="px-4">Booking Rules</TabsTrigger>
                  <TabsTrigger value="courts" className="px-4">Court Management</TabsTrigger>
                  <TabsTrigger value="billing" className="px-4">Subscription</TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Facility Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <div className="flex justify-end">
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Details
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>General facility details and contact information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Facility Name</Label>
                      <Input
                        id="name"
                        value={facilityData.name}
                        onChange={(e) => setFacilityData({ ...facilityData, name: e.target.value })}
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Facility Type</Label>
                      <Select
                        value={facilityData.type}
                        onValueChange={(value) => setFacilityData({ ...facilityData, type: value })}
                        disabled={!isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select facility type" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFacilityTypeSelectOptions(facilityData.type).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={facilityData.description}
                        onChange={(e) => setFacilityData({ ...facilityData, description: e.target.value })}
                        disabled={!isEditing}
                        rows={4}
                      />
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('basic information')}
                </Card>

                {/* Facility Logo/Image */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Facility Logo
                    </CardTitle>
                    <CardDescription>Upload your facility's logo or image</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col items-center gap-4">
                      {(facilityData.facilityImagePreview || facilityData.logoUrl) ? (
                        <div className="relative">
                          <img
                            src={facilityData.facilityImagePreview || facilityData.logoUrl}
                            alt="Facility Logo"
                            className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                            onError={() => {
                              // A previously saved blob: URL (or otherwise unreachable URL)
                              // can no longer be loaded. Clear it so we show the empty-state
                              // placeholder instead of a broken-image icon.
                              if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                                URL.revokeObjectURL(facilityData.facilityImagePreview);
                              }
                              setFacilityData(prev => ({
                                ...prev,
                                logoUrl: prev.logoUrl && prev.logoUrl.startsWith('blob:') ? '' : prev.logoUrl,
                                facilityImagePreview: '',
                                facilityImage: null,
                              }));
                            }}
                          />
                          {isEditing && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                              onClick={() => {
                                if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                                  URL.revokeObjectURL(facilityData.facilityImagePreview);
                                }
                                setFacilityData({ ...facilityData, logoUrl: '', facilityImagePreview: '', facilityImage: null });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="w-32 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                          <Building2 className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                      {isEditing && (
                        <div className="w-full">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              if (!file.type.startsWith('image/')) {
                                toast.error('Please select an image file');
                                e.target.value = '';
                                return;
                              }
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error('Image size must be less than 5MB');
                                e.target.value = '';
                                return;
                              }

                              if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                                URL.revokeObjectURL(facilityData.facilityImagePreview);
                              }

                              // Read as a base64 data URL so the logo persists across
                              // reloads. (Blob URLs are only valid in the tab that
                              // created them, which caused saved logos to break.)
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const dataUrl = reader.result as string;
                                setFacilityData(prev => ({
                                  ...prev,
                                  facilityImage: file,
                                  facilityImagePreview: dataUrl,
                                  logoUrl: dataUrl,
                                }));
                              };
                              reader.onerror = () => {
                                toast.error('Failed to read image file');
                              };
                              reader.readAsDataURL(file);

                              e.target.value = '';
                            }}
                            className="hidden"
                            id="facilityLogo"
                          />
                          <label htmlFor="facilityLogo">
                            <Button variant="outline" asChild className="w-full cursor-pointer">
                              <span>
                                <Upload className="h-4 w-4 mr-2" />
                                {facilityData.facilityImagePreview ? 'Change Image' : 'Upload Image'}
                              </span>
                            </Button>
                          </label>
                          <p className="text-xs text-gray-500 text-center mt-2">PNG, JPG up to 5MB</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('facility logo')}
                </Card>

                {/* Location Information */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Location
                    </CardTitle>
                    <CardDescription>Facility address</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryLocationLabel">Primary Address Label</Label>
                      <Input
                        id="primaryLocationLabel"
                        value={facilityData.primaryLocationLabel}
                        onChange={(e) => setFacilityData({ ...facilityData, primaryLocationLabel: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Main Campus"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="streetAddress">Street Address</Label>
                      <Input
                        id="streetAddress"
                        value={facilityData.streetAddress}
                        onChange={(e) => setFacilityData({ ...facilityData, streetAddress: e.target.value })}
                        disabled={!isEditing}
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={facilityData.city}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFacilityData({ ...facilityData, city: e.target.value })}
                          disabled={!isEditing}
                          placeholder="City"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Select
                          value={facilityData.state}
                          onValueChange={(value: string) => setFacilityData({ ...facilityData, state: value })}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {US_STATES.map((state) => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">ZIP Code</Label>
                        <Input
                          id="zipCode"
                          value={facilityData.zipCode}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFacilityData({ ...facilityData, zipCode: e.target.value })}
                          disabled={!isEditing}
                          placeholder="12345"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Phone Number
                        </Label>
                        <Input
                          id="phone"
                          value={facilityData.phone}
                          onChange={(e) => setFacilityData({ ...facilityData, phone: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={facilityData.email}
                          onChange={(e) => setFacilityData({ ...facilityData, email: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('location details')}
                </Card>

                {/* Secondary Facility Locations */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          Additional Locations
                        </CardTitle>
                        <CardDescription>Add a second campus or branch with a custom name</CardDescription>
                      </div>
                      {!addingSecondaryLocation && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            cancelEditingSecondaryLocation();
                            setAddingSecondaryLocation(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Location
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {secondaryLocations.length > 0 && (
                      <div className="space-y-3">
                        {secondaryLocations.map((loc) => (
                          <div key={loc.id} className="p-3 border rounded-lg bg-gray-50">
                            {editingSecondaryLocationId === loc.id ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="md:col-span-2 space-y-1">
                                    <Label>Location Name</Label>
                                    <Input
                                      value={editingSecondaryLocation.locationName}
                                      onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, locationName: e.target.value }))}
                                      placeholder="North Campus"
                                    />
                                  </div>
                                  <div className="md:col-span-2 space-y-1">
                                    <Label>Street Address</Label>
                                    <Input
                                      value={editingSecondaryLocation.streetAddress}
                                      onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, streetAddress: e.target.value }))}
                                      placeholder="123 Main St"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>City</Label>
                                    <Input
                                      value={editingSecondaryLocation.city}
                                      onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, city: e.target.value }))}
                                      placeholder="City"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <Label>State</Label>
                                      <Select
                                        value={editingSecondaryLocation.state}
                                        onValueChange={(value) => setEditingSecondaryLocation(prev => ({ ...prev, state: value }))}
                                      >
                                        <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                                        <SelectContent>
                                          {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label>ZIP Code</Label>
                                      <Input
                                        value={editingSecondaryLocation.zipCode}
                                        onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, zipCode: e.target.value }))}
                                        placeholder="12345"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Phone</Label>
                                    <Input
                                      value={editingSecondaryLocation.phone}
                                      onChange={(e) => setEditingSecondaryLocation(prev => ({ ...prev, phone: e.target.value }))}
                                      placeholder="(555) 000-0000"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={handleUpdateSecondaryLocation} disabled={savingSecondaryLocation}>
                                    <Save className="h-4 w-4 mr-1" />
                                    {savingSecondaryLocation ? 'Saving...' : 'Save Changes'}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={cancelEditingSecondaryLocation}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium text-sm">{loc.locationName}</p>
                                  <p className="text-sm text-gray-600">{loc.streetAddress}</p>
                                  <p className="text-sm text-gray-600">{loc.city}, {loc.state} {loc.zipCode}</p>
                                  {loc.phone && <p className="text-sm text-gray-500">{loc.phone}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditingSecondaryLocation(loc)}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => handleRemoveSecondaryLocation(loc.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {addingSecondaryLocation && (
                      <div className="border rounded-lg p-4 bg-green-50 space-y-3">
                        <p className="text-sm font-medium text-gray-800">New Location</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2 space-y-1">
                            <Label>Location Name <span className="text-gray-400">(e.g. "North Campus")</span></Label>
                            <Input
                              value={newSecondaryLocation.locationName}
                              onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, locationName: e.target.value }))}
                              placeholder="North Campus"
                            />
                          </div>
                          <div className="md:col-span-2 space-y-1">
                            <Label>Street Address</Label>
                            <Input
                              value={newSecondaryLocation.streetAddress}
                              onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, streetAddress: e.target.value }))}
                              placeholder="123 Main St"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>City</Label>
                            <Input
                              value={newSecondaryLocation.city}
                              onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, city: e.target.value }))}
                              placeholder="City"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label>State</Label>
                              <Select
                                value={newSecondaryLocation.state}
                                onValueChange={(v) => setNewSecondaryLocation(prev => ({ ...prev, state: v }))}
                              >
                                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                                <SelectContent>
                                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>ZIP Code</Label>
                              <Input
                                value={newSecondaryLocation.zipCode}
                                onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, zipCode: e.target.value }))}
                                placeholder="12345"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Phone <span className="text-gray-400">(optional)</span></Label>
                            <Input
                              value={newSecondaryLocation.phone}
                              onChange={(e) => setNewSecondaryLocation(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="(555) 000-0000"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={handleAddSecondaryLocation} disabled={savingSecondaryLocation}>
                            <Save className="h-4 w-4 mr-1" />
                            {savingSecondaryLocation ? 'Saving...' : 'Save Location'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setAddingSecondaryLocation(false); setNewSecondaryLocation({ locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: '' }); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {secondaryLocations.length === 0 && !addingSecondaryLocation && (
                      <p className="text-sm text-gray-500">No additional locations. Click "Add Location" to add a second campus or branch.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Court hours (facility setup — syncs to Court Management) */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Court hours (default for all courts)
                    </CardTitle>
                    <CardDescription>
                      Weekly open and close times for the facility calendar and for every court&apos;s schedule. Saving updates Court Management for all courts (prime-time and slot settings you set per court are kept). You can still fine-tune each court under the Court Management tab.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Timezone Selector */}
                    <div className="mb-6">
                      <Label className="text-sm font-medium mb-2 block">Timezone</Label>
                      {isEditing ? (
                        <Select
                          value={facilityData.timezone}
                          onValueChange={(value: string) => setFacilityData({ ...facilityData, timezone: value })}
                        >
                          <SelectTrigger className="w-72">
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
                      ) : (
                        <p className="text-sm text-gray-600">{facilityData.timezone}</p>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-4">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className="flex flex-col gap-3 p-3 bg-gray-50 rounded-lg sm:flex-row sm:items-center sm:gap-4">
                            <div className="font-medium capitalize sm:w-28">{day}</div>
                            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex sm:flex-1 sm:items-center sm:gap-2">
                              <div className="space-y-1 sm:space-y-0">
                                <Label className="text-xs text-gray-600 sm:hidden">Start time</Label>
                                <Input
                                  type="time"
                                  value={facilityData.operatingHours[day]?.open || '08:00'}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'open', e.target.value)}
                                  disabled={facilityData.operatingHours[day]?.closed}
                                  className="w-full sm:w-32"
                                />
                              </div>
                              <div className="space-y-1 sm:space-y-0">
                                <Label className="text-xs text-gray-600 sm:hidden">End time</Label>
                                <Input
                                  type="time"
                                  value={facilityData.operatingHours[day]?.close || '20:00'}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'close', e.target.value)}
                                  disabled={facilityData.operatingHours[day]?.closed}
                                  className="w-full sm:w-32"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:shrink-0">
                              <Switch
                                id={`closed-${day}`}
                                checked={facilityData.operatingHours[day]?.closed || false}
                                onCheckedChange={(checked: boolean) => handleOperatingHoursChange(day, 'closed', checked)}
                              />
                              <Label htmlFor={`closed-${day}`} className="text-sm text-gray-600">Closed</Label>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className="p-3 bg-gray-50 rounded-lg">
                            <div className="font-medium capitalize text-sm mb-1">{day}</div>
                            <div className="text-sm text-gray-600">{getHoursDisplay(day)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  {renderSectionSaveFooter('operating hours & timezone')}
                </Card>

                {/* Primary Contact */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Primary Contact
                    </CardTitle>
                    <CardDescription>Main point of contact for the facility</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryContactName">Contact Name</Label>
                      <Input
                        id="primaryContactName"
                        value={facilityData.primaryContact.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('name', e.target.value)}
                        disabled={!isEditing}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryContactEmail">Email</Label>
                      <Input
                        id="primaryContactEmail"
                        type="email"
                        value={facilityData.primaryContact.email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('email', e.target.value)}
                        disabled={!isEditing}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryContactPhone">Phone</Label>
                      <Input
                        id="primaryContactPhone"
                        value={facilityData.primaryContact.phone}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePrimaryContactChange('phone', e.target.value)}
                        disabled={!isEditing}
                        placeholder="(555) 555-5555"
                      />
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('primary contact')}
                </Card>

                {/* Secondary Contacts */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Secondary Contacts
                    </CardTitle>
                    <CardDescription>Additional contacts for the facility</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {facilityData.secondaryContacts.length === 0 ? (
                      <p className="text-gray-500 text-sm">No secondary contacts added</p>
                    ) : (
                      facilityData.secondaryContacts.map((contact, index) => (
                        <div key={contact.id} className="p-4 border rounded-lg space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-sm">Contact {index + 1}</span>
                            {isEditing && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSecondaryContact(contact.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Input
                              placeholder="Name"
                              value={contact.name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'name', e.target.value)}
                              disabled={!isEditing}
                            />
                            <Input
                              placeholder="Email"
                              type="email"
                              value={contact.email}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'email', e.target.value)}
                              disabled={!isEditing}
                            />
                            <Input
                              placeholder="Phone"
                              value={contact.phone}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSecondaryContact(contact.id, 'phone', e.target.value)}
                              disabled={!isEditing}
                            />
                          </div>
                        </div>
                      ))
                    )}
                    {isEditing && (
                      <Button variant="outline" onClick={addSecondaryContact} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Secondary Contact
                      </Button>
                    )}
                  </CardContent>
                  {renderSectionSaveFooter('secondary contacts')}
                </Card>

              </div>
              {renderTabFooterSaveBar()}
            </TabsContent>

            {/* Booking Rules Tab */}
            <TabsContent value="rules" className="space-y-6">
              <div className="flex justify-end">
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Rules
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      General Rules
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">
                        Set general facility policies and member expectations shown to users during booking.
                      </p>
                    </div>
                    <div>
                      <Label>General Usage Rules</Label>
                      <Textarea
                        value={facilityData.bookingRules.generalRules}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleBookingRulesChange('generalRules', e.target.value)}
                        placeholder="Enter your facility's general booking rules"
                        className="min-h-[100px] mt-1"
                        disabled={!isEditing}
                      />
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('general rules')}
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Restriction Type
                    </CardTitle>
                    <CardDescription>Controls whether household limits are enforced</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">
                        Choose whether booking limits apply per individual account or are shared by household.
                      </p>
                    </div>
                    <Label>Restriction Type</Label>
                    <Select
                      value={facilityData.bookingRules.restrictionType}
                      onValueChange={(value) => handleBookingRulesChange('restrictionType', value as 'account' | 'address')}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="account">Per Account</SelectItem>
                        <SelectItem value="address">Per Address</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                  {renderSectionSaveFooter('restriction type')}
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Max Accounts Per Address
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">
                        {RULE_METADATA.find((m) => m.code === 'HH-001')?.description ??
                          'Limits how many member accounts can join from the same street address. When off, there is no limit.'}
                        {' '}This rule is separate from the address whitelist.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Enable</Label>
                      <Switch
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                        checked={facilityData.bookingRules.householdMaxMembersEnabled}
                        onCheckedChange={(v: boolean) => handleBookingRulesChange('householdMaxMembersEnabled', v)}
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-gray-600 whitespace-nowrap">Max Accounts:</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        className="w-24"
                        value={facilityData.bookingRules.householdMaxMembers}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleBookingRulesChange('householdMaxMembers', e.target.value)
                        }
                        disabled={!isEditing || !facilityData.bookingRules.householdMaxMembersEnabled}
                      />
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('max accounts per address')}
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Days in Advance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">
                        Define how far in advance members are allowed to reserve a court.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Enable</Label>
                      <Switch
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                        checked={facilityData.bookingRules.daysInAdvanceEnabled}
                        onCheckedChange={(v: boolean) => handleBookingRulesChange('daysInAdvanceEnabled', v)}
                        disabled={!isEditing}
                      />
                    </div>
                    <Input type="number" min="0" value={facilityData.bookingRules.daysInAdvance} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('daysInAdvance', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.daysInAdvanceEnabled} />
                  </CardContent>
                  {renderSectionSaveFooter('days in advance')}
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Max Reservation Duration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">
                        Control the maximum length of a single reservation.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Enable</Label>
                      <Switch
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                        checked={facilityData.bookingRules.maxReservationDurationEnabled}
                        onCheckedChange={(v: boolean) => handleBookingRulesChange('maxReservationDurationEnabled', v)}
                        disabled={!isEditing}
                      />
                    </div>
                    {(() => {
                      const totalMinutes = Number(facilityData.bookingRules.maxReservationDurationMinutes) || 0;
                      const displayValue = String(totalMinutes / 60);
                      return (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={displayValue}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const n = parseFloat(e.target.value);
                              if (!Number.isFinite(n)) {
                                handleBookingRulesChange('maxReservationDurationMinutes', '0');
                                return;
                              }
                              const minutes = Math.round(n * 60);
                              handleBookingRulesChange('maxReservationDurationMinutes', String(minutes));
                            }}
                            disabled={!isEditing || !facilityData.bookingRules.maxReservationDurationEnabled}
                          />
                          <span className="text-sm text-gray-500 whitespace-nowrap">hours</span>
                        </div>
                      );
                    })()}
                  </CardContent>
                  {renderSectionSaveFooter('max reservation duration')}
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      User-Based Limits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Courts Per Week (Individual)</Label>
                      <div className="flex gap-2 items-center">
                        <Switch
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                          checked={facilityData.bookingRules.courtsPerWeekUserEnabled}
                          onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerWeekUserEnabled', v)}
                          disabled={!isEditing}
                        />
                        <Input type="number" min="1" value={facilityData.bookingRules.courtsPerWeekUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerWeekUser', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerWeekUserEnabled} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Courts Per Day (Individual)</Label>
                      <div className="flex gap-2 items-center">
                        <Switch
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                          checked={facilityData.bookingRules.courtsPerDayUserEnabled}
                          onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerDayUserEnabled', v)}
                          disabled={!isEditing}
                        />
                        <Input type="number" min="1" value={facilityData.bookingRules.courtsPerDayUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerDayUser', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerDayUserEnabled} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Courts Per Week (Household)</Label>
                      <div className="flex gap-2 items-center">
                        <Switch
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                          checked={facilityData.bookingRules.courtsPerWeekHouseholdEnabled}
                          onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerWeekHouseholdEnabled', v)}
                          disabled={!isEditing}
                        />
                        <Input type="number" min="1" value={facilityData.bookingRules.courtsPerWeekHousehold} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerWeekHousehold', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerWeekHouseholdEnabled} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Courts Per Day (Household)</Label>
                      <div className="flex gap-2 items-center">
                        <Switch
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                          checked={facilityData.bookingRules.courtsPerDayHouseholdEnabled}
                          onCheckedChange={(v: boolean) => handleBookingRulesChange('courtsPerDayHouseholdEnabled', v)}
                          disabled={!isEditing}
                        />
                        <Input type="number" min="1" value={facilityData.bookingRules.courtsPerDayHousehold} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtsPerDayHousehold', e.target.value)} disabled={!isEditing || !facilityData.bookingRules.courtsPerDayHouseholdEnabled} />
                      </div>
                    </div>
                  </CardContent>
                  {renderSectionSaveFooter('user-based limits')}
                </Card>

                {/* Peak Hours Policy */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Peak Hours Policy
                      </span>
                      <Switch
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                        checked={facilityData.bookingRules.hasPeakHours}
                        onCheckedChange={(checked: boolean) => handleBookingRulesChange('hasPeakHours', checked)}
                        disabled={!isEditing}
                      />
                    </CardTitle>
                    <CardDescription>Set different restrictions during peak hours</CardDescription>
                  </CardHeader>
                  {facilityData.bookingRules.hasPeakHours && (
                    <CardContent className="space-y-6">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                        <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-green-800">
                          Configure peak-hour time slots and custom restrictions that apply during those windows.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Peak Hours Slots</h4>
                          {isEditing && (
                            <Button variant="outline" size="sm" onClick={() => addPeakHourSlot()}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add Peak Hours Slot
                            </Button>
                          )}
                        </div>
                        {facilityData.bookingRules.peakHoursSlots.length > 0 ? (
                          <div className="space-y-2">
                            {facilityData.bookingRules.peakHoursSlots.map((slot) => {
                              return (
                                <div key={slot.id} className="border rounded-md p-2 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="time"
                                      value={slot.startTime}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlotTime(slot.id, 'startTime', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-32"
                                    />
                                    <span>to</span>
                                    <Input
                                      type="time"
                                      value={slot.endTime}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlotTime(slot.id, 'endTime', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-32"
                                    />
                                    {isEditing && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removePeakHourSlot(slot.id)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="space-y-2 p-3 bg-gray-50 rounded-md">
                                    <Label className="text-sm">Applies To Days</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border rounded p-2 bg-white">
                                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => (
                                        <label key={label} className="inline-flex items-center gap-2 text-sm">
                                          <input
                                            type="checkbox"
                                            checked={slot.days.includes(day)}
                                            disabled={!isEditing}
                                            onChange={() => togglePeakHourSlotDay(slot.id, day)}
                                          />
                                          {label}
                                        </label>
                                      ))}
                                    </div>
                                    <div className="space-y-2 pt-1">
                                      <Label className="text-sm">Max Reservation Duration</Label>
                                      <div className="flex items-center justify-between">
                                        <Label className="text-xs">Enable</Label>
                                        <Switch
                                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                          checked={!slot.rules.maxDurationUnlimited}
                                          onCheckedChange={(checked: boolean) =>
                                            updatePeakHourSlotRule(slot.id, 'maxDurationUnlimited', !checked)
                                          }
                                          disabled={!isEditing}
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min="0.5"
                                          step="0.5"
                                          className="w-24 h-8"
                                          value={slot.rules.maxDurationUnlimited ? '' : slot.rules.maxDurationHours}
                                          disabled={!isEditing || slot.rules.maxDurationUnlimited}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            updatePeakHourSlotRule(slot.id, 'maxDurationHours', e.target.value)
                                          }
                                        />
                                        <span className="text-xs text-gray-500 whitespace-nowrap">hours</span>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                      <Label className="text-sm md:col-span-2">User-Based Limits</Label>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Courts Per Day (Individual)</Label>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                            checked={!slot.rules.maxBookingsPerDayUnlimited}
                                            onCheckedChange={(checked: boolean) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayUnlimited', !checked)
                                            }
                                            disabled={!isEditing}
                                          />
                                          <Input
                                            type="number"
                                            min="1"
                                            className="w-24 h-8"
                                            value={slot.rules.maxBookingsPerDayUnlimited ? '' : slot.rules.maxBookingsPerDay}
                                            disabled={!isEditing || slot.rules.maxBookingsPerDayUnlimited}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerDay', e.target.value)
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Courts Per Week (Individual)</Label>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                            checked={!slot.rules.maxBookingsPerWeekUnlimited}
                                            onCheckedChange={(checked: boolean) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekUnlimited', !checked)
                                            }
                                            disabled={!isEditing}
                                          />
                                          <Input
                                            type="number"
                                            min="1"
                                            className="w-24 h-8"
                                            value={slot.rules.maxBookingsPerWeekUnlimited ? '' : slot.rules.maxBookingsPerWeek}
                                            disabled={!isEditing || slot.rules.maxBookingsPerWeekUnlimited}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeek', e.target.value)
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Courts Per Week (Household)</Label>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                            checked={!slot.rules.maxBookingsPerWeekHouseholdUnlimited}
                                            onCheckedChange={(checked: boolean) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHouseholdUnlimited', !checked)
                                            }
                                            disabled={!isEditing}
                                          />
                                          <Input
                                            type="number"
                                            min="1"
                                            className="w-24 h-8"
                                            value={slot.rules.maxBookingsPerWeekHouseholdUnlimited ? '' : slot.rules.maxBookingsPerWeekHousehold}
                                            disabled={!isEditing || slot.rules.maxBookingsPerWeekHouseholdUnlimited}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHousehold', e.target.value)
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Courts Per Day (Household)</Label>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90"
                                            checked={!slot.rules.maxBookingsPerDayHouseholdUnlimited}
                                            onCheckedChange={(checked: boolean) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHouseholdUnlimited', !checked)
                                            }
                                            disabled={!isEditing}
                                          />
                                          <Input
                                            type="number"
                                            min="1"
                                            className="w-24 h-8"
                                            value={slot.rules.maxBookingsPerDayHouseholdUnlimited ? '' : slot.rules.maxBookingsPerDayHousehold}
                                            disabled={!isEditing || slot.rules.maxBookingsPerDayHouseholdUnlimited}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                              updatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHousehold', e.target.value)
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No peak hours slots configured.</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                  {renderSectionSaveFooter('peak hours policy')}
                </Card>

                            </div>
              {renderTabFooterSaveBar()}
            </TabsContent>

            {/* Court Management Tab */}
            <TabsContent value="courts" className="space-y-6">
              <Card className="border-green-100 bg-green-50/40">
                <CardContent className="pt-6 text-sm text-gray-600">
                  Add courts here with paid booking and guest fees. Use the clock icon on each court for
                  operating hours and prime-time windows — the same editor as Admin → Court Management.
                  Fees and schedules saved here can be updated anytime from Court Management.
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button onClick={handleAddNewCourt} disabled={editingCourt !== null || isAddingNewCourt}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Court
                </Button>
              </div>

              {/* Add Court Form — editing an existing court opens inline below that row */}
              {editingCourt && isAddingNewCourt && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle>Add New Court</CardTitle>
                    <CardDescription>Configure court details and settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FacilityCourtFormBody
                      editingCourt={editingCourt}
                      setEditingCourt={setEditingCourt}
                      idPrefix="new-court"
                      courtSaving={courtSaving}
                      onSave={handleSaveCourt}
                      onCancel={handleCancelCourtEdit}
                      stripeOnboarded={stripeOnboarded}
                      stripeStatusLoading={stripeStatusLoading}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Courts List */}
              {courtsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {courts.map((court) => {
                    const isEditingThis =
                      editingCourt !== null && !isAddingNewCourt && editingCourt.id === court.id;
                    const hoursSummary = courtHoursLoading
                      ? null
                      : formatGroupedOperatingHoursSummary(courtOperatingHours[court.id] || {});
                    return (
                    <React.Fragment key={court.id}>
                      <Card className={isEditingThis ? 'border-green-200' : ''}>
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold">{court.name}</h3>
                                <Badge className={getCourtStatusColor(court.status)}>{formatCourtStatus(court.status)}</Badge>
                                {courtHoursLoading ? (
                                  <span className="text-xs text-gray-400">Loading hours…</span>
                                ) : hoursSummary ? (
                                  <span className="text-xs text-gray-600 font-normal">{hoursSummary}</span>
                                ) : null}
                                {court.isWalkUp && <Badge variant="secondary">Walk-up</Badge>}
                                {court.requirePayment && court.bookingAmountCents && (
                                  <Badge className="bg-amber-100 text-amber-900 border-amber-200">
                                    Paid · ${(court.bookingAmountCents / 100).toFixed(2)}
                                  </Badge>
                                )}
                                {court.guestFeeCents && (
                                  <Badge className="bg-blue-100 text-blue-900 border-blue-200">
                                    Guest fee · ${(court.guestFeeCents / 100).toFixed(2)}
                                  </Badge>
                                )}
                                {isEditingThis && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">Editing</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                                <span>Court #: <strong>{court.courtNumber}</strong></span>
                                <span>Type: <strong>{court.courtType}</strong></span>
                                <span>Surface: <strong>{court.surfaceType}</strong></span>
                                <span>{court.isIndoor ? 'Indoor' : 'Outdoor'}</span>
                                <span>{court.hasLights ? 'With Lights' : 'No Lights'}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleCourtConfig(court.id)}
                                disabled={editingCourt !== null}
                                className={configuringCourtId === court.id ? 'bg-green-100 border-green-300' : ''}
                                title="Schedule Settings"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditCourt(court)}
                                disabled={editingCourt !== null}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteCourt(court.id)}
                                disabled={editingCourt !== null}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                        {isEditingThis && editingCourt && (
                          <div
                            ref={facilityCourtEditPanelRef}
                            className="border-t border-green-200 px-6 pb-6 pt-4 bg-green-50 scroll-mt-6"
                          >
                            <h4 className="text-base font-semibold text-gray-900">Edit {court.name}</h4>
                            <p className="text-sm text-gray-600 mt-1 mb-4">Configure court details and settings</p>
                            <FacilityCourtFormBody
                              editingCourt={editingCourt}
                              setEditingCourt={setEditingCourt}
                              idPrefix={court.id}
                              courtSaving={courtSaving}
                              onSave={handleSaveCourt}
                              onCancel={handleCancelCourtEdit}
                              stripeOnboarded={stripeOnboarded}
                              stripeStatusLoading={stripeStatusLoading}
                            />
                          </div>
                        )}
                      </Card>

                      {/* Court Schedule Config Panel */}
                      {configuringCourtId === court.id && (
                        <Card className="border-green-200 bg-green-50/50">
                          <CardHeader>
                            <CardTitle className="text-base">Operating Schedule — {court.name}</CardTitle>
                            <CardDescription>Configure available/unavailable hours and optional prime-time windows per day</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {courtScheduleLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <CourtScheduleEditor
                                  schedule={courtSchedule}
                                  onUpdateDay={updateCourtScheduleDay}
                                  peakStartLabel="Prime Start"
                                  peakEndLabel="Prime End"
                                />

                                <div className="flex flex-wrap gap-2 pt-4">
                                  <Button onClick={saveCourtSchedule} disabled={courtScheduleSaving}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {courtScheduleSaving ? 'Saving...' : 'Save Schedule'}
                                  </Button>
                                  <Button variant="outline" onClick={() => setConfiguringCourtId(null)}>
                                    <X className="h-4 w-4 mr-2" />
                                    Close
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </React.Fragment>
                    );
                  })}
                </div>
              )}

              {!courtsLoading && courts.length === 0 && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-gray-500">No courts configured. Click "Add New Court" to get started.</p>
                  </CardContent>
                </Card>
              )}

              {/* Blackout Periods */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Blackout Periods
                    </span>
                    <Button size="sm" onClick={handleAddBlackout} disabled={!!editingBlackout}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Blackout
                    </Button>
                  </CardTitle>
                  <CardDescription>Court closures for maintenance, events, or weather</CardDescription>
                </CardHeader>
                <CardContent>
                  {editingBlackout && (
                    <div className="p-4 mb-4 border rounded-lg bg-green-50 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input
                            value={editingBlackout.title || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, title: e.target.value })}
                            placeholder="e.g., Court Resurfacing"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select
                            value={editingBlackout.blackoutType || 'maintenance'}
                            onValueChange={(val: string) => setEditingBlackout({ ...editingBlackout, blackoutType: val })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="maintenance">Maintenance</SelectItem>
                              <SelectItem value="event">Event</SelectItem>
                              <SelectItem value="tournament">Tournament</SelectItem>
                              <SelectItem value="holiday">Holiday</SelectItem>
                              <SelectItem value="weather">Weather</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Court</Label>
                          <Select
                            value={editingBlackout.courtId || 'all'}
                            onValueChange={(val: string) => setEditingBlackout({ ...editingBlackout, courtId: val === 'all' ? null : val })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Courts</SelectItem>
                              {courts.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            value={editingBlackout.description || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, description: e.target.value })}
                            placeholder="Optional details"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Start Date/Time</Label>
                          <Input
                            type="datetime-local"
                            value={editingBlackout.startDatetime || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, startDatetime: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End Date/Time</Label>
                          <Input
                            type="datetime-local"
                            value={editingBlackout.endDatetime || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, endDatetime: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveBlackout} disabled={blackoutSaving}>
                          <Save className="h-4 w-4 mr-2" />
                          {blackoutSaving ? 'Saving...' : 'Save Blackout'}
                        </Button>
                        <Button variant="outline" onClick={() => { setEditingBlackout(null); setIsAddingBlackout(false); }}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {blackoutsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                    </div>
                  ) : blackouts.length === 0 && !editingBlackout ? (
                    <p className="text-sm text-gray-500 text-center py-4">No blackout periods configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {blackouts.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{b.title || 'Untitled'}</span>
                              <Badge variant="outline">{b.blackout_type || 'maintenance'}</Badge>
                              {b.court_name && <Badge variant="secondary">{b.court_name}</Badge>}
                            </div>
                            <p className="text-sm text-gray-500">
                              {parseLocalDate(b.start_datetime).toLocaleString()} — {parseLocalDate(b.end_datetime).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditingBlackout({
                              id: b.id,
                              courtId: b.court_id,
                              blackoutType: b.blackout_type,
                              title: b.title,
                              description: b.description,
                              startDatetime: b.start_datetime?.slice(0, 16),
                              endDatetime: b.end_datetime?.slice(0, 16),
                            })}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteBlackout(b.id)} className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Subscription Tab */}
            <TabsContent value="billing" className="space-y-6">
              {currentFacilityId && <BillingTab facilityId={currentFacilityId} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
  );
}
