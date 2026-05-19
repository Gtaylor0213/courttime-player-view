import {
  normalizeBookingCreateResponse,
  unwrapApiPayload,
  type ApiResponse,
} from '../../../shared/api/core';
import type { ApiErrorCategory } from './client';

type PaymentApiRequest = <T = unknown>(
  endpoint: string,
  options?: RequestInit
) => Promise<ApiResponse<T, ApiErrorCategory>>;

export type BookingCreateResult = ApiResponse<unknown, ApiErrorCategory> & {
  requiresPayment?: boolean;
  checkoutUrl?: string;
  booking?: unknown;
};

export type BookingReconcileResult = ApiResponse<unknown, ApiErrorCategory> & {
  recovered?: Array<{ bookingId: string; bookingDate?: string }>;
  count?: number;
};

export type BookingConfirmResult = ApiResponse<unknown, ApiErrorCategory> & {
  bookingId?: string;
  bookingDate?: string;
};

export type PaymentCategory = 'BALL_MACHINE' | 'CLINIC' | 'DRILL' | 'DUES' | 'OTHER';

export interface PaymentItem {
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

export interface ConnectPayment {
  id: string;
  clubId: string;
  memberId: string;
  paymentItemId?: string | null;
  amountCents: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  itemName?: string | null;
  stripeCheckoutSessionId?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface SavedPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export function createPaymentApis(request: PaymentApiRequest) {
  return {
    paymentItems: {
      list: (clubId: string) =>
        request<PaymentItem[]>(`/api/payment-items/club/${encodeURIComponent(clubId)}`),
    },

    connectPayments: {
      checkout: (data: {
        paymentItemId: string;
        successUrl?: string;
        cancelUrl?: string;
      }) =>
        request('/api/payments/checkout', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      getPaymentMethod: (clubId: string) =>
        request<SavedPaymentMethod | null>(
          `/api/payments/payment-method?clubId=${encodeURIComponent(clubId)}`
        ),
      setupCheckout: (data: {
        clubId: string;
        successUrl?: string;
        cancelUrl?: string;
      }) =>
        request('/api/payments/setup-checkout', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      removePaymentMethod: (clubId: string) =>
        request(`/api/payments/payment-method?clubId=${encodeURIComponent(clubId)}`, {
          method: 'DELETE',
        }),
      myHistory: (clubId?: string) => {
        const qs = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
        return request<ConnectPayment[]>(`/api/payments/my-history${qs}`);
      },
    },

    members: {
      getMyPaymentLockout: () => request('/api/members/me/payment-lockout'),
      getLockoutInfo: (facilityId: string) =>
        request(`/api/members/${encodeURIComponent(facilityId)}/me/lockout-info`),
      getLockoutCheckoutUrl: (
        facilityId: string,
        options?: { successUrl?: string; cancelUrl?: string }
      ) =>
        request(`/api/members/${encodeURIComponent(facilityId)}/me/lockout-checkout`, {
          method: 'POST',
          body: JSON.stringify(options ?? {}),
        }),
      confirmLockoutPayment: (facilityId: string, sessionId: string) =>
        request(`/api/members/${encodeURIComponent(facilityId)}/me/lockout-confirm`, {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        }),
    },

    bulletinBoard: {
      signupForDrill: (
        postId: string,
        options?: { successUrl?: string; cancelUrl?: string }
      ) =>
        request(`/api/bulletin-board/${encodeURIComponent(postId)}/signup`, {
          method: 'POST',
          body: JSON.stringify(options ?? {}),
        }),
      confirmSignupPayment: (sessionId: string) =>
        request('/api/bulletin-board/signup/confirm', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        }),
    },

    bookings: {
      create: async (data: Record<string, unknown>): Promise<BookingCreateResult> => {
        const res = await request('/api/bookings', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return normalizeBookingCreateResponse(res) as BookingCreateResult;
      },
      confirmPayment: async (sessionId: string): Promise<BookingConfirmResult> => {
        const res = await request('/api/bookings/payment/confirm', {
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
      reconcilePaidBookings: async (): Promise<BookingReconcileResult> => {
        const res = await request('/api/bookings/payment/reconcile', { method: 'POST' });
        if (!res.success) return res;
        const payload = unwrapApiPayload<{
          recovered?: Array<{ bookingId: string; bookingDate?: string }>;
          count?: number;
        }>(res.data);
        return {
          ...res,
          recovered: payload?.recovered,
          count: payload?.count,
        };
      },
    },
  };
}

export type PaymentApis = ReturnType<typeof createPaymentApis>;
