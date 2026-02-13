import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
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
  Plus, Trash2, Check, AlertCircle, Upload, Mail, User, Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import { toast } from 'sonner';
import { facilitiesApi } from '../api/client';

interface Court {
  id: string;
  name: string;
  courtNumber: number;
  surfaceType: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  courtType: 'Tennis' | 'Pickleball' | 'Dual';
  isIndoor: boolean;
  hasLights: boolean;
  canSplit: boolean;
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

// US State abbreviations
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

export function FacilityRegistration() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, user } = useAuth();

  const [formData, setFormData] = useState({
    // Step 1: Facility Administrator Account (if not logged in)
    adminEmail: user?.email || '',
    adminPassword: '',
    adminConfirmPassword: '',
    adminFullName: user?.fullName || '',

    // Step 2: Facility Information
    facilityName: '',
    facilityType: '',
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

    // Address Whitelist
    addressWhitelistFile: null as File | null,
    addressWhitelistFileName: '',
    parsedAddresses: [] as Array<{ streetAddress: string; city?: string; state?: string; zipCode?: string; householdName?: string }>,

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

    // Step 3: Facility-Wide Rules
    generalRules: '',

    // Booking restriction type
    restrictionType: 'account' as 'account' | 'address', // per account or per address

    // Booking restrictions with unlimited options
    maxBookingsPerWeek: '3',
    maxBookingsPerWeekUnlimited: false,
    maxBookingDurationHours: '2',
    maxBookingDurationUnlimited: false,
    advanceBookingDays: '14',
    advanceBookingDaysUnlimited: false,
    cancellationNoticeHours: '24',
    cancellationNoticeUnlimited: false,

    // Admin restrictions
    restrictionsApplyToAdmins: true,
    adminMaxBookingsPerWeek: '10',
    adminMaxBookingsUnlimited: true,
    adminMaxBookingDurationHours: '4',
    adminMaxDurationUnlimited: true,
    adminAdvanceBookingDays: '30',
    adminAdvanceBookingUnlimited: true,
    adminCancellationNoticeHours: '1',
    adminCancellationUnlimited: true,

    // Peak hours settings - with multiple time slots per day
    hasPeakHours: false,
    peakHoursApplyToAdmins: true,
    peakHoursSlots: {} as Record<string, Array<{ id: string; startTime: string; endTime: string }>>,
    // e.g., { monday: [{ id: '1', startTime: '07:00', endTime: '10:00' }, { id: '2', startTime: '18:00', endTime: '20:00' }] }
    peakHoursRestrictions: {
      maxBookingsPerWeek: '2',
      maxBookingsUnlimited: false,
      maxDurationHours: '1.5',
      maxDurationUnlimited: false,
    },

    // Weekend policy settings
    hasWeekendPolicy: false,
    weekendPolicyApplyToAdmins: true,
    weekendPolicy: {
      enabled: false,
      maxBookingsPerWeekend: '2',
      maxBookingsUnlimited: false,
      maxDurationHours: '2',
      maxDurationUnlimited: false,
      advanceBookingDays: '7',
      advanceBookingUnlimited: false,
    },

    // Step 4: Courts (will be filled dynamically)
    courts: [] as Court[],

    // Step 5: Additional Admins
    adminInvites: [] as AdminInvite[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [courtFormMode, setCourtFormMode] = useState<'individual' | 'bulk'>('individual');
  const [bulkCourtData, setBulkCourtData] = useState({
    count: '1',
    startingNumber: '1',
    surfaceType: 'Hard' as const,
    courtType: 'Tennis' as const,
    isIndoor: false,
    hasLights: false,
  });

  const totalSteps = user ? 5 : 6; // 6 steps if creating admin account, 5 if already logged in

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

  const handlePeakHoursRestrictionsChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      peakHoursRestrictions: {
        ...prev.peakHoursRestrictions,
        [field]: value
      }
    }));
  };

  const handleWeekendPolicyChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      weekendPolicy: {
        ...prev.weekendPolicy,
        [field]: value
      }
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

  // Parse CSV text into address objects
  const parseCSV = (text: string): Array<{ streetAddress: string; city?: string; state?: string; zipCode?: string; householdName?: string }> => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    // Try to detect headers
    const firstLine = lines[0].toLowerCase();
    const hasHeaders = firstLine.includes('street') || firstLine.includes('address') || firstLine.includes('city') || firstLine.includes('zip');

    if (hasHeaders) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
      const colMap = {
        streetAddress: headers.findIndex(h => h.includes('street') || h === 'address'),
        city: headers.findIndex(h => h === 'city'),
        state: headers.findIndex(h => h === 'state'),
        zipCode: headers.findIndex(h => h.includes('zip') || h.includes('postal')),
        householdName: headers.findIndex(h => h.includes('household') || h.includes('name')),
      };

      return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        return {
          streetAddress: colMap.streetAddress >= 0 ? cols[colMap.streetAddress] : cols[0],
          city: colMap.city >= 0 ? cols[colMap.city] : undefined,
          state: colMap.state >= 0 ? cols[colMap.state] : undefined,
          zipCode: colMap.zipCode >= 0 ? cols[colMap.zipCode] : undefined,
          householdName: colMap.householdName >= 0 ? cols[colMap.householdName] : undefined,
        };
      }).filter(addr => addr.streetAddress);
    }

    // No headers: treat each line as a street address
    return lines.map(line => ({ streetAddress: line.trim() })).filter(addr => addr.streetAddress);
  };

  // Handle address whitelist file upload
  const handleAddressWhitelistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (fileExtension !== '.csv') {
        toast.error('Please select a CSV file');
        return;
      }
      setFormData(prev => ({
        ...prev,
        addressWhitelistFile: file,
        addressWhitelistFileName: file.name
      }));
      // Parse CSV
      const reader = new FileReader();
      reader.onloadend = () => {
        const text = reader.result as string;
        const addresses = parseCSV(text);
        setFormData(prev => ({
          ...prev,
          parsedAddresses: addresses
        }));
        if (addresses.length > 0) {
          toast.success(`Parsed ${addresses.length} address${addresses.length !== 1 ? 'es' : ''} from file`);
        } else {
          toast.error('No addresses found in file');
        }
      };
      reader.readAsText(file);
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

  // Add a time slot to a specific day
  const addPeakHourSlot = (day: string) => {
    setFormData(prev => {
      const currentSlots = prev.peakHoursSlots[day] || [];
      const newSlot = {
        id: `${day}-${Date.now()}`,
        startTime: '17:00',
        endTime: '20:00'
      };
      return {
        ...prev,
        peakHoursSlots: {
          ...prev.peakHoursSlots,
          [day]: [...currentSlots, newSlot]
        }
      };
    });
  };

  // Remove a time slot from a specific day
  const removePeakHourSlot = (day: string, slotId: string) => {
    setFormData(prev => {
      const currentSlots = prev.peakHoursSlots[day] || [];
      const newSlots = currentSlots.filter(slot => slot.id !== slotId);
      const newPeakHoursSlots = { ...prev.peakHoursSlots };
      if (newSlots.length === 0) {
        delete newPeakHoursSlots[day];
      } else {
        newPeakHoursSlots[day] = newSlots;
      }
      return {
        ...prev,
        peakHoursSlots: newPeakHoursSlots
      };
    });
  };

  // Update a specific time slot
  const updatePeakHourSlot = (day: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setFormData(prev => {
      const currentSlots = prev.peakHoursSlots[day] || [];
      const newSlots = currentSlots.map(slot =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      );
      return {
        ...prev,
        peakHoursSlots: {
          ...prev.peakHoursSlots,
          [day]: newSlots
        }
      };
    });
  };

  // Check if a day has peak hours configured
  const dayHasPeakHours = (day: string): boolean => {
    return (formData.peakHoursSlots[day]?.length || 0) > 0;
  };

  // Validate a single step and return errors (without setting state)
  const getStepErrors = (step: number): Record<string, string> => {
    const stepErrors: Record<string, string> = {};

    if (!user && step === 1) {
      // Validate Facility Administrator Account
      if (!formData.adminFullName.trim()) stepErrors.adminFullName = 'Full name is required';
      if (!formData.adminEmail.trim()) stepErrors.adminEmail = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(formData.adminEmail)) stepErrors.adminEmail = 'Email is invalid';
      if (!formData.adminPassword) stepErrors.adminPassword = 'Password is required';
      else if (formData.adminPassword.length < 8) stepErrors.adminPassword = 'Password must be at least 8 characters';
      if (formData.adminPassword !== formData.adminConfirmPassword) {
        stepErrors.adminConfirmPassword = 'Passwords do not match';
      }
    }

    const facilityStep = user ? 1 : 2;
    if (step === facilityStep) {
      // Validate Facility Information
      if (!formData.facilityName.trim()) stepErrors.facilityName = 'Facility name is required';
      if (!formData.facilityType) stepErrors.facilityType = 'Facility type is required';
      if (!formData.streetAddress.trim()) stepErrors.streetAddress = 'Street address is required';
      if (!formData.city.trim()) stepErrors.city = 'City is required';
      if (!formData.state) stepErrors.state = 'State is required';
      if (!formData.zipCode.trim()) stepErrors.zipCode = 'ZIP code is required';
      if (!formData.phone.trim()) stepErrors.phone = 'Facility phone number is required';
      if (!formData.email.trim()) stepErrors.email = 'Facility email is required';
      else if (!/\S+@\S+\.\S+/.test(formData.email)) stepErrors.email = 'Facility email is invalid';
      // Validate primary contact
      if (!formData.primaryContact.name.trim()) stepErrors.primaryContactName = 'Primary contact name is required';
      if (!formData.primaryContact.email.trim()) stepErrors.primaryContactEmail = 'Primary contact email is required';
      else if (!/\S+@\S+\.\S+/.test(formData.primaryContact.email)) stepErrors.primaryContactEmail = 'Primary contact email is invalid';
      if (!formData.primaryContact.phone.trim()) stepErrors.primaryContactPhone = 'Primary contact phone is required';
    }

    const rulesStep = user ? 2 : 3;
    if (step === rulesStep) {
      // Validate Facility Rules
      if (!formData.generalRules.trim()) stepErrors.generalRules = 'General rules are required';
      if (!formData.restrictionType) stepErrors.restrictionType = 'Please select how restrictions apply';
      // Only validate numeric values if not unlimited
      if (!formData.maxBookingsPerWeekUnlimited && !formData.maxBookingsPerWeek) {
        stepErrors.maxBookingsPerWeek = 'Required';
      }
      if (!formData.maxBookingDurationUnlimited && !formData.maxBookingDurationHours) {
        stepErrors.maxBookingDurationHours = 'Required';
      }
    }

    const courtsStep = user ? 3 : 4;
    if (step === courtsStep) {
      // Validate Courts
      if (formData.courts.length === 0) {
        stepErrors.courts = 'At least one court is required';
      }
    }

    return stepErrors;
  };

  // Check if a step has any validation errors
  const stepHasErrors = (step: number): boolean => {
    return Object.keys(getStepErrors(step)).length > 0;
  };

  // Validate all steps and return combined errors with the first invalid step
  const validateAllSteps = (): { isValid: boolean; errors: Record<string, string>; firstInvalidStep: number | null } => {
    const allErrors: Record<string, string> = {};
    let firstInvalidStep: number | null = null;

    for (let step = 1; step <= totalSteps; step++) {
      const stepErrors = getStepErrors(step);
      if (Object.keys(stepErrors).length > 0) {
        Object.assign(allErrors, stepErrors);
        if (firstInvalidStep === null) {
          firstInvalidStep = step;
        }
      }
    }

    return {
      isValid: Object.keys(allErrors).length === 0,
      errors: allErrors,
      firstInvalidStep
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
    };
    setFormData(prev => ({
      ...prev,
      courts: [...prev.courts, newCourt]
    }));
  };

  const addBulkCourts = () => {
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
      });
    }

    setFormData(prev => ({
      ...prev,
      courts: [...prev.courts, ...newCourts]
    }));

    toast.success(`Added ${count} courts successfully`);
    setCourtFormMode('individual');
  };

  const updateCourt = (courtId: string, updates: Partial<Court>) => {
    setFormData(prev => ({
      ...prev,
      courts: prev.courts.map(court => {
        if (court.id !== courtId) return court;

        // Initialize splitConfig when canSplit is enabled
        if (updates.canSplit && !court.splitConfig) {
          return {
            ...court,
            ...updates,
            splitConfig: { splitNames: [], splitType: 'Pickleball' as const }
          };
        }

        return { ...court, ...updates };
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
    // Validate ALL steps before submission
    const validation = validateAllSteps();

    if (!validation.isValid) {
      setErrors(validation.errors);
      if (validation.firstInvalidStep !== null) {
        setCurrentStep(validation.firstInvalidStep);
        toast.error('Please complete all required fields before submitting');
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare registration data
      const registrationData = {
        // Facility Administrator Account (if creating new user)
        ...(user ? {} : {
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          adminFullName: formData.adminFullName,
        }),

        // Facility Information
        facilityName: formData.facilityName,
        facilityType: formData.facilityType,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        phone: formData.primaryContact.phone || formData.phone,
        email: formData.primaryContact.email || formData.email,
        contactName: formData.primaryContact.name,
        description: formData.description,
        facilityImage: formData.facilityImageBase64 || undefined,

        // Contacts
        primaryContact: {
          name: formData.primaryContact.name,
          email: formData.primaryContact.email,
          phone: formData.primaryContact.phone,
        },
        secondaryContacts: formData.secondaryContacts
          .filter(c => c.name.trim())
          .map(c => ({
            name: c.name,
            email: c.email || undefined,
            phone: c.phone || undefined,
          })),

        // Operating Hours
        operatingHours: formData.operatingHours,

        // Facility Rules
        generalRules: formData.generalRules,

        // Restriction settings
        restrictionType: formData.restrictionType,
        maxBookingsPerWeek: formData.maxBookingsPerWeekUnlimited ? '-1' : formData.maxBookingsPerWeek,
        maxBookingDurationHours: formData.maxBookingDurationUnlimited ? '-1' : formData.maxBookingDurationHours,
        advanceBookingDays: formData.advanceBookingDaysUnlimited ? '-1' : formData.advanceBookingDays,
        cancellationNoticeHours: formData.cancellationNoticeUnlimited ? '0' : formData.cancellationNoticeHours,

        // Admin restrictions
        restrictionsApplyToAdmins: formData.restrictionsApplyToAdmins,
        adminRestrictions: !formData.restrictionsApplyToAdmins ? {
          maxBookingsPerWeek: formData.adminMaxBookingsUnlimited ? -1 : parseInt(formData.adminMaxBookingsPerWeek),
          maxBookingDurationHours: formData.adminMaxDurationUnlimited ? -1 : parseFloat(formData.adminMaxBookingDurationHours),
          advanceBookingDays: formData.adminAdvanceBookingUnlimited ? -1 : parseInt(formData.adminAdvanceBookingDays),
          cancellationNoticeHours: formData.adminCancellationUnlimited ? 0 : parseInt(formData.adminCancellationNoticeHours),
        } : undefined,

        // Peak hours policy - with per-day time slots
        peakHoursPolicy: formData.hasPeakHours ? {
          enabled: true,
          applyToAdmins: formData.peakHoursApplyToAdmins,
          timeSlots: formData.peakHoursSlots, // Per-day time slots: { monday: [{id, startTime, endTime}], ... }
          maxBookingsPerWeek: formData.peakHoursRestrictions.maxBookingsUnlimited ? -1 : parseInt(formData.peakHoursRestrictions.maxBookingsPerWeek),
          maxDurationHours: formData.peakHoursRestrictions.maxDurationUnlimited ? -1 : parseFloat(formData.peakHoursRestrictions.maxDurationHours),
        } : undefined,

        // Weekend policy
        weekendPolicy: formData.hasWeekendPolicy ? {
          enabled: true,
          applyToAdmins: formData.weekendPolicyApplyToAdmins,
          maxBookingsPerWeekend: formData.weekendPolicy.maxBookingsUnlimited ? -1 : parseInt(formData.weekendPolicy.maxBookingsPerWeekend),
          maxDurationHours: formData.weekendPolicy.maxDurationUnlimited ? -1 : parseFloat(formData.weekendPolicy.maxDurationHours),
          advanceBookingDays: formData.weekendPolicy.advanceBookingUnlimited ? -1 : parseInt(formData.weekendPolicy.advanceBookingDays),
        } : undefined,

        // Courts
        courts: formData.courts.map(court => ({
          name: court.name,
          courtNumber: court.courtNumber,
          surfaceType: court.surfaceType,
          courtType: court.courtType,
          isIndoor: court.isIndoor,
          hasLights: court.hasLights,
          canSplit: court.canSplit,
          splitConfig: court.splitConfig,
        })),

        // Admin Invites
        adminInvites: formData.adminInvites.filter(invite => invite.email),

        // Address Whitelist
        hoaAddresses: formData.parsedAddresses.length > 0 ? formData.parsedAddresses : undefined,

        // Existing user ID (if already logged in)
        existingUserId: user?.id,
      };

      // Call the API to register the facility
      const result = await facilitiesApi.register(registrationData);

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      // Auto-login the new user
      const backendResponse = result.data as any;
      if (backendResponse.user) {
        // Save user data to localStorage for auto-login
        const userData = {
          ...backendResponse.user,
          userType: 'admin',
          memberFacilities: [backendResponse.facility.id],
        };
        const token = 'token-' + userData.id;

        localStorage.setItem('auth_user', JSON.stringify(userData));
        localStorage.setItem('auth_token', token);

        toast.success('Facility registered successfully! You are now logged in as the facility admin.');
      } else {
        toast.success('Facility registered successfully!');
      }

      // Navigate to the app after a short delay
      setTimeout(() => {
        // Force a page reload to re-initialize auth state with the new user
        window.location.reload();
      }, 1500);

    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get step label based on step number and user status
  const getStepLabel = (stepNumber: number): string => {
    if (!user) {
      // Not logged in - 6 steps
      switch (stepNumber) {
        case 1: return 'Your Account';
        case 2: return 'Facility Info';
        case 3: return 'Rules';
        case 4: return 'Courts';
        case 5: return 'Admins';
        case 6: return 'Review';
        default: return '';
      }
    } else {
      // Logged in - 5 steps
      switch (stepNumber) {
        case 1: return 'Facility Info';
        case 2: return 'Rules';
        case 3: return 'Courts';
        case 4: return 'Admins';
        case 5: return 'Review';
        default: return '';
      }
    }
  };

  const renderProgressBar = () => {
    return (
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep;
            // A step is "visited" if we've moved past it
            const isVisited = stepNumber < currentStep;

            // Determine colors based on state
            let bgColor = 'white';
            let borderColor = '#d1d5db';
            let textColor = '#6b7280';

            if (isCurrent) {
              bgColor = '#2563eb';
              borderColor = '#2563eb';
              textColor = 'white';
            } else if (isVisited) {
              bgColor = '#16a34a';
              borderColor = '#16a34a';
              textColor = 'white';
            }

            return (
              <div key={stepNumber} className="flex-1 flex items-center">
                <div className="flex flex-col items-center flex-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => goToStep(stepNumber)}
                    onKeyDown={(e) => e.key === 'Enter' && goToStep(stepNumber)}
                    className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer hover:scale-105 font-medium"
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
                    className="text-xs mt-2 text-center"
                    style={{ color: isCurrent ? '#2563eb' : '#6b7280', fontWeight: isCurrent ? 600 : 400 }}
                  >
                    {getStepLabel(stepNumber)}
                  </div>
                </div>
                {stepNumber < totalSteps && (
                  <div
                    className="flex-1 mx-2 transition-colors"
                    style={{ backgroundColor: isVisited ? '#16a34a' : '#d1d5db', height: '2px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-center" style={{ color: '#6b7280' }}>
          Click any step above to navigate. All required fields must be completed before registration.
        </p>
      </div>
    );
  };

  const renderStep1AdminAccount = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Create Facility Administrator Account</h3>
        <p className="text-sm text-gray-600 mb-6">
          As the facility creator, you will be the primary administrator with full access to manage your facility.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="adminFullName">Full Name *</Label>
          <Input
            id="adminFullName"
            value={formData.adminFullName}
            onChange={(e) => handleInputChange('adminFullName', e.target.value)}
            placeholder="John Smith"
          />
          {errors.adminFullName && (
            <p className="text-sm text-red-600 mt-1">{errors.adminFullName}</p>
          )}
        </div>

        <div>
          <Label htmlFor="adminEmail">Email Address *</Label>
          <Input
            id="adminEmail"
            type="email"
            value={formData.adminEmail}
            onChange={(e) => handleInputChange('adminEmail', e.target.value)}
            placeholder="admin@facility.com"
          />
          {errors.adminEmail && (
            <p className="text-sm text-red-600 mt-1">{errors.adminEmail}</p>
          )}
        </div>

        <div>
          <Label htmlFor="adminPassword">Password *</Label>
          <Input
            id="adminPassword"
            type="password"
            value={formData.adminPassword}
            onChange={(e) => handleInputChange('adminPassword', e.target.value)}
            placeholder="Minimum 8 characters"
          />
          {errors.adminPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.adminPassword}</p>
          )}
        </div>

        <div>
          <Label htmlFor="adminConfirmPassword">Confirm Password *</Label>
          <Input
            id="adminConfirmPassword"
            type="password"
            value={formData.adminConfirmPassword}
            onChange={(e) => handleInputChange('adminConfirmPassword', e.target.value)}
            placeholder="Re-enter password"
          />
          {errors.adminConfirmPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.adminConfirmPassword}</p>
          )}
        </div>
      </div>
    </div>
  );

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
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column - Address & Contact Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="facilityName">Facility Name *</Label>
                <Input
                  id="facilityName"
                  value={formData.facilityName}
                  onChange={(e) => handleInputChange('facilityName', e.target.value)}
                  placeholder="Sunrise Valley Tennis Courts"
                />
                {errors.facilityName && (
                  <p className="text-sm text-red-600 mt-1">{errors.facilityName}</p>
                )}
              </div>

              <div>
                <Label htmlFor="streetAddress">Street Address *</Label>
                <Input
                  id="streetAddress"
                  value={formData.streetAddress}
                  onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                  placeholder="123 Main Street"
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
                />
                {errors.city && (
                  <p className="text-sm text-red-600 mt-1">{errors.city}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleInputChange('state', value)}
                  >
                    <SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select facility type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOA Tennis & Pickleball Courts">HOA Tennis & Pickleball Courts</SelectItem>
                    <SelectItem value="Tennis Club">Tennis Club</SelectItem>
                    <SelectItem value="Pickleball Club">Pickleball Club</SelectItem>
                    <SelectItem value="Racquet Club">Racquet Club</SelectItem>
                    <SelectItem value="Public Recreation Facility">Public Recreation Facility</SelectItem>
                    <SelectItem value="Private Sports Club">Private Sports Club</SelectItem>
                  </SelectContent>
                </Select>
                {errors.facilityType && (
                  <p className="text-sm text-red-600 mt-1">{errors.facilityType}</p>
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

      {/* Primary Contact Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            Primary Contact
          </CardTitle>
          <CardDescription>
            Main point of contact for facility inquiries
            {user && <span className="text-blue-600"> (auto-filled from your account)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="primaryContactName">Contact Name *</Label>
              <Input
                id="primaryContactName"
                value={formData.primaryContact.name}
                onChange={(e) => handlePrimaryContactChange('name', e.target.value)}
                placeholder="John Smith"
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
          <div className="flex items-center justify-between">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={contact.name}
                      onChange={(e) => updateSecondaryContact(contact.id, 'name', e.target.value)}
                      placeholder="Contact name"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => updateSecondaryContact(contact.id, 'phone', e.target.value)}
                      placeholder="(555) 123-4567"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-2">
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

      {/* Address Whitelist Upload */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Address Whitelist
          </CardTitle>
          <CardDescription>
            Upload a list of approved addresses for membership verification (optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formData.addressWhitelistFileName ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-700">{formData.addressWhitelistFileName} ({formData.parsedAddresses.length} addresses)</span>
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
              <span className="text-sm text-gray-500">Upload Address List</span>
              <span className="text-xs text-gray-400 mt-1">CSV file</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleAddressWhitelistChange}
                className="hidden"
              />
            </label>
          )}
          <p className="text-xs text-gray-500 mt-2">
            The file should contain one address per row. Members will be verified against this list during registration.
          </p>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <div>
        <h4 className="font-semibold mb-4">Operating Hours</h4>
        <div className="space-y-3">
          {Object.keys(formData.operatingHours).map((day) => {
            const hours = formData.operatingHours[day as keyof typeof formData.operatingHours];
            return (
              <div key={day} className="flex items-center gap-4">
                <div className="w-28 font-medium capitalize">{day}</div>
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={hours.open}
                    onChange={(e) => handleOperatingHoursChange(day, 'open', e.target.value)}
                    disabled={hours.closed}
                    className="w-32"
                  />
                  <span className="text-gray-500">to</span>
                  <Input
                    type="time"
                    value={hours.close}
                    onChange={(e) => handleOperatingHoursChange(day, 'close', e.target.value)}
                    disabled={hours.closed}
                    className="w-32"
                  />
                  <div className="flex items-center gap-2 ml-4">
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
    </div>
  );

  const renderStep3Rules = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Facility-Wide Rules & Policies</h3>
        <p className="text-sm text-gray-600 mb-6">
          Set rules and policies that apply to all courts at your facility.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="generalRules">General Usage Rules *</Label>
          <Textarea
            id="generalRules"
            value={formData.generalRules}
            onChange={(e) => handleInputChange('generalRules', e.target.value)}
            placeholder="E.g., No food on courts, Proper tennis attire required, Clean up after use..."
            rows={4}
          />
          <p className="text-xs text-gray-500 mt-1">
            These rules will be displayed to all members
          </p>
          {errors.generalRules && (
            <p className="text-sm text-red-600 mt-1">{errors.generalRules}</p>
          )}
        </div>

        <Separator />

        {/* Booking Restrictions Header with Type Selection */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Booking Restrictions</h4>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Apply restrictions:</span>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="restrictionAccount"
                  name="restrictionType"
                  checked={formData.restrictionType === 'account'}
                  onChange={() => handleInputChange('restrictionType', 'account')}
                  className="h-4 w-4"
                />
                <Label htmlFor="restrictionAccount" className="text-sm font-normal cursor-pointer">Per Account</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="restrictionAddress"
                  name="restrictionType"
                  checked={formData.restrictionType === 'address'}
                  onChange={() => handleInputChange('restrictionType', 'address')}
                  className="h-4 w-4"
                />
                <Label htmlFor="restrictionAddress" className="text-sm font-normal cursor-pointer">Per Address</Label>
              </div>
            </div>
          </div>
          {errors.restrictionType && (
            <p className="text-sm text-red-600 mb-3">{errors.restrictionType}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Max Bookings Per Week */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxBookingsPerWeek">Max Bookings Per Week</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="maxBookingsUnlimited"
                    checked={formData.maxBookingsPerWeekUnlimited}
                    onCheckedChange={(checked) => handleInputChange('maxBookingsPerWeekUnlimited', checked)}
                  />
                  <Label htmlFor="maxBookingsUnlimited" className="text-xs text-gray-500">Unlimited</Label>
                </div>
              </div>
              <Input
                id="maxBookingsPerWeek"
                type="number"
                min="1"
                max="50"
                value={formData.maxBookingsPerWeek}
                onChange={(e) => handleInputChange('maxBookingsPerWeek', e.target.value)}
                disabled={formData.maxBookingsPerWeekUnlimited}
                className={formData.maxBookingsPerWeekUnlimited ? 'opacity-50' : ''}
              />
              {errors.maxBookingsPerWeek && (
                <p className="text-sm text-red-600">{errors.maxBookingsPerWeek}</p>
              )}
            </div>

            {/* Max Booking Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxBookingDurationHours">Max Booking Duration (hours)</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="maxDurationUnlimited"
                    checked={formData.maxBookingDurationUnlimited}
                    onCheckedChange={(checked) => handleInputChange('maxBookingDurationUnlimited', checked)}
                  />
                  <Label htmlFor="maxDurationUnlimited" className="text-xs text-gray-500">Unlimited</Label>
                </div>
              </div>
              <Input
                id="maxBookingDurationHours"
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={formData.maxBookingDurationHours}
                onChange={(e) => handleInputChange('maxBookingDurationHours', e.target.value)}
                disabled={formData.maxBookingDurationUnlimited}
                className={formData.maxBookingDurationUnlimited ? 'opacity-50' : ''}
              />
              {errors.maxBookingDurationHours && (
                <p className="text-sm text-red-600">{errors.maxBookingDurationHours}</p>
              )}
            </div>

            {/* Advance Booking Window */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="advanceBookingDays">Advance Booking Window (days)</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="advanceBookingUnlimited"
                    checked={formData.advanceBookingDaysUnlimited}
                    onCheckedChange={(checked) => handleInputChange('advanceBookingDaysUnlimited', checked)}
                  />
                  <Label htmlFor="advanceBookingUnlimited" className="text-xs text-gray-500">Unlimited</Label>
                </div>
              </div>
              <Input
                id="advanceBookingDays"
                type="number"
                min="1"
                max="365"
                value={formData.advanceBookingDays}
                onChange={(e) => handleInputChange('advanceBookingDays', e.target.value)}
                disabled={formData.advanceBookingDaysUnlimited}
                className={formData.advanceBookingDaysUnlimited ? 'opacity-50' : ''}
              />
              <p className="text-xs text-gray-500">How far in advance members can book</p>
            </div>

            {/* Cancellation Notice */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cancellationNoticeHours">Cancellation Notice (hours)</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cancellationUnlimited"
                    checked={formData.cancellationNoticeUnlimited}
                    onCheckedChange={(checked) => handleInputChange('cancellationNoticeUnlimited', checked)}
                  />
                  <Label htmlFor="cancellationUnlimited" className="text-xs text-gray-500">No Limit</Label>
                </div>
              </div>
              <Input
                id="cancellationNoticeHours"
                type="number"
                min="0"
                max="168"
                value={formData.cancellationNoticeHours}
                onChange={(e) => handleInputChange('cancellationNoticeHours', e.target.value)}
                disabled={formData.cancellationNoticeUnlimited}
                className={formData.cancellationNoticeUnlimited ? 'opacity-50' : ''}
              />
              <p className="text-xs text-gray-500">Minimum notice required to cancel (0 = anytime)</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Admin Restrictions Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Admin Restrictions</h4>
            <div className="flex items-center gap-2">
              <Switch
                id="restrictionsApplyToAdmins"
                checked={formData.restrictionsApplyToAdmins}
                onCheckedChange={(checked) => handleInputChange('restrictionsApplyToAdmins', checked)}
              />
              <Label htmlFor="restrictionsApplyToAdmins" className="text-sm">
                Same restrictions apply to admins
              </Label>
            </div>
          </div>

          {!formData.restrictionsApplyToAdmins && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <p className="text-sm text-gray-600 mb-4">
                  Set different booking restrictions for facility administrators.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Admin Max Bookings */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Max Bookings Per Week</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.adminMaxBookingsUnlimited}
                          onCheckedChange={(checked) => handleInputChange('adminMaxBookingsUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Unlimited</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.adminMaxBookingsPerWeek}
                      onChange={(e) => handleInputChange('adminMaxBookingsPerWeek', e.target.value)}
                      disabled={formData.adminMaxBookingsUnlimited}
                      className={formData.adminMaxBookingsUnlimited ? 'opacity-50' : ''}
                    />
                  </div>

                  {/* Admin Max Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Max Booking Duration (hours)</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.adminMaxDurationUnlimited}
                          onCheckedChange={(checked) => handleInputChange('adminMaxDurationUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Unlimited</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={formData.adminMaxBookingDurationHours}
                      onChange={(e) => handleInputChange('adminMaxBookingDurationHours', e.target.value)}
                      disabled={formData.adminMaxDurationUnlimited}
                      className={formData.adminMaxDurationUnlimited ? 'opacity-50' : ''}
                    />
                  </div>

                  {/* Admin Advance Booking */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Advance Booking (days)</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.adminAdvanceBookingUnlimited}
                          onCheckedChange={(checked) => handleInputChange('adminAdvanceBookingUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Unlimited</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.adminAdvanceBookingDays}
                      onChange={(e) => handleInputChange('adminAdvanceBookingDays', e.target.value)}
                      disabled={formData.adminAdvanceBookingUnlimited}
                      className={formData.adminAdvanceBookingUnlimited ? 'opacity-50' : ''}
                    />
                  </div>

                  {/* Admin Cancellation Notice */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Cancellation Notice (hours)</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.adminCancellationUnlimited}
                          onCheckedChange={(checked) => handleInputChange('adminCancellationUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">No Limit</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max="168"
                      value={formData.adminCancellationNoticeHours}
                      onChange={(e) => handleInputChange('adminCancellationNoticeHours', e.target.value)}
                      disabled={formData.adminCancellationUnlimited}
                      className={formData.adminCancellationUnlimited ? 'opacity-50' : ''}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Separator />

        {/* Peak Hours Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold">Peak Hours Restrictions</h4>
              <p className="text-xs text-gray-500">Set different limits during high-demand times for each day</p>
            </div>
            <Switch
              checked={formData.hasPeakHours}
              onCheckedChange={(checked) => handleInputChange('hasPeakHours', checked)}
            />
          </div>

          {formData.hasPeakHours && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4 space-y-4">
                {/* Apply to Admins Toggle */}
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <Label className="text-sm font-medium">Apply peak hour restrictions to admins</Label>
                  <Switch
                    checked={formData.peakHoursApplyToAdmins}
                    onCheckedChange={(checked) => handleInputChange('peakHoursApplyToAdmins', checked)}
                  />
                </div>

                {/* Peak Hours by Day */}
                <div>
                  <Label className="text-sm mb-3 block font-medium">Configure Peak Hours by Day</Label>
                  <p className="text-xs text-gray-600 mb-3">Click on a day to add time slots. You can add multiple peak periods per day.</p>
                  <div className="space-y-3">
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                      const daySlots = formData.peakHoursSlots[day] || [];
                      const hasSlotsConfigured = daySlots.length > 0;

                      return (
                        <div key={day} className="border border-blue-200 rounded-lg p-3 bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium capitalize text-sm">{day}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addPeakHourSlot(day)}
                              className="h-7 text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Time Slot
                            </Button>
                          </div>

                          {daySlots.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No peak hours configured for this day</p>
                          ) : (
                            <div className="space-y-2">
                              {daySlots.map((slot, index) => (
                                <div key={slot.id} className="flex items-center gap-2 bg-blue-50 p-2 rounded">
                                  <span className="text-xs text-gray-500 w-12">Slot {index + 1}:</span>
                                  <Input
                                    type="time"
                                    value={slot.startTime}
                                    onChange={(e) => updatePeakHourSlot(day, slot.id, 'startTime', e.target.value)}
                                    className="h-8 w-28 text-sm"
                                  />
                                  <span className="text-gray-500 text-sm">to</span>
                                  <Input
                                    type="time"
                                    value={slot.endTime}
                                    onChange={(e) => updatePeakHourSlot(day, slot.id, 'endTime', e.target.value)}
                                    className="h-8 w-28 text-sm"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePeakHourSlot(day, slot.id)}
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="bg-blue-200" />

                {/* Peak Hours Restrictions */}
                <div>
                  <Label className="text-sm mb-3 block font-medium">Peak Hours Booking Limits</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Bookings During Peak (per week)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={formData.peakHoursRestrictions.maxBookingsUnlimited}
                            onCheckedChange={(checked) => handlePeakHoursRestrictionsChange('maxBookingsUnlimited', checked)}
                          />
                          <Label className="text-xs text-gray-500">Unlimited</Label>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={formData.peakHoursRestrictions.maxBookingsPerWeek}
                        onChange={(e) => handlePeakHoursRestrictionsChange('maxBookingsPerWeek', e.target.value)}
                        disabled={formData.peakHoursRestrictions.maxBookingsUnlimited}
                        className={formData.peakHoursRestrictions.maxBookingsUnlimited ? 'opacity-50' : ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Duration During Peak (hrs)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={formData.peakHoursRestrictions.maxDurationUnlimited}
                            onCheckedChange={(checked) => handlePeakHoursRestrictionsChange('maxDurationUnlimited', checked)}
                          />
                          <Label className="text-xs text-gray-500">Unlimited</Label>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0.5"
                        max="8"
                        step="0.5"
                        value={formData.peakHoursRestrictions.maxDurationHours}
                        onChange={(e) => handlePeakHoursRestrictionsChange('maxDurationHours', e.target.value)}
                        disabled={formData.peakHoursRestrictions.maxDurationUnlimited}
                        className={formData.peakHoursRestrictions.maxDurationUnlimited ? 'opacity-50' : ''}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Separator />

        {/* Weekend Policy Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold">Weekend Policy</h4>
              <p className="text-xs text-gray-500">Set different limits for Saturday and Sunday</p>
            </div>
            <Switch
              checked={formData.hasWeekendPolicy}
              onCheckedChange={(checked) => handleInputChange('hasWeekendPolicy', checked)}
            />
          </div>

          {formData.hasWeekendPolicy && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-4 space-y-4">
                {/* Apply to Admins Toggle */}
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <Label className="text-sm font-medium">Apply weekend restrictions to admins</Label>
                  <Switch
                    checked={formData.weekendPolicyApplyToAdmins}
                    onCheckedChange={(checked) => handleInputChange('weekendPolicyApplyToAdmins', checked)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Weekend Max Bookings */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Max Bookings Per Weekend</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.weekendPolicy.maxBookingsUnlimited}
                          onCheckedChange={(checked) => handleWeekendPolicyChange('maxBookingsUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Unlimited</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={formData.weekendPolicy.maxBookingsPerWeekend}
                      onChange={(e) => handleWeekendPolicyChange('maxBookingsPerWeekend', e.target.value)}
                      disabled={formData.weekendPolicy.maxBookingsUnlimited}
                      className={formData.weekendPolicy.maxBookingsUnlimited ? 'opacity-50' : ''}
                    />
                  </div>

                  {/* Weekend Max Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Max Booking Duration (hours)</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.weekendPolicy.maxDurationUnlimited}
                          onCheckedChange={(checked) => handleWeekendPolicyChange('maxDurationUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Unlimited</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="0.5"
                      max="8"
                      step="0.5"
                      value={formData.weekendPolicy.maxDurationHours}
                      onChange={(e) => handleWeekendPolicyChange('maxDurationHours', e.target.value)}
                      disabled={formData.weekendPolicy.maxDurationUnlimited}
                      className={formData.weekendPolicy.maxDurationUnlimited ? 'opacity-50' : ''}
                    />
                  </div>

                  {/* Weekend Advance Booking */}
                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Advance Booking for Weekends (days)</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.weekendPolicy.advanceBookingUnlimited}
                          onCheckedChange={(checked) => handleWeekendPolicyChange('advanceBookingUnlimited', checked)}
                        />
                        <Label className="text-xs text-gray-500">Same as weekdays</Label>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="90"
                      value={formData.weekendPolicy.advanceBookingDays}
                      onChange={(e) => handleWeekendPolicyChange('advanceBookingDays', e.target.value)}
                      disabled={formData.weekendPolicy.advanceBookingUnlimited}
                      className={`max-w-xs ${formData.weekendPolicy.advanceBookingUnlimited ? 'opacity-50' : ''}`}
                    />
                    <p className="text-xs text-gray-500">How far in advance members can book weekend slots</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep4Courts = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Court Setup</h3>
        <p className="text-sm text-gray-600 mb-6">
          Add courts to your facility. You can add them individually or in bulk if they have identical properties.
        </p>
      </div>

      {errors.courts && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errors.courts}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 mb-4">
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
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label>Court Type</Label>
                <Select
                  value={bulkCourtData.courtType}
                  onValueChange={(value: any) => setBulkCourtData(prev => ({ ...prev, courtType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tennis">Tennis</SelectItem>
                    <SelectItem value="Pickleball">Pickleball</SelectItem>
                    <SelectItem value="Dual">Dual Use</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Court Number</Label>
                  <Input
                    type="number"
                    value={court.courtNumber}
                    onChange={(e) => updateCourt(court.id, { courtNumber: parseInt(e.target.value) })}
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
                <div>
                  <Label>Court Type</Label>
                  <Select
                    value={court.courtType}
                    onValueChange={(value: any) => updateCourt(court.id, { courtType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tennis">Tennis</SelectItem>
                      <SelectItem value="Pickleball">Pickleball</SelectItem>
                      <SelectItem value="Dual">Dual Use</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                    <div className="grid grid-cols-2 gap-3">
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

  const renderStep6Review = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Review & Submit</h3>
        <p className="text-sm text-gray-600 mb-6">
          Please review your facility information before submitting.
        </p>
      </div>

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
          <div><span className="font-medium">Address:</span> {formData.streetAddress}, {formData.city}, {formData.state} {formData.zipCode}</div>
          <div><span className="font-medium">Phone:</span> {formData.phone}</div>
          <div><span className="font-medium">Email:</span> {formData.email}</div>
          {formData.description && <div><span className="font-medium">Description:</span> {formData.description}</div>}
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
            {formData.courts.map((court) => (
              <div key={court.id} className="flex justify-between">
                <span>{court.name}</span>
                <span className="text-gray-600">
                  {court.surfaceType} · {court.courtType} · {court.isIndoor ? 'Indoor' : 'Outdoor'}
                  {court.canSplit && ` · Splits into ${court.splitConfig?.splitNames.join(', ')}`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="font-medium">Max bookings per week:</span> {formData.maxBookingsPerWeek}</div>
          <div><span className="font-medium">Max booking duration:</span> {formData.maxBookingDurationHours} hours</div>
          <div><span className="font-medium">Advance booking window:</span> {formData.advanceBookingDays} days</div>
          <div><span className="font-medium">Cancellation notice:</span> {formData.cancellationNoticeHours} hours</div>
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <div className="flex flex-col items-center mb-6">
            <Button variant="ghost" onClick={() => navigate('/login')} className="self-start mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <img src={logoImage} alt="CourtTime" className="h-16" />
          </div>
          <CardTitle className="text-2xl">Facility Registration</CardTitle>
          <CardDescription>
            Register your tennis or pickleball facility with CourtTime
          </CardDescription>
        </CardHeader>

        <CardContent>
          {renderProgressBar()}

          <div className="mt-8">
            {!user && currentStep === 1 && renderStep1AdminAccount()}
            {(user ? currentStep === 1 : currentStep === 2) && renderStep2FacilityInfo()}
            {(user ? currentStep === 2 : currentStep === 3) && renderStep3Rules()}
            {(user ? currentStep === 3 : currentStep === 4) && renderStep4Courts()}
            {(user ? currentStep === 4 : currentStep === 5) && renderStep5Admins()}
            {(user ? currentStep === 5 : currentStep === 6) && renderStep6Review()}
          </div>

          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {currentStep < totalSteps ? (
              <Button type="button" onClick={handleNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
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
