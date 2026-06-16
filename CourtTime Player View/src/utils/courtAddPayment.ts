import { paymentsApi } from '../api/client';
import { toast } from 'sonner';

export function getCourtAddReturnUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('court_payment');
  url.searchParams.delete('session_id');
  return url.toString();
}

export async function handleCourtAddPaymentResponse(
  response: {
    success?: boolean;
    requiresPayment?: boolean;
    checkoutUrl?: string;
    sessionId?: string;
    data?: {
      checkoutUrl?: string;
      sessionId?: string;
    };
    error?: string;
  },
  options?: {
    onDevConfirm?: (sessionId: string) => Promise<void>;
  }
): Promise<'created' | 'redirected' | 'failed'> {
  if (!response.success) {
    toast.error(response.error || 'Failed to add court');
    return 'failed';
  }

  if (response.requiresPayment) {
    const checkoutUrl = response.checkoutUrl || response.data?.checkoutUrl;
    const sessionId = response.sessionId || response.data?.sessionId;

    if (checkoutUrl) {
      window.location.href = checkoutUrl;
      return 'redirected';
    }

    if (sessionId?.startsWith('dev_session_') && options?.onDevConfirm) {
      await options.onDevConfirm(sessionId);
      return 'created';
    }

    toast.error('Payment checkout could not be started');
    return 'failed';
  }

  return 'created';
}

export async function confirmCourtAddPaymentFromUrl(
  searchParams: URLSearchParams,
  facilityId?: string
): Promise<boolean> {
  const paymentStatus = searchParams.get('court_payment');
  const sessionId = searchParams.get('session_id');

  if (paymentStatus !== 'success' || !sessionId) {
    if (paymentStatus === 'cancelled') {
      toast.info('Court payment cancelled');
      clearCourtPaymentSearchParams();
    }
    return false;
  }

  try {
    const response = await paymentsApi.confirmCourtAddPayment(sessionId, facilityId);
    if (response.success) {
      toast.success('Court payment complete — courts added successfully');
      clearCourtPaymentSearchParams();
      return true;
    }
    toast.error(response.error || 'Could not confirm court payment');
    return false;
  } catch (error: any) {
    toast.error(error?.message || 'Could not confirm court payment');
    return false;
  }
}

export function clearCourtPaymentSearchParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('court_payment');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.toString());
}
