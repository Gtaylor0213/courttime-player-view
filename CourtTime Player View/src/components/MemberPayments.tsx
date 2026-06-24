import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { CreditCard, AlertCircle } from 'lucide-react';
import {
  paymentItemsApi,
  connectPaymentsApi,
  type PaymentItem,
  type PaymentCategory,
  type ConnectPayment,
  type SavedPaymentMethod,
} from '../api/client';
import { useAppContext } from '../contexts/AppContext';
import { toast } from 'sonner';

const CATEGORY_LABELS: Record<PaymentCategory, string> = {
  BALL_MACHINE: 'Ball machine',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  DUES: 'Dues',
  OTHER: 'Other',
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function MemberPayments() {
  const { selectedFacilityId } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [history, setHistory] = useState<ConnectPayment[]>([]);
  const [savedCard, setSavedCard] = useState<SavedPaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cardActionLoading, setCardActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facilityLabel = selectedFacilityId
    ? selectedFacilityId.replace(/-/g, ' ')
    : null;

  const loadSavedCard = useCallback(async (clubId: string) => {
    const res = await connectPaymentsApi.getPaymentMethod(clubId);
    if (res.success) {
      const method: SavedPaymentMethod | null = res.data?.data ?? res.data ?? null;
      setSavedCard(method && method.last4 ? method : null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedFacilityId) return;
      setLoading(true);
      setError(null);
      try {
        const [itemsRes, historyRes] = await Promise.all([
          paymentItemsApi.list(selectedFacilityId),
          connectPaymentsApi.myHistory(selectedFacilityId),
          loadSavedCard(selectedFacilityId),
        ]);
        if (cancelled) return;
        if (itemsRes.success) {
          const list: PaymentItem[] = itemsRes.data?.data ?? itemsRes.data ?? [];
          setItems(Array.isArray(list) ? list.filter(i => i.isActive) : []);
        } else {
          setError(itemsRes.error || 'Failed to load payment items');
        }
        if (historyRes.success) {
          const list: ConnectPayment[] = historyRes.data?.data ?? historyRes.data ?? [];
          setHistory(Array.isArray(list) ? list : []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load payments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedFacilityId, loadSavedCard]);

  useEffect(() => {
    if (searchParams.get('setup') !== 'success' || !selectedFacilityId) return;
    const sessionId = searchParams.get('session_id');
    const sync = async () => {
      try {
        let syncOk = true;
        if (sessionId) {
          const syncRes = await connectPaymentsApi.syncSetupSession({ clubId: selectedFacilityId, sessionId });
          if (!syncRes.success) {
            syncOk = false;
            toast.error(syncRes.error || 'Could not save card — please try again from the Payments page');
          }
        }
        await loadSavedCard(selectedFacilityId);
        if (syncOk) {
          toast.success('Card saved successfully');
        }
      } catch (err: any) {
        toast.error(err?.message || 'Could not save card — please try again');
      } finally {
        searchParams.delete('setup');
        searchParams.delete('session_id');
        setSearchParams(searchParams, { replace: true });
      }
    };
    void sync();
  }, [searchParams, selectedFacilityId, loadSavedCard, setSearchParams]);

  const handleAddOrUpdateCard = async () => {
    if (!selectedFacilityId) return;
    try {
      setCardActionLoading(true);
      const base = window.location.origin;
      const res = await connectPaymentsApi.setupCheckout({
        clubId: selectedFacilityId,
        successUrl: `${base}/payments?setup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/payments`,
      });
      const url = res.data?.data?.url || res.data?.url;
      if (res.success && url) {
        window.location.href = url;
        return;
      }
      toast.error(res.error || 'Could not start card setup');
    } catch (err: any) {
      toast.error(err?.message || 'Could not start card setup');
    } finally {
      setCardActionLoading(false);
    }
  };

  const handleRemoveCard = async () => {
    if (!selectedFacilityId) return;
    try {
      setCardActionLoading(true);
      const res = await connectPaymentsApi.removePaymentMethod(selectedFacilityId);
      if (res.success) {
        setSavedCard(null);
        toast.success('Card removed');
      } else {
        toast.error(res.error || 'Could not remove card');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove card');
    } finally {
      setCardActionLoading(false);
    }
  };

  const handlePay = async (item: PaymentItem) => {
    try {
      setPayingId(item.id);
      const base = window.location.origin;
      const res = await connectPaymentsApi.checkout({
        paymentItemId: item.id,
        successUrl: `${base}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/payments`,
      });
      const url = res.data?.data?.url || res.data?.url;
      if (res.success && url) {
        window.location.href = url;
        return;
      }
      toast.error(res.error || 'Could not start checkout');
    } catch (err: any) {
      toast.error(err?.message || 'Could not start checkout');
    } finally {
      setPayingId(null);
    }
  };

  const groupedItems = useMemo(() => {
    const groups = new Map<PaymentCategory, PaymentItem[]>();
    for (const it of items) {
      const arr = groups.get(it.category) ?? [];
      arr.push(it);
      groups.set(it.category, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-gray-900">Payments</h1>
          <p className="text-sm text-gray-600">
            Pay your club for ball machine time, clinics, drills, and dues.
          </p>
        </div>

        {error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : (
          <>
            {selectedFacilityId && (
              <Card>
                <CardHeader>
                  <CardTitle>Saved card</CardTitle>
                  <CardDescription>
                    {facilityLabel
                      ? `Stored for this club (${facilityLabel}). Used to speed up checkout for dues, bookings, and events here.`
                      : 'Stored for this club. Used to speed up checkout for dues, bookings, and events.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  {savedCard ? (
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-gray-500" />
                      <span>
                        {formatCardBrand(savedCard.brand)} ···· {savedCard.last4} · Exp{' '}
                        {String(savedCard.expMonth).padStart(2, '0')}/{savedCard.expYear}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      Add a card once and Stripe will pre-fill it when you pay this club.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={savedCard ? 'outline' : 'default'}
                      onClick={handleAddOrUpdateCard}
                      disabled={cardActionLoading}
                    >
                      {cardActionLoading
                        ? 'Please wait…'
                        : savedCard
                          ? 'Update card'
                          : 'Add card'}
                    </Button>
                    {savedCard && (
                      <Button
                        variant="ghost"
                        onClick={handleRemoveCard}
                        disabled={cardActionLoading}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {items.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Nothing to pay for right now</CardTitle>
                  <CardDescription>
                    Your club hasn't published any payment options yet.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              groupedItems.map(([category, list]) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle>{CATEGORY_LABELS[category]}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {list.map(item => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-white"
                      >
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-sm text-gray-600 max-w-xl">
                              {item.description}
                            </div>
                          )}
                          {item.isRecurring && (
                            <Badge variant="secondary" className="mt-1">
                              Recurring · every {item.recurringInterval}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-semibold">{dollars(item.amountCents)}</div>
                          <Button
                            onClick={() => handlePay(item)}
                            disabled={payingId === item.id}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            {payingId === item.id ? 'Redirecting…' : 'Pay now'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}

            <Card>
              <CardHeader>
                <CardTitle>Your payment history</CardTitle>
                <CardDescription>Past payments at this club.</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4 text-center">
                    No payments yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map(p => (
                        <TableRow key={p.id}>
                          <TableCell>
                            {new Date(p.paidAt || p.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>{p.itemName || '—'}</TableCell>
                          <TableCell>{dollars(p.amountCents)}</TableCell>
                          <TableCell>
                            <MemberPaymentStatusBadge status={p.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function MemberPaymentStatusBadge({ status }: { status: ConnectPayment['status'] }) {
  switch (status) {
    case 'PAID':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
    case 'PENDING':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
    case 'FAILED':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>;
    case 'REFUNDED':
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Refunded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
