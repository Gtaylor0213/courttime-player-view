/**
 * API Client
 * Frontend utility for calling backend API
 */

import {
  buildApiRequest,
  unwrapApiPayload,
  extractBulletinPosts,
  parseApiBoolean,
  isStripeConnectReadyFromResponse,
  normalizeBookingCreateResponse,
  type ApiResponse as SharedApiResponse,
} from '../../shared/api/core';

export {
  unwrapApiPayload,
  extractBulletinPosts,
  parseApiBoolean,
  isStripeConnectReadyFromResponse,
  normalizeBookingCreateResponse,
};

// Dev: always same-origin so Vite can proxy `/api` (ignores stray VITE_API_BASE_URL in .env).
// Production: same-origin by default, or set VITE_API_BASE_URL at build time if API is on another host.
const API_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL ?? '');

export type ApiResponse<T = any> = SharedApiResponse<T>;

export interface TermsAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

const _rawApiRequest = buildApiRequest({
  baseUrl: API_BASE_URL,
  getToken: () => localStorage.getItem('auth_token'),
});

// Intercept payment_locked (402) responses and broadcast to the UI so it can redirect.
function apiRequest<T = unknown>(endpoint: string, options?: RequestInit) {
  return _rawApiRequest<T>(endpoint, options).then((result) => {
    if (!result.success && (result as any).error === 'payment_locked') {
      window.dispatchEvent(new CustomEvent('payment-locked', { detail: (result as any).lockout }));
    }
    return result;
  });
}

// Auth API
export const authApi = {
  register: async (data: {
    email: string;
    password: string;
    fullName: string;
    userType?: string;
    selectedFacilities?: string[];
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    skillLevel?: string;
    ustaRating?: string;
    bio?: string;
    profilePicture?: string;
    notificationPreferences?: {
      emailBookingConfirmations?: boolean;
      smsReminders?: boolean;
      promotionalEmails?: boolean;
      weeklyDigest?: boolean;
      maintenanceUpdates?: boolean;
    };
  }) => {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login: async (email: string, password: string) => {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  addFacility: async (userId: string, facilityId: string, membershipType?: string) => {
    return apiRequest('/api/auth/add-facility', {
      method: 'POST',
      body: JSON.stringify({ userId, facilityId, membershipType }),
    });
  },

  getMe: async (userId: string) => {
    return apiRequest(`/api/auth/me/${userId}`);
  },

  getTermsStatus: async () => {
    return apiRequest('/api/auth/terms/status');
  },

  acceptTerms: async (facilityId: string) => {
    return apiRequest('/api/auth/terms/accept', {
      method: 'POST',
      body: JSON.stringify({ facilityId }),
    });
  },

  forgotPassword: async (email: string) => {
    return apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  validateResetToken: async (token: string) => {
    return apiRequest(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
  },

  resetPassword: async (token: string, password: string) => {
    return apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
};

// Facilities API
export const facilitiesApi = {
  getAll: async () => {
    return apiRequest('/api/facilities');
  },

  search: async (query: string) => {
    return apiRequest(`/api/facilities/search?q=${encodeURIComponent(query)}`);
  },

  getById: async (id: string) => {
    return apiRequest(`/api/facilities/${id}`);
  },

  getCourts: async (id: string) => {
    return apiRequest(`/api/facilities/${id}/courts`);
  },

  getTerms: async (id: string) => {
    return apiRequest(`/api/facilities/${id}/terms`);
  },

  getStats: async () => {
    return apiRequest('/api/facilities/stats');
  },

  register: async (data: {
    // Super Admin Account (if creating new user)
    adminEmail?: string;
    adminPassword?: string;
    adminFullName?: string;

    // Facility Information
    facilityName: string;
    facilityType: string;
    primaryLocationLabel?: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    email: string;
    contactName: string;
    description?: string;
    facilityImage?: string;

    // Contacts
    primaryContact?: {
      name: string;
      email?: string;
      phone?: string;
    };
    secondaryContacts?: Array<{
      name: string;
      email?: string;
      phone?: string;
    }>;
    secondaryLocations?: Array<{
      locationName: string;
      streetAddress: string;
      city: string;
      state: string;
      zipCode: string;
      phone?: string;
    }>;

    // Operating Hours
    operatingHours: Record<string, { open: string; close: string; closed?: boolean }>;

    // Facility Rules
    generalRules: string;
    bookingRules?: Record<string, any>;
    termsAndConditions?: string;
    termsAttachments?: TermsAttachment[];
    requiredReviewSeconds?: number;

    // Restriction settings
    restrictionType: 'account' | 'address';
    maxBookingsPerWeek: string;
    maxBookingDurationHours: string;
    advanceBookingDays: string;

    // Admin restrictions (optional, if different from regular members)
    restrictionsApplyToAdmins?: boolean;
    adminRestrictions?: {
      maxBookingsPerWeek: number;
      maxBookingDurationHours: number;
      advanceBookingDays: number;
    };

    // Peak hours policy (optional) - with slot definitions and selected days
    peakHoursPolicy?: {
      enabled: boolean;
      applyToAdmins: boolean;
      timeSlots: Array<{
        id: string;
        startTime: string;
        endTime: string;
        days: number[];
        appliesToAllCourts?: boolean;
        selectedCourtIds?: string[];
        rules?: {
          maxBookingsPerDay?: number;
          maxBookingsPerWeek?: number;
          maxBookingsPerWeekHousehold?: number;
          maxDurationHours?: number;
        };
      }>;
      maxBookingsPerWeek?: number; // legacy
      maxDurationHours?: number; // legacy
    };

    // Weekend policy (optional)
    weekendPolicy?: {
      enabled: boolean;
      applyToAdmins: boolean;
      maxBookingsPerWeekend: number;
      maxDurationHours: number;
      advanceBookingDays: number;
    };

    // Courts
    courts: Array<{
      name: string;
      courtNumber: number;
      surfaceType: string;
      courtType: string;
      isIndoor: boolean;
      hasLights: boolean;
      isWalkUp?: boolean;
      canSplit?: boolean;
      splitConfig?: {
        splitNames: string[];
        splitType: string;
      };
    }>;

    // Admin Invites
    adminInvites?: Array<{ email: string }>;

    // Address Whitelist
    hoaAddresses?: Array<{ streetAddress: string; city?: string; state?: string; zipCode?: string; householdName?: string }>;

    // Rules engine configs
    ruleConfigs?: Array<{
      ruleCode: string;
      isEnabled: boolean;
      ruleConfig: Record<string, any>;
    }>;

    // Admin profile fields
    adminProfilePicture?: string;
    adminSkillLevel?: string;
    adminUstaRating?: string;
    adminBio?: string;

    // Existing user ID (if already logged in)
    existingUserId?: string;
  }) => {
    return apiRequest('/api/facilities/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Users API
export const usersApi = {
  getById: async (id: string) => {
    return apiRequest(`/api/users/${id}`);
  },

  getWithMemberships: async (id: string) => {
    return apiRequest(`/api/users/${id}/memberships`);
  },

  updateProfile: async (id: string, updates: any) => {
    return apiRequest(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  deleteAccount: async () => {
    return apiRequest('/api/users/me', {
      method: 'DELETE',
    });
  },
};

// Members API
export const membersApi = {
  getFacilityMembers: async (facilityId: string, search?: string) => {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest(`/api/members/${facilityId}${searchParam}`);
  },

  getMemberDetails: async (facilityId: string, userId: string) => {
    return apiRequest(`/api/members/${facilityId}/${userId}`);
  },

  updateMember: async (facilityId: string, userId: string, updates: {
    membershipType?: string;
    status?: 'active' | 'pending' | 'expired' | 'suspended';
    isFacilityAdmin?: boolean;
    isViewOnly?: boolean;
    endDate?: string;
    suspendedUntil?: string | null;
  }) => {
    return apiRequest(`/api/members/${facilityId}/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  removeMember: async (facilityId: string, userId: string) => {
    return apiRequest(`/api/members/${facilityId}/${userId}`, {
      method: 'DELETE',
    });
  },

  addMember: async (facilityId: string, data: {
    userId: string;
    membershipType?: string;
    isFacilityAdmin?: boolean;
  }) => {
    return apiRequest(`/api/members/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setAdmin: async (facilityId: string, userId: string, isAdmin: boolean) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/admin`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin }),
    });
  },

  setViewOnly: async (facilityId: string, userId: string, isViewOnly: boolean) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/view-only`, {
      method: 'PUT',
      body: JSON.stringify({ isViewOnly }),
    });
  },

  setPaymentLockout: async (facilityId: string, userId: string, isPaymentLocked: boolean) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/payment-lockout`, {
      method: 'PUT',
      body: JSON.stringify({ isPaymentLocked }),
    });
  },

  createLockoutPayment: async (facilityId: string, userId: string, amountCents: number, description: string) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/lockout-payment`, {
      method: 'POST',
      body: JSON.stringify({ amountCents, description }),
    });
  },

  getMyPaymentLockout: async () => {
    return apiRequest('/api/members/me/payment-lockout');
  },

  getLockoutInfo: async (facilityId: string) => {
    return apiRequest(`/api/members/${facilityId}/me/lockout-info`);
  },

  getLockoutCheckoutUrl: async (
    facilityId: string,
    options?: { successUrl?: string; cancelUrl?: string }
  ) => {
    return apiRequest(`/api/members/${facilityId}/me/lockout-checkout`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  confirmLockoutPayment: async (facilityId: string, sessionId: string) => {
    return apiRequest(`/api/members/${facilityId}/me/lockout-confirm`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },

  isAdmin: async (facilityId: string, userId: string) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/is-admin`);
  },
};

// User preferences (notifications, etc.)
export const userPreferencesApi = {
  getNotifications: async () => {
    return apiRequest('/api/user-preferences/notifications');
  },

  updateNotifications: async (updates: Record<string, boolean>) => {
    return apiRequest('/api/user-preferences/notifications', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },
};

// Player Profile API
export const playerProfileApi = {
  getProfile: async (userId: string) => {
    return apiRequest(`/api/player-profile/${userId}`);
  },

  updateProfile: async (userId: string, updates: {
    skillLevel?: string;
    ntrpRating?: number;
    playingHand?: string;
    playingStyle?: string;
    preferredCourtSurface?: string;
    bio?: string;
    profileImageUrl?: string;
    yearsPlaying?: number;
  }) => {
    return apiRequest(`/api/player-profile/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  requestMembership: async (userId: string, facilityId: string, membershipType?: string, termsAccepted?: boolean) => {
    return apiRequest(`/api/player-profile/${userId}/request-membership`, {
      method: 'POST',
      body: JSON.stringify({ facilityId, membershipType, termsAccepted }),
    });
  },

  getBookings: async (userId: string, upcoming: boolean = true) => {
    return apiRequest(`/api/player-profile/${userId}/bookings?upcoming=${upcoming}`);
  },
};

// Hitting Partner API
export const hittingPartnerApi = {
  getAll: async () => {
    return apiRequest('/api/hitting-partner');
  },

  getByFacility: async (facilityId: string) => {
    return apiRequest(`/api/hitting-partner/facility/${facilityId}`);
  },

  getUserPosts: async (userId: string) => {
    return apiRequest(`/api/hitting-partner/user/${userId}`);
  },

  create: async (data: {
    userId: string;
    facilityId: string;
    skillLevel?: string;
    availability: string;
    playStyle: string[];
    description: string;
    expiresInDays: number;
  }) => {
    return apiRequest('/api/hitting-partner', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (postId: string, userId: string, updates: {
    availability?: string;
    playStyle?: string[];
    description?: string;
    skillLevel?: string;
    expiresInDays?: number;
  }) => {
    return apiRequest(`/api/hitting-partner/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ userId, ...updates }),
    });
  },

  delete: async (postId: string, userId: string) => {
    return apiRequest(`/api/hitting-partner/${postId}?userId=${userId}`, {
      method: 'DELETE',
    });
  },
};

// Bulletin Board API
export const bulletinBoardApi = {
  getPosts: async (facilityId: string) => {
    return apiRequest(`/api/bulletin-board/${facilityId}`);
  },

  create: async (data: {
    facilityId: string;
    authorId: string;
    title: string;
    content: string;
    category: string;
    isAdminPost?: boolean;
    expiresInDays?: number;
    expiresAfterEvent?: boolean;
    recurrence?: {
      frequency: 'daily' | 'weekly' | 'biweekly';
      endDate?: string;
      occurrenceCount?: number;
    };
    drillStartAt?: string;
    drillCourtId?: string;
    drillMaxParticipants?: number;
    minParticipants?: number;
    cancelIfMinNotMet?: boolean;
    drillGenderRestriction?: 'any' | 'male_only' | 'female_only';
    drillShowParticipants?: boolean;
    requirePayment?: boolean;
    signupAmountCents?: number;
  }) => {
    return apiRequest('/api/bulletin-board', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (postId: string, authorId: string, updates: {
    title?: string;
    content?: string;
    category?: string;
  }) => {
    return apiRequest(`/api/bulletin-board/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ authorId, ...updates }),
    });
  },

  delete: async (postId: string, authorId: string, isAdmin?: boolean) => {
    const params = isAdmin ? `isAdmin=true` : `authorId=${authorId}`;
    return apiRequest(`/api/bulletin-board/${postId}?${params}`, {
      method: 'DELETE',
    });
  },

  togglePin: async (postId: string, facilityId: string, isPinned: boolean) => {
    return apiRequest(`/api/bulletin-board/${postId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ facilityId, isPinned }),
    });
  },

  signupForDrill: async (
    postId: string,
    options?: { successUrl?: string; cancelUrl?: string }
  ) => {
    return apiRequest(`/api/bulletin-board/${postId}/signup`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  confirmSignupPayment: async (sessionId: string) => {
    return apiRequest('/api/bulletin-board/signup/confirm', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },

  cancelDrillSignup: async (postId: string) => {
    return apiRequest(`/api/bulletin-board/${postId}/signup`, {
      method: 'DELETE',
    });
  },

  adminRemoveDrillSignup: async (postId: string, memberUserId: string) => {
    return apiRequest(`/api/bulletin-board/${postId}/signup/${memberUserId}`, {
      method: 'DELETE',
    });
  },
};

// Booking API
export const bookingApi = {
  getByFacility: async (facilityId: string, date: string) => {
    return apiRequest(`/api/bookings/facility/${facilityId}?date=${date}`);
  },

  getByCourt: async (courtId: string, date: string) => {
    return apiRequest(`/api/bookings/court/${courtId}?date=${date}`);
  },

  getByUser: async (userId: string, upcoming: boolean = true) => {
    return apiRequest(`/api/bookings/user/${userId}?upcoming=${upcoming}`);
  },

  getById: async (bookingId: string) => {
    return apiRequest(`/api/bookings/${bookingId}`);
  },

  create: async (data: {
    courtId: string;
    userId: string;
    facilityId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    bookingType?: string;
    notes?: string;
    successUrl?: string;
    cancelUrl?: string;
    bringGuest?: boolean;
    provisionalSameRequestBookings?: Array<{
      bookingDate: string;
      courtId: string;
      startTime: string;
      endTime: string;
      durationMinutes?: number;
    }>;
  }) => {
    const res = await apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizeBookingCreateResponse(res);
  },

  confirmPayment: async (sessionId: string) => {
    const res = await apiRequest('/api/bookings/payment/confirm', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    if (!res.success) return res;
    const payload = unwrapApiPayload<{ bookingId?: string; bookingDate?: string }>(res.data);
    return {
      ...res,
      bookingId: payload?.bookingId,
      bookingDate: payload?.bookingDate,
    };
  },

  reconcilePaidBookings: async () => {
    const res = await apiRequest('/api/bookings/payment/reconcile', { method: 'POST' });
    if (!res.success) return res;
    const payload = unwrapApiPayload<{
      recovered?: Array<{ bookingId: string; bookingDate?: string }>;
      count?: number;
    }>(res.data);
    return {
      ...res,
      recovered: payload?.recovered ?? [],
      count: payload?.count ?? 0,
    };
  },

  createRecurringSeries: async (data: {
    userId: string;
    facilityId: string;
    bookingType?: string;
    notes?: string;
    instances: Array<{
      courtId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    }>;
  }) => {
    return apiRequest('/api/bookings/recurring-series', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancel: async (bookingId: string, userId: string) => {
    return apiRequest(`/api/bookings/${bookingId}?userId=${userId}`, {
      method: 'DELETE',
    });
  },

  validate: async (data: {
    courtId: string;
    userId: string;
    facilityId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }) => {
    return apiRequest('/api/bookings/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Admin API
export const adminApi = {
  // Dashboard
  getDashboardStats: async (facilityId: string) => {
    return apiRequest(`/api/admin/dashboard/${facilityId}`);
  },

  getRevenue: async (facilityId: string, months = 12, limit = 50) => {
    return apiRequest(`/api/admin/revenue/${facilityId}?months=${months}&limit=${limit}`);
  },

  // Facility Management
  updateFacility: async (facilityId: string, data: {
    name?: string;
    type?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    primaryLocationLabel?: string;
    address?: string;
    phone?: string;
    email?: string;
    description?: string;
    operatingHours?: any;
    timezone?: string;
    logoUrl?: string;
    primaryContact?: { name: string; email: string; phone: string };
    secondaryContacts?: Array<{ name: string; email: string; phone: string }>;
    bookingRules?: any;
  }) => {
    return apiRequest(`/api/admin/facilities/${facilityId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Court Management
  createCourt: async (facilityId: string, data: {
    name: string;
    courtNumber: number;
    surfaceType: string;
    courtType: string;
    isIndoor: boolean;
    hasLights: boolean;
    isWalkUp?: boolean;
    requirePayment?: boolean;
    bookingAmountCents?: number | null;
    bookingFeeDollars?: string;
    guestFeeCents?: number | null;
    guestFeeDollars?: string;
    canSplit?: boolean;
    splitConfig?: {
      splitNames: string[];
      splitType: string;
    };
  }) => {
    return apiRequest(`/api/admin/courts/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createCourtsBulk: async (facilityId: string, data: {
    count: number;
    startingNumber: number;
    surfaceType: string;
    courtType: string;
    isIndoor: boolean;
    hasLights: boolean;
    isWalkUp?: boolean;
  }) => {
    return apiRequest(`/api/admin/courts/${facilityId}/bulk`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  bulkUpdateCourts: async (courtIds: string[], updates: {
    surfaceType?: string;
    courtType?: string;
    isIndoor?: boolean;
    hasLights?: boolean;
    isWalkUp?: boolean;
    status?: string;
  }) => {
    return apiRequest('/api/admin/courts/bulk-update', {
      method: 'PATCH',
      body: JSON.stringify({ courtIds, updates }),
    });
  },

  updateCourt: async (courtId: string, data: {
    name?: string;
    courtNumber?: number;
    surfaceType?: string;
    courtType?: string;
    isIndoor?: boolean;
    hasLights?: boolean;
    isWalkUp?: boolean;
    requirePayment?: boolean;
    bookingAmountCents?: number | null;
    bookingFeeDollars?: string;
    guestFeeCents?: number | null;
    guestFeeDollars?: string;
    enableGuestFee?: boolean;
    status?: string;
    canSplit?: boolean;
    splitConfig?: {
      splitNames: string[];
      splitType: string;
    };
  }) => {
    if (!courtId) {
      return { success: false, error: 'Court ID is required' };
    }
    return apiRequest(`/api/admin/courts/${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCourt: async (courtId: string) => {
    if (!courtId) {
      return { success: false, error: 'Court ID is required' };
    }
    return apiRequest(`/api/admin/courts/${courtId}`, {
      method: 'DELETE',
    });
  },

  // Booking Management
  getBookings: async (facilityId: string, filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    courtId?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.courtId) params.append('courtId', filters.courtId);

    const queryString = params.toString();
    return apiRequest(`/api/admin/bookings/${facilityId}${queryString ? `?${queryString}` : ''}`);
  },

  updateBookingStatus: async (bookingId: string, status: string) => {
    return apiRequest(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  updateBookingSeries: async (seriesId: string, data: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    bookingType?: string;
    notes?: string;
  }) => {
    return apiRequest(`/api/admin/booking-series/${seriesId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteBookingSeries: async (seriesId: string) => {
    return apiRequest(`/api/admin/booking-series/${seriesId}`, {
      method: 'DELETE',
    });
  },

  updateBookingSeriesInstances: async (seriesId: string, data: {
    bookingIds: string[];
    startTime: string;
    endTime: string;
    durationMinutes: number;
    bookingType?: string;
    notes?: string;
  }) => {
    return apiRequest(`/api/admin/booking-series/${seriesId}/instances`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteBookingSeriesInstances: async (seriesId: string, bookingIds: string[]) => {
    return apiRequest(`/api/admin/booking-series/${seriesId}/instances`, {
      method: 'DELETE',
      body: JSON.stringify({ bookingIds }),
    });
  },

  // Analytics
  getAnalytics: async (facilityId: string, period?: number) => {
    return apiRequest(`/api/admin/analytics/${facilityId}?period=${period || 30}`);
  },

  // Email Blast
  sendEmailBlast: async (facilityId: string, data: { subject: string; message: string; recipientFilter: string }) => {
    return apiRequest(`/api/admin/email-blast/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Email Templates
  getEmailTemplates: async (facilityId: string) => {
    return apiRequest(`/api/admin/email-templates/${facilityId}`);
  },

  upsertEmailTemplate: async (facilityId: string, templateType: string, data: {
    subject: string;
    bodyHtml: string;
  }) => {
    return apiRequest(`/api/admin/email-templates/${facilityId}/${templateType}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  resetEmailTemplate: async (facilityId: string, templateType: string) => {
    return apiRequest(`/api/admin/email-templates/${facilityId}/${templateType}`, {
      method: 'DELETE',
    });
  },

  previewEmailTemplate: async (facilityId: string, templateType: string, data: {
    subject: string;
    bodyHtml: string;
  }) => {
    return apiRequest(`/api/admin/email-templates/${facilityId}/${templateType}/preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Terms & Conditions
  getTerms: async (facilityId: string) => {
    return apiRequest(`/api/admin/terms/${facilityId}`);
  },

  publishTerms: async (
    facilityId: string,
    contentHtml: string,
    requiredReviewSeconds: number = 0,
    attachments: TermsAttachment[] = []
  ) => {
    return apiRequest(`/api/admin/terms/${facilityId}`, {
      method: 'PUT',
      body: JSON.stringify({ contentHtml, requiredReviewSeconds, attachments }),
    });
  },

  getTermsAcceptanceSummary: async (facilityId: string) => {
    return apiRequest(`/api/admin/terms/${facilityId}/acceptance`);
  },
};

// Court Config API
export const courtConfigApi = {
  /** Per-court operating window for one calendar day (merged with facility defaults on the server). */
  getFacilityDayOperating: async (facilityId: string, dateYmd: string) => {
    const qs = new URLSearchParams({ date: dateYmd });
    return apiRequest(`/api/court-config/facility/${facilityId}?${qs.toString()}`);
  },

  getSchedule: async (courtId: string) => {
    return apiRequest(`/api/court-config/${courtId}/schedule`);
  },

  updateSchedule: async (courtId: string, schedule: Array<{
    day_of_week: number;
    is_open?: boolean;
    open_time?: string;
    close_time?: string;
    prime_time_start?: string | null;
    prime_time_end?: string | null;
    prime_time_max_duration?: number;
    min_duration?: number;
    max_duration?: number;
  }>) => {
    return apiRequest(`/api/court-config/${courtId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    });
  },

  getFacilityBlackouts: async (facilityId: string, options?: {
    startDate?: string;
    endDate?: string;
    includeExpired?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    if (options?.includeExpired) params.append('includeExpired', 'true');
    const qs = params.toString();
    return apiRequest(`/api/court-config/facility/${facilityId}/blackouts${qs ? `?${qs}` : ''}`);
  },

  createBlackout: async (data: {
    courtId?: string | null;
    facilityId: string;
    blackoutType?: string;
    title?: string;
    description?: string;
    startDatetime: string;
    endDatetime: string;
    recurrenceRule?: string | null;
    createdBy?: string;
  }) => {
    return apiRequest('/api/court-config/blackouts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateBlackout: async (blackoutId: string, data: {
    courtId?: string | null;
    blackoutType?: string;
    title?: string;
    description?: string;
    startDatetime?: string;
    endDatetime?: string;
    recurrenceRule?: string | null;
  }) => {
    return apiRequest(`/api/court-config/blackouts/${blackoutId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteBlackout: async (blackoutId: string) => {
    return apiRequest(`/api/court-config/blackouts/${blackoutId}`, {
      method: 'DELETE',
    });
  },
};

// Rules API
export const rulesApi = {
  getDefinitions: async (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return apiRequest(`/api/rules/definitions${qs}`);
  },

  getFacilityRules: async (facilityId: string) => {
    return apiRequest(`/api/rules/facility/${facilityId}`);
  },

  getEffectiveRules: async (facilityId: string) => {
    return apiRequest(`/api/rules/facility/${facilityId}/effective`);
  },

  configureRule: async (facilityId: string, data: {
    ruleCode: string;
    isEnabled: boolean;
    severity?: string;
    ruleConfig?: Record<string, any>;
    customMessage?: string;
  }) => {
    return apiRequest(`/api/rules/facility/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRule: async (facilityId: string, ruleCode: string, data: {
    isEnabled?: boolean;
    severity?: string;
    ruleConfig?: Record<string, any>;
    customMessage?: string;
  }) => {
    return apiRequest(`/api/rules/facility/${facilityId}/${ruleCode}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRule: async (facilityId: string, ruleCode: string) => {
    return apiRequest(`/api/rules/facility/${facilityId}/${ruleCode}`, {
      method: 'DELETE',
    });
  },

  bulkUpdate: async (facilityId: string, rules: Array<{
    ruleCode: string;
    isEnabled: boolean;
    severity?: string;
    ruleConfig?: Record<string, any>;
    customMessage?: string;
  }>) => {
    return apiRequest(`/api/rules/facility/${facilityId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ rules }),
    });
  },

  enableAll: async (facilityId: string) => {
    return apiRequest(`/api/rules/facility/${facilityId}/enable-all`, {
      method: 'POST',
    });
  },

  disableAll: async (facilityId: string) => {
    return apiRequest(`/api/rules/facility/${facilityId}/disable-all`, {
      method: 'POST',
    });
  },
};

// Strikes API
export const strikesApi = {
  getByFacility: async (facilityId: string, options?: { activeOnly?: boolean; userId?: string }) => {
    const params = new URLSearchParams();
    if (options?.activeOnly) params.append('activeOnly', 'true');
    if (options?.userId) params.append('userId', options.userId);
    const qs = params.toString();
    return apiRequest(`/api/strikes/facility/${facilityId}${qs ? `?${qs}` : ''}`);
  },

  getByUser: async (userId: string, facilityId?: string) => {
    const qs = facilityId ? `?facilityId=${facilityId}` : '';
    return apiRequest(`/api/strikes/user/${userId}${qs}`);
  },

  issue: async (data: {
    userId: string;
    facilityId: string;
    strikeType: 'no_show' | 'late_cancel' | 'manual';
    strikeReason?: string;
    relatedBookingId?: string;
    issuedBy?: string;
    expiresAt?: string | null;
  }) => {
    return apiRequest('/api/strikes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  revoke: async (strikeId: string, data: { revokedBy: string; revokeReason?: string }) => {
    return apiRequest(`/api/strikes/${strikeId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete: async (strikeId: string) => {
    return apiRequest(`/api/strikes/${strikeId}`, {
      method: 'DELETE',
    });
  },

  checkLockout: async (userId: string, facilityId?: string) => {
    const qs = facilityId ? `?facilityId=${facilityId}` : '';
    return apiRequest(`/api/strikes/check/${userId}${qs}`);
  },
};

// Address Whitelist API
export const addressWhitelistApi = {
  getAll: async (facilityId: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}`);
  },

  getWithMembers: async (facilityId: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/with-members`);
  },

  add: async (facilityId: string, address: string, accountsLimit?: number, lastName?: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify({ address, accountsLimit, lastName }),
    });
  },

  remove: async (facilityId: string, addressId: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/${addressId}`, {
      method: 'DELETE',
    });
  },

  updateLimit: async (facilityId: string, addressId: string, accountsLimit: number) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/${addressId}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountsLimit }),
    });
  },

  check: async (facilityId: string, address: string, lastName?: string) => {
    const qs = lastName ? `?lastName=${encodeURIComponent(lastName)}` : '';
    return apiRequest(`/api/address-whitelist/${facilityId}/check/${encodeURIComponent(address)}${qs}`);
  },

  getCount: async (facilityId: string, address: string, lastName?: string) => {
    const qs = lastName ? `?lastName=${encodeURIComponent(lastName)}` : '';
    return apiRequest(`/api/address-whitelist/${facilityId}/count/${encodeURIComponent(address)}${qs}`);
  },

  bulkAdd: async (facilityId: string, addresses: Array<{ address: string; lastName?: string; accountsLimit?: number }>) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ addresses }),
    });
  },
};

// Messages API
export const messagesApi = {
  // Get all conversations for a user within a facility
  getConversations: async (facilityId: string, userId: string) => {
    return apiRequest(`/api/messages/conversations/${facilityId}/${userId}`);
  },

  // Get all messages in a conversation
  getMessages: async (conversationId: string) => {
    return apiRequest(`/api/messages/${conversationId}`);
  },

  // Send a new message or create a conversation
  sendMessage: async (senderId: string, recipientId: string, facilityId: string, messageText: string) => {
    return apiRequest('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ senderId, recipientId, facilityId, messageText }),
    });
  },

  // Mark all messages in a conversation as read
  markAsRead: async (conversationId: string, userId: string) => {
    return apiRequest(`/api/messages/${conversationId}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ userId }),
    });
  },

  /** Delete a message you sent */
  deleteMessage: async (messageId: string, userId: string) => {
    return apiRequest(`/api/messages/message/${messageId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    });
  },
};

// Notifications API
export const notificationsApi = {
  // Get all notifications for a user
  getNotifications: async (userId: string) => {
    return apiRequest(`/api/notifications/${userId}`);
  },

  // Get unread count for a user
  getUnreadCount: async (userId: string) => {
    return apiRequest(`/api/notifications/${userId}/unread-count`);
  },

  // Mark a notification as read
  markAsRead: async (notificationId: string) => {
    return apiRequest(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  },

  // Mark all notifications as read for a user
  markAllAsRead: async (userId: string) => {
    return apiRequest(`/api/notifications/${userId}/read-all`, {
      method: 'PATCH',
    });
  },

  // Create a notification (for testing or admin use)
  create: async (data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high';
  }) => {
    return apiRequest('/api/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Delete a notification
  delete: async (notificationId: string) => {
    return apiRequest(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },
};

// Households API
export const householdsApi = {
  getByFacility: async (facilityId: string) => {
    return apiRequest(`/api/households/facility/${facilityId}`);
  },

  getById: async (householdId: string) => {
    return apiRequest(`/api/households/${householdId}`);
  },

  getByUser: async (userId: string, facilityId?: string) => {
    const qs = facilityId ? `?facilityId=${facilityId}` : '';
    return apiRequest(`/api/households/user/${userId}${qs}`);
  },

  create: async (data: {
    facilityId: string;
    streetAddress: string;
    city?: string;
    state?: string;
    zipCode?: string;
    householdName?: string;
    maxMembers?: number;
    maxActiveReservations?: number;
    primeTimeMaxPerWeek?: number;
    hoaAddressId?: string;
  }) => {
    return apiRequest('/api/households', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (householdId: string, data: {
    householdName?: string;
    maxMembers?: number;
    maxActiveReservations?: number;
    primeTimeMaxPerWeek?: number;
  }) => {
    return apiRequest(`/api/households/${householdId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (householdId: string, force?: boolean) => {
    const qs = force ? '?force=true' : '';
    return apiRequest(`/api/households/${householdId}${qs}`, {
      method: 'DELETE',
    });
  },

  addMember: async (householdId: string, data: {
    userId: string;
    isPrimary?: boolean;
    addedBy?: string;
  }) => {
    return apiRequest(`/api/households/${householdId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateMember: async (householdId: string, userId: string, data: {
    isPrimary?: boolean;
    verificationStatus?: 'pending' | 'verified' | 'rejected';
    verifiedBy?: string;
  }) => {
    return apiRequest(`/api/households/${householdId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  removeMember: async (householdId: string, userId: string) => {
    return apiRequest(`/api/households/${householdId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  getBookings: async (householdId: string, includePast?: boolean) => {
    const qs = includePast ? '?includePast=true' : '';
    return apiRequest(`/api/households/${householdId}/bookings${qs}`);
  },

  autoCreate: async (facilityId: string) => {
    return apiRequest('/api/households/auto-create', {
      method: 'POST',
      body: JSON.stringify({ facilityId }),
    });
  },
};

// Payments API
export const paymentsApi = {
  validatePromo: async (code: string, courtCount?: number) => {
    return apiRequest('/api/payments/validate-promo', {
      method: 'POST',
      body: JSON.stringify({ code, courtCount }),
    });
  },

  createCheckoutSession: async (data: {
    facilityName: string;
    courtCount: number;
    amountCents?: number;
    promoCode?: string;
    successUrl: string;
    cancelUrl: string;
  }) => {
    return apiRequest('/api/payments/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  verifySession: async (sessionId: string) => {
    return apiRequest('/api/payments/verify-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },

  getSubscription: async (facilityId: string) => {
    return apiRequest(`/api/payments/subscription/${facilityId}`);
  },

  getPaymentHistory: async (facilityId: string) => {
    return apiRequest(`/api/payments/history/${facilityId}`);
  },

  createPortalSession: async (facilityId: string, returnUrl: string) => {
    return apiRequest('/api/payments/portal-session', {
      method: 'POST',
      body: JSON.stringify({ facilityId, returnUrl }),
    });
  },

  cancelSubscription: async (facilityId: string) => {
    return apiRequest('/api/payments/cancel-subscription', {
      method: 'POST',
      body: JSON.stringify({ facilityId }),
    });
  },
};

// ============================================================
// Stripe Connect (member → club payments) — NEW
// ============================================================

export type PaymentCategory = 'BALL_MACHINE' | 'CLINIC' | 'DRILL' | 'DUES' | 'OTHER';
export type ConnectPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentItem {
  id: string;
  clubId: string;
  name: string;
  description: string | null;
  amountCents: number;
  category: PaymentCategory;
  isRecurring: boolean;
  recurringInterval: 'month' | 'year' | null;
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ConnectPayment {
  id: string;
  clubId: string;
  memberId: string;
  paymentItemId: string;
  amountCents: number;
  platformFeeCents: number;
  status: ConnectPaymentStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAt: string | null;
  createdAt: string;
  itemName?: string;
  itemCategory?: PaymentCategory;
  memberName?: string;
  memberEmail?: string;
}

export const stripeConnectApi = {
  // Returns { url } to send the admin to Stripe-hosted Express onboarding.
  startOnboarding: async (clubId: string) => {
    return apiRequest(
      `/api/stripe/connect?clubId=${encodeURIComponent(clubId)}&format=json`
    );
  },
  // Refresh + return the connected-account onboarding status.
  getStatus: async (clubId: string) => {
    return apiRequest(`/api/stripe/connect/status?clubId=${encodeURIComponent(clubId)}`);
  },
};

export const paymentItemsApi = {
  list: async (clubId: string) => {
    return apiRequest(`/api/payment-items/club/${encodeURIComponent(clubId)}`);
  },
  create: async (data: {
    clubId: string;
    name: string;
    description?: string;
    amountCents: number;
    category: PaymentCategory;
    isRecurring?: boolean;
    recurringInterval?: 'month' | 'year' | null;
  }) => {
    return apiRequest('/api/payment-items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  update: async (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      amountCents: number;
      category: PaymentCategory;
      isRecurring: boolean;
      recurringInterval: 'month' | 'year' | null;
      isActive: boolean;
    }>
  ) => {
    return apiRequest(`/api/payment-items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

export interface SavedPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export const connectPaymentsApi = {
  checkout: async (data: {
    paymentItemId: string;
    successUrl?: string;
    cancelUrl?: string;
  }) => {
    return apiRequest('/api/payments/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getPaymentMethod: async (clubId: string) => {
    return apiRequest<SavedPaymentMethod | null>(
      `/api/payments/payment-method?clubId=${encodeURIComponent(clubId)}`
    );
  },
  setupCheckout: async (data: {
    clubId: string;
    successUrl?: string;
    cancelUrl?: string;
  }) => {
    return apiRequest('/api/payments/setup-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  removePaymentMethod: async (clubId: string) => {
    return apiRequest(`/api/payments/payment-method?clubId=${encodeURIComponent(clubId)}`, {
      method: 'DELETE',
    });
  },
  // Admin — all payments for the club.
  clubHistory: async (clubId: string) => {
    return apiRequest(`/api/payments/history?clubId=${encodeURIComponent(clubId)}`);
  },
  // Member — their own payments (optionally filtered by club).
  myHistory: async (clubId?: string) => {
    const qs = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
    return apiRequest(`/api/payments/my-history${qs}`);
  },
};

// Secondary Facility Locations API
export const facilityLocationsApi = {
  getAll: async (facilityId: string) => {
    return apiRequest(`/api/facility-locations/${facilityId}`);
  },

  add: async (facilityId: string, data: {
    locationName: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    phone?: string;
  }) => {
    return apiRequest(`/api/facility-locations/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (facilityId: string, locationId: string, data: {
    locationName?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    phone?: string;
  }) => {
    return apiRequest(`/api/facility-locations/${facilityId}/${locationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  remove: async (facilityId: string, locationId: string) => {
    return apiRequest(`/api/facility-locations/${facilityId}/${locationId}`, {
      method: 'DELETE',
    });
  },
};
