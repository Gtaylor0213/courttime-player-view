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

/**
 * Reservation management (web's ReservationManagementModal): players on a
 * reservation, open spots, split payment, and the post-play settlement view.
 */
export const reservationEndpoints = {
  detail: (bookingId: string) => api.get(`/api/bookings/${bookingId}`),
  /** `{ success, participants, settlementStatus }` */
  participants: (bookingId: string) => api.get(`/api/bookings/${bookingId}/participants`),
  addParticipant: (bookingId: string, userId: string) =>
    api.post(`/api/bookings/${bookingId}/participants`, { userId }),
  removeParticipant: (bookingId: string, userId: string) =>
    api.delete(`/api/bookings/${bookingId}/participants/${userId}`),
  /** Advertise (or stop advertising) open spots on the caller's own booking. */
  setOpenToMembers: (bookingId: string, open: boolean, maxPlayers?: number) =>
    api.post(`/api/bookings/${bookingId}/open-spot`, { open, maxPlayers }),
  /** Bookings at the facility currently advertising an open spot. */
  openSpots: (facilityId: string) => api.get(`/api/bookings/open?facilityId=${encodeURIComponent(facilityId)}`),
  claimSpot: (bookingId: string) => api.post(`/api/bookings/${bookingId}/claim-spot`, {}),
  /** `{ success, data: { bookingId, ownerId, status, paymentDeadlineAt, shares[] } }`; 400 when not split. */
  splitPayment: (bookingId: string) => api.get(`/api/bookings/${bookingId}/split-payment`),
  splitPaymentCheckout: (bookingId: string, successUrl: string, cancelUrl: string) =>
    api.post(`/api/bookings/${bookingId}/split-payment/checkout`, { successUrl, cancelUrl }),
  declineSplitPayment: (bookingId: string, reason?: string) =>
    api.post(`/api/bookings/${bookingId}/split-payment/decline`, { reason }),
  updateSplitParticipants: (bookingId: string, participantIds: string[]) =>
    api.put(`/api/bookings/${bookingId}/split-payment/participants`, { participantIds }),
  /** Staff preview + charge rows; 403 for members. */
  settlement: (bookingId: string) => api.get(`/api/bookings/${bookingId}/settlement`),
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

export const bulletinEndpoints = {
  /** One post by id (deep links); `{ success, post }`. */
  post: (postId: string) => api.get(`/api/bulletin-board/post/${postId}`),
  /** Admin: pin/unpin a post to the top of the board. */
  setPinned: (postId: string, facilityId: string, isPinned: boolean) =>
    api.put(`/api/bulletin-board/${postId}/pin`, { facilityId, isPinned }),
  /** Admin: remove a member from an event's roster or waitlist. */
  adminRemoveSignup: (postId: string, memberUserId: string) =>
    api.delete(`/api/bulletin-board/${postId}/signup/${memberUserId}`),
};

export const facilityLocationEndpoints = {
  /** Additional (non-primary) locations; `{ success, locations }`. */
  list: (facilityId: string) => api.get(`/api/facility-locations/${facilityId}`),
};

export const proShopEndpoints = {
  products: (facilityId: string) => api.get(`/api/pro-shop/products/${facilityId}`),
  myOrders: (facilityId: string) => api.get(`/api/pro-shop/my-orders/${facilityId}`),
  /** The member's running tab (`unbilled_cents`, `items`), when the club bills to a tab. */
  myTab: (facilityId: string) => api.get(`/api/pro-shop/my-tab/${facilityId}`),
  /** Card on file at this club (`has_card`, `card_brand`, `card_last4`). */
  myCard: (facilityId: string) => api.get(`/api/pro-shop/my-card/${facilityId}`),
  /** Club settings (`require_card`); 403 for non-admins, which callers ignore. */
  settings: (facilityId: string) => api.get(`/api/pro-shop/admin/settings/${facilityId}`),
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
