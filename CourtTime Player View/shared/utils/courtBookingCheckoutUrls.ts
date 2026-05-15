/** Stripe Checkout return URLs for paid court bookings (use current browser origin in dev). */
export function courtBookingCheckoutUrls(origin: string) {
  const base = origin.replace(/\/$/, '');
  return {
    successUrl: `${base}/calendar?bookingPaymentSuccess=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/calendar?bookingPaymentCancelled=1`,
  };
}
