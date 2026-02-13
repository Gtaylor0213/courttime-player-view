/**
 * API Client
 * Frontend utility for calling backend API
 */

// In production, use empty string for same-origin API calls
// In development, fallback to localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Request failed',
      };
    }

    return {
      success: true,
      data,
      message: data.message,
    };
  } catch (error: any) {
    console.error('API request error:', error);
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
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
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    email: string;
    contactName: string;
    description?: string;

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

    // Operating Hours
    operatingHours: Record<string, { open: string; close: string; closed?: boolean }>;

    // Facility Rules
    generalRules: string;

    // Restriction settings
    restrictionType: 'account' | 'address';
    maxBookingsPerWeek: string;
    maxBookingDurationHours: string;
    advanceBookingDays: string;
    cancellationNoticeHours: string;

    // Admin restrictions (optional, if different from regular members)
    restrictionsApplyToAdmins?: boolean;
    adminRestrictions?: {
      maxBookingsPerWeek: number;
      maxBookingDurationHours: number;
      advanceBookingDays: number;
      cancellationNoticeHours: number;
    };

    // Peak hours policy (optional) - with per-day time slots
    peakHoursPolicy?: {
      enabled: boolean;
      applyToAdmins: boolean;
      timeSlots: Record<string, Array<{ id: string; startTime: string; endTime: string }>>; // e.g., { monday: [{id, startTime, endTime}], ... }
      maxBookingsPerWeek: number;
      maxDurationHours: number;
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
      canSplit?: boolean;
      splitConfig?: {
        splitNames: string[];
        splitType: string;
      };
    }>;

    // Admin Invites
    adminInvites?: Array<{ email: string }>;

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
    endDate?: string;
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

  isAdmin: async (facilityId: string, userId: string) => {
    return apiRequest(`/api/members/${facilityId}/${userId}/is-admin`);
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

  requestMembership: async (userId: string, facilityId: string, membershipType?: string) => {
    return apiRequest(`/api/player-profile/${userId}/request-membership`, {
      method: 'POST',
      body: JSON.stringify({ facilityId, membershipType }),
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

  delete: async (postId: string, authorId: string) => {
    return apiRequest(`/api/bulletin-board/${postId}?authorId=${authorId}`, {
      method: 'DELETE',
    });
  },

  togglePin: async (postId: string, facilityId: string, isPinned: boolean) => {
    return apiRequest(`/api/bulletin-board/${postId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ facilityId, isPinned }),
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
  }) => {
    return apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancel: async (bookingId: string, userId: string) => {
    return apiRequest(`/api/bookings/${bookingId}?userId=${userId}`, {
      method: 'DELETE',
    });
  },
};

// Admin API
export const adminApi = {
  // Dashboard
  getDashboardStats: async (facilityId: string) => {
    return apiRequest(`/api/admin/dashboard/${facilityId}`);
  },

  // Facility Management
  updateFacility: async (facilityId: string, data: {
    name?: string;
    type?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    address?: string; // Legacy field
    phone?: string;
    email?: string;
    description?: string;
    amenities?: string[];
    operatingHours?: any;
    logoUrl?: string;
  }) => {
    return apiRequest(`/api/admin/facilities/${facilityId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Court Management
  updateCourt: async (courtId: string, data: {
    name?: string;
    courtNumber?: number;
    surfaceType?: string;
    courtType?: string;
    isIndoor?: boolean;
    hasLights?: boolean;
    status?: string;
  }) => {
    return apiRequest(`/api/admin/courts/${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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

  // Analytics
  getAnalytics: async (facilityId: string, period?: number) => {
    return apiRequest(`/api/admin/analytics/${facilityId}?period=${period || 30}`);
  },
};

// Address Whitelist API
export const addressWhitelistApi = {
  getAll: async (facilityId: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}`);
  },

  add: async (facilityId: string, address: string, accountsLimit?: number) => {
    return apiRequest(`/api/address-whitelist/${facilityId}`, {
      method: 'POST',
      body: JSON.stringify({ address, accountsLimit }),
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

  check: async (facilityId: string, address: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/check/${encodeURIComponent(address)}`);
  },

  getCount: async (facilityId: string, address: string) => {
    return apiRequest(`/api/address-whitelist/${facilityId}/count/${encodeURIComponent(address)}`);
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
