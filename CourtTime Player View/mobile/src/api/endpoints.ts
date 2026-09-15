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

export const memberEndpoints = {
  /** Record the caller's member number for a facility that requires one. */
  saveMyMemberNumber: (facilityId: string, memberNumber: string) =>
    api.post(`/api/members/${facilityId}/me/member-number`, { memberNumber }),
};

export const bookingMemberEndpoints = {
  /**
   * Members of a facility matching a search, for picking split-payment
   * participants. The server returns `{ success, members }` and requires at
   * least 2 characters.
   */
  lookup: (facilityId: string, q: string) =>
    api.get(`/api/bookings/facility/${facilityId}/members?q=${encodeURIComponent(q)}`),
};

export const ballMachineEndpoints = {
  /**
   * Named machines and the caller's live passes. Returns an empty list when the
   * facility has the ball machine flag off — enforced in the route.
   */
  status: (facilityId: string) => api.get(`/api/ball-machine/status/${facilityId}`),
};

export const strikesEndpoints = {
  check: (userId: string, facilityId: string) =>
    api.get(`/api/strikes/check/${userId}?facilityId=${encodeURIComponent(facilityId)}`),
  byUser: (userId: string, activeOnly = true) =>
    api.get(`/api/strikes/user/${userId}?activeOnly=${activeOnly}`),
};
