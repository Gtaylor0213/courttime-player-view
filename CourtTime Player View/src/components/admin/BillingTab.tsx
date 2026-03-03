import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { CreditCard, Calendar, AlertCircle, Check, Clock } from 'lucide-react';
import { paymentsApi } from '../../api/client';

interface BillingTabProps {
  facilityId: string;
}

export function BillingTab({ facilityId }: BillingTabProps) {
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBillingData() {
      try {
        const [subResult, historyResult] = await Promise.all([
          paymentsApi.getSubscription(facilityId),
          paymentsApi.getPaymentHistory(facilityId),
        ]);
        if (subResult.success) setSubscription(subResult.data?.data || subResult.data);
        if (historyResult.success) {
          const history = historyResult.data?.data || historyResult.data;
          setPaymentHistory(Array.isArray(history) ? history : []);
        }
      } catch (error) {
        console.error('Failed to load billing data:', error);
      } finally {
        setLoading(false);
      }
    }
    if (facilityId) loadBillingData();
  }, [facilityId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No subscription found for this facility. Payment may not have been recorded during registration.
        </AlertDescription>
      </Alert>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'waived':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Waived</Badge>;
      case 'custom_pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Custom — Pending</Badge>;
      case 'pending_payment':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pending Payment</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const formatAmount = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <CardDescription>Your facility's billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Plan</p>
              <p className="font-medium capitalize">{subscription.planType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <div className="mt-0.5">{getStatusBadge(subscription.status)}</div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Amount</p>
              <p className="font-medium">
                {subscription.amountCents === 0 ? 'Free' : `${formatAmount(subscription.amountCents)}/year`}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Courts</p>
              <p className="font-medium">{subscription.courtCount}</p>
            </div>
          </div>

          {subscription.billingPeriodStart && subscription.billingPeriodEnd && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Billing Start
                  </p>
                  <p className="font-medium">{formatDate(subscription.billingPeriodStart)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Renewal Date
                  </p>
                  <p className="font-medium">{formatDate(subscription.billingPeriodEnd)}</p>
                </div>
              </div>
            </>
          )}

          {subscription.promoCodeUsed && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-gray-500">Promo Code Applied</p>
                <p className="font-medium">{subscription.promoCodeUsed}</p>
              </div>
            </>
          )}

          {subscription.status === 'custom_pending' && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Custom pricing is being arranged for your facility. Our team will contact you to set up your plan.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentHistory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No payment history available</p>
          ) : (
            <div className="space-y-3">
              {paymentHistory.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{payment.description}</p>
                    <p className="text-xs text-gray-500">{formatDate(payment.createdAt)}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-medium">
                      {payment.amountCents === 0 ? 'Free' : formatAmount(payment.amountCents)}
                    </p>
                    {payment.status === 'succeeded' ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Paid
                      </Badge>
                    ) : payment.status === 'pending' ? (
                      <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pending</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">{payment.status}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
