import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { CheckCircle2, AlertCircle, ExternalLink, Plus, Pencil, X, Save, Lock, LockOpen, User } from 'lucide-react';
import {
  paymentItemsApi,
  stripeConnectApi,
  connectPaymentsApi,
  membersApi,
  type PaymentItem,
  type PaymentCategory,
  type ConnectPayment,
} from '../../api/client';
import { toast } from 'sonner';

interface PaymentsTabProps {
  clubId: string;
}

const CATEGORY_OPTIONS: Array<{ value: PaymentCategory; label: string }> = [
  { value: 'BALL_MACHINE', label: 'Ball machine' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'DRILL', label: 'Drill' },
  { value: 'DUES', label: 'Dues' },
  { value: 'OTHER', label: 'Other' },
];

function categoryLabel(c: PaymentCategory): string {
  return CATEGORY_OPTIONS.find(opt => opt.value === c)?.label ?? c;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface ItemFormState {
  name: string;
  description: string;
  amountDollars: string;
  category: PaymentCategory;
  isRecurring: boolean;
  recurringInterval: 'month' | 'year';
}

const emptyForm: ItemFormState = {
  name: '',
  description: '',
  amountDollars: '',
  category: 'BALL_MACHINE',
  isRecurring: false,
  recurringInterval: 'month',
};

export function PaymentsTab({ clubId }: PaymentsTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState<{
    onboarded: boolean;
    chargesEnabled: boolean;
    accountId: string | null;
    platformFeePercent: number;
  } | null>(null);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [payments, setPayments] = useState<ConnectPayment[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [savingItem, setSavingItem] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Member lockout state
  const [allMembers, setAllMembers] = useState<Array<{ userId: string; fullName: string; email: string; isPaymentLocked: boolean; lockoutAmountCents?: number | null; lockoutDescription?: string | null; paymentLockedAt?: string | null }>>([]);
  const [lockoutMemberSearch, setLockoutMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [lockoutAmountDollars, setLockoutAmountDollars] = useState('');
  const [lockoutDescription, setLockoutDescription] = useState('');
  const [lockingMember, setLockingMember] = useState(false);
  const [clearingLockout, setClearingLockout] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!clubId) return;
    const res = await membersApi.getFacilityMembers(clubId).catch(() => null);
    if (res?.success) {
      const list = (res as any).data?.members ?? [];
      setAllMembers(Array.isArray(list) ? list : []);
    }
  }, [clubId]);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const [statusRes, itemsRes, historyRes] = await Promise.all([
        stripeConnectApi.getStatus(clubId),
        paymentItemsApi.list(clubId),
        connectPaymentsApi.clubHistory(clubId),
      ]);
      if (statusRes.success) {
        const d = (statusRes as any).data?.data || (statusRes as any).data;
        setConnectStatus({
          onboarded: Boolean(d.onboarded),
          chargesEnabled: Boolean(d.chargesEnabled),
          accountId: d.accountId ?? null,
          platformFeePercent: Number(d.platformFeePercent ?? 0),
        });
      }
      if (itemsRes.success) {
        const list = (itemsRes as any).data?.data ?? (itemsRes as any).data ?? [];
        setItems(Array.isArray(list) ? list : []);
      }
      if (historyRes.success) {
        const list = (historyRes as any).data?.data ?? (historyRes as any).data ?? [];
        setPayments(Array.isArray(list) ? list : []);
      }
      await loadMembers();
    } catch (err) {
      console.error('PaymentsTab refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [clubId, loadMembers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // If Stripe just redirected back to ?connect=done, refresh + show a toast.
  useEffect(() => {
    const connect = searchParams.get('connect');
    if (connect === 'done') {
      refresh();
      toast.success('Returned from Stripe — onboarding status refreshed.');
      const next = new URLSearchParams(searchParams);
      next.delete('connect');
      next.delete('clubId');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, refresh]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await stripeConnectApi.startOnboarding(clubId);
      const url = res.data?.data?.url || res.data?.url;
      if (res.success && url) {
        window.location.href = url;
        return;
      }
      toast.error(res.error || 'Could not start Stripe onboarding');
    } catch (err: any) {
      toast.error(err?.message || 'Could not start Stripe onboarding');
    } finally {
      setConnecting(false);
    }
  };

  const beginCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCreating(true);
  };

  const beginEdit = (item: PaymentItem) => {
    setCreating(true);
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      amountDollars: (item.amountCents / 100).toFixed(2),
      category: item.category,
      isRecurring: item.isRecurring,
      recurringInterval: item.recurringInterval ?? 'month',
    });
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const saveItem = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const amount = Number(form.amountDollars);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than $0');
      return;
    }
    const amountCents = Math.round(amount * 100);

    setSavingItem(true);
    try {
      if (editingId) {
        const res = await paymentItemsApi.update(editingId, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          amountCents,
          category: form.category,
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : null,
        });
        if (!res.success) throw new Error(res.error || 'Failed to update item');
        toast.success('Payment item updated');
      } else {
        const res = await paymentItemsApi.create({
          clubId,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          amountCents,
          category: form.category,
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : null,
        });
        if (!res.success) throw new Error(res.error || 'Failed to create item');
        toast.success('Payment item created');
      }
      cancelEdit();
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSavingItem(false);
    }
  };

  const toggleActive = async (item: PaymentItem, next: boolean) => {
    try {
      const res = await paymentItemsApi.update(item.id, { isActive: next });
      if (!res.success) throw new Error(res.error || 'Failed to update item');
      setItems(prev => prev.map(p => (p.id === item.id ? { ...p, isActive: next } : p)));
      toast.success(next ? 'Item set to active' : 'Item set to inactive');
    } catch (err: any) {
      toast.error(err?.message || 'Update failed');
    }
  };

  const handleLockMember = async () => {
    if (!selectedMemberId) { toast.error('Select a member'); return; }
    const amount = Number(lockoutAmountDollars);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount greater than $0'); return; }
    const amountCents = Math.round(amount * 100);
    setLockingMember(true);
    try {
      const res = await membersApi.createLockoutPayment(clubId, selectedMemberId, amountCents, lockoutDescription.trim() || 'Account balance due');
      if (!(res as any).success) throw new Error((res as any).error || 'Failed to lock member');
      toast.success('Member locked — they will be prompted to pay before accessing the app');
      setSelectedMemberId('');
      setLockoutAmountDollars('');
      setLockoutDescription('');
      setLockoutMemberSearch('');
      await loadMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to lock member');
    } finally {
      setLockingMember(false);
    }
  };

  const handleClearLockout = async (userId: string) => {
    setClearingLockout(userId);
    try {
      const res = await membersApi.setPaymentLockout(clubId, userId, false);
      if (!(res as any).success) throw new Error((res as any).error || 'Failed to clear lockout');
      toast.success('Lockout cleared — member can now access the app');
      await loadMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear lockout');
    } finally {
      setClearingLockout(null);
    }
  };

  const isConnected = Boolean(connectStatus?.onboarded);

  const filteredMembers = useMemo(() => {
    const q = lockoutMemberSearch.toLowerCase();
    return allMembers.filter(m =>
      !m.isPaymentLocked &&
      (m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    );
  }, [allMembers, lockoutMemberSearch]);

  const lockedMembers = useMemo(
    () => allMembers.filter(m => m.isPaymentLocked),
    [allMembers]
  );

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      }),
    [items]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stripe Connect status */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Stripe Connect</CardTitle>
              <CardDescription>
                Money flows directly to your club's bank account. CourtTime takes a small
                platform fee of {connectStatus?.platformFeePercent ?? 0}% per transaction.
              </CardDescription>
            </div>
            {isConnected ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connect your club's Stripe account to start accepting payments from members.
                You'll be redirected to Stripe to verify your bank details.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleConnect}
              disabled={connecting}
              variant={isConnected ? 'outline' : 'default'}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {connecting
                ? 'Redirecting…'
                : isConnected
                  ? 'Update Stripe details'
                  : 'Connect Stripe'}
            </Button>
            {connectStatus?.accountId && (
              <span className="text-xs text-gray-500">Account: {connectStatus.accountId}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Items management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment items</CardTitle>
              <CardDescription>
                What members can pay for — ball machine time, clinics, drills, dues, etc.
              </CardDescription>
            </div>
            {!creating && (
              <Button onClick={beginCreate} disabled={!isConnected}>
                <Plus className="h-4 w-4 mr-2" /> New item
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Finish Stripe Connect onboarding before you create payment items.
              </AlertDescription>
            </Alert>
          )}

          {creating && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {editingId ? 'Edit payment item' : 'New payment item'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pi-name">Name</Label>
                    <Input
                      id="pi-name"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Tuesday 6pm Clinic"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pi-amount">Amount (USD)</Label>
                    <Input
                      id="pi-amount"
                      type="number"
                      step="0.01"
                      min="0.50"
                      value={form.amountDollars}
                      onChange={e => setForm(f => ({ ...f, amountDollars: e.target.value }))}
                      placeholder="25.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pi-category">Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={v =>
                        setForm(f => ({ ...f, category: v as PaymentCategory }))
                      }
                    >
                      <SelectTrigger id="pi-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Recurring</Label>
                    <div className="flex items-center gap-3 h-9">
                      <Switch
                        checked={form.isRecurring}
                        onCheckedChange={c => setForm(f => ({ ...f, isRecurring: c }))}
                      />
                      {form.isRecurring && (
                        <Select
                          value={form.recurringInterval}
                          onValueChange={v =>
                            setForm(f => ({ ...f, recurringInterval: v as 'month' | 'year' }))
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="month">Monthly</SelectItem>
                            <SelectItem value="year">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="pi-description">Description (optional)</Label>
                    <Textarea
                      id="pi-description"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={2}
                      placeholder="Anything members should know before paying."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={cancelEdit} disabled={savingItem}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={saveItem} disabled={savingItem}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingItem ? 'Saving…' : editingId ? 'Save changes' : 'Create item'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {sortedItems.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">
              No payment items yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-gray-500 max-w-md whitespace-normal">
                          {item.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{categoryLabel(item.category)}</TableCell>
                    <TableCell>{dollars(item.amountCents)}</TableCell>
                    <TableCell>
                      {item.isRecurring ? (
                        <Badge variant="secondary">
                          Every {item.recurringInterval ?? 'month'}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={item.isActive}
                        onCheckedChange={c => toggleActive(item, c)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => beginEdit(item)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Member payment lockout */}
      <Card>
        <CardHeader>
          <CardTitle>Member Lockout</CardTitle>
          <CardDescription>
            Lock a member's access and require a Stripe payment before they can use the app again.
            Their account is automatically restored once payment is confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lock a member form */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Lock a member
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="lockout-search">Search member</Label>
                <Input
                  id="lockout-search"
                  placeholder="Type name or email…"
                  value={lockoutMemberSearch}
                  onChange={e => {
                    setLockoutMemberSearch(e.target.value);
                    setSelectedMemberId('');
                  }}
                />
                {lockoutMemberSearch && filteredMembers.length > 0 && !selectedMemberId && (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto shadow-sm">
                    {filteredMembers.slice(0, 8).map(m => (
                      <button
                        key={m.userId}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setSelectedMemberId(m.userId);
                          setLockoutMemberSearch(`${m.fullName} (${m.email})`);
                        }}
                      >
                        <span className="font-medium">{m.fullName}</span>
                        <span className="text-gray-400 ml-2">{m.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {lockoutMemberSearch && filteredMembers.length === 0 && !selectedMemberId && (
                  <p className="text-xs text-gray-400 pl-1">No unlocked members match</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lockout-amount">Amount owed (USD)</Label>
                <Input
                  id="lockout-amount"
                  type="number"
                  step="0.01"
                  min="0.50"
                  placeholder="25.00"
                  value={lockoutAmountDollars}
                  onChange={e => setLockoutAmountDollars(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lockout-desc">Description (optional)</Label>
                <Input
                  id="lockout-desc"
                  placeholder="e.g. Court damage fee"
                  value={lockoutDescription}
                  onChange={e => setLockoutDescription(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleLockMember}
              disabled={lockingMember || !selectedMemberId}
              variant="destructive"
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              {lockingMember ? 'Locking…' : 'Lock Member & Require Payment'}
            </Button>
          </div>

          {/* Currently locked members */}
          {lockedMembers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4" />
                Currently locked ({lockedMembers.length})
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Locked on</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lockedMembers.map(m => (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <div className="font-medium">{m.fullName}</div>
                        <div className="text-xs text-gray-500">{m.email}</div>
                      </TableCell>
                      <TableCell>
                        {m.lockoutAmountCents
                          ? dollars(m.lockoutAmountCents)
                          : <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {m.lockoutDescription || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {m.paymentLockedAt
                          ? new Date(m.paymentLockedAt).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={clearingLockout === m.userId}
                          onClick={() => handleClearLockout(m.userId)}
                          className="gap-1"
                        >
                          <LockOpen className="h-3.5 w-3.5" />
                          {clearingLockout === m.userId ? 'Clearing…' : 'Clear Lockout'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {lockedMembers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No members are currently locked.</p>
          )}
        </CardContent>
      </Card>

      {/* Payment history (admin view) */}
      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>All member payments to this club.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">
              No payments yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Platform fee</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {new Date(p.paidAt || p.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.memberName || '—'}</div>
                      {p.memberEmail && (
                        <div className="text-xs text-gray-500">{p.memberEmail}</div>
                      )}
                    </TableCell>
                    <TableCell>{p.itemName || '—'}</TableCell>
                    <TableCell>{dollars(p.amountCents)}</TableCell>
                    <TableCell>{dollars(p.platformFeeCents)}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: ConnectPayment['status'] }) {
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
