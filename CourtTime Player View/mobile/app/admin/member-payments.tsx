/**
 * Admin Member Payments — web's AdminMemberPayments (PaymentsTab + BillingTab):
 *   - Stripe Connect status and onboarding (opens Stripe in the browser)
 *   - Payment items: create, edit, activate/deactivate
 *   - Member payment lockouts (shared AdminPaymentLockoutCard)
 *   - Recent member payments with refunds
 *   - Club billing: CourtTime subscription, billing portal, cancel, history
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  cancelFacilitySubscription,
  createBillingPortalSession,
  createFacilityCheckout,
  createPaymentItem,
  getClubPaymentHistory,
  getFacilityBillingHistory,
  getFacilityMembers,
  getFacilitySubscription,
  getStripeConnectStatus,
  listPaymentItems,
  refundConnectPayment,
  startStripeOnboarding,
  updatePaymentItem,
  type AdminPaymentItem,
  type ClubPaymentRow,
  type FacilitySubscription,
  type PaymentCategory,
} from '../../src/api/admin';
import { parseAdminLockoutMembers } from '../../src/utils/adminPaymentLockout';
import { AdminPaymentLockoutCard } from '../../src/components/AdminPaymentLockoutCard';
import { isStripeConnectReadyFromResponse, unwrapApiPayload } from '../../../shared/api/core';
import { parseDollarsToCents } from '../../../shared/utils/money';
import { formatCentsAsUsd } from '../../src/utils/payments';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Member Payments');

/** Browser flows (Stripe onboarding, billing portal) return to the web console. */
const WEB_APP_URL = 'https://www.courttimeapp.com';

const CATEGORY_OPTIONS: Array<{ value: PaymentCategory; label: string }> = [
  { value: 'BALL_MACHINE', label: 'Ball machine' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'DRILL', label: 'Drill' },
  { value: 'DUES', label: 'Dues' },
  { value: 'OTHER', label: 'Other' },
];

const EMPTY_FORM = {
  name: '',
  amountDollars: '',
  category: 'OTHER' as PaymentCategory,
  isRecurring: false,
  recurringInterval: 'month' as 'month' | 'year',
  description: '',
};

function categoryLabel(c: string): string {
  return CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

async function openInBrowser(url: string | undefined | null, failTitle: string) {
  if (!url) {
    showAlert(failTitle, 'No link was returned. Please try again.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    showAlert(failTitle, 'Could not open the browser.');
  }
}

export default function AdminMemberPaymentsScreen() {
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [connectStatus, setConnectStatus] = useState<{ connected: boolean; accountId?: string; platformFeePercent?: number }>({ connected: false });
  const [items, setItems] = useState<AdminPaymentItem[]>([]);
  const [payments, setPayments] = useState<ClubPaymentRow[]>([]);
  const [members, setMembers] = useState<ReturnType<typeof parseAdminLockoutMembers>>([]);
  const [subscription, setSubscription] = useState<FacilitySubscription | null>(null);
  const [billingHistory, setBillingHistory] = useState<Array<{ id: string; amountCents?: number; status?: string; createdAt?: string; description?: string }>>([]);

  const [connecting, setConnecting] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; form: typeof EMPTY_FORM } | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const [statusRes, itemsRes, paymentsRes, membersRes, subRes, historyRes] = await Promise.all([
      getStripeConnectStatus(facilityId),
      listPaymentItems(facilityId),
      getClubPaymentHistory(facilityId),
      getFacilityMembers(facilityId),
      getFacilitySubscription(facilityId),
      getFacilityBillingHistory(facilityId),
    ]);
    const statusPayload = unwrapApiPayload<{ accountId?: string; platformFeePercent?: number }>(statusRes.data) ?? {};
    setConnectStatus({
      connected: isStripeConnectReadyFromResponse(statusRes),
      accountId: statusPayload.accountId,
      platformFeePercent: statusPayload.platformFeePercent,
    });
    const itemList = itemsRes.success ? unwrapApiPayload<AdminPaymentItem[]>(itemsRes.data) : null;
    setItems(Array.isArray(itemList) ? itemList : []);
    const payList = paymentsRes.success ? unwrapApiPayload<ClubPaymentRow[]>(paymentsRes.data) : null;
    setPayments(Array.isArray(payList) ? payList : []);
    setMembers(membersRes.success && membersRes.data ? parseAdminLockoutMembers(membersRes.data.members || []) : []);
    setSubscription(subRes.success ? (unwrapApiPayload<FacilitySubscription>(subRes.data) ?? null) : null);
    const hist = historyRes.success ? unwrapApiPayload<any[]>(historyRes.data) : null;
    setBillingHistory(Array.isArray(hist) ? hist : []);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    [items]
  );

  // ── Stripe Connect ──
  async function handleConnect() {
    if (!facilityId) return;
    setConnecting(true);
    const res = await startStripeOnboarding(facilityId);
    setConnecting(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not start Stripe onboarding');
      return;
    }
    await openInBrowser(unwrapApiPayload<{ url?: string }>(res.data)?.url, 'Stripe');
  }

  // ── Payment items ──
  function beginEdit(item?: AdminPaymentItem) {
    setEditing({
      id: item?.id ?? null,
      form: item
        ? {
            name: item.name,
            amountDollars: (item.amountCents / 100).toFixed(2),
            category: item.category,
            isRecurring: !!item.isRecurring,
            recurringInterval: item.recurringInterval === 'year' ? 'year' : 'month',
            description: item.description ?? '',
          }
        : { ...EMPTY_FORM },
    });
  }

  async function saveItem() {
    if (!facilityId || !editing) return;
    const { form } = editing;
    const amountCents = parseDollarsToCents(form.amountDollars);
    if (!form.name.trim()) {
      showAlert('Payment item', 'Name is required.');
      return;
    }
    if (!amountCents || amountCents < 50) {
      showAlert('Payment item', 'Enter an amount of at least $0.50.');
      return;
    }
    setSavingItem(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amountCents,
      category: form.category,
      isRecurring: form.isRecurring,
      recurringInterval: form.isRecurring ? form.recurringInterval : null,
    };
    const res = editing.id
      ? await updatePaymentItem(editing.id, { ...payload, description: payload.description ?? null })
      : await createPaymentItem({ clubId: facilityId, ...payload });
    setSavingItem(false);
    if (res.success) {
      setEditing(null);
      await load();
    } else {
      showApiErrorAlert(res, editing.id ? 'Failed to update item' : 'Failed to create item');
    }
  }

  async function toggleActive(item: AdminPaymentItem, isActive: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isActive } : i)));
    const res = await updatePaymentItem(item.id, { isActive });
    if (!res.success) {
      showApiErrorAlert(res, 'Failed to update item');
      await load();
    }
  }

  // ── Refunds ──
  function confirmRefund(p: ClubPaymentRow) {
    Alert.alert(
      'Refund payment?',
      `Refund ${formatCentsAsUsd(p.amountCents)} to ${p.memberName || 'this member'}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(p.id);
              const res = await refundConnectPayment(p.id);
              setBusyId(null);
              if (res.success) await load();
              else showApiErrorAlert(res, 'Refund failed');
            })();
          },
        },
      ]
    );
  }

  // ── Club billing ──
  async function openPortal() {
    if (!facilityId) return;
    setBusyId('portal');
    const res = await createBillingPortalSession(facilityId, `${WEB_APP_URL}/admin/member-payments`);
    setBusyId(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Unable to open billing portal');
      return;
    }
    await openInBrowser(unwrapApiPayload<{ url?: string }>(res.data)?.url, 'Billing portal');
  }

  async function paySubscription() {
    if (!facilityId) return;
    setBusyId('pay');
    const res = await createFacilityCheckout(facilityId, `${WEB_APP_URL}/admin/member-payments`);
    setBusyId(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Unable to start checkout');
      return;
    }
    const data = unwrapApiPayload<{ sessionUrl?: string; url?: string; devMode?: boolean }>(res.data);
    if (data?.devMode) {
      showAlert('Payment', 'Payment completed (dev mode).');
      await load();
      return;
    }
    await openInBrowser(data?.sessionUrl ?? data?.url, 'Checkout');
  }

  function confirmCancelSubscription() {
    if (!facilityId) return;
    Alert.alert('Cancel subscription?', 'Your subscription will end at the end of the current billing period.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel subscription',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId('cancel');
            const res = await cancelFacilitySubscription(facilityId);
            setBusyId(null);
            if (res.success) {
              setSubscription((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
            } else {
              showApiErrorAlert(res, 'Failed to cancel subscription');
            }
          })();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Member Payments' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const renewal = subscription?.currentPeriodEnd || subscription?.billingPeriodEnd;
  const subActive = subscription?.status === 'active' || subscription?.status === 'trialing';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl * 2 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Stack.Screen options={{ title: 'Member Payments' }} />

      {/* Stripe Connect */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Stripe Connect</Text>
          <View style={[styles.badge, connectStatus.connected && styles.badgeOk]}>
            <Text style={[styles.badgeText, connectStatus.connected && styles.badgeOkText]}>
              {connectStatus.connected ? 'Connected' : 'Not connected'}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>
          Money flows directly to your club's bank account. CourtTime takes a platform fee of{' '}
          {connectStatus.platformFeePercent ?? 0}% per transaction.
        </Text>
        {!connectStatus.connected ? (
          <Text style={styles.muted}>Connect your club's Stripe account to start accepting payments from members. You'll be sent to Stripe to verify bank details.</Text>
        ) : null}
        <Button
          title={connecting ? 'Opening Stripe…' : connectStatus.connected ? 'Update Stripe details' : 'Connect Stripe'}
          variant={connectStatus.connected ? 'secondary' : 'primary'}
          onPress={() => void handleConnect()}
          loading={connecting}
          style={{ marginTop: Spacing.sm }}
        />
        {connectStatus.accountId ? <Text style={styles.muted}>Account: {connectStatus.accountId}</Text> : null}
      </Card>

      {/* Payment items */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Payment items</Text>
          <TouchableOpacity
            onPress={() => beginEdit()}
            disabled={!connectStatus.connected}
            accessibilityRole="button"
            accessibilityLabel="New payment item"
            style={!connectStatus.connected && { opacity: 0.4 }}
          >
            <Text style={styles.link}>+ New item</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.muted}>What members can pay for — ball machine time, clinics, drills, dues, etc.</Text>
        {!connectStatus.connected ? <Text style={styles.warn}>Finish Stripe Connect onboarding before you create payment items.</Text> : null}
        {sortedItems.length === 0 ? (
          <Text style={styles.empty}>No payment items yet.</Text>
        ) : (
          sortedItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {categoryLabel(item.category)} · {formatCentsAsUsd(item.amountCents)}
                  {item.isRecurring ? ` · every ${item.recurringInterval ?? 'month'}` : ''}
                </Text>
                {item.description ? <Text style={styles.rowMeta}>{item.description}</Text> : null}
              </View>
              <Switch value={item.isActive} onValueChange={(v) => void toggleActive(item, v)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${item.name} active`} />
              <TouchableOpacity onPress={() => beginEdit(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </Card>

      {/* Member lockouts (shared with Members screen) */}
      <AdminPaymentLockoutCard facilityId={facilityId} members={members} stripeConnected={connectStatus.connected} onChanged={load} />

      {/* Recent payments */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Recent payments</Text>
        <Text style={styles.muted}>Member card charges across checkout, court close-out, annual fees, and pro shop.</Text>
        {payments.length === 0 ? (
          <Text style={styles.empty}>No payments yet.</Text>
        ) : (
          payments.slice(0, 50).map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{p.memberName || '—'}</Text>
                <Text style={styles.rowMeta}>
                  {p.itemName || p.source || 'Payment'} · {new Date(p.paidAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatCentsAsUsd(p.amountCents)}
                  {p.platformFeeCents ? ` · fee ${formatCentsAsUsd(p.platformFeeCents)}` : ''} · {p.status}
                </Text>
              </View>
              {p.refundable ? (
                <Button title="Refund" variant="secondary" onPress={() => confirmRefund(p)} loading={busyId === p.id} disabled={busyId !== null} accessibilityLabel={`Refund ${p.memberName || 'payment'}`} />
              ) : null}
            </View>
          ))
        )}
      </Card>

      {/* Club billing (BillingTab) */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>CourtTime subscription</Text>
        {!subscription ? (
          <Text style={styles.empty}>No subscription on file.</Text>
        ) : (
          <>
            <View style={styles.kv}>
              <Text style={styles.k}>Plan</Text>
              <Text style={styles.v}>{subscription.planType ?? '—'}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>Status</Text>
              <Text style={styles.v}>{subscription.status ?? '—'}{subscription.cancelAtPeriodEnd ? ' (ends at period end)' : ''}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>Amount</Text>
              <Text style={styles.v}>{subscription.amountCents === 0 ? 'Free' : subscription.amountCents != null ? `${formatCentsAsUsd(subscription.amountCents)}/year` : '—'}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>Courts</Text>
              <Text style={styles.v}>{subscription.courtCount ?? '—'}</Text>
            </View>
            {renewal ? (
              <View style={styles.kv}>
                <Text style={styles.k}>{subscription.cancelAtPeriodEnd ? 'Ends on' : 'Renewal date'}</Text>
                <Text style={styles.v}>{new Date(renewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              {subscription.status === 'custom_pending' || subscription.status === 'past_due' || subscription.status === 'unpaid' ? (
                <Button title="Pay annual subscription" onPress={() => void paySubscription()} loading={busyId === 'pay'} disabled={busyId !== null} />
              ) : null}
              <Button title="Manage subscription" variant="secondary" onPress={() => void openPortal()} loading={busyId === 'portal'} disabled={busyId !== null} />
              {subActive && !subscription.cancelAtPeriodEnd ? (
                <Button title="Cancel subscription" variant="destructive" onPress={confirmCancelSubscription} loading={busyId === 'cancel'} disabled={busyId !== null} />
              ) : null}
            </View>
          </>
        )}
        {billingHistory.length > 0 ? (
          <>
            <Text style={[styles.rowTitle, { marginTop: Spacing.md }]}>Billing history</Text>
            {billingHistory.slice(0, 20).map((h) => (
              <View key={h.id} style={styles.kv}>
                <Text style={styles.k}>{h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}{h.description ? ` · ${h.description}` : ''}</Text>
                <Text style={styles.v}>{h.amountCents != null ? formatCentsAsUsd(h.amountCents) : '—'}{h.status ? ` · ${h.status}` : ''}</Text>
              </View>
            ))}
          </>
        ) : null}
      </Card>

      {/* Payment item editor */}
      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditing(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editing?.id ? 'Edit payment item' : 'New payment item'}</Text>
            <TouchableOpacity onPress={() => void saveItem()} disabled={savingItem} accessibilityRole="button" accessibilityLabel="Save payment item">
              <Text style={[styles.modalSave, savingItem && { opacity: 0.5 }]}>{savingItem ? '…' : editing?.id ? 'Save' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
          {editing ? (
            <ScrollView contentContainerStyle={{ padding: Spacing.md }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Name</Text>
              <Input value={editing.form.name} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, name: v } })} placeholder="e.g. Tuesday 6pm Clinic" />
              <Text style={styles.label}>Amount (USD)</Text>
              <Input value={editing.form.amountDollars} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, amountDollars: v.replace(/[^0-9.]/g, '') } })} keyboardType="decimal-pad" placeholder="25.00" />
              <Text style={styles.label}>Category</Text>
              <View style={styles.chips}>
                {CATEGORY_OPTIONS.map((o) => (
                  <TouchableOpacity key={o.value} style={[styles.chip, editing.form.category === o.value && styles.chipSelected]} onPress={() => setEditing({ ...editing, form: { ...editing.form, category: o.value } })} accessibilityRole="button" accessibilityState={{ selected: editing.form.category === o.value }} accessibilityLabel={o.label}>
                    <Text style={[styles.chipText, editing.form.category === o.value && styles.chipTextSelected]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.cardHeaderRow, { marginTop: Spacing.md }]}>
                <Text style={styles.label}>Recurring</Text>
                <Switch value={editing.form.isRecurring} onValueChange={(v) => setEditing({ ...editing, form: { ...editing.form, isRecurring: v } })} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="Recurring" />
              </View>
              {editing.form.isRecurring ? (
                <View style={styles.chips}>
                  {(['month', 'year'] as const).map((i) => (
                    <TouchableOpacity key={i} style={[styles.chip, editing.form.recurringInterval === i && styles.chipSelected]} onPress={() => setEditing({ ...editing, form: { ...editing.form, recurringInterval: i } })} accessibilityRole="button" accessibilityLabel={i === 'month' ? 'Monthly' : 'Yearly'}>
                      <Text style={[styles.chipText, editing.form.recurringInterval === i && styles.chipTextSelected]}>{i === 'month' ? 'Monthly' : 'Yearly'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <Text style={styles.label}>Description (optional)</Text>
              <Input value={editing.form.description} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, description: v } })} placeholder="Anything members should know before paying." multiline style={styles.multiline} />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  warn: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 4 },
  empty: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.sm },
  link: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  badge: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  badgeOk: { backgroundColor: Colors.success + '15', borderColor: Colors.success },
  badgeText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  badgeOkText: { color: Colors.success, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, paddingVertical: 4 },
  k: { fontSize: FontSize.xs, color: Colors.textSecondary, flexShrink: 1 },
  v: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
});
