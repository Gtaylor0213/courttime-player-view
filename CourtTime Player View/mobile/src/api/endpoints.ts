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
   * Named machines, pass products, and the caller's passes. Returns an empty
   * list when the facility has the ball machine flag off — enforced in the route.
   */
  status: (facilityId: string) => api.get(`/api/ball-machine/status/${facilityId}`),
  /**
   * The keypad code for one machine. 403s unless the member holds a covering
   * pass or claimed the machine on a booking — i.e. has already paid for it.
   */
  accessCode: (facilityId: string, machineId: string) =>
    api.get(`/api/ball-machine/access-code/${facilityId}/${machineId}`),
  /** Starts a Stripe checkout for a pass; returns the URL to open. */
  purchasePass: (
    facilityId: string,
    body: { durationMonths: number; machineId?: string | null; successUrl?: string; cancelUrl?: string }
  ) => api.post(`/api/ball-machine/purchase/${facilityId}`, body),
  /** Completes a pass purchase after the Stripe redirect. */
  confirmPurchase: (sessionId: string) =>
    api.post('/api/ball-machine/purchase/confirm', { sessionId }),
};

export const lessonsEndpoints = {
  /** Upcoming lessons and clinics. Returns `{ success, posts }` (bulletin-shaped). */
  upcoming: (facilityId: string) => api.get(`/api/lessons/${facilityId}`),
};

export const levelGroupEndpoints = {
  /** The caller's own skill group and who else is in it. */
  mine: (facilityId: string) => api.get(`/api/player-level-groups/${facilityId}/me`),

  // ── Admin board (facility admins only; mirrors web's playerLevelGroupsApi) ──
  /** Every tier with its members, plus the unassigned pool. */
  board: (facilityId: string) => api.get(`/api/player-level-groups/${facilityId}`),
  createGroup: (facilityId: string, name: string) =>
    api.post(`/api/player-level-groups/${facilityId}/groups`, { name }),
  /** Rewrite the tier order, top (strongest) tier first. */
  reorderGroups: (facilityId: string, groupIds: string[]) =>
    api.put(`/api/player-level-groups/${facilityId}/groups/order`, { groupIds }),
  updateGroup: (facilityId: string, groupId: string, updates: { name?: string; isVisibleToPlayers?: boolean }) =>
    api.patch(`/api/player-level-groups/${facilityId}/groups/${groupId}`, updates),
  deleteGroup: (facilityId: string, groupId: string) =>
    api.delete(`/api/player-level-groups/${facilityId}/groups/${groupId}`),
  /** Move players into a tier (or back to unassigned with groupId null); `position` is the landing index. */
  assign: (facilityId: string, userIds: string[], groupId: string | null, position?: number) =>
    api.put(`/api/player-level-groups/${facilityId}/assignments`, { userIds, groupId, position }),
  /** Start a group chat with the tier's current members. */
  createConversation: (facilityId: string, groupId: string) =>
    api.post(`/api/player-level-groups/${facilityId}/groups/${groupId}/conversation`, {}),
};

export const proShopEndpoints = {
  products: (facilityId: string) => api.get(`/api/pro-shop/products/${facilityId}`),
  myOrders: (facilityId: string) => api.get(`/api/pro-shop/my-orders/${facilityId}`),
  checkout: (facilityId: string, body: Record<string, unknown>) =>
    api.post(`/api/pro-shop/checkout/${facilityId}`, body),
};

export const padelEndpoints = {
  sessions: (facilityId: string) => api.get(`/api/padel/sessions/${facilityId}`),
  join: (sessionId: string) => api.post(`/api/padel/sessions/${sessionId}/join`, {}),
  leave: (sessionId: string) => api.post(`/api/padel/sessions/${sessionId}/leave`, {}),
  standings: (sessionId: string) => api.get(`/api/padel/sessions/${sessionId}/standings`),
};

export const strikesEndpoints = {
  check: (userId: string, facilityId: string) =>
    api.get(`/api/strikes/check/${userId}?facilityId=${encodeURIComponent(facilityId)}`),
  byUser: (userId: string, activeOnly = true) =>
    api.get(`/api/strikes/user/${userId}?activeOnly=${activeOnly}`),
};
