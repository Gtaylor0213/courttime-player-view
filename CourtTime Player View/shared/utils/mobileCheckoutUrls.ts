/** Stripe Checkout return URLs for the CourtTime mobile app (`courttime://` deep links). */
const SCHEME = 'courttime';

export function courtBookingCheckoutUrls() {
  return {
    successUrl: `${SCHEME}://book?bookingPaymentSuccess=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SCHEME}://book?bookingPaymentCancelled=1`,
  };
}

export function bulletinSignupCheckoutUrls(postId: string) {
  return {
    successUrl: `${SCHEME}://community?signupSuccess=1&postId=${encodeURIComponent(postId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SCHEME}://community?postId=${encodeURIComponent(postId)}`,
  };
}

export function memberPaymentCheckoutUrls() {
  return {
    successUrl: `${SCHEME}://payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SCHEME}://payments`,
  };
}

export function lockoutCheckoutUrls(facilityId: string) {
  return {
    successUrl: `${SCHEME}://lockout-paid?facilityId=${encodeURIComponent(facilityId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SCHEME}://book`,
  };
}
