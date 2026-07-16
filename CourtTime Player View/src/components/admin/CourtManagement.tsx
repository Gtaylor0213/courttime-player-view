import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Edit, Trash2, Save, X, Clock, Layers, CheckSquare, AlertCircle, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import {
  facilitiesApi,
  adminApi,
  courtConfigApi,
  stripeConnectApi,
  isStripeConnectReadyFromResponse,
} from '../../api/client';
import { toast } from 'sonner';
import { sortCourtsForDisplay } from '../../../shared/utils/courtDisplayOrder';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberInputChange,
  courtNumberInputDisplayValue,
  formatStandardCourtName,
  isCourtNumberEmpty,
  normalizeCourtNameAndNumber,
} from '../../../shared/utils/courtNaming';
import {
  courtScheduleRowsToOperatingHoursMap,
  extractCourtScheduleFromApiResponse,
  formatGroupedOperatingHoursSummary,
  type OperatingHoursMap,
} from '../../../shared/utils/operatingHours';
import {
  PaidCourtBookingFields,
  formatCentsToDollars,
  parseBookingFeeDollars,
  type PaidCourtFormFields,
} from './PaidCourtBookingFields';
import { CourtScheduleEditor } from './CourtScheduleEditor';
import { SetFeesForAllPanel } from './SetFeesForAllPanel';
import { CourtTypeField } from './CourtTypeField';
import { validateStoredCourtType } from '../../../shared/constants/courtTypes';
import { MAX_COURTS_AT_LIST_PRICE } from '../../services/subscriptionPricing';
import {
  clearCourtAddWaiverDraft,
  confirmCourtAddPaymentFromUrl,
  getCourtAddReturnUrl,
  handleCourtAddPaymentResponse,
  publishStashedCourtAddWaiver,
  stashCourtAddWaiverDraft,
} from '../../utils/courtAddPayment';
import { useCourtAddPromo } from './useCourtAddPromo';
import { CourtAddPromoSection } from './CourtAddPromoSection';
import { CourtWaiverSection } from './CourtWaiverSection';

interface Court extends PaidCourtFormFields {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp: boolean;
  status: 'available' | 'maintenance' | 'closed';
  enableGuestFee?: boolean;
  guestFeeCents?: number | null;
  guestFeeDollars?: string;
  /** Waiver draft for a court being added; published after the court is created. */
  waiverContent?: string;
}


interface BulkAddForm {
  count: number;
  startingNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
}

interface BulkEditForm {
  courtType: string;
  surfaceType: string;
  status: string;
  isIndoor: string; // 'true' | 'false' | '' (unchanged)
  hasLights: string;
}

export function CourtManagement() {
  const { user } = useAuth();
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bulk add state
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [bulkAddForm, setBulkAddForm] = useState<BulkAddForm>({
    count: 4,
    startingNumber: 1,
    courtType: 'Tennis',
    surfaceType: 'Hard Court',
    isIndoor: false,
    hasLights: false,
  });
  const [bulkAdding, setBulkAdding] = useState(false);

  // Bulk edit state
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(new Set());
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>({
    courtType: '',
    surfaceType: '',
    status: '',
    isIndoor: '',
    hasLights: '',
  });
  const [bulkEditing, setBulkEditing] = useState(false);

  // Facility-wide fees state
  const [feesAllMode, setFeesAllMode] = useState(false);

  // Court schedule config state
  const [configuringCourtId, setConfiguringCourtId] = useState<string | null>(null);
  const [courtSchedule, setCourtSchedule] = useState<any[]>([]);
  const [courtScheduleLoading, setCourtScheduleLoading] = useState(false);
  const [courtScheduleSaving, setCourtScheduleSaving] = useState(false);
  const [courtOperatingHours, setCourtOperatingHours] = useState<Record<string, OperatingHoursMap>>({});
  const [courtHoursLoading, setCourtHoursLoading] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);

  const courtEditPanelRef = useRef<HTMLDivElement | null>(null);

  const loadStripeStatus = async (facilityId: string) => {
    setStripeStatusLoading(true);
    try {
      const res = await stripeConnectApi.getStatus(facilityId);
      setStripeOnboarded(isStripeConnectReadyFromResponse(res));
    } catch (err) {
      console.error('Stripe Connect status check failed:', err);
      setStripeOnboarded(null);
    } finally {
      setStripeStatusLoading(false);
    }
  };

  useEffect(() => {
    if (currentFacilityId) {
      loadCourts();
    }
  }, [currentFacilityId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void confirmCourtAddPaymentFromUrl(params, currentFacilityId || undefined).then((confirmed) => {
      if (confirmed && currentFacilityId) {
        void loadCourts();
      }
    });
  }, [currentFacilityId]);

  useEffect(() => {
    if (!editingCourt || isAddingNew) return;
    courtEditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [editingCourt?.id, isAddingNew]);

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

  const loadCourts = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      setCourtOperatingHours({});
      const response = await facilitiesApi.getCourts(currentFacilityId);

      if (response.success && response.data?.courts) {
        // Normalize legacy status values to match DB constraint
        const normalized = response.data.courts.map((c: any) => ({
          ...c,
          status: c.status === 'active' ? 'available' : c.status === 'inactive' ? 'closed' : c.status,
          isWalkUp: c.isWalkUp === true,
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
          ballMachineFeeCents:
            c.ballMachineFeeCents != null
              ? Number(c.ballMachineFeeCents)
              : c.ball_machine_fee_cents != null
                ? Number(c.ball_machine_fee_cents)
                : null,
          ballMachineFeeDollars: formatCentsToDollars(
            c.ballMachineFeeCents ?? c.ball_machine_fee_cents
          ),
          enableBallMachineFee: Boolean(c.ballMachineFeeCents ?? c.ball_machine_fee_cents),
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
      setLoading(false);
    }
  };

  // --- Court Limit ---
  const activeCourts = courts.filter(c => c.status !== 'closed');
  const atSubscriptionCap = activeCourts.length >= MAX_COURTS_AT_LIST_PRICE;
  const courtsToAddForPromo = bulkAddMode ? bulkAddForm.count : 1;
  const courtAddPromo = useCourtAddPromo(activeCourts.length, courtsToAddForPromo);

  // --- Single Add/Edit ---

  const handleAddNew = () => {
    const maxNumber = courts.length > 0 ? Math.max(...courts.map(c => c.courtNumber)) : 0;
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
      enableBallMachineFee: false,
      ballMachineFeeCents: null,
      ballMachineFeeDollars: '',
      status: 'available',
    });
    if (currentFacilityId) void loadStripeStatus(currentFacilityId);
    setIsAddingNew(true);
    setBulkAddMode(false);
    courtAddPromo.resetPromo();
  };

  const handleEdit = (court: Court) => {
    setEditingCourt({
      ...court,
      requirePayment: court.requirePayment === true,
      bookingFeeDollars:
        court.bookingFeeDollars || formatCentsToDollars(court.bookingAmountCents),
      enableGuestFee: Boolean(court.guestFeeCents),
      guestFeeDollars:
        court.guestFeeDollars || formatCentsToDollars(court.guestFeeCents),
      enableBallMachineFee: Boolean(court.ballMachineFeeCents),
      ballMachineFeeDollars:
        court.ballMachineFeeDollars || formatCentsToDollars(court.ballMachineFeeCents),
    });
    if (currentFacilityId) void loadStripeStatus(currentFacilityId);
    setIsAddingNew(false);
  };

  const handleSave = async () => {
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
      !isAddingNew && editingCourt.id ? courts.find((c) => c.id === editingCourt.id) : undefined;
    const wasPaid = existingCourt?.requirePayment === true;
    const turningOnPaidBooking = wantsPayment && !wasPaid;
    const bookingAmountCents =
      parseBookingFeeDollars(editingCourt.bookingFeeDollars) ??
      (wantsPayment ? existingCourt?.bookingAmountCents ?? null : null);
    if (wantsPayment && !bookingAmountCents) {
      toast.error('Enter an hourly rate when paid court booking is enabled');
      return;
    }
    const guestFeeCents = parseBookingFeeDollars(editingCourt.guestFeeDollars);
    const hasGuestFee = Boolean(editingCourt.enableGuestFee);
    if (hasGuestFee && !guestFeeCents) {
      toast.error('Enter a valid guest fee amount');
      return;
    }
    const ballMachineFeeCents = parseBookingFeeDollars(editingCourt.ballMachineFeeDollars);
    const hasBallMachineFee = Boolean(editingCourt.enableBallMachineFee);
    if (hasBallMachineFee && !ballMachineFeeCents) {
      toast.error('Enter a valid ball machine hourly rate');
      return;
    }
    if (turningOnPaidBooking && stripeOnboarded === false) {
      toast.error('Complete Stripe Connect setup under Member Payments first');
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
    if (hasBallMachineFee && stripeOnboarded === false) {
      toast.info(
        'Ball machine fee saved, but Stripe Connect must be set up before members can be charged'
      );
    }

    try {
      setSaving(true);

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
        ballMachineFeeCents: hasBallMachineFee ? ballMachineFeeCents : null,
        ballMachineFeeDollars: hasBallMachineFee ? editingCourt.ballMachineFeeDollars : '',
      };

      let response;
      if (isAddingNew || !editingCourt.id) {
        response = await adminApi.createCourt(currentFacilityId, {
          name: courtName,
          courtNumber,
          surfaceType: editingCourt.surfaceType,
          courtType: editingCourt.courtType,
          isIndoor: editingCourt.isIndoor,
          hasLights: editingCourt.hasLights,
          isWalkUp: editingCourt.isWalkUp,
          returnUrl: getCourtAddReturnUrl(),
          promoCode: courtAddPromo.appliedPromoCode,
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
          ...paymentPayload,
        });
      }

      if (response.success) {
        if (isAddingNew || !editingCourt.id) {
          // Stash the waiver draft in case checkout redirects away; the payment
          // return handler publishes it against the created court.
          stashCourtAddWaiverDraft(editingCourt.waiverContent || '');
          let createdCourtId = (response as any)?.court?.id as string | undefined;
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
                paymentSessionId: sessionId,
                ...paymentPayload,
              });
              if (!confirmRes.success) {
                throw new Error(confirmRes.error || 'Failed to confirm court payment');
              }
              createdCourtId = (confirmRes as any)?.court?.id ?? createdCourtId;
            },
          });
          if (paymentResult === 'redirected') return;
          if (paymentResult === 'failed') return;
          if (createdCourtId) {
            await publishStashedCourtAddWaiver([createdCourtId]);
          } else {
            clearCourtAddWaiverDraft();
          }
        }
        toast.success(isAddingNew ? 'Court created successfully' : 'Court updated successfully');
        setEditingCourt(null);
        setIsAddingNew(false);
        courtAddPromo.resetPromo();
        await loadCourts();
      } else {
        toast.error(response.error || response.message || 'Failed to save court');
      }
    } catch (error: any) {
      console.error('Error saving court:', error);
      toast.error(error?.message || 'Failed to save court');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingCourt(null);
    setIsAddingNew(false);
    setBulkAddMode(false);
    courtAddPromo.resetPromo();
  };

  const handleDelete = async (id: string) => {
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

  // --- Bulk Add ---

  const handleBulkAddToggle = () => {
    setBulkAddMode(true);
    setEditingCourt(null);
    setIsAddingNew(false);
    courtAddPromo.resetPromo();
    const maxNumber = courts.length > 0 ? Math.max(...courts.map(c => c.courtNumber)) : 0;
    setBulkAddForm(prev => ({ ...prev, startingNumber: maxNumber + 1 }));
  };

  const handleBulkAdd = async () => {
    if (!currentFacilityId) return;

    const courtTypeError = validateStoredCourtType(bulkAddForm.courtType);
    if (courtTypeError) {
      toast.error(courtTypeError);
      return;
    }

    try {
      setBulkAdding(true);
      const response = await adminApi.createCourtsBulk(currentFacilityId, {
        count: bulkAddForm.count,
        startingNumber: bulkAddForm.startingNumber,
        surfaceType: bulkAddForm.surfaceType,
        courtType: bulkAddForm.courtType,
        isIndoor: bulkAddForm.isIndoor,
        hasLights: bulkAddForm.hasLights,
        returnUrl: getCourtAddReturnUrl(),
        promoCode: courtAddPromo.appliedPromoCode,
      });

      if (response.success) {
        const paymentResult = await handleCourtAddPaymentResponse(response, {
          onDevConfirm: async (sessionId) => {
            const confirmRes = await adminApi.createCourtsBulk(currentFacilityId, {
              count: bulkAddForm.count,
              startingNumber: bulkAddForm.startingNumber,
              surfaceType: bulkAddForm.surfaceType,
              courtType: bulkAddForm.courtType,
              isIndoor: bulkAddForm.isIndoor,
              hasLights: bulkAddForm.hasLights,
              paymentSessionId: sessionId,
            });
            if (!confirmRes.success) {
              throw new Error(confirmRes.error || 'Failed to confirm court payment');
            }
          },
        });
        if (paymentResult === 'redirected') return;
        if (paymentResult === 'failed') return;

        toast.success(`${bulkAddForm.count} courts created successfully`);
        setBulkAddMode(false);
        courtAddPromo.resetPromo();
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to create courts');
      }
    } catch (error: any) {
      console.error('Error bulk creating courts:', error);
      toast.error('Failed to create courts');
    } finally {
      setBulkAdding(false);
    }
  };

  // --- Bulk Edit / Selection ---

  const toggleCourtSelection = (courtId: string) => {
    setSelectedCourts(prev => {
      const next = new Set(prev);
      if (next.has(courtId)) {
        next.delete(courtId);
      } else {
        next.add(courtId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCourts.size === courts.length) {
      setSelectedCourts(new Set());
    } else {
      setSelectedCourts(new Set(courts.map(c => c.id)));
    }
  };

  const handleBulkEdit = async () => {
    if (selectedCourts.size === 0) return;

    if (bulkEditForm.courtType) {
      const courtTypeError = validateStoredCourtType(bulkEditForm.courtType);
      if (courtTypeError) {
        toast.error(courtTypeError);
        return;
      }
    }

    const updates: Record<string, any> = {};
    if (bulkEditForm.courtType) updates.courtType = bulkEditForm.courtType;
    if (bulkEditForm.surfaceType) updates.surfaceType = bulkEditForm.surfaceType;
    if (bulkEditForm.status) updates.status = bulkEditForm.status;
    if (bulkEditForm.isIndoor) updates.isIndoor = bulkEditForm.isIndoor === 'true';
    if (bulkEditForm.hasLights) updates.hasLights = bulkEditForm.hasLights === 'true';

    if (Object.keys(updates).length === 0) {
      toast.error('Select at least one property to change');
      return;
    }

    try {
      setBulkEditing(true);
      const response = await adminApi.bulkUpdateCourts(
        Array.from(selectedCourts),
        updates
      );

      if (response.success) {
        toast.success(`${selectedCourts.size} courts updated successfully`);
        setSelectedCourts(new Set());
        setBulkEditForm({ courtType: '', surfaceType: '', status: '', isIndoor: '', hasLights: '' });
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to update courts');
      }
    } catch (error: any) {
      console.error('Error bulk updating courts:', error);
      toast.error('Failed to update courts');
    } finally {
      setBulkEditing(false);
    }
  };

  const cancelBulkEdit = () => {
    setSelectedCourts(new Set());
    setBulkEditForm({ courtType: '', surfaceType: '', status: '', isIndoor: '', hasLights: '' });
  };

  // --- Facility-Wide Fees ---

  const handleFeesAllToggle = () => {
    setFeesAllMode(true);
    setEditingCourt(null);
    setIsAddingNew(false);
    setBulkAddMode(false);
    if (currentFacilityId) void loadStripeStatus(currentFacilityId);
  };

  // --- Court Schedule Config ---

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

  const sortedActiveCourts = sortCourtsForDisplay(activeCourts);

  // --- Helpers ---

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const isFormOpen = editingCourt !== null || bulkAddMode || feesAllMode;

  return (
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-medium text-gray-900">Court Management</h1>
              {selectedCourts.size > 0 ? (
                <p className="text-sm text-green-600 mt-1">{selectedCourts.size} court{selectedCourts.size !== 1 ? 's' : ''} selected</p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">{activeCourts.length} active court{activeCourts.length !== 1 ? 's' : ''}</p>
              )}
            </div>
            <div className="flex gap-2">
              {courts.length > 0 && (
                <Button
                  variant="outline"
                  onClick={toggleSelectAll}
                  disabled={isFormOpen}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {selectedCourts.size === courts.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
              {courts.length > 0 && (
                <Button variant="outline" onClick={handleFeesAllToggle} disabled={isFormOpen}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Set Fees for All
                </Button>
              )}
              <Button variant="outline" onClick={handleBulkAddToggle} disabled={isFormOpen}>
                <Layers className="h-4 w-4 mr-2" />
                Bulk Add
              </Button>
              <Button onClick={handleAddNew} disabled={isFormOpen}>
                <Plus className="h-4 w-4 mr-2" />
                Add Court
              </Button>
            </div>
          </div>

          {/* Subscription cap info */}
          {atSubscriptionCap && (
            <Alert className="mb-6 border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Your facility is at the annual plan maximum ($550/year for up to {MAX_COURTS_AT_LIST_PRICE} courts).
                Additional courts can be added at no extra platform charge.
              </AlertDescription>
            </Alert>
          )}

          {/* Facility-Wide Fees Form */}
          {feesAllMode && (
            <SetFeesForAllPanel
              courts={activeCourts}
              stripeOnboarded={stripeOnboarded}
              stripeStatusLoading={stripeStatusLoading}
              onClose={() => setFeesAllMode(false)}
              onApplied={loadCourts}
            />
          )}

          {/* Add New Court Form (only shown when adding, not when editing existing) */}
          {editingCourt && isAddingNew && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle>Add New Court</CardTitle>
                <CardDescription>Configure court details and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="courtName">Court Name</Label>
                    <p className="text-xs text-gray-500">Shown on the calendar — any label you want (not tied to court number).</p>
                    <Input
                      id="courtName"
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
                    <Label htmlFor="courtNumber">Court Number</Label>
                    <Input
                      id="courtNumber"
                      type="text"
                      inputMode="numeric"
                      value={courtNumberInputDisplayValue(editingCourt.courtNumber)}
                      onChange={(e) =>
                        setEditingCourt((prev) =>
                          prev
                            ? {
                                ...prev,
                                ...courtFieldsAfterNumberInputChange(e.target.value, prev.name),
                              }
                            : prev
                        )
                      }
                    />
                  </div>
                  <CourtTypeField
                    id="courtType"
                    value={editingCourt.courtType}
                    onChange={(courtType) =>
                      setEditingCourt((prev) => (prev ? { ...prev, courtType } : prev))
                    }
                  />
                  <div className="space-y-2">
                    <Label htmlFor="courtSurface">Surface Type</Label>
                    <Select
                      value={editingCourt.surfaceType}
                      onValueChange={(value) =>
                        setEditingCourt((prev) => (prev ? { ...prev, surfaceType: value } : prev))
                      }
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
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="indoor"
                      checked={editingCourt.isIndoor}
                      onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, isIndoor: checked } : prev))
                      }
                    />
                    <Label htmlFor="indoor">Indoor Court</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="lights"
                      checked={editingCourt.hasLights}
                      onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, hasLights: checked } : prev))
                      }
                    />
                    <Label htmlFor="lights">Has Lights</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="walkUp"
                      checked={editingCourt.isWalkUp}
                      onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, isWalkUp: checked } : prev))
                      }
                    />
                    <Label htmlFor="walkUp">Walk-up Court (no online booking)</Label>
                  </div>
                </div>
                {editingCourt && (
                  <PaidCourtBookingFields
                    court={editingCourt}
                    onChange={(patch) => setEditingCourt((prev) => (prev ? { ...prev, ...patch } : prev))}
                    stripeOnboarded={stripeOnboarded}
                    stripeStatusLoading={stripeStatusLoading}
                  />
                )}
                {editingCourt && (
                  <CourtWaiverSection
                    courtId={null}
                    idPrefix="new-court"
                    draftContent={editingCourt.waiverContent || ''}
                    onDraftChange={(waiverContent) =>
                      setEditingCourt((prev) => (prev ? { ...prev, waiverContent } : prev))
                    }
                  />
                )}
                <CourtAddPromoSection
                  courtsToAdd={1}
                  baseAmountCents={courtAddPromo.baseAmountCents}
                  finalAmountCents={courtAddPromo.finalAmountCents}
                  paymentRequired={courtAddPromo.paymentRequired}
                  perCourtLabel={courtAddPromo.perCourtLabel}
                  promoCode={courtAddPromo.promoCode}
                  setPromoCode={courtAddPromo.setPromoCode}
                  promoValidation={courtAddPromo.promoValidation}
                  setPromoValidation={courtAddPromo.setPromoValidation}
                  isValidatingPromo={courtAddPromo.isValidatingPromo}
                  onValidate={courtAddPromo.handleValidatePromo}
                  onClear={courtAddPromo.handleClearPromo}
                />
                <div className="flex gap-2 mt-6">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Create Court'}
                  </Button>
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bulk Add Form */}
          {bulkAddMode && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle>Bulk Add Courts</CardTitle>
                <CardDescription>Create multiple courts with shared properties</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bulkCount">Number of Courts</Label>
                    <Input
                      id="bulkCount"
                      type="number"
                      min={1}
                      max={50}
                      value={bulkAddForm.count}
                      onChange={(e) => setBulkAddForm({ ...bulkAddForm, count: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startingNumber">Starting Number</Label>
                    <Input
                      id="startingNumber"
                      type="number"
                      min={1}
                      value={bulkAddForm.startingNumber}
                      onChange={(e) => setBulkAddForm({ ...bulkAddForm, startingNumber: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <CourtTypeField
                    id="bulkCourtType"
                    value={bulkAddForm.courtType}
                    onChange={(courtType) => setBulkAddForm({ ...bulkAddForm, courtType })}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="bulkSurfaceType">Surface Type</Label>
                    <Select
                      value={bulkAddForm.surfaceType}
                      onValueChange={(value) => setBulkAddForm({ ...bulkAddForm, surfaceType: value })}
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
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="bulkIndoor"
                      checked={bulkAddForm.isIndoor}
                      onCheckedChange={(checked) => setBulkAddForm({ ...bulkAddForm, isIndoor: checked })}
                    />
                    <Label htmlFor="bulkIndoor">Indoor</Label>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="bulkLights"
                      checked={bulkAddForm.hasLights}
                      onCheckedChange={(checked) => setBulkAddForm({ ...bulkAddForm, hasLights: checked })}
                    />
                    <Label htmlFor="bulkLights">Has Lights</Label>
                  </div>
                </div>
                <CourtAddPromoSection
                  courtsToAdd={bulkAddForm.count}
                  baseAmountCents={courtAddPromo.baseAmountCents}
                  finalAmountCents={courtAddPromo.finalAmountCents}
                  paymentRequired={courtAddPromo.paymentRequired}
                  perCourtLabel={courtAddPromo.perCourtLabel}
                  promoCode={courtAddPromo.promoCode}
                  setPromoCode={courtAddPromo.setPromoCode}
                  promoValidation={courtAddPromo.promoValidation}
                  setPromoValidation={courtAddPromo.setPromoValidation}
                  isValidatingPromo={courtAddPromo.isValidatingPromo}
                  onValidate={courtAddPromo.handleValidatePromo}
                  onClear={courtAddPromo.handleClearPromo}
                />
                <p className="text-sm text-gray-500 mt-3">
                  This will create Court {bulkAddForm.startingNumber} through Court {bulkAddForm.startingNumber + bulkAddForm.count - 1}.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleBulkAdd} disabled={bulkAdding}>
                    <Layers className="h-4 w-4 mr-2" />
                    {bulkAdding ? 'Creating...' : `Create ${bulkAddForm.count} Courts`}
                  </Button>
                  <Button variant="outline" onClick={handleCancel} disabled={bulkAdding}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Courts List */}
          <div className="grid grid-cols-1 gap-4">
            {sortedActiveCourts.map((court) => {
              const isEditingThis =
                editingCourt !== null && !isAddingNew && editingCourt.id === court.id;
              const hoursSummary = courtHoursLoading
                ? null
                : formatGroupedOperatingHoursSummary(courtOperatingHours[court.id] || {});
              return (
              <React.Fragment key={court.id}>
                <Card
                  className={[
                    selectedCourts.has(court.id) ? 'ring-2 ring-green-400 bg-green-50/30' : '',
                    isEditingThis ? 'border-green-200' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={selectedCourts.has(court.id)}
                          onCheckedChange={() => toggleCourtSelection(court.id)}
                          className="h-5 w-5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold">{court.name}</h3>
                            <Badge className={getStatusColor(court.status)}>{formatStatus(court.status)}</Badge>
                            {courtHoursLoading ? (
                              <span className="text-xs text-gray-400">Loading hours…</span>
                            ) : hoursSummary ? (
                              <span className="text-xs text-gray-600 font-normal">{hoursSummary}</span>
                            ) : null}
                            {court.isWalkUp && <Badge variant="secondary">Walk-up</Badge>}
                            {court.requirePayment && court.bookingAmountCents && (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-200">
                                Paid · ${(court.bookingAmountCents / 100).toFixed(2)}/hr
                              </Badge>
                            )}
                            {court.guestFeeCents && (
                              <Badge className="bg-blue-100 text-blue-900 border-blue-200">
                                Guest fee · ${(court.guestFeeCents / 100).toFixed(2)}/guest
                              </Badge>
                            )}
                            {court.ballMachineFeeCents && (
                              <Badge className="bg-purple-100 text-purple-900 border-purple-200">
                                Ball machine · ${(court.ballMachineFeeCents / 100).toFixed(2)}/hr
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
                          onClick={() => handleEdit(court)}
                          disabled={editingCourt !== null}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(court.id)}
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
                      ref={courtEditPanelRef}
                      className="border-t border-green-200 px-6 pb-6 pt-4 bg-green-50 scroll-mt-6"
                    >
                      <h4 className="text-base font-semibold text-gray-900">Edit {court.name}</h4>
                      <p className="text-sm text-gray-600 mt-1 mb-4">Configure court details and settings</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`courtName-${court.id}`}>Court Name</Label>
                          <p className="text-xs text-gray-500">Shown on the calendar — any label you want.</p>
                          <Input
                            id={`courtName-${court.id}`}
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
                          <Label htmlFor={`courtNumber-${court.id}`}>Court Number</Label>
                          <Input
                            id={`courtNumber-${court.id}`}
                            type="text"
                            inputMode="numeric"
                            value={courtNumberInputDisplayValue(editingCourt.courtNumber)}
                            onChange={(e) =>
                        setEditingCourt((prev) =>
                          prev
                            ? {
                                ...prev,
                                ...courtFieldsAfterNumberInputChange(e.target.value, prev.name),
                              }
                            : prev
                        )
                      }
                          />
                        </div>
                        <CourtTypeField
                          id={`courtType-${court.id}`}
                          value={editingCourt.courtType}
                          onChange={(courtType) =>
                            setEditingCourt((prev) => (prev ? { ...prev, courtType } : prev))
                          }
                        />
                        <div className="space-y-2">
                          <Label>Surface Type</Label>
                          <Select
                            value={editingCourt.surfaceType}
                            onValueChange={(value) =>
                        setEditingCourt((prev) => (prev ? { ...prev, surfaceType: value } : prev))
                      }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Hard Court">Hard Court</SelectItem>
                              <SelectItem value="Clay Court">Clay Court</SelectItem>
                              <SelectItem value="Grass Court">Grass Court</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={editingCourt.status}
                            onValueChange={(value: 'available' | 'maintenance' | 'closed') =>
                              setEditingCourt((prev) => (prev ? { ...prev, status: value } : prev))
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="maintenance">Maintenance</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`indoor-${court.id}`}
                            checked={editingCourt.isIndoor}
                            onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, isIndoor: checked } : prev))
                      }
                          />
                          <Label htmlFor={`indoor-${court.id}`}>Indoor Court</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`lights-${court.id}`}
                            checked={editingCourt.hasLights}
                            onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, hasLights: checked } : prev))
                      }
                          />
                          <Label htmlFor={`lights-${court.id}`}>Has Lights</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`walkUp-${court.id}`}
                            checked={editingCourt.isWalkUp}
                            onCheckedChange={(checked) =>
                        setEditingCourt((prev) => (prev ? { ...prev, isWalkUp: checked } : prev))
                      }
                          />
                          <Label htmlFor={`walkUp-${court.id}`}>Walk-up Court (no online booking)</Label>
                        </div>
                      </div>
                      {editingCourt && (
                        <PaidCourtBookingFields
                          court={editingCourt}
                          onChange={(patch) => setEditingCourt((prev) => (prev ? { ...prev, ...patch } : prev))}
                          stripeOnboarded={stripeOnboarded}
                          stripeStatusLoading={stripeStatusLoading}
                        />
                      )}
                      {editingCourt && (
                        <CourtWaiverSection courtId={court.id} idPrefix={court.id} />
                      )}
                      <div className="flex gap-2 mt-6">
                        <Button onClick={handleSave} disabled={saving}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? 'Saving...' : 'Save Court'}
                        </Button>
                        <Button variant="outline" onClick={handleCancel} disabled={saving}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Court Schedule Config Panel */}
                {configuringCourtId === court.id && (
                  <Card className="border-green-200 bg-green-50/50">
                    <CardHeader>
                      <CardTitle className="text-base">Operating Schedule — {court.name}</CardTitle>
                      <CardDescription>Configure available and unavailable hours for each day</CardDescription>
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

          {courts.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-500">No courts configured. Click "Add Court" or "Bulk Add" to get started.</p>
              </CardContent>
            </Card>
          )}

          {/* Floating Bulk Edit Bar */}
          {selectedCourts.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-medium text-sm whitespace-nowrap">
                    {selectedCourts.size} court{selectedCourts.size !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-3 flex-wrap flex-1">
                    <div className="w-full sm:min-w-[200px] sm:max-w-[280px]">
                      <CourtTypeField
                        id="bulkEditCourtType"
                        label=""
                        value={bulkEditForm.courtType}
                        onChange={(courtType) =>
                          setBulkEditForm({ ...bulkEditForm, courtType })
                        }
                        allowEmpty
                        emptyPlaceholder="Court Type"
                      />
                    </div>
                    <Select value={bulkEditForm.surfaceType} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, surfaceType: v })}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Surface" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hard Court">Hard Court</SelectItem>
                        <SelectItem value="Clay Court">Clay Court</SelectItem>
                        <SelectItem value="Grass Court">Grass Court</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.status} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, status: v })}>
                      <SelectTrigger className="w-full sm:w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.isIndoor} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, isIndoor: v })}>
                      <SelectTrigger className="w-full sm:w-[120px]">
                        <SelectValue placeholder="Indoor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Indoor</SelectItem>
                        <SelectItem value="false">Outdoor</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.hasLights} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, hasLights: v })}>
                      <SelectTrigger className="w-full sm:w-[120px]">
                        <SelectValue placeholder="Lights" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Has Lights</SelectItem>
                        <SelectItem value="false">No Lights</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleBulkEdit} disabled={bulkEditing}>
                      <Save className="h-4 w-4 mr-2" />
                      {bulkEditing ? 'Applying...' : 'Apply Changes'}
                    </Button>
                    <Button variant="outline" onClick={cancelBulkEdit} disabled={bulkEditing}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
