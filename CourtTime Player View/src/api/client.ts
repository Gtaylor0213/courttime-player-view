/**
 * API Client
 * Frontend utility for calling backend API
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3003';

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
