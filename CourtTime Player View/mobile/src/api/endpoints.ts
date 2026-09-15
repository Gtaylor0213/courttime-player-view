/**
 * Named API paths shared with web — use to avoid scattered string literals in mobile screens.
 */
import { api } from './client';

export const authEndpoints = {
  me: () => api.get('/api/auth/me'),
  validateResetToken: (token: string) =>
    api.get(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`),
};

export const courtConfigEndpoints = {
  availability: (courtId: string, dateYmd: string) =>
    api.get(`/api/court-config/${courtId}/availability?date=${dateYmd}`),
  facilityDay: (facilityId: string, dateYmd: string) =>
    api.get(`/api/court-config/facility/${facilityId}?date=${dateYmd}`),
};

export const courtWaiverEndpoints = {
  /**
   * Waivers the caller must accept before booking these courts.
   * Returns [] when the facility has court_waivers off — the flag is enforced
   * in the server's SQL, so mobile needs no client-side gate for it.
   */
  pending: (courtIds: string[]) =>
    api.get(
      `/api/bookings/court-waivers/pending?courtIds=${encodeURIComponent(courtIds.join(','))}`
    ),
  accept: (courtId: string) => api.post('/api/bookings/court-waivers/accept', { courtId }),
};

export const strikesEndpoints = {
  check: (userId: string, facilityId: string) =>
    api.get(`/api/strikes/check/${userId}?facilityId=${encodeURIComponent(facilityId)}`),
  byUser: (userId: string, activeOnly = true) =>
    api.get(`/api/strikes/user/${userId}?activeOnly=${activeOnly}`),
};
