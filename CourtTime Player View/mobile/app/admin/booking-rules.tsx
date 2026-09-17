/**
 * Admin Booking Rules — web's FacilityRulesTab. Each rule the server offers
 * (GET /rules/definitions) gets an on/off switch and inputs for the keys in
 * its config; enable all / disable all; and the split court payments toggle.
 * Field labels come from the config keys (humanised) since the server owns
 * the rule catalogue.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { rulesAdmin, type FacilityRuleRow, type RuleDefinitionRow } from '../../src/api/admin';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Booking Rules');

const CATEGORY_LABELS: Record<string, string> = { account: 'Account limits', cancellation: 'Cancellations & no-shows', court: 'Court rules', household: 'Household limits' };
const CATEGORY_ORDER = ['account', 'court', 'household', 'cancellation'];

/** "max_active_reservations" → "Max active reservations". Exported for tests. */
export function humanizeKey(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

type Draft = Record<string, string | boolean>;
function draftFromConfig(cfg: Record<string, unknown> | null | undefined): Draft {
  const out: Draft = {};
  for (const [k, v] of Object.entries(cfg ?? {})) {
    out[k] = typeof v === 'boolean' ? v : Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  }
  return out;
}
/** Coerce a draft back to the value types of the reference config. Exported for tests. */
export function configFromDraft(draft: Draft, reference: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    const ref = reference?.[k];
    if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(ref)) out[k] = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    else if (typeof ref === 'number' || (ref == null && /^-?\d+(\.\d+)?$/.test(String(v)))) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

export default function AdminBookingRulesScreen() {
  const { facilityId } = useAuth();
  const [definitions, setDefinitions] = useState<RuleDefinitionRow[]>([]);
  const [configured, setConfigured] = useState<Record<string, FacilityRuleRow>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [defs, rules, split] = await Promise.all([rulesAdmin.definitions(), rulesAdmin.facilityRules(facilityId), rulesAdmin.splitPayments(facilityId)]);
    const defList = defs.success ? ((defs.data as any)?.definitions ?? []) : [];
    const ruleList: FacilityRuleRow[] = rules.success ? ((rules.data as any)?.rules ?? []) : [];
    setDefinitions(Array.isArray(defList) ? defList : []);
    const byCode: Record<string, FacilityRuleRow> = {};
    for (const r of ruleList) byCode[r.rule_code] = r;
    setConfigured(byCode);
    setDrafts(Object.fromEntries((Array.isArray(defList) ? defList : []).map((d: RuleDefinitionRow) => [d.rule_code, draftFromConfig(byCode[d.rule_code]?.rule_config ?? d.default_config)])));
    setSplitEnabled(!!(split.success && (split.data as any)?.enabled));
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, RuleDefinitionRow[]> = {};
    for (const d of definitions) (g[d.rule_category] ??= []).push(d);
    return Object.entries(g).sort(([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 100) % 100 - ((CATEGORY_ORDER.indexOf(b) + 100) % 100));
  }, [definitions]);

  async function toggle(def: RuleDefinitionRow, enabled: boolean) {
    if (!facilityId) return;
    setBusy(def.rule_code);
    const res = await rulesAdmin.setRule(facilityId, def.rule_code, { isEnabled: enabled, ruleConfig: enabled ? configFromDraft(drafts[def.rule_code] ?? {}, def.default_config) : undefined });
    setBusy(null);
    if (res.success) await load();
    else showApiErrorAlert(res, 'Could not update rule');
  }

  async function saveConfig(def: RuleDefinitionRow) {
    if (!facilityId) return;
    setBusy(def.rule_code);
    const res = await rulesAdmin.setRule(facilityId, def.rule_code, { isEnabled: true, ruleConfig: configFromDraft(drafts[def.rule_code] ?? {}, def.default_config) });
    setBusy(null);
    if (res.success) {
      showAlert('Saved', `${def.rule_name} updated.`);
      await load();
    } else showApiErrorAlert(res, 'Could not save rule');
  }

  async function bulk(enable: boolean) {
    if (!facilityId) return;
    setBusy(enable ? 'enable-all' : 'disable-all');
    const res = enable ? await rulesAdmin.enableAll(facilityId) : await rulesAdmin.disableAll(facilityId);
    setBusy(null);
    if (res.success) await load();
    else showApiErrorAlert(res, enable ? 'Could not enable rules' : 'Could not disable rules');
  }

  async function toggleSplit(v: boolean) {
    if (!facilityId) return;
    setSplitEnabled(v);
    const res = await rulesAdmin.setSplitPayments(facilityId, v);
    if (!res.success) {
      setSplitEnabled(!v);
      showApiErrorAlert(res, 'Could not update split court payments');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <Stack.Screen options={{ title: 'Booking Rules' }} />
      <View style={styles.row}>
        <Button title="Enable all" variant="secondary" onPress={() => void bulk(true)} loading={busy === 'enable-all'} style={{ flex: 1 }} />
        <Button title="Disable all" variant="secondary" onPress={() => void bulk(false)} loading={busy === 'disable-all'} style={{ flex: 1 }} />
      </View>

      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleName}>Split court payments</Text>
            <Text style={styles.desc}>Let members split a paid court's fee with the other players on the reservation.</Text>
          </View>
          <Switch value={splitEnabled} onValueChange={(v) => void toggleSplit(v)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="Split court payments" />
        </View>
      </Card>

      {grouped.map(([category, defs]) => (
        <Card key={category} style={styles.card}>
          <Text style={styles.cardTitle}>{CATEGORY_LABELS[category] ?? humanizeKey(category)}</Text>
          {defs.map((def) => {
            const row = configured[def.rule_code];
            const enabled = !!row?.is_enabled;
            const draft = drafts[def.rule_code] ?? {};
            const keys = Object.keys(draft);
            return (
              <View key={def.rule_code} style={styles.rule}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleName}>{def.rule_name} <Text style={styles.code}>{def.rule_code}</Text></Text>
                    {def.description ? <Text style={styles.desc}>{def.description}</Text> : null}
                  </View>
                  <Switch value={enabled} onValueChange={(v) => void toggle(def, v)} disabled={busy === def.rule_code} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`${def.rule_name} enabled`} />
                </View>
                {enabled && keys.length > 0 ? (
                  <View style={styles.fields}>
                    {keys.map((k) => {
                      const v = draft[k];
                      if (typeof v === 'boolean') {
                        return (
                          <View key={k} style={styles.rowBetween}>
                            <Text style={styles.fieldLabel}>{humanizeKey(k)}</Text>
                            <Switch value={v} onValueChange={(nv) => setDrafts((p) => ({ ...p, [def.rule_code]: { ...p[def.rule_code], [k]: nv } }))} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={humanizeKey(k)} />
                          </View>
                        );
                      }
                      const numeric = typeof def.default_config?.[k] === 'number';
                      return (
                        <View key={k} style={styles.field}>
                          <Text style={styles.fieldLabel}>{humanizeKey(k)}</Text>
                          <Input value={String(v)} onChangeText={(nv) => setDrafts((p) => ({ ...p, [def.rule_code]: { ...p[def.rule_code], [k]: nv } }))} keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize="none" style={styles.fieldInput} accessibilityLabel={humanizeKey(k)} />
                        </View>
                      );
                    })}
                    <Button title="Save" variant="secondary" onPress={() => void saveConfig(def)} loading={busy === def.rule_code} style={{ alignSelf: 'flex-start', marginTop: Spacing.xs }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  rule: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  ruleName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  code: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textMuted },
  desc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  fields: { marginTop: Spacing.sm, gap: Spacing.xs, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.sm },
  field: { gap: 4 },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', flexShrink: 1 },
  fieldInput: { paddingVertical: 8 },
});
