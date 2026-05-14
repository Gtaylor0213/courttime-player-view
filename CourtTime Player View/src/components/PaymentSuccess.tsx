import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, Clock } from 'lucide-react';
import { connectPaymentsApi, type ConnectPayment } from '../api/client';

/**
 * Landing page Stripe redirects to after a successful Checkout.
 * Because the webhook is what flips the row from PENDING → PAID, we poll
 * the member's history briefly so the user sees a confirmed status.
 */
export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [payment, setPayment] = useState<ConnectPayment | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollOnce = async () => {
      attempts += 1;
      try {
        const res = await connectPaymentsApi.myHistory();
        const list: ConnectPayment[] = res.data?.data ?? res.data ?? [];
        const found = list.find(p => p.stripeCheckoutSessionId === sessionId) || list[0] || null;
        if (cancelled) return;
        if (found) setPayment(found);
        if (found?.status === 'PAID') {
          setConfirmed(true);
          return;
        }
      } catch {
        // Swallow — we'll retry.
      }
      if (!cancelled && attempts < 8) {
        timer = setTimeout(pollOnce, 1500);
      }
    };
    pollOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <div className="p-6 md:p-12">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {confirmed ? (
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              ) : (
                <Clock className="h-7 w-7 text-yellow-600" />
              )}
              <div>
                <CardTitle>{confirmed ? 'Payment received' : 'Processing your payment…'}</CardTitle>
                <CardDescription>
                  {confirmed
                    ? 'Thanks! Your club has been credited and your account is updated.'
                    : 'Stripe is confirming your payment. This usually takes a moment.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {payment && (
              <div className="rounded-lg border p-4 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Item</span>
                  <span className="font-medium">{payment.itemName ?? '—'}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-medium">
                    ${(payment.amountCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium capitalize">{payment.status.toLowerCase()}</span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/payments">Back to payments</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/calendar">Court calendar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
