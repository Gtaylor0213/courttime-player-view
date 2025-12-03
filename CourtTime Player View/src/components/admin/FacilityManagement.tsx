import React, { useState, useEffect } from 'react';
import { UnifiedSidebar } from '../UnifiedSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Building2, Clock, MapPin, Phone, Mail, Save, Edit, X, Plus, Trash2, Image, User, Users, FileText, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useAuth } from '../../contexts/AuthContext';
import { facilitiesApi, adminApi } from '../../api/client';
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
}

interface FacilityManagementProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToBulletinBoard?: () => void;
  onNavigateToAdminDashboard?: () => void;
  onNavigateToFacilityManagement?: () => void;
  onNavigateToCourtManagement?: () => void;
  onNavigateToBookingManagement?: () => void;
  onNavigateToAdminBooking?: () => void;
  onNavigateToMemberManagement?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
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

export function FacilityManagement({
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToBulletinBoard = () => {},
  onNavigateToAdminDashboard = () => {},
  onNavigateToFacilityManagement = () => {},
  onNavigateToCourtManagement = () => {},
  onNavigateToBookingManagement = () => {},
  onNavigateToAdminBooking = () => {},
  onNavigateToMemberManagement = () => {},
  sidebarCollapsed = false,
  onToggleSidebar
}: FacilityManagementProps) {
  const { user } = useAuth();
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

  const currentFacilityId = user?.memberFacilities?.[0];

  useEffect(() => {
    if (currentFacilityId) {
      loadFacilityData();
      loadCourts();
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

  const getHoursDisplay = (day: string) => {
    if (!facilityData.operatingHours || !facilityData.operatingHours[day]) {
      return 'Not set';
    }
    const hours = facilityData.operatingHours[day];
    if (typeof hours === 'string') return hours;
    if (hours.closed) return 'Closed';
    return `${hours.open} - ${hours.close}`;
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedSidebar
        userType="admin"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onNavigateToBulletinBoard={onNavigateToBulletinBoard}
        onNavigateToAdminDashboard={onNavigateToAdminDashboard}
        onNavigateToFacilityManagement={onNavigateToFacilityManagement}
        onNavigateToCourtManagement={onNavigateToCourtManagement}
        onNavigateToBookingManagement={onNavigateToBookingManagement}
        onNavigateToAdminBooking={onNavigateToAdminBooking}
        onNavigateToMemberManagement={onNavigateToMemberManagement}
                onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="facility-management"
      />

      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out p-8`}>
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
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
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
                <Card className="border-blue-200 bg-blue-50">
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {courts.map((court) => (
                    <Card key={court.id}>
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
