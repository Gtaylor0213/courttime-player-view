// In production, use empty string for same-origin API calls
// In development, fallback to localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

const API_BASE = `${API_BASE_URL}/api/developer`;

// ── Auth helpers ───────────────────────────────────────────

const getPassword = (): string | null => sessionStorage.getItem('support_password');

export const setSupportPassword = (password: string): void => {
  sessionStorage.setItem('support_password', password);
};

export const clearSupportPassword = (): void => {
  sessionStorage.removeItem('support_password');
};

export const isSupportAuthenticated = (): boolean => !!getPassword();

// ── Fetch wrapper ──────────────────────────────────────────

async function supportFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const password = getPassword();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (password) headers['x-developer-password'] = password;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  return response.json();
}

// ── Auth ───────────────────────────────────────────────────

export async function verifyPassword(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-developer-password': password,
      },
    });
    const data = await response.json();
    if (data.success) setSupportPassword(password);
    return data;
  } catch {
    return { success: false, error: 'Failed to connect to server' };
  }
}

// ── Dashboard ──────────────────────────────────────────────

export async function getDashboardStats() {
  try {
    return await supportFetch('/dashboard');
  } catch {
    return { success: false, error: 'Failed to fetch dashboard' };
  }
}

// ── Users ──────────────────────────────────────────────────

export async function searchUsers(q: string) {
  try {
    return await supportFetch(`/users/search?q=${encodeURIComponent(q)}`);
  } catch {
    return { success: false, error: 'Failed to search users' };
  }
}

export async function getUserProfile(userId: string) {
  try {
    return await supportFetch(`/users/${userId}`);
  } catch {
    return { success: false, error: 'Failed to fetch user profile' };
  }
}

export async function sendPasswordResetEmail(userId: string) {
  try {
    return await supportFetch(`/users/${userId}/reset-password-email`, { method: 'POST' });
  } catch {
    return { success: false, error: 'Failed to send reset email' };
  }
}

export async function setTemporaryPassword(userId: string, password: string) {
  try {
    return await supportFetch(`/users/${userId}/set-temporary-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  } catch {
    return { success: false, error: 'Failed to set password' };
  }
}

// ── Facilities ─────────────────────────────────────────────

export async function getFacilities() {
  try {
    return await supportFetch('/facilities');
  } catch {
    return { success: false, error: 'Failed to fetch facilities' };
  }
}

export async function getFacility(id: string) {
  try {
    return await supportFetch(`/facilities/${id}`);
  } catch {
    return { success: false, error: 'Failed to fetch facility' };
  }
}

export async function updateFacility(id: string, data: Record<string, any>) {
  try {
    return await supportFetch(`/facilities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  } catch {
    return { success: false, error: 'Failed to update facility' };
  }
}

// ── Courts ─────────────────────────────────────────────────

export async function getFacilityCourts(facilityId: string) {
  try {
    return await supportFetch(`/facilities/${facilityId}/courts`);
  } catch {
    return { success: false, error: 'Failed to fetch courts' };
  }
}

export async function updateCourt(courtId: string, data: Record<string, any>) {
  try {
    return await supportFetch(`/courts/${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  } catch {
    return { success: false, error: 'Failed to update court' };
  }
}

// ── Members ────────────────────────────────────────────────

export async function getFacilityMembers(facilityId: string, search?: string, status?: string) {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    return await supportFetch(`/facilities/${facilityId}/members?${params}`);
  } catch {
    return { success: false, error: 'Failed to fetch members' };
  }
}

export async function updateMember(facilityId: string, userId: string, data: Record<string, any>) {
  try {
    return await supportFetch(`/members/${facilityId}/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  } catch {
    return { success: false, error: 'Failed to update member' };
  }
}

export async function toggleMemberAdmin(facilityId: string, userId: string, isAdmin: boolean) {
  try {
    return await supportFetch(`/members/${facilityId}/${userId}/admin`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin }),
    });
  } catch {
    return { success: false, error: 'Failed to toggle admin' };
  }
}

// ── Bookings ───────────────────────────────────────────────

export async function getFacilityBookings(
  facilityId: string,
  filters?: { status?: string; startDate?: string; endDate?: string }
) {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    return await supportFetch(`/facilities/${facilityId}/bookings?${params}`);
  } catch {
    return { success: false, error: 'Failed to fetch bookings' };
  }
}

export async function updateBookingStatus(bookingId: string, status: string) {
  try {
    return await supportFetch(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  } catch {
    return { success: false, error: 'Failed to update booking' };
  }
}

// ── Violations ─────────────────────────────────────────────

export async function getFacilityViolations(facilityId: string) {
  try {
    return await supportFetch(`/facilities/${facilityId}/violations`);
  } catch {
    return { success: false, error: 'Failed to fetch violations' };
  }
}
