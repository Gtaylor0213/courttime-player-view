/**
 * Admin Pro Shop — web's ProShopAdmin: products (with photo), orders, member
 * tabs (bill one / bill all), in-person sales to a member (charge card, add to
 * tab, cash) or a guest (cash or Stripe link), and tab settings.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/AuthContext';
import { proShopAdmin, type ProShopAdminOrder, type ProShopAdminProduct, type ProShopMemberRow, type ProShopTabRow } from '../../src/api/admin';
import { unwrapApiPayload } from '../../../shared/api/core';
import { extractCheckoutUrl, formatCentsAsUsd } from '../../src/utils/payments';
import { PRO_SHOP_CATEGORIES, adjustCart, cartItems, cartTotalCents, parseProductForm, type Cart, type ProductFormValues } from '../../src/utils/proShopAdmin';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Pro Shop');

type Tab = 'products' | 'orders' | 'tabs' | 'sell' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'orders', label: 'Orders' },
  { key: 'tabs', label: 'Tabs' },
  { key: 'sell', label: 'Sell' },
  { key: 'settings', label: 'Settings' },
];
const EMPTY_FORM: ProductFormValues = { name: '', description: '', category: 'other', priceDollars: '', stock: '', imageData: null, isActive: true };

export default function AdminProShopScreen() {
  const { facilityId } = useAuth();
  const [tab, setTab] = useState<Tab>('products');
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProShopAdminProduct[]>([]);
  const [orders, setOrders] = useState<ProShopAdminOrder[]>([]);
  const [tabs, setTabs] = useState<ProShopTabRow[]>([]);
  const [members, setMembers] = useState<ProShopMemberRow[]>([]);
  const [settings, setSettings] = useState<{ tab_billing_day: string; require_card: boolean }>({ tab_billing_day: '1', require_card: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<(ProductFormValues & { id: string | null }) | null>(null);
  // Sell tab state
  const [cart, setCart] = useState<Cart>({});
  const [buyer, setBuyer] = useState<'member' | 'guest'>('member');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<ProShopMemberRow | null>(null);
  const [guest, setGuest] = useState({ name: '', email: '' });

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [p, o, t, m, s] = await Promise.all([proShopAdmin.products(facilityId), proShopAdmin.orders(facilityId), proShopAdmin.tabs(facilityId), proShopAdmin.members(facilityId), proShopAdmin.settings(facilityId)]);
    setProducts((p.success ? unwrapApiPayload<ProShopAdminProduct[]>(p.data) : []) ?? []);
    setOrders((o.success ? unwrapApiPayload<ProShopAdminOrder[]>(o.data) : []) ?? []);
    setTabs((t.success ? unwrapApiPayload<ProShopTabRow[]>(t.data) : []) ?? []);
    setMembers((m.success ? unwrapApiPayload<ProShopMemberRow[]>(m.data) : []) ?? []);
    const st = s.success ? unwrapApiPayload<{ tab_billing_day?: number; require_card?: boolean }>(s.data) : null;
    if (st) setSettings({ tab_billing_day: String(st.tab_billing_day ?? 1), require_card: !!st.require_card });
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active && (p.stock_quantity == null || p.stock_quantity > 0)), [products]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    return members.filter((m) => m.full_name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)).slice(0, 8);
  }, [members, memberSearch]);
  const total = cartTotalCents(cart, products);
  const tabTotal = tabs.reduce((s, t) => s + Number(t.unbilled_cents || 0), 0);

  // ── Products ──
  async function pickImage() {
    if (!form) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Photos', 'Allow photo access to add a product image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    const asset = result.canceled ? null : result.assets[0];
    if (asset?.base64) setForm({ ...form, imageData: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` });
  }

  async function saveProduct() {
    if (!facilityId || !form) return;
    const parsed = parseProductForm(form);
    if (!parsed.ok) {
      showAlert('Product', parsed.error);
      return;
    }
    setBusy('product');
    const res = form.id ? await proShopAdmin.updateProduct(form.id, parsed.body) : await proShopAdmin.createProduct(facilityId, parsed.body);
    setBusy(null);
    if (res.success) {
      setForm(null);
      await load();
    } else showApiErrorAlert(res, 'Failed to save product');
  }

  function confirmDeleteProduct(p: ProShopAdminProduct) {
    Alert.alert('Delete product', `Delete "${p.name}"? Products with past orders are hidden instead of removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { const res = await proShopAdmin.deleteProduct(p.id); if (res.success) await load(); else showApiErrorAlert(res, 'Failed to delete product'); })(); } },
    ]);
  }

  async function toggleActive(p: ProShopAdminProduct, v: boolean) {
    const res = await proShopAdmin.updateProduct(p.id, { is_active: v });
    if (res.success) setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: v } : x)));
    else showApiErrorAlert(res, 'Failed to update product');
  }

  // ── Tabs ──
  function confirmBill(row: ProShopTabRow | null) {
    if (!facilityId) return;
    const label = row ? `Charge ${row.member_name}'s card ${formatCentsAsUsd(Number(row.unbilled_cents))}?` : `Charge every member with a card on file? Total ${formatCentsAsUsd(tabTotal)}.`;
    Alert.alert(row ? 'Bill tab' : 'Bill all tabs', label, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Charge', style: 'destructive', onPress: () => { void (async () => { setBusy(row ? row.user_id : 'bill-all'); const res = row ? await proShopAdmin.billTab(facilityId, row.user_id) : await proShopAdmin.billAll(facilityId); setBusy(null); if (res.success) { const r = unwrapApiPayload<any>(res.data); if (!row && r && (r.charged != null || r.chargedCount != null)) showAlert('Billing complete', `Charged ${r.charged ?? r.chargedCount}, failed ${r.failed ?? r.failedCount ?? 0}.`); await load(); } else showApiErrorAlert(res, 'Billing failed'); })(); } },
    ]);
  }

  // ── Sell ──
  async function sell(mode: 'charge' | 'tab' | 'cash' | 'guest-cash' | 'guest-stripe') {
    if (!facilityId) return;
    const items = cartItems(cart);
    if (items.length === 0) {
      showAlert('Sale', 'Add at least one item.');
      return;
    }
    setBusy(mode);
    let res;
    if (mode === 'guest-cash' || mode === 'guest-stripe') {
      if (!guest.name.trim()) {
        setBusy(null);
        showAlert('Sale', 'Guest name is required.');
        return;
      }
      res = await proShopAdmin.guestSale(facilityId, { guest_name: guest.name.trim(), guest_email: guest.email.trim() || null, items, payment_mode: mode === 'guest-stripe' ? 'stripe' : 'cash' });
    } else {
      if (!selectedMember) {
        setBusy(null);
        showAlert('Sale', 'Pick a member first.');
        return;
      }
      res = await proShopAdmin.assign(facilityId, mode, selectedMember.id, items);
    }
    setBusy(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Sale failed');
      return;
    }
    const url = mode === 'guest-stripe' ? extractCheckoutUrl(unwrapApiPayload(res.data)) : null;
    setCart({});
    if (url) {
      Alert.alert('Payment link ready', 'Open the Stripe checkout for the guest to pay on this device?', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open', onPress: () => { void Linking.openURL(url); } },
      ]);
    } else {
      showAlert('Sale recorded', mode === 'tab' ? `Added ${formatCentsAsUsd(total)} to ${selectedMember?.full_name}'s tab.` : `Recorded ${formatCentsAsUsd(total)}.`);
    }
    await load();
  }

  async function saveSettings() {
    if (!facilityId) return;
    const d = Number(settings.tab_billing_day);
    if (!d || d < 1 || d > 28) {
      showAlert('Settings', 'Billing day must be between 1 and 28.');
      return;
    }
    setBusy('settings');
    const res = await proShopAdmin.updateSettings(facilityId, { tab_billing_day: d, require_card: settings.require_card });
    setBusy(null);
    if (res.success) showAlert('Saved', 'Pro shop settings saved.');
    else showApiErrorAlert(res, 'Failed to save settings');
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Pro Shop Admin' }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipSelected]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} accessibilityLabel={t.label}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextSelected]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {tab === 'products' ? (
          <>
            <Button title="Add product" onPress={() => setForm({ ...EMPTY_FORM, id: null })} leftIcon={<Ionicons name="add" size={16} color={Colors.textInverse} />} style={{ marginBottom: Spacing.md }} />
            {form ? (
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>{form.id ? 'Edit product' : 'New product'}</Text>
                <TouchableOpacity style={styles.imageBox} onPress={() => void pickImage()} accessibilityRole="button" accessibilityLabel="Product photo">
                  {form.imageData ? <Image source={{ uri: form.imageData }} style={styles.image} /> : <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />}
                  <Text style={styles.muted}>{form.imageData ? 'Tap to change photo' : 'Add photo'}</Text>
                </TouchableOpacity>
                <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" />
                <Input value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Description" multiline style={{ marginTop: Spacing.xs }} />
                <View style={styles.chips}>
                  {PRO_SHOP_CATEGORIES.map((c) => (
                    <TouchableOpacity key={c.value} style={[styles.chip, form.category === c.value && styles.chipSelected]} onPress={() => setForm({ ...form, category: c.value })} accessibilityRole="button" accessibilityLabel={c.label}><Text style={[styles.chipText, form.category === c.value && styles.chipTextSelected]}>{c.label}</Text></TouchableOpacity>
                  ))}
                </View>
                <View style={styles.row}>
                  <Input value={form.priceDollars} onChangeText={(v) => setForm({ ...form, priceDollars: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Price (USD)" style={{ flex: 1 }} accessibilityLabel="Price" />
                  <Input value={form.stock} onChangeText={(v) => setForm({ ...form, stock: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="Stock (blank = unlimited)" style={{ flex: 1 }} accessibilityLabel="Stock" />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.name}>Visible in shop</Text>
                  <Switch value={form.isActive} onValueChange={(v) => setForm({ ...form, isActive: v })} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="Visible in shop" />
                </View>
                <View style={[styles.row, { marginTop: Spacing.sm }]}>
                  <Button title="Save product" onPress={() => void saveProduct()} loading={busy === 'product'} style={{ flex: 1 }} />
                  <Button title="Cancel" variant="secondary" onPress={() => setForm(null)} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null}
            {products.length === 0 && !form ? <Text style={styles.empty}>No products yet.</Text> : null}
            {products.map((p) => (
              <Card key={p.id} style={styles.card}>
                <View style={styles.row}>
                  {p.image_data ? <Image source={{ uri: p.image_data }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="pricetag-outline" size={18} color={Colors.textMuted} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.muted}>{PRO_SHOP_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category} · {formatCentsAsUsd(p.price_cents)} · {p.stock_quantity == null ? 'Unlimited' : `${p.stock_quantity} in stock`}</Text>
                  </View>
                  <Switch value={p.is_active} onValueChange={(v) => void toggleActive(p, v)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${p.name} visible`} />
                  <TouchableOpacity onPress={() => setForm({ id: p.id, name: p.name, description: p.description ?? '', category: p.category, priceDollars: (p.price_cents / 100).toFixed(2), stock: p.stock_quantity == null ? '' : String(p.stock_quantity), imageData: p.image_data ?? null, isActive: p.is_active })} accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} hitSlop={8}><Ionicons name="create-outline" size={20} color={Colors.primary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDeleteProduct(p)} accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} hitSlop={8}><Ionicons name="trash-outline" size={20} color={Colors.error} /></TouchableOpacity>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'orders' ? (
          <>
            {orders.length === 0 ? <Text style={styles.empty}>No orders yet.</Text> : null}
            {orders.map((o) => (
              <Card key={o.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.name}>{o.is_guest ? `${o.guest_name ?? o.member_name ?? 'Guest'} (guest)` : o.member_name ?? 'Member'}</Text>
                  <Text style={styles.name}>{formatCentsAsUsd(o.total_cents)}</Text>
                </View>
                <Text style={styles.muted}>{new Date(o.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {o.status}{o.member_email ? ` · ${o.member_email}` : ''}</Text>
                {(o.items || []).map((it, i) => (
                  <Text key={i} style={styles.muted}>{it.quantity}× {it.name} · {formatCentsAsUsd(it.price_cents * it.quantity)}</Text>
                ))}
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'tabs' ? (
          <>
            <Card style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardTitle}>Open tabs</Text>
                  <Text style={styles.muted}>{tabs.length} member{tabs.length === 1 ? '' : 's'} · {formatCentsAsUsd(tabTotal)} unbilled</Text>
                </View>
                <Button title="Bill all" variant="destructive" onPress={() => confirmBill(null)} loading={busy === 'bill-all'} disabled={tabTotal === 0} />
              </View>
            </Card>
            {tabs.length === 0 ? <Text style={styles.empty}>No open tabs.</Text> : null}
            {tabs.map((t) => (
              <Card key={t.user_id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{t.member_name}</Text>
                    <Text style={styles.muted}>{formatCentsAsUsd(Number(t.unbilled_cents))} unbilled · {t.has_card ? 'card on file' : 'no card'}</Text>
                  </View>
                  <Button title="Bill" variant="secondary" onPress={() => confirmBill(t)} loading={busy === t.user_id} disabled={!t.has_card || Number(t.unbilled_cents) === 0} />
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'sell' ? (
          <>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Items</Text>
              {activeProducts.length === 0 ? <Text style={styles.muted}>No in-stock products.</Text> : null}
              {activeProducts.map((p) => (
                <View key={p.id} style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.muted}>{formatCentsAsUsd(p.price_cents)}{p.stock_quantity != null ? ` · ${p.stock_quantity} left` : ''}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => setCart((c) => adjustCart(c, p.id, -1, p.stock_quantity))} accessibilityRole="button" accessibilityLabel={`Remove one ${p.name}`} hitSlop={8}><Ionicons name="remove-circle-outline" size={24} color={cart[p.id] ? Colors.primary : Colors.textMuted} /></TouchableOpacity>
                    <Text style={styles.qty}>{cart[p.id] ?? 0}</Text>
                    <TouchableOpacity onPress={() => setCart((c) => adjustCart(c, p.id, 1, p.stock_quantity))} accessibilityRole="button" accessibilityLabel={`Add one ${p.name}`} hitSlop={8}><Ionicons name="add-circle-outline" size={24} color={Colors.primary} /></TouchableOpacity>
                  </View>
                </View>
              ))}
              <Text style={[styles.name, { marginTop: Spacing.sm, textAlign: 'right' }]}>Total {formatCentsAsUsd(total)}</Text>
            </Card>
            <Card style={styles.card}>
              <View style={styles.chips}>
                <TouchableOpacity style={[styles.chip, buyer === 'member' && styles.chipSelected]} onPress={() => setBuyer('member')} accessibilityRole="button" accessibilityLabel="Sell to member"><Text style={[styles.chipText, buyer === 'member' && styles.chipTextSelected]}>Member</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.chip, buyer === 'guest' && styles.chipSelected]} onPress={() => setBuyer('guest')} accessibilityRole="button" accessibilityLabel="Sell to guest"><Text style={[styles.chipText, buyer === 'guest' && styles.chipTextSelected]}>Guest</Text></TouchableOpacity>
              </View>
              {buyer === 'member' ? (
                <>
                  {selectedMember ? (
                    <View style={styles.rowBetween}>
                      <Text style={styles.name}>{selectedMember.full_name}{selectedMember.has_card ? '' : ' · no card'}</Text>
                      <TouchableOpacity onPress={() => setSelectedMember(null)} accessibilityRole="button" accessibilityLabel="Change member"><Text style={styles.link}>Change</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Input value={memberSearch} onChangeText={setMemberSearch} placeholder="Search members" accessibilityLabel="Search members" />
                      {filteredMembers.map((m) => (
                        <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => { setSelectedMember(m); setMemberSearch(''); }} accessibilityRole="button" accessibilityLabel={m.full_name}>
                          <Text style={styles.name}>{m.full_name}</Text>
                          <Text style={styles.muted}>{m.email}{m.has_card ? ' · card on file' : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  <View style={[styles.row, { marginTop: Spacing.sm }]}>
                    <Button title="Charge card" onPress={() => void sell('charge')} loading={busy === 'charge'} disabled={!selectedMember?.has_card} style={{ flex: 1 }} />
                    <Button title="Add to tab" variant="secondary" onPress={() => void sell('tab')} loading={busy === 'tab'} style={{ flex: 1 }} />
                    <Button title="Cash" variant="secondary" onPress={() => void sell('cash')} loading={busy === 'cash'} style={{ flex: 1 }} />
                  </View>
                </>
              ) : (
                <>
                  <Input value={guest.name} onChangeText={(v) => setGuest({ ...guest, name: v })} placeholder="Guest name" accessibilityLabel="Guest name" />
                  <Input value={guest.email} onChangeText={(v) => setGuest({ ...guest, email: v })} placeholder="Guest email (optional, for receipt)" keyboardType="email-address" autoCapitalize="none" style={{ marginTop: Spacing.xs }} accessibilityLabel="Guest email" />
                  <View style={[styles.row, { marginTop: Spacing.sm }]}>
                    <Button title="Cash / external" onPress={() => void sell('guest-cash')} loading={busy === 'guest-cash'} style={{ flex: 1 }} />
                    <Button title="Stripe link" variant="secondary" onPress={() => void sell('guest-stripe')} loading={busy === 'guest-stripe'} style={{ flex: 1 }} />
                  </View>
                </>
              )}
            </Card>
          </>
        ) : null}

        {tab === 'settings' ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Tab settings</Text>
            <Text style={styles.label}>Monthly tab billing day (1–28)</Text>
            <Input value={settings.tab_billing_day} onChangeText={(v) => setSettings({ ...settings, tab_billing_day: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" accessibilityLabel="Tab billing day" />
            <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Require a card on file</Text>
                <Text style={styles.muted}>Members must save a card before they can run a tab.</Text>
              </View>
              <Switch value={settings.require_card} onValueChange={(v) => setSettings({ ...settings, require_card: v })} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="Require a card on file" />
            </View>
            <Button title="Save settings" onPress={() => void saveSettings()} loading={busy === 'settings'} style={{ marginTop: Spacing.md }} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.card },
  tabRow: { flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tabChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  tabChipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextSelected: { color: Colors.primary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  name: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  empty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginVertical: Spacing.sm },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  imageBox: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.sm },
  image: { width: 96, height: 96, borderRadius: BorderRadius.md },
  thumb: { width: 44, height: 44, borderRadius: BorderRadius.sm },
  thumbEmpty: { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  qty: { minWidth: 20, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  memberRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: Colors.borderLight },
});
