import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, CreditCard, Calendar, AlertTriangle, Building2, ExternalLink, Save, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { getSubscriptions, updateSubscription, getSubscriptionPayments } from '../../api/supportClient';
import { formatAnnualPricePerYear } from '../../services/subscriptionPricing';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId?: string | null;
  onSelectFacility?: (id: string) => void;
}

const STATUS_OPTIONS = [
  'active', 'trialing', 'waived', 'pending_payment', 'pending', 'past_due', 'custom_pending', 'canceled',
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'waived':
      return 'bg-green-100 text-green-700';
    case 'pending_payment':
    case 'pending':
    case 'custom_pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'past_due':
      return 'bg-red-100 text-red-700';
    case 'canceled':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function SupportSubscriptionManagement({ selectedFacilityId, onSelectFacility }: Props) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [editData, setEditData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [extendDialog, setExtendDialog] = useState(false);
  const [extendDays, setExtendDays] = useState('30');

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    const res = await getSubscriptions({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: search || undefined,
    });
    if (res.success) setSubscriptions(res.data);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { loadSubscriptions(); }, [statusFilter]);

  useEffect(() => {
    const timer = setTimeout(loadSubscriptions, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    const sub = subscriptions.find((s) => s.facilityId === selectedFacilityId);
    if (sub) selectSubscription(sub);
  }, [selectedFacilityId, subscriptions]);

  const selectSubscription = async (sub: any) => {
    setSelected(sub);
    setEditData({
      status: sub.status,
      courtCount: sub.courtCount,
      amountCents: sub.amountCents,
      currentPeriodEnd: sub.currentPeriodEnd?.slice(0, 10) || sub.billingPeriodEnd?.slice(0, 10) || '',
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      promoCodeUsed: sub.promoCodeUsed || '',
    });
    onSelectFacility?.(sub.facilityId);
    setPaymentsLoading(true);
    const res = await getSubscriptionPayments(sub.facilityId);
    if (res.success) setPayments(res.data);
    setPaymentsLoading(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await updateSubscription(selected.facilityId, {
      status: editData.status,
      courtCount: Number(editData.courtCount),
      amountCents: Number(editData.amountCents),
      currentPeriodEnd: editData.currentPeriodEnd || null,
      billingPeriodEnd: editData.currentPeriodEnd || null,
      cancelAtPeriodEnd: editData.cancelAtPeriodEnd,
      promoCodeUsed: editData.promoCodeUsed || null,
    });
    if (res.success) {
      toast.success('Subscription updated');
      await loadSubscriptions();
      const updated = subscriptions.find((s) => s.facilityId === selected.facilityId);
      if (updated) setSelected({ ...updated, ...res.data });
    } else {
      toast.error(res.error || 'Failed to update');
    }
    setSaving(false);
  };

  const handleExtend = async () => {
    if (!selected) return;
    const days = Number(extendDays);
    const base = editData.currentPeriodEnd
      ? new Date(editData.currentPeriodEnd)
      : new Date();
    base.setDate(base.getDate() + days);
    const newEnd = base.toISOString().slice(0, 10);
    setEditData((prev: any) => ({ ...prev, currentPeriodEnd: newEnd }));
    setExtendDialog(false);
    toast.success(`Period end set to ${new Date(newEnd).toLocaleDateString()} — click Save to apply`);
  };

  const needsAttention = (sub: any) =>
    ['pending_payment', 'pending', 'past_due', 'custom_pending'].includes(sub.status) ||
    sub.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Subscriptions & Billing</h1>
          <p className="text-sm text-gray-500 mt-1">Manage facility plans, renewal dates, and payment status</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSubscriptions}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by facility name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subscriptions</SelectItem>
            <SelectItem value="attention">Needs Attention</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          )}
          {!loading && subscriptions.map((sub) => (
            <Card
              key={sub.facilityId}
              className={`cursor-pointer transition-colors ${
                selected?.facilityId === sub.facilityId ? 'ring-2 ring-indigo-500' : 'hover:bg-gray-50'
              }`}
              onClick={() => selectSubscription(sub)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                      <p className="font-medium text-sm truncate">{sub.facilityName}</p>
                      {needsAttention(sub) && (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatAnnualPricePerYear(sub.amountCents)} · {sub.courtCount} courts
                    </p>
                    <p className="text-xs text-gray-400">
                      Renews {formatDate(sub.currentPeriodEnd || sub.billingPeriodEnd)}
                    </p>
                  </div>
                  <Badge className={`text-xs shrink-0 ${getStatusColor(sub.status)}`}>
                    {sub.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && subscriptions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No subscriptions found.</p>
          )}
        </div>

        <div>
          {!selected && (
            <div className="text-center py-16 text-gray-400">
              <CreditCard className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">Select a subscription to manage billing</p>
            </div>
          )}

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selected.facilityName}</CardTitle>
                <p className="text-xs text-gray-400 font-mono">{selected.facilityId}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Stripe Customer</p>
                    <p className="font-mono text-xs truncate">{selected.stripeCustomerId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Stripe Subscription</p>
                    <p className="font-mono text-xs truncate">{selected.stripeSubscriptionId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Facility Payment Status</p>
                    <p className="capitalize">{selected.paymentStatus || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Promo Code</p>
                    <p>{selected.promoCodeUsed || '—'}</p>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Edit Subscription</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select
                        value={editData.status}
                        onValueChange={(v) => setEditData((p: any) => ({ ...p, status: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Courts</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editData.courtCount}
                        onChange={(e) => setEditData((p: any) => ({ ...p, courtCount: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Annual Amount (cents)</Label>
                      <Input
                        type="number"
                        value={editData.amountCents}
                        onChange={(e) => setEditData((p: any) => ({ ...p, amountCents: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Period End Date</Label>
                      <Input
                        type="date"
                        value={editData.currentPeriodEnd}
                        onChange={(e) => setEditData((p: any) => ({ ...p, currentPeriodEnd: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Promo Code Used</Label>
                    <Input
                      value={editData.promoCodeUsed}
                      onChange={(e) => setEditData((p: any) => ({ ...p, promoCodeUsed: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setExtendDialog(true)}>
                      <Calendar className="h-4 w-4 mr-1" />
                      Extend Period
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditData((p: any) => ({ ...p, cancelAtPeriodEnd: !p.cancelAtPeriodEnd }))}
                    >
                      {editData.cancelAtPeriodEnd ? 'Undo Cancel' : 'Mark Cancel at End'}
                    </Button>
                    {selected.stripeCustomerId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://dashboard.stripe.com/customers/${selected.stripeCustomerId}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Stripe
                      </Button>
                    )}
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Payment History</p>
                  {paymentsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
                    </div>
                  ) : payments.length === 0 ? (
                    <p className="text-xs text-gray-400">No payments recorded.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {payments.map((p) => (
                        <div key={p.id} className="flex justify-between text-xs p-2 bg-gray-50 rounded">
                          <span>{new Date(p.created_at).toLocaleDateString()} — {p.description || p.payment_method_type}</span>
                          <span className={p.status === 'succeeded' ? 'text-green-600' : 'text-gray-500'}>
                            ${(p.amount_cents / 100).toFixed(2)} ({p.status})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={extendDialog} onOpenChange={setExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription Period</DialogTitle>
            <DialogDescription>
              Add days to the current period end for {selected?.facilityName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={extendDays} onValueChange={setExtendDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExtendDialog(false)}>Cancel</Button>
              <Button onClick={handleExtend}>Apply Extension</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
