import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Building2, Clock, MapPin, Phone, Mail, Save, Edit, X, Plus, Trash2, Image, User, Users, FileText, Upload, Settings, Shield, AlertTriangle, Zap, Home } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { facilitiesApi, adminApi, courtConfigApi, rulesApi, tiersApi } from '../../api/client';
import { toast } from 'sonner';

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
}

interface BookingRules {
  generalRules: string;
  restrictionType: 'account' | 'address';
  maxBookingsPerWeek: string;
  maxBookingsPerWeekUnlimited: boolean;
  maxBookingDurationHours: string;
  maxBookingDurationUnlimited: boolean;
  advanceBookingDays: string;
  advanceBookingDaysUnlimited: boolean;
  cancellationNoticeHours: string;
  cancellationNoticeUnlimited: boolean;
  restrictionsApplyToAdmins: boolean;
  adminMaxBookingsPerWeek: string;
  adminMaxBookingsUnlimited: boolean;
  adminMaxBookingDurationHours: string;
  adminMaxDurationUnlimited: boolean;
  adminAdvanceBookingDays: string;
  adminAdvanceBookingUnlimited: boolean;
  adminCancellationNoticeHours: string;
  adminCancellationUnlimited: boolean;
  hasPeakHours: boolean;
  peakHoursApplyToAdmins: boolean;
  peakHoursSlots: Record<string, PeakHourSlot[]>;
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
  // ACC-007: Cancellation cooldown
  cancellationCooldownEnabled: boolean;
  cancellationCooldownMinutes: string;
  // ACC-009: Strike system
  strikeSystemEnabled: boolean;
  strikeThreshold: string;
  strikeWindowDays: string;
  strikeLockoutDays: string;
  // ACC-011: Rate limiting
  rateLimitEnabled: boolean;
  rateLimitMaxActions: string;
  rateLimitWindowSeconds: string;
  // CRT-003: Prime time tier restriction
  primeTimeRequiresTierEnabled: boolean;
  primeTimeAllowedTiers: string[];
  primeTimeAdminOverride: boolean;
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
  // HH-003: Household prime-time cap
  householdPrimeCapEnabled: boolean;
  householdPrimeCap: string;
}

interface FacilityData {
  name: string;
  type: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  description: string;
  amenities: string[];
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
  addressWhitelistFile: File | null;
  addressWhitelistFileName: string;
  // Booking Rules
  bookingRules: BookingRules;
}

interface Court {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: 'active' | 'maintenance' | 'inactive';
}

export function FacilityManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalData, setOriginalData] = useState<FacilityData | null>(null);
  const defaultBookingRules: BookingRules = {
    generalRules: '',
    restrictionType: 'account',
    maxBookingsPerWeek: '3',
    maxBookingsPerWeekUnlimited: false,
    maxBookingDurationHours: '2',
    maxBookingDurationUnlimited: false,
    advanceBookingDays: '14',
    advanceBookingDaysUnlimited: false,
    cancellationNoticeHours: '24',
    cancellationNoticeUnlimited: false,
    restrictionsApplyToAdmins: true,
    adminMaxBookingsPerWeek: '10',
    adminMaxBookingsUnlimited: true,
    adminMaxBookingDurationHours: '4',
    adminMaxDurationUnlimited: true,
    adminAdvanceBookingDays: '30',
    adminAdvanceBookingUnlimited: true,
    adminCancellationNoticeHours: '1',
    adminCancellationUnlimited: true,
    hasPeakHours: false,
    peakHoursApplyToAdmins: true,
    peakHoursSlots: {},
    peakHoursRestrictions: {
      maxBookingsPerWeek: '2',
      maxBookingsUnlimited: false,
      maxDurationHours: '1.5',
      maxDurationUnlimited: false,
    },
    hasWeekendPolicy: false,
    weekendPolicyApplyToAdmins: true,
    weekendPolicy: {
      maxBookingsPerWeekend: '2',
      maxBookingsUnlimited: false,
      maxDurationHours: '2',
      maxDurationUnlimited: false,
      advanceBookingDays: '7',
      advanceBookingUnlimited: false,
    },
    maxActiveReservationsEnabled: false,
    maxActiveReservations: '3',
    maxHoursPerWeekEnabled: false,
    maxHoursPerWeek: '10',
    noOverlappingReservations: true,
    minimumLeadTimeEnabled: false,
    minimumLeadTimeMinutes: '60',
    cancellationCooldownEnabled: false,
    cancellationCooldownMinutes: '30',
    strikeSystemEnabled: false,
    strikeThreshold: '3',
    strikeWindowDays: '30',
    strikeLockoutDays: '7',
    rateLimitEnabled: false,
    rateLimitMaxActions: '10',
    rateLimitWindowSeconds: '60',
    primeTimeRequiresTierEnabled: false,
    primeTimeAllowedTiers: [],
    primeTimeAdminOverride: true,
    courtWeeklyCapEnabled: false,
    courtWeeklyCap: '5',
    courtReleaseTimeEnabled: false,
    courtReleaseTime: '07:00',
    courtReleaseDaysAhead: '7',
    householdMaxMembersEnabled: false,
    householdMaxMembers: '6',
    householdMaxActiveEnabled: false,
    householdMaxActive: '4',
    householdPrimeCapEnabled: false,
    householdPrimeCap: '3',
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

  const [facilityData, setFacilityData] = useState<FacilityData>({
    name: '',
    type: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    description: '',
    amenities: [],
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
    addressWhitelistFile: null,
    addressWhitelistFileName: '',
    bookingRules: defaultBookingRules,
  });

  // Court management state
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [isAddingNewCourt, setIsAddingNewCourt] = useState(false);
  const [courtSaving, setCourtSaving] = useState(false);

  // Court schedule config state
  const [configuringCourtId, setConfiguringCourtId] = useState<string | null>(null);
  const [courtSchedule, setCourtSchedule] = useState<any[]>([]);
  const [courtScheduleLoading, setCourtScheduleLoading] = useState(false);
  const [courtScheduleSaving, setCourtScheduleSaving] = useState(false);

  // Blackout state
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [blackoutsLoading, setBlackoutsLoading] = useState(false);
  const [editingBlackout, setEditingBlackout] = useState<any | null>(null);
  const [isAddingBlackout, setIsAddingBlackout] = useState(false);
  const [blackoutSaving, setBlackoutSaving] = useState(false);

  // Tier state
  const [tiers, setTiers] = useState<any[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [editingTier, setEditingTier] = useState<any | null>(null);
  const [isAddingTier, setIsAddingTier] = useState(false);
  const [tierSaving, setTierSaving] = useState(false);

  const { selectedFacilityId: currentFacilityId } = useAppContext();

  useEffect(() => {
    if (currentFacilityId) {
      // loadFacilityData must complete before loadFacilityRules to avoid race condition
      loadFacilityData().then(() => loadFacilityRules());
      loadCourts();
      loadBlackouts();
      loadTiers();
    }
  }, [currentFacilityId]);

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
        const bookingRules: BookingRules = {
          generalRules: facility.generalRules || '',
          restrictionType: facility.restrictionType || 'account',
          maxBookingsPerWeek: facility.maxBookingsPerWeek === -1 ? '3' : String(facility.maxBookingsPerWeek || '3'),
          maxBookingsPerWeekUnlimited: facility.maxBookingsPerWeek === -1,
          maxBookingDurationHours: facility.maxBookingDurationHours === -1 ? '2' : String(facility.maxBookingDurationHours || '2'),
          maxBookingDurationUnlimited: facility.maxBookingDurationHours === -1,
          advanceBookingDays: facility.advanceBookingDays === -1 ? '14' : String(facility.advanceBookingDays || '14'),
          advanceBookingDaysUnlimited: facility.advanceBookingDays === -1,
          cancellationNoticeHours: facility.cancellationNoticeHours === 0 ? '24' : String(facility.cancellationNoticeHours || '24'),
          cancellationNoticeUnlimited: facility.cancellationNoticeHours === 0,
          restrictionsApplyToAdmins: facility.restrictionsApplyToAdmins !== false,
          adminMaxBookingsPerWeek: String(facility.adminRestrictions?.maxBookingsPerWeek || '10'),
          adminMaxBookingsUnlimited: facility.adminRestrictions?.maxBookingsPerWeek === -1,
          adminMaxBookingDurationHours: String(facility.adminRestrictions?.maxBookingDurationHours || '4'),
          adminMaxDurationUnlimited: facility.adminRestrictions?.maxBookingDurationHours === -1,
          adminAdvanceBookingDays: String(facility.adminRestrictions?.advanceBookingDays || '30'),
          adminAdvanceBookingUnlimited: facility.adminRestrictions?.advanceBookingDays === -1,
          adminCancellationNoticeHours: String(facility.adminRestrictions?.cancellationNoticeHours || '1'),
          adminCancellationUnlimited: facility.adminRestrictions?.cancellationNoticeHours === 0,
          hasPeakHours: !!facility.peakHoursPolicy?.enabled,
          peakHoursApplyToAdmins: facility.peakHoursPolicy?.applyToAdmins !== false,
          peakHoursSlots: facility.peakHoursPolicy?.timeSlots || {},
          peakHoursRestrictions: {
            maxBookingsPerWeek: String(facility.peakHoursPolicy?.maxBookingsPerWeek || '2'),
            maxBookingsUnlimited: facility.peakHoursPolicy?.maxBookingsPerWeek === -1,
            maxDurationHours: String(facility.peakHoursPolicy?.maxDurationHours || '1.5'),
            maxDurationUnlimited: facility.peakHoursPolicy?.maxDurationHours === -1,
          },
          hasWeekendPolicy: !!facility.weekendPolicy?.enabled,
          weekendPolicyApplyToAdmins: facility.weekendPolicy?.applyToAdmins !== false,
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
          cancellationCooldownEnabled: defaultBookingRules.cancellationCooldownEnabled,
          cancellationCooldownMinutes: defaultBookingRules.cancellationCooldownMinutes,
          strikeSystemEnabled: defaultBookingRules.strikeSystemEnabled,
          strikeThreshold: defaultBookingRules.strikeThreshold,
          strikeWindowDays: defaultBookingRules.strikeWindowDays,
          strikeLockoutDays: defaultBookingRules.strikeLockoutDays,
          rateLimitEnabled: defaultBookingRules.rateLimitEnabled,
          rateLimitMaxActions: defaultBookingRules.rateLimitMaxActions,
          rateLimitWindowSeconds: defaultBookingRules.rateLimitWindowSeconds,
          primeTimeRequiresTierEnabled: defaultBookingRules.primeTimeRequiresTierEnabled,
          primeTimeAllowedTiers: defaultBookingRules.primeTimeAllowedTiers,
          primeTimeAdminOverride: defaultBookingRules.primeTimeAdminOverride,
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
          type: facility.type || 'Tennis Facility',
          streetAddress,
          city,
          state,
          zipCode,
          phone: facility.phone || '',
          email: facility.email || '',
          description: facility.description || '',
          amenities: facility.amenities || [],
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
          addressWhitelistFile: null,
          addressWhitelistFileName: facility.addressWhitelistFileName || '',
          bookingRules,
        };
        setFacilityData(data);
        setOriginalData(data);
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

  const handleSave = async () => {
    if (!currentFacilityId) return;

    try {
      setSaving(true);
      const response = await adminApi.updateFacility(currentFacilityId, facilityData);

      if (response.success) {
        await syncBookingRulesToEngine();
        toast.success('Facility updated successfully');
        setIsEditing(false);
        setOriginalData(facilityData);
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

  const handlePeakHoursRestrictionsChange = (field: string, value: string | boolean) => {
    setFacilityData(prev => ({
      ...prev,
      bookingRules: {
        ...prev.bookingRules,
        peakHoursRestrictions: {
          ...prev.bookingRules.peakHoursRestrictions,
          [field]: value
        }
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
  const addPeakHourSlot = (day: string) => {
    setFacilityData(prev => {
      const currentSlots = prev.bookingRules.peakHoursSlots[day] || [];
      const newSlot: PeakHourSlot = {
        id: `${day}-${Date.now()}`,
        startTime: '17:00',
        endTime: '20:00'
      };
      return {
        ...prev,
        bookingRules: {
          ...prev.bookingRules,
          peakHoursSlots: {
            ...prev.bookingRules.peakHoursSlots,
            [day]: [...currentSlots, newSlot]
          }
        }
      };
    });
  };

  const removePeakHourSlot = (day: string, slotId: string) => {
    setFacilityData(prev => {
      const currentSlots = prev.bookingRules.peakHoursSlots[day] || [];
      const newSlots = currentSlots.filter(slot => slot.id !== slotId);
      const newPeakHoursSlots = { ...prev.bookingRules.peakHoursSlots };
      if (newSlots.length === 0) {
        delete newPeakHoursSlots[day];
      } else {
        newPeakHoursSlots[day] = newSlots;
      }
      return {
        ...prev,
        bookingRules: {
          ...prev.bookingRules,
          peakHoursSlots: newPeakHoursSlots
        }
      };
    });
  };

  const updatePeakHourSlot = (day: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setFacilityData(prev => {
      const currentSlots = prev.bookingRules.peakHoursSlots[day] || [];
      const newSlots = currentSlots.map(slot =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      );
      return {
        ...prev,
        bookingRules: {
          ...prev.bookingRules,
          peakHoursSlots: {
            ...prev.bookingRules.peakHoursSlots,
            [day]: newSlots
          }
        }
      };
    });
  };

  // Handle address whitelist file upload
  const handleAddressWhitelistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['.csv', '.xlsx', '.xls'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(fileExtension)) {
        toast.error('Please select a CSV or Excel file');
        return;
      }
      setFacilityData(prev => ({
        ...prev,
        addressWhitelistFile: file,
        addressWhitelistFileName: file.name
      }));
    }
  };

  const removeAddressWhitelist = () => {
    setFacilityData(prev => ({
      ...prev,
      addressWhitelistFile: null,
      addressWhitelistFileName: ''
    }));
  };

  // Court management functions
  const loadCourts = async () => {
    if (!currentFacilityId) return;

    try {
      setCourtsLoading(true);
      const response = await facilitiesApi.getCourts(currentFacilityId);

      if (response.success && response.data?.courts) {
        setCourts(response.data.courts);
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
    setEditingCourt({
      id: '',
      name: '',
      courtNumber: courts.length + 1,
      courtType: 'Tennis',
      surfaceType: 'Hard Court',
      isIndoor: false,
      hasLights: false,
      status: 'active',
    });
    setIsAddingNewCourt(true);
  };

  const handleEditCourt = (court: Court) => {
    setEditingCourt({ ...court });
    setIsAddingNewCourt(false);
  };

  const handleSaveCourt = async () => {
    if (!editingCourt || !currentFacilityId) return;

    try {
      setCourtSaving(true);
      const response = await adminApi.updateCourt(editingCourt.id, {
        name: editingCourt.name,
        courtNumber: editingCourt.courtNumber,
        surfaceType: editingCourt.surfaceType,
        courtType: editingCourt.courtType,
        isIndoor: editingCourt.isIndoor,
        hasLights: editingCourt.hasLights,
        status: editingCourt.status,
      });

      if (response.success) {
        toast.success('Court updated successfully');
        setEditingCourt(null);
        setIsAddingNewCourt(false);
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to update court');
      }
    } catch (error: any) {
      console.error('Error saving court:', error);
      toast.error('Failed to update court');
    } finally {
      setCourtSaving(false);
    }
  };

  const handleCancelCourtEdit = () => {
    setEditingCourt(null);
    setIsAddingNewCourt(false);
  };

  const handleDeleteCourt = async (id: string) => {
    if (!confirm('Are you sure you want to delete this court?')) return;

    try {
      const response = await adminApi.updateCourt(id, { status: 'inactive' });
      if (response.success) {
        toast.success('Court deactivated successfully');
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to deactivate court');
      }
    } catch (error: any) {
      console.error('Error deactivating court:', error);
      toast.error('Failed to deactivate court');
    }
  };

  // Court schedule config functions
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const dayNameToNumber: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  // Tier management functions
  const loadTiers = async () => {
    if (!currentFacilityId) return;
    try {
      setTiersLoading(true);
      const response = await tiersApi.getByFacility(currentFacilityId);
      if (response.success && response.data?.tiers) {
        setTiers(response.data.tiers);
      }
    } catch (error) {
      console.error('Error loading tiers:', error);
    } finally {
      setTiersLoading(false);
    }
  };

  const handleAddTier = () => {
    setIsAddingTier(true);
    setEditingTier({
      tier_name: '',
      tier_level: tiers.length + 1,
      advance_booking_days: 7,
      max_active_reservations: null,
      max_reservations_per_week: null,
      max_minutes_per_week: null,
      prime_time_eligible: true,
      prime_time_max_per_week: null,
      is_default: tiers.length === 0,
    });
  };

  const handleSaveTier = async () => {
    if (!currentFacilityId || !editingTier) return;
    if (!editingTier.tier_name?.trim()) {
      toast.error('Tier name is required');
      return;
    }
    try {
      setTierSaving(true);
      if (isAddingTier) {
        const response = await tiersApi.create({
          facilityId: currentFacilityId,
          tierName: editingTier.tier_name,
          tierLevel: editingTier.tier_level,
          advanceBookingDays: editingTier.advance_booking_days,
          maxActiveReservations: editingTier.max_active_reservations,
          maxReservationsPerWeek: editingTier.max_reservations_per_week,
          maxMinutesPerWeek: editingTier.max_minutes_per_week,
          primeTimeEligible: editingTier.prime_time_eligible,
          primeTimeMaxPerWeek: editingTier.prime_time_max_per_week,
          isDefault: editingTier.is_default,
        });
        if (response.success) {
          toast.success('Tier created');
        } else {
          toast.error(response.error || 'Failed to create tier');
          return;
        }
      } else {
        const response = await tiersApi.update(editingTier.id, {
          tierName: editingTier.tier_name,
          tierLevel: editingTier.tier_level,
          advanceBookingDays: editingTier.advance_booking_days,
          maxActiveReservations: editingTier.max_active_reservations,
          maxReservationsPerWeek: editingTier.max_reservations_per_week,
          maxMinutesPerWeek: editingTier.max_minutes_per_week,
          primeTimeEligible: editingTier.prime_time_eligible,
          primeTimeMaxPerWeek: editingTier.prime_time_max_per_week,
          isDefault: editingTier.is_default,
        });
        if (response.success) {
          toast.success('Tier updated');
        } else {
          toast.error(response.error || 'Failed to update tier');
          return;
        }
      }
      setEditingTier(null);
      setIsAddingTier(false);
      loadTiers();
    } catch (error) {
      console.error('Error saving tier:', error);
      toast.error('Failed to save tier');
    } finally {
      setTierSaving(false);
    }
  };

  const handleDeleteTier = async (tierId: string) => {
    if (!confirm('Delete this tier? Members assigned to it will lose their tier.')) return;
    try {
      const response = await tiersApi.delete(tierId);
      if (response.success) {
        toast.success('Tier deleted');
        loadTiers();
      } else {
        toast.error(response.error || 'Failed to delete tier');
      }
    } catch (error) {
      console.error('Error deleting tier:', error);
      toast.error('Failed to delete tier');
    }
  };

  const syncBookingRulesToEngine = async () => {
    if (!currentFacilityId) return;
    const rules = facilityData.bookingRules;
    const ruleConfigs: Array<{
      ruleCode: string;
      isEnabled: boolean;
      ruleConfig?: Record<string, any>;
    }> = [];

    // ACC-001: Max active reservations
    if (rules.maxActiveReservationsEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-001',
        isEnabled: true,
        ruleConfig: { max_active_reservations: parseInt(rules.maxActiveReservations) || 3 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-001', isEnabled: false });
    }

    // ACC-002: Max bookings per week
    ruleConfigs.push({
      ruleCode: 'ACC-002',
      isEnabled: !rules.maxBookingsPerWeekUnlimited,
      ruleConfig: { max_per_week: parseInt(rules.maxBookingsPerWeek) || 3 },
    });

    // ACC-003: Max hours per week
    if (rules.maxHoursPerWeekEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-003',
        isEnabled: true,
        ruleConfig: { max_minutes_per_week: (parseFloat(rules.maxHoursPerWeek) || 10) * 60 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-003', isEnabled: false });
    }

    // ACC-004: No overlapping reservations
    ruleConfigs.push({
      ruleCode: 'ACC-004',
      isEnabled: rules.noOverlappingReservations,
      ruleConfig: { allow_overlap: !rules.noOverlappingReservations },
    });

    // ACC-005: Advance booking window
    ruleConfigs.push({
      ruleCode: 'ACC-005',
      isEnabled: !rules.advanceBookingDaysUnlimited,
      ruleConfig: { max_days_ahead: parseInt(rules.advanceBookingDays) || 14 },
    });

    // ACC-006: Minimum lead time
    if (rules.minimumLeadTimeEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-006',
        isEnabled: true,
        ruleConfig: { min_minutes_before_start: parseInt(rules.minimumLeadTimeMinutes) || 60 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-006', isEnabled: false });
    }

    // ACC-007: Cancellation cooldown
    if (rules.cancellationCooldownEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-007',
        isEnabled: true,
        ruleConfig: { cooldown_minutes: parseInt(rules.cancellationCooldownMinutes) || 30 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-007', isEnabled: false });
    }

    // ACC-008: Cancellation notice
    ruleConfigs.push({
      ruleCode: 'ACC-008',
      isEnabled: !rules.cancellationNoticeUnlimited,
      ruleConfig: { late_cancel_cutoff_minutes: (parseInt(rules.cancellationNoticeHours) || 24) * 60 },
    });

    // ACC-009: Strike system
    if (rules.strikeSystemEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-009',
        isEnabled: true,
        ruleConfig: {
          strike_threshold: parseInt(rules.strikeThreshold) || 3,
          strike_window_days: parseInt(rules.strikeWindowDays) || 30,
          lockout_duration_days: parseInt(rules.strikeLockoutDays) || 7,
        },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-009', isEnabled: false });
    }

    // ACC-011: Rate limiting
    if (rules.rateLimitEnabled) {
      ruleConfigs.push({
        ruleCode: 'ACC-011',
        isEnabled: true,
        ruleConfig: {
          max_actions: parseInt(rules.rateLimitMaxActions) || 10,
          window_seconds: parseInt(rules.rateLimitWindowSeconds) || 60,
        },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-011', isEnabled: false });
    }

    // CRT-005: Max booking duration
    ruleConfigs.push({
      ruleCode: 'CRT-005',
      isEnabled: !rules.maxBookingDurationUnlimited,
      ruleConfig: { max_duration_minutes: (parseFloat(rules.maxBookingDurationHours) || 2) * 60 },
    });

    // Peak hours rules
    if (rules.hasPeakHours) {
      ruleConfigs.push({
        ruleCode: 'ACC-010',
        isEnabled: !rules.peakHoursRestrictions.maxBookingsUnlimited,
        ruleConfig: { max_prime_per_week: parseInt(rules.peakHoursRestrictions.maxBookingsPerWeek) || 2 },
      });
      ruleConfigs.push({
        ruleCode: 'CRT-002',
        isEnabled: !rules.peakHoursRestrictions.maxDurationUnlimited,
        ruleConfig: { max_minutes_prime: (parseFloat(rules.peakHoursRestrictions.maxDurationHours) || 1.5) * 60 },
      });
      const primeWindows = Object.entries(rules.peakHoursSlots).flatMap(([day, slots]) =>
        slots.map(slot => ({
          day_of_week: dayNameToNumber[day],
          start_time: slot.startTime,
          end_time: slot.endTime,
        }))
      );
      ruleConfigs.push({
        ruleCode: 'CRT-001',
        isEnabled: true,
        ruleConfig: { prime_windows: primeWindows },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'ACC-010', isEnabled: false });
      ruleConfigs.push({ ruleCode: 'CRT-002', isEnabled: false });
      ruleConfigs.push({ ruleCode: 'CRT-001', isEnabled: false });
    }

    // CRT-003: Prime time tier restriction
    if (rules.primeTimeRequiresTierEnabled) {
      ruleConfigs.push({
        ruleCode: 'CRT-003',
        isEnabled: true,
        ruleConfig: {
          allowed_tiers: rules.primeTimeAllowedTiers,
          allow_admin_override: rules.primeTimeAdminOverride,
        },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'CRT-003', isEnabled: false });
    }

    // CRT-010: Court weekly cap
    if (rules.courtWeeklyCapEnabled) {
      ruleConfigs.push({
        ruleCode: 'CRT-010',
        isEnabled: true,
        ruleConfig: { max_per_week_per_account: parseInt(rules.courtWeeklyCap) || 5 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'CRT-010', isEnabled: false });
    }

    // CRT-011: Court release time
    if (rules.courtReleaseTimeEnabled) {
      ruleConfigs.push({
        ruleCode: 'CRT-011',
        isEnabled: true,
        ruleConfig: {
          release_time_local: rules.courtReleaseTime || '07:00',
          days_ahead: parseInt(rules.courtReleaseDaysAhead) || 7,
        },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'CRT-011', isEnabled: false });
    }

    // HH-001: Max members per address
    if (rules.householdMaxMembersEnabled) {
      ruleConfigs.push({
        ruleCode: 'HH-001',
        isEnabled: true,
        ruleConfig: { max_members: parseInt(rules.householdMaxMembers) || 6, verification_method: 'admin_approval' },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'HH-001', isEnabled: false });
    }

    // HH-002: Household max active reservations
    if (rules.householdMaxActiveEnabled) {
      ruleConfigs.push({
        ruleCode: 'HH-002',
        isEnabled: true,
        ruleConfig: { max_active_household: parseInt(rules.householdMaxActive) || 4 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'HH-002', isEnabled: false });
    }

    // HH-003: Household prime-time cap
    if (rules.householdPrimeCapEnabled) {
      ruleConfigs.push({
        ruleCode: 'HH-003',
        isEnabled: true,
        ruleConfig: { max_prime_per_week_household: parseInt(rules.householdPrimeCap) || 3 },
      });
    } else {
      ruleConfigs.push({ ruleCode: 'HH-003', isEnabled: false });
    }

    try {
      const response = await rulesApi.bulkUpdate(currentFacilityId, ruleConfigs);
      if (!response.success) {
        console.error('Error syncing rules to engine:', response.error);
        toast.error('Failed to save booking rules to engine. Please try saving again.');
      }
    } catch (error) {
      console.error('Error syncing rules to engine:', error);
      toast.error('Failed to save booking rules to engine. Please try saving again.');
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

          const acc001 = ruleMap.get('ACC-001') as any;
          if (acc001) {
            updated.bookingRules.maxActiveReservationsEnabled = !!acc001.isEnabled;
            if (acc001.effectiveConfig?.max_active_reservations) {
              updated.bookingRules.maxActiveReservations = String(acc001.effectiveConfig.max_active_reservations);
            }
          }

          const acc002 = ruleMap.get('ACC-002') as any;
          if (acc002) {
            updated.bookingRules.maxBookingsPerWeekUnlimited = !acc002.isEnabled;
            if (acc002.effectiveConfig?.max_per_week) {
              updated.bookingRules.maxBookingsPerWeek = String(acc002.effectiveConfig.max_per_week);
            }
          }

          const acc003 = ruleMap.get('ACC-003') as any;
          if (acc003) {
            updated.bookingRules.maxHoursPerWeekEnabled = !!acc003.isEnabled;
            if (acc003.effectiveConfig?.max_minutes_per_week) {
              updated.bookingRules.maxHoursPerWeek = String(acc003.effectiveConfig.max_minutes_per_week / 60);
            }
          }

          const acc004 = ruleMap.get('ACC-004') as any;
          if (acc004) {
            updated.bookingRules.noOverlappingReservations = !!acc004.isEnabled;
          }

          const acc005 = ruleMap.get('ACC-005') as any;
          if (acc005) {
            updated.bookingRules.advanceBookingDaysUnlimited = !acc005.isEnabled;
            if (acc005.effectiveConfig?.max_days_ahead) {
              updated.bookingRules.advanceBookingDays = String(acc005.effectiveConfig.max_days_ahead);
            }
          }

          const acc006 = ruleMap.get('ACC-006') as any;
          if (acc006) {
            updated.bookingRules.minimumLeadTimeEnabled = !!acc006.isEnabled;
            if (acc006.effectiveConfig?.min_minutes_before_start) {
              updated.bookingRules.minimumLeadTimeMinutes = String(acc006.effectiveConfig.min_minutes_before_start);
            }
          }

          const acc007 = ruleMap.get('ACC-007') as any;
          if (acc007) {
            updated.bookingRules.cancellationCooldownEnabled = !!acc007.isEnabled;
            if (acc007.effectiveConfig?.cooldown_minutes) {
              updated.bookingRules.cancellationCooldownMinutes = String(acc007.effectiveConfig.cooldown_minutes);
            }
          }

          const acc008 = ruleMap.get('ACC-008') as any;
          if (acc008) {
            updated.bookingRules.cancellationNoticeUnlimited = !acc008.isEnabled;
            if (acc008.effectiveConfig?.late_cancel_cutoff_minutes) {
              updated.bookingRules.cancellationNoticeHours = String(acc008.effectiveConfig.late_cancel_cutoff_minutes / 60);
            }
          }

          const acc009 = ruleMap.get('ACC-009') as any;
          if (acc009) {
            updated.bookingRules.strikeSystemEnabled = !!acc009.isEnabled;
            if (acc009.effectiveConfig) {
              if (acc009.effectiveConfig.strike_threshold) {
                updated.bookingRules.strikeThreshold = String(acc009.effectiveConfig.strike_threshold);
              }
              if (acc009.effectiveConfig.strike_window_days) {
                updated.bookingRules.strikeWindowDays = String(acc009.effectiveConfig.strike_window_days);
              }
              if (acc009.effectiveConfig.lockout_duration_days) {
                updated.bookingRules.strikeLockoutDays = String(acc009.effectiveConfig.lockout_duration_days);
              }
            }
          }

          const acc010 = ruleMap.get('ACC-010') as any;
          if (acc010) {
            updated.bookingRules.peakHoursRestrictions = {
              ...updated.bookingRules.peakHoursRestrictions,
              maxBookingsUnlimited: !acc010.isEnabled,
            };
            if (acc010.effectiveConfig?.max_prime_per_week) {
              updated.bookingRules.peakHoursRestrictions.maxBookingsPerWeek = String(acc010.effectiveConfig.max_prime_per_week);
            }
          }

          const acc011 = ruleMap.get('ACC-011') as any;
          if (acc011) {
            updated.bookingRules.rateLimitEnabled = !!acc011.isEnabled;
            if (acc011.effectiveConfig) {
              if (acc011.effectiveConfig.max_actions) {
                updated.bookingRules.rateLimitMaxActions = String(acc011.effectiveConfig.max_actions);
              }
              if (acc011.effectiveConfig.window_seconds) {
                updated.bookingRules.rateLimitWindowSeconds = String(acc011.effectiveConfig.window_seconds);
              }
            }
          }

          const crt005 = ruleMap.get('CRT-005') as any;
          if (crt005) {
            updated.bookingRules.maxBookingDurationUnlimited = !crt005.isEnabled;
            if (crt005.effectiveConfig?.max_duration_minutes) {
              updated.bookingRules.maxBookingDurationHours = String(crt005.effectiveConfig.max_duration_minutes / 60);
            }
          }

          const crt002 = ruleMap.get('CRT-002') as any;
          if (crt002) {
            updated.bookingRules.peakHoursRestrictions = {
              ...updated.bookingRules.peakHoursRestrictions,
              maxDurationUnlimited: !crt002.isEnabled,
            };
            if (crt002.effectiveConfig?.max_minutes_prime) {
              updated.bookingRules.peakHoursRestrictions.maxDurationHours = String(crt002.effectiveConfig.max_minutes_prime / 60);
            }
          }

          const crt003 = ruleMap.get('CRT-003') as any;
          if (crt003) {
            updated.bookingRules.primeTimeRequiresTierEnabled = !!crt003.isEnabled;
            if (crt003.effectiveConfig) {
              if (crt003.effectiveConfig.allowed_tiers) {
                updated.bookingRules.primeTimeAllowedTiers = crt003.effectiveConfig.allowed_tiers;
              }
              if (crt003.effectiveConfig.allow_admin_override !== undefined) {
                updated.bookingRules.primeTimeAdminOverride = crt003.effectiveConfig.allow_admin_override;
              }
            }
          }

          const crt010 = ruleMap.get('CRT-010') as any;
          if (crt010) {
            updated.bookingRules.courtWeeklyCapEnabled = !!crt010.isEnabled;
            if (crt010.effectiveConfig?.max_per_week_per_account) {
              updated.bookingRules.courtWeeklyCap = String(crt010.effectiveConfig.max_per_week_per_account);
            }
          }

          const crt011 = ruleMap.get('CRT-011') as any;
          if (crt011) {
            updated.bookingRules.courtReleaseTimeEnabled = !!crt011.isEnabled;
            if (crt011.effectiveConfig) {
              if (crt011.effectiveConfig.release_time_local) {
                updated.bookingRules.courtReleaseTime = crt011.effectiveConfig.release_time_local;
              }
              if (crt011.effectiveConfig.days_ahead) {
                updated.bookingRules.courtReleaseDaysAhead = String(crt011.effectiveConfig.days_ahead);
              }
            }
          }

          const hh001 = ruleMap.get('HH-001') as any;
          if (hh001) {
            updated.bookingRules.householdMaxMembersEnabled = !!hh001.isEnabled;
            if (hh001.effectiveConfig?.max_members) {
              updated.bookingRules.householdMaxMembers = String(hh001.effectiveConfig.max_members);
            }
          }

          const hh002 = ruleMap.get('HH-002') as any;
          if (hh002) {
            updated.bookingRules.householdMaxActiveEnabled = !!hh002.isEnabled;
            if (hh002.effectiveConfig?.max_active_household) {
              updated.bookingRules.householdMaxActive = String(hh002.effectiveConfig.max_active_household);
            }
          }

          const hh003 = ruleMap.get('HH-003') as any;
          if (hh003) {
            updated.bookingRules.householdPrimeCapEnabled = !!hh003.isEnabled;
            if (hh003.effectiveConfig?.max_prime_per_week_household) {
              updated.bookingRules.householdPrimeCap = String(hh003.effectiveConfig.max_prime_per_week_household);
            }
          }

          return updated;
        });
      }
    } catch (error) {
      console.error('Error loading facility rules:', error);
    }
  };

  const getCourtStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCourtStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-medium text-gray-900">Facility Management</h1>
              <TabsList className="flex">
                <TabsTrigger value="details" className="px-4">Facility Details</TabsTrigger>
                <TabsTrigger value="rules" className="px-4">Booking Rules</TabsTrigger>
                <TabsTrigger value="courts" className="px-4">Court Management</TabsTrigger>
              </TabsList>
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Tennis Club">Tennis Club</SelectItem>
                          <SelectItem value="Tennis Facility">Tennis Facility</SelectItem>
                          <SelectItem value="Pickleball Club">Pickleball Club</SelectItem>
                          <SelectItem value="Multi-Sport Club">Multi-Sport Club</SelectItem>
                          <SelectItem value="HOA Community">HOA Community</SelectItem>
                          <SelectItem value="Recreation Center">Recreation Center</SelectItem>
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
                              if (file) {
                                if (facilityData.facilityImagePreview && facilityData.facilityImagePreview.startsWith('blob:')) {
                                  URL.revokeObjectURL(facilityData.facilityImagePreview);
                                }
                                const previewUrl = URL.createObjectURL(file);
                                setFacilityData({
                                  ...facilityData,
                                  facilityImage: file,
                                  facilityImagePreview: previewUrl,
                                  logoUrl: previewUrl
                                });
                              }
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
                      <Label htmlFor="streetAddress">Street Address</Label>
                      <Input
                        id="streetAddress"
                        value={facilityData.streetAddress}
                        onChange={(e) => setFacilityData({ ...facilityData, streetAddress: e.target.value })}
                        disabled={!isEditing}
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
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
                </Card>

                {/* Operating Hours */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Operating Hours
                    </CardTitle>
                    <CardDescription>Set your facility's operating hours for each day</CardDescription>
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
                          <div key={day} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                            <div className="w-28 font-medium capitalize">{day}</div>
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                type="time"
                                value={facilityData.operatingHours[day]?.open || '08:00'}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'open', e.target.value)}
                                disabled={facilityData.operatingHours[day]?.closed}
                                className="w-32"
                              />
                              <span className="text-gray-500">to</span>
                              <Input
                                type="time"
                                value={facilityData.operatingHours[day]?.close || '20:00'}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOperatingHoursChange(day, 'close', e.target.value)}
                                disabled={facilityData.operatingHours[day]?.closed}
                                className="w-32"
                              />
                            </div>
                            <div className="flex items-center gap-2">
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
                </Card>

                {/* Address Whitelist */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Address Whitelist
                    </CardTitle>
                    <CardDescription>Upload a list of approved addresses (CSV or Excel)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {facilityData.addressWhitelistFileName ? (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm">{facilityData.addressWhitelistFileName}</span>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removeAddressWhitelist}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No address whitelist uploaded</p>
                    )}
                    {isEditing && !facilityData.addressWhitelistFileName && (
                      <div>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleAddressWhitelistChange}
                          className="hidden"
                          id="addressWhitelist"
                        />
                        <label htmlFor="addressWhitelist">
                          <Button variant="outline" asChild className="cursor-pointer">
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Whitelist
                            </span>
                          </Button>
                        </label>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Amenities */}
                <Card>
                  <CardHeader>
                    <CardTitle>Amenities</CardTitle>
                    <CardDescription>Available facilities and features</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {facilityData.amenities && facilityData.amenities.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {facilityData.amenities.map((amenity: string, index: number) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No amenities listed</p>
                    )}
                  </CardContent>
                </Card>
              </div>
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

              {/* Membership Tiers */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Membership Tiers
                      </CardTitle>
                      <CardDescription>Define membership levels with different booking privileges</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleAddTier} disabled={editingTier !== null}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Tier
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tiersLoading ? (
                    <div className="text-center py-4 text-gray-500 text-sm">Loading tiers...</div>
                  ) : tiers.length === 0 && !editingTier ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No membership tiers configured. All members will have the same booking privileges.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tiers.map((tier) => (
                        <div
                          key={tier.id}
                          className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">Level {tier.tier_level}</Badge>
                              <span className="font-medium text-sm">{tier.tier_name}</span>
                              {tier.is_default && (
                                <Badge className="bg-green-100 text-green-700 text-[10px]">Default</Badge>
                              )}
                            </div>
                            <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
                              <span>{tier.advance_booking_days}d advance</span>
                              <span>{tier.max_active_reservations ?? 'No limit'} active</span>
                              <span>{tier.max_reservations_per_week ?? 'No limit'}/wk</span>
                              {tier.prime_time_eligible ? (
                                <span className="text-green-600">Prime eligible</span>
                              ) : (
                                <span className="text-red-600">No prime</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => { setEditingTier({ ...tier }); setIsAddingTier(false); }}
                              disabled={editingTier !== null}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteTier(tier.id)}
                              disabled={editingTier !== null}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tier Edit/Add Form */}
                  {editingTier && (
                    <div className="mt-4 p-4 border-2 border-green-200 bg-green-50 rounded-lg space-y-4">
                      <h4 className="font-medium text-sm">{isAddingTier ? 'Add New Tier' : 'Edit Tier'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Tier Name</Label>
                          <Input
                            value={editingTier.tier_name}
                            onChange={(e) => setEditingTier({ ...editingTier, tier_name: e.target.value })}
                            placeholder="e.g., Gold"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Level (1=lowest)</Label>
                          <Input
                            type="number"
                            value={editingTier.tier_level}
                            onChange={(e) => setEditingTier({ ...editingTier, tier_level: parseInt(e.target.value) || 1 })}
                            min="1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Advance Booking (days)</Label>
                          <Input
                            type="number"
                            value={editingTier.advance_booking_days}
                            onChange={(e) => setEditingTier({ ...editingTier, advance_booking_days: parseInt(e.target.value) || 7 })}
                            min="1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Active Reservations</Label>
                          <Input
                            type="number"
                            value={editingTier.max_active_reservations ?? ''}
                            onChange={(e) => setEditingTier({ ...editingTier, max_active_reservations: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="Unlimited"
                            min="1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Bookings/Week</Label>
                          <Input
                            type="number"
                            value={editingTier.max_reservations_per_week ?? ''}
                            onChange={(e) => setEditingTier({ ...editingTier, max_reservations_per_week: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="Unlimited"
                            min="1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Hours/Week</Label>
                          <Input
                            type="number"
                            value={editingTier.max_minutes_per_week ? editingTier.max_minutes_per_week / 60 : ''}
                            onChange={(e) => setEditingTier({ ...editingTier, max_minutes_per_week: e.target.value ? parseFloat(e.target.value) * 60 : null })}
                            placeholder="Unlimited"
                            min="1"
                            step="0.5"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editingTier.prime_time_eligible}
                            onCheckedChange={(checked: boolean) => setEditingTier({ ...editingTier, prime_time_eligible: checked })}
                          />
                          <Label className="text-xs">Prime Time Eligible</Label>
                        </div>
                        {editingTier.prime_time_eligible && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Prime/Week:</Label>
                            <Input
                              type="number"
                              value={editingTier.prime_time_max_per_week ?? ''}
                              onChange={(e) => setEditingTier({ ...editingTier, prime_time_max_per_week: e.target.value ? parseInt(e.target.value) : null })}
                              placeholder="Unlimited"
                              className="w-24"
                              min="1"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editingTier.is_default}
                            onCheckedChange={(checked: boolean) => setEditingTier({ ...editingTier, is_default: checked })}
                          />
                          <Label className="text-xs">Default Tier</Label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveTier} disabled={tierSaving}>
                          {tierSaving ? 'Saving...' : 'Save Tier'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingTier(null); setIsAddingTier(false); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* General Rules */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      General Rules
                    </CardTitle>
                    <CardDescription>Facility rules and guidelines for members</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={facilityData.bookingRules.generalRules}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleBookingRulesChange('generalRules', e.target.value)}
                      disabled={!isEditing}
                      rows={6}
                      placeholder="Enter your facility rules and guidelines..."
                    />
                  </CardContent>
                </Card>

                {/* Restriction Type */}
                <Card>
                  <CardHeader>
                    <CardTitle>Restriction Type</CardTitle>
                    <CardDescription>How booking limits are applied</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id="restrictionAccount"
                          name="restrictionType"
                          value="account"
                          checked={facilityData.bookingRules.restrictionType === 'account'}
                          onChange={() => handleBookingRulesChange('restrictionType', 'account')}
                          disabled={!isEditing}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="restrictionAccount">Per Account</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id="restrictionAddress"
                          name="restrictionType"
                          value="address"
                          checked={facilityData.bookingRules.restrictionType === 'address'}
                          onChange={() => handleBookingRulesChange('restrictionType', 'address')}
                          disabled={!isEditing}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="restrictionAddress">Per Address</Label>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      {facilityData.bookingRules.restrictionType === 'account'
                        ? 'Booking limits apply to each individual user account'
                        : 'Booking limits apply to all accounts sharing the same address'}
                    </p>
                  </CardContent>
                </Card>

                {/* User Booking Restrictions */}
                <Card>
                  <CardHeader>
                    <CardTitle>User Booking Restrictions</CardTitle>
                    <CardDescription>Limits applied to regular members</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Max Bookings Per Week</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={facilityData.bookingRules.maxBookingsPerWeekUnlimited}
                            onCheckedChange={(checked: boolean) => handleBookingRulesChange('maxBookingsPerWeekUnlimited', checked)}
                            disabled={!isEditing}
                          />
                          <span className="text-sm text-gray-500">Unlimited</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        value={facilityData.bookingRules.maxBookingsPerWeek}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('maxBookingsPerWeek', e.target.value)}
                        disabled={!isEditing || facilityData.bookingRules.maxBookingsPerWeekUnlimited}
                        min="1"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Max Booking Duration (hours)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={facilityData.bookingRules.maxBookingDurationUnlimited}
                            onCheckedChange={(checked: boolean) => handleBookingRulesChange('maxBookingDurationUnlimited', checked)}
                            disabled={!isEditing}
                          />
                          <span className="text-sm text-gray-500">Unlimited</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        value={facilityData.bookingRules.maxBookingDurationHours}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('maxBookingDurationHours', e.target.value)}
                        disabled={!isEditing || facilityData.bookingRules.maxBookingDurationUnlimited}
                        min="0.5"
                        step="0.5"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Advance Booking (days)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={facilityData.bookingRules.advanceBookingDaysUnlimited}
                            onCheckedChange={(checked: boolean) => handleBookingRulesChange('advanceBookingDaysUnlimited', checked)}
                            disabled={!isEditing}
                          />
                          <span className="text-sm text-gray-500">Unlimited</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        value={facilityData.bookingRules.advanceBookingDays}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('advanceBookingDays', e.target.value)}
                        disabled={!isEditing || facilityData.bookingRules.advanceBookingDaysUnlimited}
                        min="1"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Cancellation Notice (hours)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={facilityData.bookingRules.cancellationNoticeUnlimited}
                            onCheckedChange={(checked: boolean) => handleBookingRulesChange('cancellationNoticeUnlimited', checked)}
                            disabled={!isEditing}
                          />
                          <span className="text-sm text-gray-500">No notice required</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        value={facilityData.bookingRules.cancellationNoticeHours}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('cancellationNoticeHours', e.target.value)}
                        disabled={!isEditing || facilityData.bookingRules.cancellationNoticeUnlimited}
                        min="0"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Advanced Account Rules */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Advanced Account Rules
                    </CardTitle>
                    <CardDescription>Additional booking constraints and account-level policies</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* ACC-001: Max Active Reservations */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Max Active Reservations</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.maxActiveReservationsEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('maxActiveReservationsEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={facilityData.bookingRules.maxActiveReservations}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('maxActiveReservations', e.target.value)}
                          disabled={!isEditing || !facilityData.bookingRules.maxActiveReservationsEnabled}
                          min="1"
                        />
                        <p className="text-xs text-gray-500">Max upcoming reservations a user can have at once</p>
                      </div>

                      {/* ACC-003: Max Hours Per Week */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Max Hours Per Week</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.maxHoursPerWeekEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('maxHoursPerWeekEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={facilityData.bookingRules.maxHoursPerWeek}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('maxHoursPerWeek', e.target.value)}
                          disabled={!isEditing || !facilityData.bookingRules.maxHoursPerWeekEnabled}
                          min="1"
                          step="0.5"
                        />
                        <p className="text-xs text-gray-500">Total booking hours allowed per week</p>
                      </div>

                      {/* ACC-004: No Overlapping Reservations */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Prevent Overlapping Reservations</Label>
                          <Switch
                            checked={facilityData.bookingRules.noOverlappingReservations}
                            onCheckedChange={(checked: boolean) => handleBookingRulesChange('noOverlappingReservations', checked)}
                            disabled={!isEditing}
                          />
                        </div>
                        <p className="text-xs text-gray-500">Block users from booking overlapping time slots</p>
                      </div>

                      {/* ACC-006: Minimum Lead Time */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Minimum Lead Time (minutes)</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.minimumLeadTimeEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('minimumLeadTimeEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={facilityData.bookingRules.minimumLeadTimeMinutes}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('minimumLeadTimeMinutes', e.target.value)}
                          disabled={!isEditing || !facilityData.bookingRules.minimumLeadTimeEnabled}
                          min="0"
                        />
                        <p className="text-xs text-gray-500">Minimum minutes before start time to allow booking</p>
                      </div>

                      {/* ACC-007: Cancellation Cooldown */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Cancellation Cooldown (minutes)</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.cancellationCooldownEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('cancellationCooldownEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={facilityData.bookingRules.cancellationCooldownMinutes}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('cancellationCooldownMinutes', e.target.value)}
                          disabled={!isEditing || !facilityData.bookingRules.cancellationCooldownEnabled}
                          min="0"
                        />
                        <p className="text-xs text-gray-500">Cooldown period after cancellation before rebooking</p>
                      </div>

                      {/* ACC-011: Rate Limiting */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label className="flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" />
                            Rate Limiting
                          </Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.rateLimitEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('rateLimitEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Max Actions</Label>
                            <Input
                              type="number"
                              value={facilityData.bookingRules.rateLimitMaxActions}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('rateLimitMaxActions', e.target.value)}
                              disabled={!isEditing || !facilityData.bookingRules.rateLimitEnabled}
                              min="1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Window (seconds)</Label>
                            <Input
                              type="number"
                              value={facilityData.bookingRules.rateLimitWindowSeconds}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('rateLimitWindowSeconds', e.target.value)}
                              disabled={!isEditing || !facilityData.bookingRules.rateLimitEnabled}
                              min="1"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">Limit booking actions to prevent abuse</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* No-Show / Strike System */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        No-Show / Strike System
                      </span>
                      <Switch
                        checked={facilityData.bookingRules.strikeSystemEnabled}
                        onCheckedChange={(checked: boolean) => handleBookingRulesChange('strikeSystemEnabled', checked)}
                        disabled={!isEditing}
                      />
                    </CardTitle>
                    <CardDescription>Automatically track no-shows and late cancellations with escalating penalties</CardDescription>
                  </CardHeader>
                  {facilityData.bookingRules.strikeSystemEnabled && (
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Strike Threshold</Label>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.strikeThreshold}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('strikeThreshold', e.target.value)}
                            disabled={!isEditing}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Strikes before lockout</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Window (days)</Label>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.strikeWindowDays}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('strikeWindowDays', e.target.value)}
                            disabled={!isEditing}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Rolling window for counting strikes</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Lockout Duration (days)</Label>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.strikeLockoutDays}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('strikeLockoutDays', e.target.value)}
                            disabled={!isEditing}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Days locked out after threshold</p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Court Scheduling Rules */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Court Scheduling Rules
                    </CardTitle>
                    <CardDescription>Per-court scheduling constraints and release policies</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* CRT-003: Prime Time Tier Restriction */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Prime Time Tier Restriction</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.primeTimeRequiresTierEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('primeTimeRequiresTierEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        {facilityData.bookingRules.primeTimeRequiresTierEnabled && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs">Allowed Tiers (comma-separated names)</Label>
                              <Input
                                value={facilityData.bookingRules.primeTimeAllowedTiers.join(', ')}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                  const tierNames = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                  handleBookingRulesChange('primeTimeAllowedTiers', tierNames);
                                }}
                                placeholder="e.g. Premium, Gold"
                                disabled={!isEditing}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.primeTimeAdminOverride}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('primeTimeAdminOverride', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-xs text-gray-500">Admins can override</span>
                            </div>
                          </>
                        )}
                        <p className="text-xs text-gray-500">Restrict prime-time booking to specific membership tiers</p>
                      </div>

                      {/* CRT-010: Court Weekly Cap */}
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <Label>Per-Court Weekly Cap</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.courtWeeklyCapEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('courtWeeklyCapEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          value={facilityData.bookingRules.courtWeeklyCap}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtWeeklyCap', e.target.value)}
                          disabled={!isEditing || !facilityData.bookingRules.courtWeeklyCapEnabled}
                          min="1"
                        />
                        <p className="text-xs text-gray-500">Max bookings per account per week on the same court</p>
                      </div>

                      {/* CRT-011: Court Release Time */}
                      <div className="space-y-2 p-3 border rounded-lg md:col-span-2">
                        <div className="flex justify-between items-center">
                          <Label>Booking Release Schedule</Label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={facilityData.bookingRules.courtReleaseTimeEnabled}
                              onCheckedChange={(checked: boolean) => handleBookingRulesChange('courtReleaseTimeEnabled', checked)}
                              disabled={!isEditing}
                            />
                            <span className="text-sm text-gray-500">Enabled</span>
                          </div>
                        </div>
                        {facilityData.bookingRules.courtReleaseTimeEnabled && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Release Time</Label>
                              <Input
                                type="time"
                                value={facilityData.bookingRules.courtReleaseTime}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtReleaseTime', e.target.value)}
                                disabled={!isEditing}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Days Ahead</Label>
                              <Input
                                type="number"
                                value={facilityData.bookingRules.courtReleaseDaysAhead}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('courtReleaseDaysAhead', e.target.value)}
                                disabled={!isEditing}
                                min="1"
                              />
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-gray-500">Courts become bookable at a specific time, X days ahead</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Household Rules - only show when restriction type is address-based */}
                {facilityData.bookingRules.restrictionType === 'address' && (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Home className="h-5 w-5" />
                        Household Rules
                      </CardTitle>
                      <CardDescription>Limits applied per household address (address-based restriction mode)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* HH-001: Max Members Per Address */}
                        <div className="space-y-2 p-3 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <Label>Max Members Per Address</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.householdMaxMembersEnabled}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('householdMaxMembersEnabled', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Enabled</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.householdMaxMembers}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('householdMaxMembers', e.target.value)}
                            disabled={!isEditing || !facilityData.bookingRules.householdMaxMembersEnabled}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Limits how many accounts can be registered at a single address</p>
                        </div>

                        {/* HH-002: Household Max Active Reservations */}
                        <div className="space-y-2 p-3 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <Label>Household Max Active Reservations</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.householdMaxActiveEnabled}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('householdMaxActiveEnabled', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Enabled</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.householdMaxActive}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('householdMaxActive', e.target.value)}
                            disabled={!isEditing || !facilityData.bookingRules.householdMaxActiveEnabled}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Max active reservations across all accounts at this address</p>
                        </div>

                        {/* HH-003: Household Prime-Time Cap */}
                        <div className="space-y-2 p-3 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <Label>Household Prime-Time Cap</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.householdPrimeCapEnabled}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('householdPrimeCapEnabled', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Enabled</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.householdPrimeCap}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('householdPrimeCap', e.target.value)}
                            disabled={!isEditing || !facilityData.bookingRules.householdPrimeCapEnabled}
                            min="1"
                          />
                          <p className="text-xs text-gray-500">Max prime-time bookings per week for all accounts at this address</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Admin Restrictions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Admin Restrictions</CardTitle>
                    <CardDescription>Limits applied to facility administrators</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <Label>Same restrictions as users</Label>
                      <Switch
                        checked={facilityData.bookingRules.restrictionsApplyToAdmins}
                        onCheckedChange={(checked: boolean) => handleBookingRulesChange('restrictionsApplyToAdmins', checked)}
                        disabled={!isEditing}
                      />
                    </div>

                    {!facilityData.bookingRules.restrictionsApplyToAdmins && (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Bookings Per Week</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.adminMaxBookingsUnlimited}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('adminMaxBookingsUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.adminMaxBookingsPerWeek}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('adminMaxBookingsPerWeek', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.adminMaxBookingsUnlimited}
                            min="1"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Booking Duration (hours)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.adminMaxDurationUnlimited}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('adminMaxDurationUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.adminMaxBookingDurationHours}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('adminMaxBookingDurationHours', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.adminMaxDurationUnlimited}
                            min="0.5"
                            step="0.5"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Advance Booking (days)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.adminAdvanceBookingUnlimited}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('adminAdvanceBookingUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.adminAdvanceBookingDays}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('adminAdvanceBookingDays', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.adminAdvanceBookingUnlimited}
                            min="1"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Cancellation Notice (hours)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.adminCancellationUnlimited}
                                onCheckedChange={(checked: boolean) => handleBookingRulesChange('adminCancellationUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">No notice required</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.adminCancellationNoticeHours}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBookingRulesChange('adminCancellationNoticeHours', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.adminCancellationUnlimited}
                            min="0"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Peak Hours Policy */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Peak Hours Policy</span>
                      <Switch
                        checked={facilityData.bookingRules.hasPeakHours}
                        onCheckedChange={(checked: boolean) => handleBookingRulesChange('hasPeakHours', checked)}
                        disabled={!isEditing}
                      />
                    </CardTitle>
                    <CardDescription>Set different restrictions during peak hours</CardDescription>
                  </CardHeader>
                  {facilityData.bookingRules.hasPeakHours && (
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <Label>Apply to admins</Label>
                        <Switch
                          checked={facilityData.bookingRules.peakHoursApplyToAdmins}
                          onCheckedChange={(checked: boolean) => handleBookingRulesChange('peakHoursApplyToAdmins', checked)}
                          disabled={!isEditing}
                        />
                      </div>

                      {/* Peak Hours Time Slots */}
                      <div className="space-y-4">
                        <h4 className="font-medium">Peak Hours Schedule</h4>
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium capitalize">{day}</span>
                              {isEditing && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addPeakHourSlot(day)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add Slot
                                </Button>
                              )}
                            </div>
                            {facilityData.bookingRules.peakHoursSlots[day]?.length > 0 ? (
                              <div className="space-y-2">
                                {facilityData.bookingRules.peakHoursSlots[day].map((slot) => (
                                  <div key={slot.id} className="flex items-center gap-2">
                                    <Input
                                      type="time"
                                      value={slot.startTime}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlot(day, slot.id, 'startTime', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-32"
                                    />
                                    <span>to</span>
                                    <Input
                                      type="time"
                                      value={slot.endTime}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePeakHourSlot(day, slot.id, 'endTime', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-32"
                                    />
                                    {isEditing && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removePeakHourSlot(day, slot.id)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No peak hours set</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Peak Hours Restrictions */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Bookings Per Week (Peak)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.peakHoursRestrictions.maxBookingsUnlimited}
                                onCheckedChange={(checked: boolean) => handlePeakHoursRestrictionsChange('maxBookingsUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.peakHoursRestrictions.maxBookingsPerWeek}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePeakHoursRestrictionsChange('maxBookingsPerWeek', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.peakHoursRestrictions.maxBookingsUnlimited}
                            min="1"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Duration (hours)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.peakHoursRestrictions.maxDurationUnlimited}
                                onCheckedChange={(checked: boolean) => handlePeakHoursRestrictionsChange('maxDurationUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-sm text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.peakHoursRestrictions.maxDurationHours}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePeakHoursRestrictionsChange('maxDurationHours', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.peakHoursRestrictions.maxDurationUnlimited}
                            min="0.5"
                            step="0.5"
                          />
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Weekend Policy */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Weekend Policy</span>
                      <Switch
                        checked={facilityData.bookingRules.hasWeekendPolicy}
                        onCheckedChange={(checked: boolean) => handleBookingRulesChange('hasWeekendPolicy', checked)}
                        disabled={!isEditing}
                      />
                    </CardTitle>
                    <CardDescription>Set different restrictions for weekend bookings</CardDescription>
                  </CardHeader>
                  {facilityData.bookingRules.hasWeekendPolicy && (
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <Label>Apply to admins</Label>
                        <Switch
                          checked={facilityData.bookingRules.weekendPolicyApplyToAdmins}
                          onCheckedChange={(checked: boolean) => handleBookingRulesChange('weekendPolicyApplyToAdmins', checked)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Bookings Per Weekend</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.weekendPolicy.maxBookingsUnlimited}
                                onCheckedChange={(checked: boolean) => handleWeekendPolicyChange('maxBookingsUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-xs text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.weekendPolicy.maxBookingsPerWeekend}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleWeekendPolicyChange('maxBookingsPerWeekend', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.weekendPolicy.maxBookingsUnlimited}
                            min="1"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Max Duration (hours)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.weekendPolicy.maxDurationUnlimited}
                                onCheckedChange={(checked: boolean) => handleWeekendPolicyChange('maxDurationUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-xs text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.weekendPolicy.maxDurationHours}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleWeekendPolicyChange('maxDurationHours', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.weekendPolicy.maxDurationUnlimited}
                            min="0.5"
                            step="0.5"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Advance Booking (days)</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={facilityData.bookingRules.weekendPolicy.advanceBookingUnlimited}
                                onCheckedChange={(checked: boolean) => handleWeekendPolicyChange('advanceBookingUnlimited', checked)}
                                disabled={!isEditing}
                              />
                              <span className="text-xs text-gray-500">Unlimited</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            value={facilityData.bookingRules.weekendPolicy.advanceBookingDays}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleWeekendPolicyChange('advanceBookingDays', e.target.value)}
                            disabled={!isEditing || facilityData.bookingRules.weekendPolicy.advanceBookingUnlimited}
                            min="1"
                          />
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* Court Management Tab */}
            <TabsContent value="courts" className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={handleAddNewCourt} disabled={editingCourt !== null || isAddingNewCourt}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Court
                </Button>
              </div>

              {/* Edit/Add Court Form */}
              {editingCourt && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle>{isAddingNewCourt ? 'Add New Court' : `Edit ${editingCourt.name}`}</CardTitle>
                    <CardDescription>Configure court details and settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="courtName">Court Name</Label>
                        <Input
                          id="courtName"
                          value={editingCourt.name}
                          onChange={(e) => setEditingCourt({ ...editingCourt, name: e.target.value })}
                          placeholder="e.g., Court 1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="courtNumber">Court Number</Label>
                        <Input
                          id="courtNumber"
                          type="number"
                          value={editingCourt.courtNumber}
                          onChange={(e) => setEditingCourt({ ...editingCourt, courtNumber: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="courtType">Court Type</Label>
                        <Select
                          value={editingCourt.courtType}
                          onValueChange={(value) => setEditingCourt({ ...editingCourt, courtType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Tennis">Tennis</SelectItem>
                            <SelectItem value="Pickleball">Pickleball</SelectItem>
                            <SelectItem value="Dual Purpose">Dual Purpose</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="courtSurface">Surface Type</Label>
                        <Select
                          value={editingCourt.surfaceType}
                          onValueChange={(value) => setEditingCourt({ ...editingCourt, surfaceType: value })}
                        >
                          <SelectTrigger>
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
                        <Label htmlFor="courtStatus">Status</Label>
                        <Select
                          value={editingCourt.status}
                          onValueChange={(value: 'active' | 'maintenance' | 'inactive') => setEditingCourt({ ...editingCourt, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="indoor"
                          checked={editingCourt.isIndoor}
                          onCheckedChange={(checked) => setEditingCourt({ ...editingCourt, isIndoor: checked })}
                        />
                        <Label htmlFor="indoor">Indoor Court</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="lights"
                          checked={editingCourt.hasLights}
                          onCheckedChange={(checked) => setEditingCourt({ ...editingCourt, hasLights: checked })}
                        />
                        <Label htmlFor="lights">Has Lights</Label>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-6">
                      <Button onClick={handleSaveCourt} disabled={courtSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        {courtSaving ? 'Saving...' : 'Save Court'}
                      </Button>
                      <Button variant="outline" onClick={handleCancelCourtEdit} disabled={courtSaving}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
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
                  {courts.map((court) => (
                    <React.Fragment key={court.id}>
                      <Card>
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold">{court.name}</h3>
                                <Badge className={getCourtStatusColor(court.status)}>{formatCourtStatus(court.status)}</Badge>
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
                                <Settings className="h-4 w-4" />
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
                      </Card>

                      {/* Court Schedule Config Panel */}
                      {configuringCourtId === court.id && (
                        <Card className="border-green-200 bg-green-50/50">
                          <CardHeader>
                            <CardTitle className="text-base">Operating Schedule — {court.name}</CardTitle>
                            <CardDescription>Configure hours, prime time, and slot settings per day</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {courtScheduleLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left p-2">Day</th>
                                        <th className="text-center p-2">Open</th>
                                        <th className="text-center p-2">Open Time</th>
                                        <th className="text-center p-2">Close Time</th>
                                        <th className="text-center p-2">Prime Start</th>
                                        <th className="text-center p-2">Prime End</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {courtSchedule.map((day: any) => (
                                        <tr key={day.day_of_week} className="border-b">
                                          <td className="p-2 font-medium">{DAY_NAMES[day.day_of_week]}</td>
                                          <td className="p-2 text-center">
                                            <Switch
                                              checked={day.is_open}
                                              onCheckedChange={(checked: boolean) => updateCourtScheduleDay(day.day_of_week, 'is_open', checked)}
                                            />
                                          </td>
                                          <td className="p-2">
                                            <Input
                                              type="time"
                                              value={day.open_time || '06:00'}
                                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'open_time', e.target.value)}
                                              disabled={!day.is_open}
                                              className="w-28"
                                            />
                                          </td>
                                          <td className="p-2">
                                            <Input
                                              type="time"
                                              value={day.close_time || '22:00'}
                                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'close_time', e.target.value)}
                                              disabled={!day.is_open}
                                              className="w-28"
                                            />
                                          </td>
                                          <td className="p-2">
                                            <Input
                                              type="time"
                                              value={day.prime_time_start || ''}
                                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'prime_time_start', e.target.value || null)}
                                              disabled={!day.is_open}
                                              className="w-28"
                                            />
                                          </td>
                                          <td className="p-2">
                                            <Input
                                              type="time"
                                              value={day.prime_time_end || ''}
                                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'prime_time_end', e.target.value || null)}
                                              disabled={!day.is_open}
                                              className="w-28"
                                            />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                                  <div className="space-y-1">
                                    <Label className="text-sm">Slot Duration (min)</Label>
                                    <Select
                                      value={String(courtSchedule[0]?.slot_duration || 30)}
                                      onValueChange={(val: string) => updateAllScheduleDays('slot_duration', parseInt(val))}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="15">15 min</SelectItem>
                                        <SelectItem value="30">30 min</SelectItem>
                                        <SelectItem value="60">60 min</SelectItem>
                                        <SelectItem value="90">90 min</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">Buffer Before (min)</Label>
                                    <Input
                                      type="number"
                                      value={courtSchedule[0]?.buffer_before || 0}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAllScheduleDays('buffer_before', parseInt(e.target.value) || 0)}
                                      min="0"
                                      max="30"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">Buffer After (min)</Label>
                                    <Input
                                      type="number"
                                      value={courtSchedule[0]?.buffer_after || 0}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAllScheduleDays('buffer_after', parseInt(e.target.value) || 0)}
                                      min="0"
                                      max="30"
                                    />
                                  </div>
                                </div>

                                <div className="flex gap-2 pt-4">
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
                  ))}
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
                              {new Date(b.start_datetime).toLocaleString()} — {new Date(b.end_datetime).toLocaleString()}
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
          </Tabs>
        </div>
      </div>
  );
}
