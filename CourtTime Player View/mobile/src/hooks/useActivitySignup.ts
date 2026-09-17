/**
 * Bulletin activity sign-up (drills, clinics, events, lessons): sign up, pay
 * through Stripe when the post requires it, withdraw, and confirm a paid
 * sign-up after the Stripe return. Shared by the Community tab and the
 * Lessons screen so both behave like web's BulletinActivitySignupModal.
 */

import { useCallback, useRef, useState } from 'react';
import { api, paymentApi } from '../api/client';
import { unwrapApiPayload } from '../../../shared/api/core';
import { isPaidBulletinSignup } from '../utils/payments';
import { showAlert } from '../utils/alert';
import { formatCentsAsUsd, openStripeCheckout } from '../utils/payments';

export interface SignupPostLike {
  id: string;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
}

export type SignupReturnUrls = { successUrl: string; cancelUrl: string };

function extractCheckoutUrl(data: unknown): string | null {
  const payload = unwrapApiPayload<{ checkoutUrl?: string; url?: string }>(data) ?? (data as any);
  const url = payload?.checkoutUrl ?? payload?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

export function useActivitySignup(onChanged: () => Promise<void> | void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirmedSessionRef = useRef<string | null>(null);

  const signUp = useCallback(
    async (post: SignupPostLike, urls: SignupReturnUrls) => {
      setBusyId(post.id);
      const res = await paymentApi.bulletinBoard.signupForDrill(post.id, urls);
      const checkoutUrl = res.success ? extractCheckoutUrl(res.data) : null;
      if (checkoutUrl) {
        const opened = await openStripeCheckout(checkoutUrl);
        if (!opened) {
          showAlert('Payment', 'Could not open Stripe checkout. Try again.');
        } else if (isPaidBulletinSignup(post)) {
          showAlert(
            'Complete payment',
            `Finish card payment (${formatCentsAsUsd(post.signupAmountCents)}) to complete your signup.`
          );
        }
        setBusyId(null);
        return;
      }
      if (res.success) {
        await onChanged();
        if (res.message) showAlert('Signed Up', res.message);
      } else {
        showAlert('Could not sign up', res.error || 'Please try again.');
      }
      setBusyId(null);
    },
    [onChanged]
  );

  const cancelSignup = useCallback(
    (postId: string) => {
      showAlert('Cancel Signup', 'Remove yourself from this event?', [
        { text: 'Keep Signup', style: 'cancel' },
        {
          text: 'Cancel Signup',
          style: 'destructive',
          onPress: async () => {
            setBusyId(postId);
            const res = await api.delete(`/api/bulletin-board/${postId}/signup`);
            if (res.success) await onChanged();
            else showAlert('Error', res.error || 'Could not cancel signup.');
            setBusyId(null);
          },
        },
      ]);
    },
    [onChanged]
  );

  /**
   * Back from Stripe with `signupSuccess=1&session_id=…`. Confirms once per
   * session id; a placeholder id (checkout not completed) just refreshes.
   */
  const confirmReturn = useCallback(
    async (sessionId: string | undefined) => {
      if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
        showAlert('Payment received', 'Refreshing your signup status…');
        await onChanged();
        return;
      }
      if (confirmedSessionRef.current === sessionId) return;
      confirmedSessionRef.current = sessionId;

      const response = await paymentApi.bulletinBoard.confirmSignupPayment(sessionId);
      const payload = unwrapApiPayload<{ status?: 'confirmed' | 'waitlist'; waitlistPosition?: number | null }>(
        response.data
      );
      if (response.success) {
        showAlert(
          'Signed up',
          response.message ||
            (payload?.status === 'waitlist'
              ? `Payment received — you are on the waitlist (#${payload.waitlistPosition ?? '?'})`
              : 'Payment received — you are signed up!')
        );
      } else {
        showAlert('Signup', response.error || 'Payment received but signup could not be confirmed. Contact the club.');
      }
      await onChanged();
    },
    [onChanged]
  );

  return { busyId, signUp, cancelSignup, confirmReturn };
}
