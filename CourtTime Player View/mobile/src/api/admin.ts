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

export interface AdminAnalytics {
  bookingsTrend: Array<{ date: string; bookings: string | number }>;
  peakHours: Array<{ hour: string | number; bookings: string | number }>;
  courtUsage: Array<{ court_name: string; court_number?: number; bookings: string | number }>;
  memberGrowth: Array<{ date: string; new_members: string | number }>;
  dayOfWeek: Array<{ day_of_week: string | number; bookings: string | number }>;
  heatmap: Array<{ day_of_week: string | number; hour: string | number; bookings: string | number }>;
  statusBreakdown: AdminStatusBreakdownRow[];
  courtUtilization: Array<{ court_name: string; court_number?: number; total_bookings: string | number; total_minutes_booked: string | number }>;
  topBookers: Array<{ member_name: string; email?: string; booking_count: string | number; total_minutes: string | number }>;
}

export function getFullAnalytics(facilityId: string, periodDays: number) {
  return api.get<{ success: boolean; data: Partial<AdminAnalytics> }>(`/api/admin/analytics/${facilityId}?period=${periodDays}`);
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
  durationMinutes?: number;
  notes?: string | null;
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

// ── Recurring series (web's BookingManagement series controls) ──
export interface SeriesEditPayload {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  notes?: string;
}

export function updateBookingSeries(seriesId: string, data: SeriesEditPayload) {
  return api.patch(`/api/admin/booking-series/${seriesId}`, data);
}

export function deleteBookingSeries(seriesId: string) {
  return api.delete(`/api/admin/booking-series/${seriesId}`);
}

export function updateBookingSeriesInstances(seriesId: string, data: SeriesEditPayload & { bookingIds: string[] }) {
  return api.patch(`/api/admin/booking-series/${seriesId}/instances`, data);
}

export function deleteBookingSeriesInstances(seriesId: string, bookingIds: string[]) {
  return api.delete(`/api/admin/booking-series/${seriesId}/instances`, { bookingIds });
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
    memberNumber: string | null;
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
  isAdminOnly?: boolean;
  canSplit?: boolean;
  requirePayment?: boolean;
  bookingAmountCents?: number | null;
  billingMode?: 'hourly' | 'daily' | string | null;
  dailyRateCents?: number | null;
  guestFeeCents?: number | null;
  ballMachineFeeCents?: number | null;
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
  isAdminOnly?: boolean;
  canSplit?: boolean;
  requirePayment?: boolean;
  bookingFeeDollars?: string;
  billingMode?: 'hourly' | 'daily';
  dailyRateDollars?: string;
  guestFeeDollars?: string;
  ballMachineFeeDollars?: string;
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

// ── Member Payments admin (web's AdminMemberPayments: PaymentsTab + BillingTab) ──

export type PaymentCategory = 'BALL_MACHINE' | 'CLINIC' | 'DRILL' | 'DUES' | 'OTHER';

export interface AdminPaymentItem {
  id: string;
  clubId: string;
  name: string;
  description?: string | null;
  amountCents: number;
  category: PaymentCategory;
  isRecurring: boolean;
  recurringInterval?: 'month' | 'year' | null;
  isActive: boolean;
}

export interface ClubPaymentRow {
  id: string;
  source?: 'connect' | 'settlement' | 'annual_fee' | 'pro_shop' | string;
  memberName?: string | null;
  memberEmail?: string | null;
  itemName?: string | null;
  amountCents: number;
  platformFeeCents?: number | null;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | string;
  refundable?: boolean;
  paidAt?: string | null;
  createdAt: string;
}

export interface FacilitySubscription {
  planType?: string;
  status?: string;
  amountCents?: number;
  courtCount?: number;
  currentPeriodEnd?: string | null;
  billingPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export function getStripeConnectStatus(clubId: string) {
  return api.get(`/api/stripe/connect/status?clubId=${encodeURIComponent(clubId)}`);
}

/** `{ success, data: { url } }` — open in the browser to onboard or update Stripe details. */
export function startStripeOnboarding(clubId: string) {
  return api.get(`/api/stripe/connect?clubId=${encodeURIComponent(clubId)}&format=json`);
}

export function listPaymentItems(clubId: string) {
  return api.get<{ success: boolean; data: AdminPaymentItem[] }>(`/api/payment-items/club/${encodeURIComponent(clubId)}`);
}

export function createPaymentItem(data: {
  clubId: string;
  name: string;
  description?: string;
  amountCents: number;
  category: PaymentCategory;
  isRecurring?: boolean;
  recurringInterval?: 'month' | 'year' | null;
}) {
  return api.post('/api/payment-items', data);
}

export function updatePaymentItem(id: string, data: Partial<Omit<AdminPaymentItem, 'id' | 'clubId'>>) {
  return api.put(`/api/payment-items/${encodeURIComponent(id)}`, data);
}

export function getClubPaymentHistory(clubId: string) {
  return api.get(`/api/payments/history?clubId=${encodeURIComponent(clubId)}`);
}

export function refundConnectPayment(connectPaymentId: string) {
  return api.post(`/api/payments/${encodeURIComponent(connectPaymentId)}/refund`, {});
}

export function getFacilitySubscription(facilityId: string) {
  return api.get(`/api/payments/subscription/${facilityId}`);
}

export function getFacilityBillingHistory(facilityId: string) {
  return api.get(`/api/payments/history/${facilityId}`);
}

export function createBillingPortalSession(facilityId: string, returnUrl: string) {
  return api.post('/api/payments/portal-session', { facilityId, returnUrl });
}

export function createFacilityCheckout(facilityId: string, returnUrl: string) {
  return api.post('/api/payments/facility-checkout', { facilityId, returnUrl });
}

export function cancelFacilitySubscription(facilityId: string) {
  return api.post('/api/payments/cancel-subscription', { facilityId });
}

// ── Court waivers + bulk add (web CourtManagement / CourtWaiverSection) ──
export function getCourtWaiver(courtId: string) {
  return api.get(`/api/admin/courts/${courtId}/waiver`);
}
export function publishCourtWaiver(courtId: string, contentHtml: string) {
  return api.put(`/api/admin/courts/${courtId}/waiver`, { contentHtml });
}
export function removeCourtWaiver(courtId: string) {
  return api.delete(`/api/admin/courts/${courtId}/waiver`);
}
export function getCourtWaiverAcceptance(courtId: string) {
  return api.get(`/api/admin/courts/${courtId}/waiver/acceptance`);
}
export function bulkAddCourts(
  facilityId: string,
  input: { count: number; startingNumber: number } & Partial<CreateCourtInput>
) {
  return api.post(`/api/admin/courts/${facilityId}/bulk`, input);
}

// ── Facility details + locations (web FacilityManagement > Details) ──
export interface FacilityContact {
  name?: string;
  email?: string;
  phone?: string;
}
export interface AdminFacilityDetails {
  id: string;
  name: string;
  type?: string | null;
  facilityType?: string | null;
  description?: string | null;
  primaryLocationLabel?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  logoUrl?: string | null;
  primaryContact?: FacilityContact | null;
  secondaryContacts?: FacilityContact[] | null;
}
export function getFacilityDetails(facilityId: string) {
  return api.get(`/api/facilities/${facilityId}`);
}
export function updateFacilityDetails(facilityId: string, data: Partial<AdminFacilityDetails>) {
  return api.patch(`/api/admin/facilities/${facilityId}`, data);
}
export interface FacilityLocationRow {
  id: string;
  locationName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string | null;
}
export function listFacilityLocations(facilityId: string) {
  return api.get(`/api/facility-locations/${facilityId}`);
}
export function createFacilityLocation(facilityId: string, data: Omit<FacilityLocationRow, 'id'>) {
  return api.post(`/api/facility-locations/${facilityId}`, data);
}
export function updateFacilityLocation(facilityId: string, locationId: string, data: Omit<FacilityLocationRow, 'id'>) {
  return api.patch(`/api/facility-locations/${facilityId}/${locationId}`, data);
}
export function deleteFacilityLocation(facilityId: string, locationId: string) {
  return api.delete(`/api/facility-locations/${facilityId}/${locationId}`);
}
