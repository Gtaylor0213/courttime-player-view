/**
 * Admin Ball Machine — web's BallMachineAdmin: machines (add, edit, activate/
 * deactivate, reorder), pass pricing per machine and per duration, pass
 * holders with comp (grant) and revoke.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { ballMachineAdmin, getFacilityMembers, type BallMachinePassHolder, type BallMachineProduct, type BallMachineRow } from '../../src/api/admin';
import { unwrapApiPayload } from '../../../shared/api/core';
import { formatCentsAsUsd } from '../../src/utils/payments';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Ball Machine');

const DURATIONS = [1, 3, 6, 12] as const;
const ALL = '__all__';
const durationLabel = (m: number) => (m === 12 ? '1 year' : `${m} month${m === 1 ? '' : 's'}`);

interface Draft { name: string; accessCode: string; instructions: string; hourlyDollars: string; machineCount: string }
const draftFrom = (m: BallMachineRow): Draft => ({ name: m.name, accessCode: m.accessCode ?? '', instructions: m.instructions ?? '', hourlyDollars: m.hourlyFeeCents ? (m.hourlyFeeCents / 100).toFixed(2) : '', machineCount: String(m.machineCount ?? 1) });

export default function AdminBallMachineScreen() {
  const { facilityId } = useAuth();
  const [machines, setMachines] = useState<BallMachineRow[]>([]);
  const [products, setProducts] = useState<BallMachineProduct[]>([]);
  const [holders, setHolders] = useState<BallMachinePassHolder[]>([]);
  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceForms, setPriceForms] = useState<Record<string, Record<number, { price: string; active: boolean }>>>({});
  const [newName, setNewName] = useState('');
  const [grantSearch, setGrantSearch] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantMachine, setGrantMachine] = useState<string>(ALL);
  const [grantMonths, setGrantMonths] = useState<number>(12);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [m, p, h, mem] = await Promise.all([ballMachineAdmin.machines(facilityId), ballMachineAdmin.products(facilityId), ballMachineAdmin.passes(facilityId), getFacilityMembers(facilityId)]);
    if (!m.success && (m.error || '').toLowerCase().includes('not enabled')) {
      setUnavailable(true);
      return;
    }
    const ms = (m.success ? unwrapApiPayload<BallMachineRow[]>(m.data) : []) ?? [];
    const ps = (p.success ? unwrapApiPayload<BallMachineProduct[]>(p.data) : []) ?? [];
    setMachines(ms);
    setProducts(ps);
    setHolders((h.success ? unwrapApiPayload<BallMachinePassHolder[]>(h.data) : []) ?? []);
    setMembers(mem.success && mem.data ? (mem.data.members || []).map((x) => ({ userId: x.userId, fullName: x.fullName })) : []);
    setDrafts(Object.fromEntries(ms.map((x) => [x.id, draftFrom(x)])));
    const keys = [ALL, ...ms.map((x) => x.id)];
    setPriceForms(
      Object.fromEntries(
        keys.map((k) => [
          k,
          Object.fromEntries(
            DURATIONS.map((d) => {
              const existing = ps.find((x) => x.durationMonths === d && (x.machineId ?? ALL) === k);
              return [d, { price: existing ? (existing.priceCents / 100).toFixed(2) : '', active: existing?.isActive ?? false }];
            })
          ),
        ])
      )
    );
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const memberMatches = useMemo(() => {
    const q = grantSearch.trim().toLowerCase();
    return (q ? members.filter((m) => m.fullName.toLowerCase().includes(q)) : members).slice(0, 8);
  }, [members, grantSearch]);

  async function addMachine() {
    if (!facilityId || !newName.trim()) return;
    setSaving('add');
    const res = await ballMachineAdmin.createMachine(facilityId, { name: newName.trim() });
    setSaving(null);
    if (res.success) {
      setNewName('');
      await load();
    } else showApiErrorAlert(res, 'Could not add the machine');
  }

  async function saveMachine(m: BallMachineRow) {
    if (!facilityId) return;
    const d = drafts[m.id];
    if (!d || !d.name.trim()) {
      showAlert('Machine', 'Give the machine a name.');
      return;
    }
    const count = parseInt(d.machineCount, 10);
    if (!count || count < 1) {
      showAlert('Machine', 'Machine count must be at least 1.');
      return;
    }
    setSaving(m.id);
    const res = await ballMachineAdmin.updateMachine(facilityId, m.id, {
      name: d.name.trim(),
      accessCode: d.accessCode.trim(),
      instructions: d.instructions.trim(),
      hourlyFeeCents: d.hourlyDollars.trim() ? Math.round(parseFloat(d.hourlyDollars) * 100) : null,
      machineCount: count,
    });
    setSaving(null);
    if (res.success) {
      setEditingId(null);
      await load();
    } else showApiErrorAlert(res, 'Could not save the machine');
  }

  async function toggleActive(m: BallMachineRow) {
    if (!facilityId) return;
    setSaving(m.id);
    const res = m.isActive ? await ballMachineAdmin.deactivateMachine(facilityId, m.id) : await ballMachineAdmin.updateMachine(facilityId, m.id, { isActive: true });
    setSaving(null);
    if (res.success) await load();
    else showApiErrorAlert(res, 'Could not update the machine');
  }

  async function move(index: number, delta: number) {
    if (!facilityId) return;
    const target = index + delta;
    if (target < 0 || target >= machines.length) return;
    const ordered = [...machines];
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    setMachines(ordered);
    const res = await ballMachineAdmin.reorderMachines(facilityId, ordered.map((x) => x.id));
    if (!res.success) {
      showApiErrorAlert(res, 'Could not reorder machines');
      await load();
    }
  }

  async function savePricing(key: string) {
    if (!facilityId) return;
    const form = priceForms[key] || {};
    const payload = DURATIONS.filter((d) => (form[d]?.price ?? '').trim() !== '').map((d) => ({
      machineId: key === ALL ? null : key,
      durationMonths: d,
      priceCents: Math.round(parseFloat(form[d]!.price) * 100),
      isActive: !!form[d]!.active,
    }));
    if (payload.some((p) => !Number.isFinite(p.priceCents) || p.priceCents < 0)) {
      showAlert('Pricing', 'Prices must be valid dollar amounts.');
      return;
    }
    if (payload.length === 0) {
      showAlert('Pricing', 'Set a price for at least one pass length.');
      return;
    }
    setSaving(`pricing-${key}`);
    const res = await ballMachineAdmin.updateProducts(facilityId, payload);
    setSaving(null);
    if (res.success) {
      showAlert('Pricing', 'Pass pricing saved.');
      await load();
    } else showApiErrorAlert(res, 'Could not save pricing');
  }

  async function grant() {
    if (!facilityId || !grantUserId) {
      showAlert('Comp a pass', 'Pick a member first.');
      return;
    }
    setSaving('grant');
    const res = await ballMachineAdmin.grantPass(facilityId, grantUserId, grantMachine === ALL ? null : grantMachine, grantMonths);
    setSaving(null);
    if (res.success) {
      setGrantUserId('');
      setGrantSearch('');
      await load();
    } else showApiErrorAlert(res, 'Could not grant the pass');
  }

  function confirmRevoke(p: BallMachinePassHolder) {
    if (!facilityId) return;
    Alert.alert('Revoke pass', `Revoke ${p.fullName}'s pass?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => { void (async () => { const res = await ballMachineAdmin.revokePass(facilityId, p.id); if (res.success) await load(); else showApiErrorAlert(res, 'Could not revoke the pass'); })(); } },
    ]);
  }

  if (unavailable) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Ball Machine' }} />
        <Text style={[styles.muted, { padding: Spacing.md }]}>The ball machine feature is not enabled for this club.</Text>
      </View>
    );
  }

  const pricingKeys = machines.length > 1 ? [ALL, ...machines.map((m) => m.id)] : [ALL];
  const live = holders.filter((h) => h.status === 'active' && new Date(h.expiresAt) > new Date());

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <Stack.Screen options={{ title: 'Ball Machine' }} />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Machines</Text>
        {machines.map((m, i) => {
          const d = drafts[m.id] ?? draftFrom(m);
          const editing = editingId === m.id;
          return (
            <View key={m.id} style={styles.machine}>
              <View style={styles.rowBetween}>
                <Text style={styles.name}>{m.name}{!m.isActive ? ' (inactive)' : ''}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => void move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${m.name} up`} style={i === 0 && { opacity: 0.3 }}><Ionicons name="chevron-up" size={18} color={Colors.text} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => void move(i, 1)} disabled={i === machines.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${m.name} down`} style={i === machines.length - 1 && { opacity: 0.3 }}><Ionicons name="chevron-down" size={18} color={Colors.text} /></TouchableOpacity>
                  <Switch value={m.isActive} onValueChange={() => void toggleActive(m)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${m.name} active`} />
                  <TouchableOpacity onPress={() => setEditingId(editing ? null : m.id)} accessibilityRole="button" accessibilityLabel={`Edit ${m.name}`}><Ionicons name={editing ? 'close' : 'create-outline'} size={20} color={Colors.primary} /></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.muted}>
                {m.machineCount} machine{m.machineCount === 1 ? '' : 's'} · {m.hourlyFeeCents ? `${formatCentsAsUsd(m.hourlyFeeCents)}/hr without a pass` : 'no hourly rate'}
                {m.accessCode ? ` · code ${m.accessCode}` : ''}
              </Text>
              {editing ? (
                <View style={{ gap: Spacing.xs, marginTop: Spacing.sm }}>
                  <Text style={styles.label}>Machine name</Text>
                  <Input value={d.name} onChangeText={(v) => setDrafts({ ...drafts, [m.id]: { ...d, name: v } })} />
                  <Text style={styles.label}>Keypad code</Text>
                  <Input value={d.accessCode} onChangeText={(v) => setDrafts({ ...drafts, [m.id]: { ...d, accessCode: v } })} autoCapitalize="none" />
                  <Text style={styles.label}>Hourly rate without a pass (USD)</Text>
                  <Input value={d.hourlyDollars} onChangeText={(v) => setDrafts({ ...drafts, [m.id]: { ...d, hourlyDollars: v.replace(/[^0-9.]/g, '') } })} keyboardType="decimal-pad" placeholder="Leave blank for pass-only" />
                  <Text style={styles.label}>Machine count</Text>
                  <Input value={d.machineCount} onChangeText={(v) => setDrafts({ ...drafts, [m.id]: { ...d, machineCount: v.replace(/[^0-9]/g, '') } })} keyboardType="number-pad" />
                  <Text style={styles.label}>Instructions (optional)</Text>
                  <Input value={d.instructions} onChangeText={(v) => setDrafts({ ...drafts, [m.id]: { ...d, instructions: v } })} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
                  <Button title="Save machine" onPress={() => void saveMachine(m)} loading={saving === m.id} style={{ marginTop: Spacing.xs }} />
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={[styles.row, { marginTop: Spacing.sm }]}>
          <Input value={newName} onChangeText={setNewName} placeholder="New machine name" style={{ flex: 1 }} />
          <Button title="Add" onPress={() => void addMachine()} loading={saving === 'add'} disabled={!newName.trim()} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Pass pricing</Text>
        <Text style={styles.muted}>Set a price for each pass length you sell. Leave blank to not offer that length.</Text>
        {pricingKeys.map((key) => {
          const form = priceForms[key] || {};
          const title = key === ALL ? (machines.length > 1 ? 'All machines' : 'Passes') : machines.find((m) => m.id === key)?.name ?? key;
          return (
            <View key={key} style={styles.machine}>
              <Text style={styles.name}>{title}</Text>
              {DURATIONS.map((d) => (
                <View key={d} style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{durationLabel(d)}</Text>
                  <Input value={form[d]?.price ?? ''} onChangeText={(v) => setPriceForms((p) => ({ ...p, [key]: { ...p[key], [d]: { price: v.replace(/[^0-9.]/g, ''), active: p[key]?.[d]?.active ?? true } } }))} keyboardType="decimal-pad" placeholder="0.00" style={styles.priceInput} accessibilityLabel={`${title} ${durationLabel(d)} price`} />
                  <Switch value={!!form[d]?.active} onValueChange={(v) => setPriceForms((p) => ({ ...p, [key]: { ...p[key], [d]: { price: p[key]?.[d]?.price ?? '', active: v } } }))} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${durationLabel(d)} for sale`} />
                </View>
              ))}
              <Button title="Save pricing" variant="secondary" onPress={() => void savePricing(key)} loading={saving === `pricing-${key}`} style={{ marginTop: Spacing.xs }} />
            </View>
          );
        })}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Comp a pass</Text>
        <Input value={grantSearch} onChangeText={(v) => { setGrantSearch(v); setGrantUserId(''); }} placeholder="Search member" accessibilityLabel="Search member to grant a pass" />
        <View style={styles.chips}>
          {memberMatches.map((m) => (
            <TouchableOpacity key={m.userId} style={[styles.chip, grantUserId === m.userId && styles.chipSelected]} onPress={() => setGrantUserId(m.userId)} accessibilityRole="button" accessibilityLabel={m.fullName}>
              <Text style={[styles.chipText, grantUserId === m.userId && styles.chipTextSelected]}>{m.fullName}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {machines.length > 1 ? (
          <>
            <Text style={styles.label}>Machine</Text>
            <View style={styles.chips}>
              {[{ id: ALL, name: 'All machines' }, ...machines].map((m) => (
                <TouchableOpacity key={m.id} style={[styles.chip, grantMachine === m.id && styles.chipSelected]} onPress={() => setGrantMachine(m.id)} accessibilityRole="button" accessibilityLabel={m.name}>
                  <Text style={[styles.chipText, grantMachine === m.id && styles.chipTextSelected]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Length</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <TouchableOpacity key={d} style={[styles.chip, grantMonths === d && styles.chipSelected]} onPress={() => setGrantMonths(d)} accessibilityRole="button" accessibilityLabel={durationLabel(d)}>
              <Text style={[styles.chipText, grantMonths === d && styles.chipTextSelected]}>{durationLabel(d)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button title="Grant pass" onPress={() => void grant()} loading={saving === 'grant'} disabled={!grantUserId} style={{ marginTop: Spacing.sm }} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Active passes ({live.length})</Text>
        {live.length === 0 ? <Text style={styles.muted}>No active passes.</Text> : null}
        {live.map((p) => (
          <View key={p.id} style={styles.holder}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.fullName}</Text>
              <Text style={styles.muted}>{p.machineName || 'All machines'} · {durationLabel(p.durationMonths)} · expires {new Date(p.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{p.grantedBy ? ' · comped' : ` · ${formatCentsAsUsd(p.priceCentsAtPurchase)}`}</Text>
            </View>
            <TouchableOpacity onPress={() => confirmRevoke(p)} accessibilityRole="button" accessibilityLabel={`Revoke ${p.fullName}'s pass`}><Text style={styles.revoke}>Revoke</Text></TouchableOpacity>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: Spacing.xs },
  name: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  machine: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  priceLabel: { width: 72, fontSize: FontSize.xs, color: Colors.textSecondary },
  priceInput: { flex: 1, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  holder: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  revoke: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.error },
});
