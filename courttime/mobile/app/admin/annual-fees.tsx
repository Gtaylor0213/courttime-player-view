/**
 * Admin Annual Fees — web's AnnualFeesAdmin: fee tiers, member tier
 * assignment, annual billing date, billing preview + run, and run history.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { annualFeesAdmin, type AnnualFeeMember, type AnnualFeeTier } from '../../src/api/admin';
import { unwrapApiPayload } from '../../../shared/api/core';
import { parseDollarsToCents } from '../../../shared/utils/money';
import { formatCentsAsUsd } from '../../src/utils/payments';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Annual Fees');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AdminAnnualFeesScreen() {
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [tiers, setTiers] = useState<AnnualFeeTier[]>([]);
  const [members, setMembers] = useState<AnnualFeeMember[]>([]);
  const [config, setConfig] = useState<{ billingMonth: number; billingDay: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ billingYear?: number; members?: any[] } | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runRecords, setRunRecords] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState<{ id: string | null; name: string; amountDollars: string; description: string } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState('1');

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [t, m, c, h] = await Promise.all([annualFeesAdmin.tiers(facilityId), annualFeesAdmin.members(facilityId), annualFeesAdmin.config(facilityId), annualFeesAdmin.history(facilityId)]);
    setTiers((t.success ? unwrapApiPayload<AnnualFeeTier[]>(t.data) : []) ?? []);
    setMembers((m.success ? unwrapApiPayload<AnnualFeeMember[]>(m.data) : []) ?? []);
    const cfg = c.success ? unwrapApiPayload<{ billingMonth?: number; billingDay?: number }>(c.data) : null;
    if (cfg && cfg.billingMonth) {
      setConfig({ billingMonth: Number(cfg.billingMonth), billingDay: Number(cfg.billingDay || 1) });
      setMonth(Number(cfg.billingMonth));
      setDay(String(cfg.billingDay || 1));
    } else setConfig(null);
    setHistory((h.success ? unwrapApiPayload<any[]>(h.data) : []) ?? []);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (q ? members.filter((m) => m.fullName.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)) : members).slice(0, 80);
  }, [members, memberSearch]);

  async function saveTier() {
    if (!facilityId || !tierForm) return;
    const amountCents = parseDollarsToCents(tierForm.amountDollars);
    if (!tierForm.name.trim() || !amountCents) {
      showAlert('Fee tier', 'Name and a valid amount are required.');
      return;
    }
    setBusy('tier');
    const res = tierForm.id
      ? await annualFeesAdmin.updateTier(facilityId, tierForm.id, { name: tierForm.name.trim(), amountCents, description: tierForm.description.trim() })
      : await annualFeesAdmin.createTier(facilityId, { name: tierForm.name.trim(), amountCents, description: tierForm.description.trim() || undefined });
    setBusy(null);
    if (res.success) {
      setTierForm(null);
      await load();
    } else showApiErrorAlert(res, 'Failed to save tier');
  }

  function confirmDeleteTier(t: AnnualFeeTier) {
    if (!facilityId) return;
    Alert.alert('Delete tier', `Delete "${t.name}"? Members on it will have no tier.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { const res = await annualFeesAdmin.deleteTier(facilityId, t.id); if (res.success) await load(); else showApiErrorAlert(res, 'Failed to delete tier'); })(); } },
    ]);
  }

  async function assign(m: AnnualFeeMember, tierId: string | null) {
    if (!facilityId) return;
    setBusy(m.userId);
    const res = await annualFeesAdmin.setMemberTier(facilityId, m.userId, tierId);
    setBusy(null);
    if (res.success) setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, tierId } : x)));
    else showApiErrorAlert(res, 'Failed to assign tier');
  }

  async function saveConfig() {
    if (!facilityId) return;
    const d = Number(day);
    if (!d || d < 1 || d > 28) {
      showAlert('Billing date', 'Pick a day between 1 and 28.');
      return;
    }
    setBusy('config');
    const res = await annualFeesAdmin.setConfig(facilityId, month, d);
    setBusy(null);
    if (res.success) {
      showAlert('Saved', 'Billing date saved.');
      await load();
    } else showApiErrorAlert(res, 'Failed to save');
  }

  async function loadPreview() {
    if (!facilityId) return;
    setBusy('preview');
    const res = await annualFeesAdmin.preview(facilityId);
    setBusy(null);
    if (res.success) setPreview(unwrapApiPayload<any>(res.data) ?? null);
    else showApiErrorAlert(res, 'Failed to load preview');
  }

  function confirmRun() {
    if (!facilityId || !preview) return;
    const toCharge = (preview.members || []).filter((m: any) => !m.alreadyBilledThisYear && m.hasSavedCard);
    const total = toCharge.reduce((s: number, m: any) => s + Number(m.amountCents || 0), 0);
    Alert.alert('Run annual billing?', `This charges ${toCharge.length} member${toCharge.length === 1 ? '' : 's'} a total of ${formatCentsAsUsd(total)} for ${preview.billingYear}. Members without a saved card will be locked until they pay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Run billing', style: 'destructive', onPress: () => { void (async () => { setBusy('run'); const res = await annualFeesAdmin.run(facilityId); setBusy(null); if (res.success) { const r = unwrapApiPayload<any>(res.data); showAlert('Billing complete', `Charged ${r?.chargedCount ?? 0}, failed ${r?.failedCount ?? 0}, locked ${r?.lockoutCount ?? 0}.`); setPreview(null); await load(); } else showApiErrorAlert(res, 'Billing run failed'); })(); } },
    ]);
  }

  async function toggleRun(run: any) {
    if (!facilityId) return;
    if (expandedRun === run.id) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(run.id);
    if (!runRecords[run.id]) {
      const res = await annualFeesAdmin.runRecords(facilityId, run.id);
      setRunRecords((p) => ({ ...p, [run.id]: (res.success ? unwrapApiPayload<any[]>(res.data) : []) ?? [] }));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <Stack.Screen options={{ title: 'Annual Fees' }} />

      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Fee tiers</Text>
          <TouchableOpacity onPress={() => setTierForm({ id: null, name: '', amountDollars: '', description: '' })} accessibilityRole="button" accessibilityLabel="New fee tier"><Ionicons name="add-circle" size={26} color={Colors.primary} /></TouchableOpacity>
        </View>
        {tiers.length === 0 && !tierForm ? <Text style={styles.muted}>No tiers yet. Add one to start billing.</Text> : null}
        {tiers.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{t.name} · {formatCentsAsUsd(t.amountCents)}/yr{t.isActive === false ? ' · inactive' : ''}</Text>
              {t.description ? <Text style={styles.muted}>{t.description}</Text> : null}
            </View>
            <Switch value={t.isActive !== false} onValueChange={(v) => void (async () => { if (!facilityId) return; const res = await annualFeesAdmin.updateTier(facilityId, t.id, { isActive: v }); if (res.success) await load(); else showApiErrorAlert(res, 'Failed to update tier'); })()} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${t.name} active`} />
            <TouchableOpacity onPress={() => setTierForm({ id: t.id, name: t.name, amountDollars: (t.amountCents / 100).toFixed(2), description: t.description ?? '' })} accessibilityRole="button" accessibilityLabel={`Edit ${t.name}`} hitSlop={8}><Ionicons name="create-outline" size={20} color={Colors.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDeleteTier(t)} accessibilityRole="button" accessibilityLabel={`Delete ${t.name}`} hitSlop={8}><Ionicons name="trash-outline" size={20} color={Colors.error} /></TouchableOpacity>
          </View>
        ))}
        {tierForm ? (
          <View style={styles.formBox}>
            <Text style={styles.label}>{tierForm.id ? 'Edit tier' : 'New fee tier'}</Text>
            <Input value={tierForm.name} onChangeText={(v) => setTierForm({ ...tierForm, name: v })} placeholder="Tier name (e.g. Family)" />
            <Input value={tierForm.amountDollars} onChangeText={(v) => setTierForm({ ...tierForm, amountDollars: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Annual fee (USD)" style={{ marginTop: Spacing.xs }} />
            <Input value={tierForm.description} onChangeText={(v) => setTierForm({ ...tierForm, description: v })} placeholder="Description (optional)" style={{ marginTop: Spacing.xs }} />
            <View style={[styles.row, { marginTop: Spacing.sm }]}>
              <Button title="Save tier" onPress={() => void saveTier()} loading={busy === 'tier'} style={{ flex: 1 }} />
              <Button title="Cancel" variant="secondary" onPress={() => setTierForm(null)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Member tiers</Text>
        <Input value={memberSearch} onChangeText={setMemberSearch} placeholder="Search members" accessibilityLabel="Search members" />
        {filteredMembers.map((m) => (
          <View key={m.userId} style={styles.memberRow}>
            <Text style={styles.name}>{m.fullName}{m.hasSavedCard ? '' : '  · no card'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chips}>
                <TouchableOpacity style={[styles.chip, !m.tierId && styles.chipSelected]} onPress={() => void assign(m, null)} disabled={busy === m.userId} accessibilityRole="button" accessibilityLabel={`${m.fullName}: no tier`}><Text style={[styles.chipText, !m.tierId && styles.chipTextSelected]}>None</Text></TouchableOpacity>
                {tiers.filter((t) => t.isActive !== false).map((t) => (
                  <TouchableOpacity key={t.id} style={[styles.chip, m.tierId === t.id && styles.chipSelected]} onPress={() => void assign(m, t.id)} disabled={busy === m.userId} accessibilityRole="button" accessibilityLabel={`${m.fullName}: ${t.name}`}><Text style={[styles.chipText, m.tierId === t.id && styles.chipTextSelected]}>{t.name}</Text></TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Annual billing date</Text>
        <Text style={styles.muted}>{config ? `Currently ${MONTHS[config.billingMonth - 1]} ${config.billingDay}.` : 'Not set — billing runs manually below.'}</Text>
        <View style={styles.chips}>
          {MONTHS.map((label, i) => (
            <TouchableOpacity key={label} style={[styles.chip, month === i + 1 && styles.chipSelected]} onPress={() => setMonth(i + 1)} accessibilityRole="button" accessibilityLabel={label}><Text style={[styles.chipText, month === i + 1 && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>
          ))}
        </View>
        <View style={[styles.row, { marginTop: Spacing.sm }]}>
          <Input value={day} onChangeText={(v) => setDay(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Day (1–28)" style={{ flex: 1 }} accessibilityLabel="Billing day" />
          <Button title="Save date" variant="secondary" onPress={() => void saveConfig()} loading={busy === 'config'} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Run annual billing</Text>
        <Text style={styles.muted}>Preview who would be charged, then run. Members with a saved card are charged; others are locked until they pay.</Text>
        <Button title="Load preview" variant="secondary" onPress={() => void loadPreview()} loading={busy === 'preview'} style={{ marginTop: Spacing.sm }} />
        {preview ? (
          <View style={{ marginTop: Spacing.sm }}>
            <Text style={styles.name}>Billing year {preview.billingYear}</Text>
            {(preview.members || []).map((m: any) => (
              <View key={m.userId} style={styles.kv}>
                <Text style={styles.k}>{m.fullName} · {m.tierName || 'No tier'}{m.alreadyBilledThisYear ? ' · already billed' : m.hasSavedCard ? '' : ' · no card (lockout)'}</Text>
                <Text style={styles.v}>{formatCentsAsUsd(Number(m.amountCents || 0))}</Text>
              </View>
            ))}
            <Button title="Run billing now" variant="destructive" onPress={confirmRun} loading={busy === 'run'} style={{ marginTop: Spacing.sm }} />
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Billing history</Text>
        {history.length === 0 ? <Text style={styles.muted}>No billing runs yet.</Text> : null}
        {history.map((run) => (
          <View key={run.id}>
            <TouchableOpacity style={styles.kv} onPress={() => void toggleRun(run)} accessibilityRole="button" accessibilityLabel={`Billing run ${run.billingYear}`}>
              <Text style={styles.k}>{run.billingYear} · {run.startedAt ? new Date(run.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{run.triggeredByName ? ` · ${run.triggeredByName}` : ''}</Text>
              <Text style={styles.v}>{run.chargedCount} charged · {run.failedCount} failed · {run.lockoutCount} locked</Text>
            </TouchableOpacity>
            {expandedRun === run.id ? (
              <View style={styles.formBox}>
                {(runRecords[run.id] || []).length === 0 ? <Text style={styles.muted}>Loading…</Text> : null}
                {(runRecords[run.id] || []).map((r: any, i: number) => (
                  <View key={r.id ?? i} style={styles.kv}>
                    <Text style={styles.k}>{r.fullName ?? r.memberName ?? r.userId}</Text>
                    <Text style={styles.v}>{r.amountCents != null ? formatCentsAsUsd(Number(r.amountCents)) : ''} · {r.status ?? r.outcome ?? ''}</Text>
                  </View>
                ))}
              </View>
            ) : null}
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
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  name: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formBox: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  memberRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  k: { fontSize: FontSize.xs, color: Colors.text, flexShrink: 1 },
  v: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right' },
});
