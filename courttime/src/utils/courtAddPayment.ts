import { adminApi, paymentsApi } from '../api/client';
import { toast } from 'sonner';

/**
 * Waiver draft for a court being added. When the add flow redirects to Stripe
 * checkout, in-memory state is lost — the draft is stashed here and published
 * against the created court(s) after the payment return confirms.
 */
const COURT_ADD_WAIVER_DRAFT_KEY = 'pendingCourtAddWaiverDraft';

export function stashCourtAddWaiverDraft(contentHtml: string): void {
  try {
    if (contentHtml.trim()) {
      sessionStorage.setItem(COURT_ADD_WAIVER_DRAFT_KEY, contentHtml);
    } else {
      sessionStorage.removeItem(COURT_ADD_WAIVER_DRAFT_KEY);
    }
  } catch {
    // sessionStorage unavailable — waiver can still be added by editing the court
  }
}

export function clearCourtAddWaiverDraft(): void {
  try {
    sessionStorage.removeItem(COURT_ADD_WAIVER_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export async function publishStashedCourtAddWaiver(courtIds: string[]): Promise<void> {
  let content: string | null = null;
  try {
    content = sessionStorage.getItem(COURT_ADD_WAIVER_DRAFT_KEY);
  } catch {
    return;
  }
  if (!content?.trim() || courtIds.length === 0) {
    clearCourtAddWaiverDraft();
    return;
  }
  try {
    for (const courtId of courtIds) {
      const res = await adminApi.publishCourtWaiver(courtId, content);
      if (!res.success) {
        toast.error('Court created, but its waiver could not be published — edit the court to add it.');
        return;
      }
    }
    toast.success('Court waiver published');
  } catch {
    toast.error('Court created, but its waiver could not be published — edit the court to add it.');
  } finally {
    clearCourtAddWaiverDraft();
  }
}

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
      clearCourtAddWaiverDraft();
    }
    return false;
  }

  try {
    const response = await paymentsApi.confirmCourtAddPayment(sessionId, facilityId);
    if (response.success) {
      toast.success('Court payment complete — courts added successfully');
      clearCourtPaymentSearchParams();
      const createdCourts = ((response.data as any)?.data?.courts ?? []) as Array<{ id?: string }>;
      await publishStashedCourtAddWaiver(
        createdCourts.map((c) => c?.id).filter((id): id is string => Boolean(id))
      );
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
