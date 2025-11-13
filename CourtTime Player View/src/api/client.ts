/**
 * API Client
 * Frontend utility for calling backend API
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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
