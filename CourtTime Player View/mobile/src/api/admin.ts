/**
 * Thin wrappers around the admin / members / strikes / court-config endpoints
 * used by the Admin tab screens. Each function just wraps `api.*` with the
 * exact response shape the server returns (see server/routes/admin.ts,
 * members.ts, strikes.ts, courtConfig.ts) — no extra normalization layer.
 */
import { api } from './client';

// ── Dashboard / Analytics ──

export interface AdminDashboardStats {
  totalBookings: number;
  bookingsChange: number;
  activeMembers: number;
  newMembers: number;
  courtUtilization: number;
  revenueCents: number;
  revenueDollars: string;
  revenueBreakdown: Record<string, number>;
}

export interface AdminRecentActivityItem {
  id: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  userName: string;
  courtName: string;
  status: string;
  createdAt: string;
}

export interface AdminStatusBreakdownRow {
  status: string;
  count: string;
}

export function getDashboardStats(facilityId: string) {
  return api.get<{
    success: boolean;
    data: { stats: AdminDashboardStats; recentActivity: AdminRecentActivityItem[] };
  }>(`/api/admin/dashboard/${facilityId}`);
}

export function getAnalytics(facilityId: string, periodDays: number) {
  return api.get<{
    success: boolean;
    data: { statusBreakdown: AdminStatusBreakdownRow[] };
  }>(`/api/admin/analytics/${facilityId}?period=${periodDays}`);
}

// ── Bookings ──

export interface AdminBookingFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  courtId?: string;
}

export interface AdminBookingRow {
  id: string;
  seriesId: string | null;
  isRecurring: boolean;
  courtId: string;
  courtName: string;
  userId: string;
  userName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | string;
  bookingType?: string;
  walkInName?: string | null;
  paymentMode?: string | null;
  frontDeskAmountDueCents?: number | null;
  frontDeskCollectedAt?: string | null;
}

export function getAdminBookings(facilityId: string, filters: AdminBookingFilters) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.courtId && filters.courtId !== 'all') params.set('courtId', filters.courtId);
  return api.get<{ success: boolean; data: { bookings: AdminBookingRow[] } }>(
    `/api/admin/bookings/${facilityId}?${params.toString()}`
  );
}

export function updateBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'cancelled' | 'completed'
) {
  return api.patch(`/api/admin/bookings/${bookingId}/status`, { status });
}

export function collectFrontDeskFee(bookingId: string) {
  return api.post(`/api/bookings/${bookingId}/front-desk-fee/collect`, {});
}

// ── Members ──

export interface AdminMemberRow {
  userId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  membershipType?: string | null;
  status: 'active' | 'pending' | 'suspended' | 'expired' | string;
  isFacilityAdmin: boolean;
  isSubAdmin: boolean;
  isViewOnly: boolean;
  isPaymentLocked: boolean;
  lockoutAmountCents?: number | null;
  lockoutDescription?: string | null;
  suspendedUntil?: string | null;
  memberNumber?: string | null;
}

export function getFacilityMembers(facilityId: string) {
  return api.get<{ success: boolean; members: AdminMemberRow[] }>(`/api/members/${facilityId}`);
}

export function updateMember(
  facilityId: string,
  userId: string,
  updates: Partial<{
    status: string;
    suspendedUntil: string | null;
    membershipType: string;
  }>
) {
  return api.patch<{ success: boolean; member: AdminMemberRow; message?: string }>(
    `/api/members/${facilityId}/${userId}`,
    updates
  );
}

export function setMemberAdmin(facilityId: string, userId: string, isAdmin: boolean) {
  return api.put<{ success: boolean; member: AdminMemberRow; message?: string }>(
    `/api/members/${facilityId}/${userId}/admin`,
    { isAdmin }
  );
}

export function setMemberSubAdmin(facilityId: string, userId: string, isSubAdmin: boolean) {
  return api.put<{ success: boolean; member: AdminMemberRow; message?: string }>(
    `/api/members/${facilityId}/${userId}/sub-admin`,
    { isSubAdmin }
  );
}

export function setMemberViewOnly(facilityId: string, userId: string, isViewOnly: boolean) {
  return api.put<{ success: boolean; member: AdminMemberRow; message?: string }>(
    `/api/members/${facilityId}/${userId}/view-only`,
    { isViewOnly }
  );
}

export function removeMember(facilityId: string, userId: string) {
  return api.delete(`/api/members/${facilityId}/${userId}`);
}

export function setMemberPaymentLockout(facilityId: string, userId: string, isPaymentLocked: boolean) {
  return api.put(`/api/members/${facilityId}/${userId}/payment-lockout`, { isPaymentLocked });
}

export function createLockoutPayment(
  facilityId: string,
  userId: string,
  amountCents: number,
  description: string
) {
  return api.post(`/api/members/${facilityId}/${userId}/lockout-payment`, {
    amountCents,
    description,
  });
}

// ── Strikes ──

export type StrikeType = 'no_show' | 'late_cancel' | 'manual';

export interface AdminStrikeRow {
  id: string;
  user_id: string;
  facility_id: string;
  strike_type: StrikeType;
  strike_reason: string | null;
  issued_at: string;
  revoked: boolean;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export function getStrikesForUser(facilityId: string, userId: string) {
  return api.get<{ success: boolean; strikes: AdminStrikeRow[] }>(
    `/api/strikes/facility/${facilityId}?userId=${userId}`
  );
}

export function issueStrike(
  facilityId: string,
  userId: string,
  strikeType: StrikeType,
  strikeReason: string
) {
  return api.post(`/api/strikes`, { facilityId, userId, strikeType, strikeReason });
}

export function revokeStrike(strikeId: string, revokeReason: string) {
  return api.post(`/api/strikes/${strikeId}/revoke`, { revokeReason });
}

// ── Courts & schedule ──

export interface AdminCourtRow {
  id: string;
  facilityId: string;
  name: string;
  courtNumber: number;
  surfaceType?: string;
  courtType?: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp: boolean;
  status: 'available' | 'maintenance' | 'closed' | string;
}

export function getFacilityCourts(facilityId: string) {
  return api.get<AdminCourtRow[] | { courts: AdminCourtRow[] }>(
    `/api/facilities/${facilityId}/courts`
  );
}

export interface CreateCourtInput {
  name: string;
  courtNumber: number;
  surfaceType: string;
  courtType: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp: boolean;
}

export function createCourt(facilityId: string, input: CreateCourtInput) {
  return api.post<{
    success: boolean;
    requiresPayment?: boolean;
    data?: { court?: AdminCourtRow; checkoutUrl?: string };
    error?: string;
  }>(`/api/admin/courts/${facilityId}`, input);
}

export function updateCourt(courtId: string, updates: Partial<CreateCourtInput & { status: string }>) {
  return api.patch<{ success: boolean; data: { court: AdminCourtRow } }>(
    `/api/admin/courts/${courtId}`,
    updates
  );
}

export function deleteCourt(courtId: string) {
  return api.delete(`/api/admin/courts/${courtId}`);
}

export interface CourtScheduleDay {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export function getCourtSchedule(courtId: string) {
  return api.get<{ success: boolean; schedule: CourtScheduleDay[]; isDefault: boolean }>(
    `/api/court-config/${courtId}/schedule`
  );
}

export function updateCourtSchedule(courtId: string, schedule: CourtScheduleDay[]) {
  return api.put<{ success: boolean; schedule: CourtScheduleDay[] }>(
    `/api/court-config/${courtId}/schedule`,
    { schedule }
  );
}

// ── Blackouts ──

export interface AdminBlackoutRow {
  id: string;
  court_id: string | null;
  court_name?: string | null;
  facility_id: string;
  blackout_type: string;
  title: string;
  description?: string | null;
  start_datetime: string;
  end_datetime: string;
}

export function getFacilityBlackouts(facilityId: string) {
  return api.get<{ success: boolean; blackouts: AdminBlackoutRow[] }>(
    `/api/court-config/facility/${facilityId}/blackouts`
  );
}

export function createBlackout(input: {
  courtId?: string | null;
  facilityId: string;
  blackoutType: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
}) {
  return api.post<{ success: boolean; blackout: AdminBlackoutRow }>(
    `/api/court-config/blackouts`,
    input
  );
}

export function deleteBlackout(blackoutId: string) {
  return api.delete(`/api/court-config/blackouts/${blackoutId}`);
}

// ── Communication ──

export function sendEmailBlast(facilityId: string, subject: string, message: string, recipientFilter: string) {
  return api.post<{
    success: boolean;
    data: { sent: number; failed: number; total: number; errorMessage?: string };
  }>(`/api/admin/email-blast/${facilityId}`, { subject, message, recipientFilter });
}
