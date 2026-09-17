/**
 * Admin Club Policies — the text-heavy admin tabs from the web: General Rules
 * and Terms & Conditions (versioned, with acceptance counts), the Address
 * Whitelist (single/bulk add, resend invites, edit limit, remove), and Email
 * Templates (subject/body per type, reset to default).
 *
 * Rules/terms are edited as plain text on mobile; saving converts paragraphs
 * and bullet lines to simple HTML, so rich formatting made on the web is
 * flattened if re-saved here (the screen says so).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { policiesAdmin, type EmailTemplateRow, type PolicyAcceptance, type PolicyDoc, type WhitelistRow } from '../../src/api/admin';
import { API_BASE_URL } from '../../src/api/client';
import { unwrapApiPayload } from '../../../shared/api/core';
import { htmlToDisplayText } from '../../src/utils/htmlToText';
import { parseWhitelistLines, plainTextToHtml } from '../../src/utils/policyText';
import { resolveWebAppBaseUrl } from '../../src/utils/facilityRegistration';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Club Policies');

type Tab = 'rules' | 'terms' | 'whitelist' | 'emails';
const TABS: { key: Tab; label: string }[] = [
  { key: 'rules', label: 'General Rules' },
  { key: 'terms', label: 'Terms' },
  { key: 'whitelist', label: 'Address Whitelist' },
  { key: 'emails', label: 'Email Templates' },
];

function fmtDate(s?: string | null): string {
  return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export default function AdminPoliciesScreen() {
  const { facilityId } = useAuth();
  const [tab, setTab] = useState<Tab>('rules');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Rules / terms
  const [rules, setRules] = useState<PolicyDoc | null>(null);
  const [rulesAcc, setRulesAcc] = useState<PolicyAcceptance | null>(null);
  const [rulesText, setRulesText] = useState('');
  const [terms, setTerms] = useState<PolicyDoc | null>(null);
  const [termsAcc, setTermsAcc] = useState<PolicyAcceptance | null>(null);
  const [termsText, setTermsText] = useState('');
  const [reviewSeconds, setReviewSeconds] = useState('0');
  const [showHistory, setShowHistory] = useState<Tab | null>(null);
  // Whitelist
  const [whitelist, setWhitelist] = useState<WhitelistRow[]>([]);
  const [wlForm, setWlForm] = useState({ address: '', lastName: '', email: '', accountsLimit: '1' });
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [wlSearch, setWlSearch] = useState('');
  const [limitEdit, setLimitEdit] = useState<{ id: string; value: string } | null>(null);
  // Emails
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [editing, setEditing] = useState<{ templateType: string; subject: string; bodyHtml: string } | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [r, ra, t, ta, w, e] = await Promise.all([
      policiesAdmin.generalRules(facilityId), policiesAdmin.generalRulesAcceptance(facilityId),
      policiesAdmin.terms(facilityId), policiesAdmin.termsAcceptance(facilityId),
      policiesAdmin.whitelist(facilityId), policiesAdmin.emailTemplates(facilityId),
    ]);
    const rd = r.success ? unwrapApiPayload<PolicyDoc>(r.data) : null;
    setRules(rd ?? null);
    setRulesText(htmlToDisplayText(rd?.currentVersion?.contentHtml));
    setRulesAcc(ra.success ? (unwrapApiPayload<PolicyAcceptance>(ra.data) ?? null) : null);
    const td = t.success ? unwrapApiPayload<PolicyDoc>(t.data) : null;
    setTerms(td ?? null);
    setTermsText(htmlToDisplayText(td?.currentVersion?.contentHtml));
    setReviewSeconds(String(td?.currentVersion?.requiredReviewSeconds ?? 0));
    setTermsAcc(ta.success ? (unwrapApiPayload<PolicyAcceptance>(ta.data) ?? null) : null);
    setWhitelist(w.success ? (((w.data as any)?.addresses ?? unwrapApiPayload<WhitelistRow[]>(w.data)) ?? []) : []);
    setTemplates(e.success ? (((e.data as any)?.templates ?? []) as EmailTemplateRow[]) : []);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmPublish(kind: 'rules' | 'terms') {
    if (!facilityId) return;
    const text = kind === 'rules' ? rulesText : termsText;
    if (!text.trim()) {
      showAlert('Publish', 'Write something first.');
      return;
    }
    const secs = Number(reviewSeconds);
    if (kind === 'terms' && (!Number.isFinite(secs) || secs < 0)) {
      showAlert('Publish', 'Required review time must be 0 or more seconds.');
      return;
    }
    Alert.alert(`Publish new ${kind === 'rules' ? 'general rules' : 'terms'} version?`, 'Every member will be asked to accept the new version before booking. Formatting made on the web (bold, headings) is flattened when publishing from the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Publish', onPress: () => { void (async () => {
        setBusy(kind);
        const html = plainTextToHtml(text);
        const res = kind === 'rules' ? await policiesAdmin.publishGeneralRules(facilityId, html) : await policiesAdmin.publishTerms(facilityId, html, Math.floor(secs));
        setBusy(null);
        if (res.success) { showAlert('Published', 'New version is live.'); await load(); } else showApiErrorAlert(res, 'Publish failed');
      })(); } },
    ]);
  }

  async function addWhitelist() {
    if (!facilityId) return;
    if (!wlForm.address.trim()) {
      showAlert('Whitelist', 'Address is required.');
      return;
    }
    setBusy('wl-add');
    const res = await policiesAdmin.addWhitelist(facilityId, { address: wlForm.address.trim(), lastName: wlForm.lastName.trim() || undefined, email: wlForm.email.trim() || undefined, accountsLimit: Math.max(1, Number(wlForm.accountsLimit) || 1) });
    setBusy(null);
    if (res.success) { setWlForm({ address: '', lastName: '', email: '', accountsLimit: '1' }); await load(); } else showApiErrorAlert(res, 'Could not add address');
  }

  async function bulkAdd() {
    if (!facilityId) return;
    const rows = parseWhitelistLines(bulkText);
    if (rows.length === 0) {
      showAlert('Bulk add', 'Paste one address per line: address | last name | email | limit');
      return;
    }
    setBusy('wl-bulk');
    const res = await policiesAdmin.bulkWhitelist(facilityId, rows);
    setBusy(null);
    if (res.success) {
      const r = unwrapApiPayload<any>(res.data);
      showAlert('Bulk add', r?.added != null ? `Added ${r.added}${r.skipped ? `, skipped ${r.skipped}` : ''}.` : `Submitted ${rows.length} address${rows.length === 1 ? '' : 'es'}.`);
      setBulkText(''); setShowBulk(false); await load();
    } else showApiErrorAlert(res, 'Bulk add failed');
  }

  async function resendPending() {
    if (!facilityId) return;
    setBusy('wl-resend');
    const res = await policiesAdmin.resendPendingInvites(facilityId);
    setBusy(null);
    if (res.success) { const r = unwrapApiPayload<any>(res.data); showAlert('Invites sent', r?.sent != null ? `Re-sent ${r.sent} invite${r.sent === 1 ? '' : 's'}.` : 'Pending invites re-sent.'); await load(); } else showApiErrorAlert(res, 'Could not resend invites');
  }

  async function saveLimit() {
    if (!facilityId || !limitEdit) return;
    const n = Number(limitEdit.value);
    if (!n || n < 1) {
      showAlert('Accounts limit', 'Enter a number of 1 or more.');
      return;
    }
    setBusy('wl-limit');
    const res = await policiesAdmin.updateWhitelist(facilityId, limitEdit.id, { accountsLimit: n });
    setBusy(null);
    if (res.success) { setLimitEdit(null); await load(); } else showApiErrorAlert(res, 'Could not update');
  }

  function confirmRemove(row: WhitelistRow) {
    if (!facilityId) return;
    Alert.alert('Remove address', `Remove ${row.address} from the whitelist?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void (async () => { const res = await policiesAdmin.removeWhitelist(facilityId, row.id); if (res.success) await load(); else showApiErrorAlert(res, 'Could not remove'); })(); } },
    ]);
  }

  async function saveTemplate() {
    if (!facilityId || !editing) return;
    if (!editing.subject.trim() || !editing.bodyHtml.trim()) {
      showAlert('Template', 'Subject and body are required.');
      return;
    }
    setBusy('tpl');
    const res = await policiesAdmin.saveEmailTemplate(facilityId, editing.templateType, { subject: editing.subject.trim(), bodyHtml: editing.bodyHtml });
    setBusy(null);
    if (res.success) { setEditing(null); await load(); } else showApiErrorAlert(res, 'Could not save template');
  }

  function confirmResetTemplate(t: EmailTemplateRow) {
    if (!facilityId) return;
    Alert.alert('Reset template', `Restore the default ${t.label} email?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => { void (async () => { const res = await policiesAdmin.resetEmailTemplate(facilityId, t.templateType); if (res.success) await load(); else showApiErrorAlert(res, 'Could not reset'); })(); } },
    ]);
  }

  const webUrl = resolveWebAppBaseUrl(API_BASE_URL, process.env.EXPO_PUBLIC_WEB_URL);
  const wlFiltered = wlSearch.trim() ? whitelist.filter((r) => `${r.address} ${r.lastName ?? ''} ${r.email ?? ''}`.toLowerCase().includes(wlSearch.trim().toLowerCase())) : whitelist;
  const pendingInvites = whitelist.filter((r) => r.email && !r.setupInviteAcceptedAt).length;

  function renderPolicy(kind: 'rules' | 'terms') {
    const doc = kind === 'rules' ? rules : terms;
    const acc = kind === 'rules' ? rulesAcc : termsAcc;
    const text = kind === 'rules' ? rulesText : termsText;
    const setText = kind === 'rules' ? setRulesText : setTermsText;
    const cur = doc?.currentVersion;
    return (
      <>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{cur ? `Version ${cur.versionNumber} · published ${fmtDate(cur.publishedAt)}` : 'Not published yet'}</Text>
          {acc ? <Text style={styles.muted}>{acc.accepted?.length ?? 0} accepted · {acc.notAccepted?.length ?? 0} still to accept</Text> : null}
          {doc?.versions?.length ? (
            <TouchableOpacity onPress={() => setShowHistory(showHistory === kind ? null : kind)} accessibilityRole="button" accessibilityLabel="Version history"><Text style={styles.link}>{showHistory === kind ? 'Hide history' : `${doc.versions.length} version${doc.versions.length === 1 ? '' : 's'}`}</Text></TouchableOpacity>
          ) : null}
          {showHistory === kind ? doc?.versions.map((v) => (
            <TouchableOpacity key={v.versionNumber} style={styles.historyRow} onPress={() => setText(htmlToDisplayText(v.contentHtml))} accessibilityRole="button" accessibilityLabel={`Load version ${v.versionNumber}`}>
              <Text style={styles.name}>v{v.versionNumber} · {fmtDate(v.publishedAt)}</Text>
              <Text style={styles.muted} numberOfLines={1}>{htmlToDisplayText(v.contentHtml)}</Text>
            </TouchableOpacity>
          )) : null}
        </Card>
        <Card style={styles.card}>
          <Text style={styles.label}>{kind === 'rules' ? 'General rules' : 'Terms & conditions'} (plain text; blank line = new paragraph, "- " = bullet)</Text>
          <Input value={text} onChangeText={setText} multiline style={styles.editor} accessibilityLabel={kind === 'rules' ? 'General rules text' : 'Terms text'} placeholder="Write the policy members must accept…" />
          {kind === 'terms' ? (
            <>
              <Text style={[styles.label, { marginTop: Spacing.sm }]}>Required review time (seconds before Accept enables)</Text>
              <Input value={reviewSeconds} onChangeText={(v) => setReviewSeconds(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Required review seconds" />
            </>
          ) : null}
          <Button title="Publish new version" onPress={() => confirmPublish(kind)} loading={busy === kind} style={{ marginTop: Spacing.md }} />
          <TouchableOpacity onPress={() => { void Linking.openURL(`${webUrl}/admin`); }} accessibilityRole="link" accessibilityLabel="Open the rich editor on the web" style={{ marginTop: Spacing.sm, alignSelf: 'center' }}><Text style={styles.link}>Need headings or bold? Open the web editor</Text></TouchableOpacity>
        </Card>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Club Policies' }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipSelected]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} accessibilityLabel={t.label}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextSelected]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {tab === 'rules' ? renderPolicy('rules') : null}
        {tab === 'terms' ? renderPolicy('terms') : null}

        {tab === 'whitelist' ? (
          <>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Add address</Text>
              <Text style={styles.muted}>Members whose address (or email) matches a row can register and get a setup invite.</Text>
              <Input value={wlForm.address} onChangeText={(v) => setWlForm({ ...wlForm, address: v })} placeholder="Street address" style={{ marginTop: Spacing.sm }} accessibilityLabel="Address" />
              <View style={styles.row}>
                <Input value={wlForm.lastName} onChangeText={(v) => setWlForm({ ...wlForm, lastName: v })} placeholder="Last name (optional)" style={{ flex: 1 }} accessibilityLabel="Last name" />
                <Input value={wlForm.accountsLimit} onChangeText={(v) => setWlForm({ ...wlForm, accountsLimit: v.replace(/[^0-9]/g, '') })} placeholder="Limit" keyboardType="number-pad" style={{ width: 80 }} accessibilityLabel="Accounts limit" />
              </View>
              <Input value={wlForm.email} onChangeText={(v) => setWlForm({ ...wlForm, email: v })} placeholder="Email (sends setup invite)" keyboardType="email-address" autoCapitalize="none" style={{ marginTop: Spacing.xs }} accessibilityLabel="Email" />
              <View style={[styles.row, { marginTop: Spacing.sm }]}>
                <Button title="Add" onPress={() => void addWhitelist()} loading={busy === 'wl-add'} style={{ flex: 1 }} />
                <Button title={showBulk ? 'Hide bulk' : 'Bulk add'} variant="secondary" onPress={() => setShowBulk(!showBulk)} style={{ flex: 1 }} />
              </View>
              {showBulk ? (
                <View style={{ marginTop: Spacing.sm }}>
                  <Text style={styles.label}>One per line: address | last name | email | limit</Text>
                  <Input value={bulkText} onChangeText={setBulkText} multiline style={styles.bulkEditor} placeholder={'12 Oak St | Smith | smith@example.com | 2\n45 Elm Ave'} accessibilityLabel="Bulk addresses" />
                  <Button title={`Add ${parseWhitelistLines(bulkText).length || ''} addresses`.replace('  ', ' ')} onPress={() => void bulkAdd()} loading={busy === 'wl-bulk'} style={{ marginTop: Spacing.xs }} />
                </View>
              ) : null}
            </Card>
            <Card style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{whitelist.length} address{whitelist.length === 1 ? '' : 'es'}</Text>
                <Button title={`Resend ${pendingInvites} pending`} variant="secondary" onPress={() => void resendPending()} loading={busy === 'wl-resend'} disabled={pendingInvites === 0} />
              </View>
              <Input value={wlSearch} onChangeText={setWlSearch} placeholder="Search addresses" accessibilityLabel="Search addresses" />
              {wlFiltered.map((r) => (
                <View key={r.id} style={styles.wlRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.address}{r.lastName ? ` · ${r.lastName}` : ''}</Text>
                    <Text style={styles.muted}>{r.email ?? 'no email'} · limit {r.accountsLimit}{r.setupInviteAcceptedAt ? ' · joined' : r.setupInviteSentAt ? ` · invited ${fmtDate(r.setupInviteSentAt)}` : ''}</Text>
                  </View>
                  {limitEdit?.id === r.id ? (
                    <>
                      <Input value={limitEdit.value} onChangeText={(v) => setLimitEdit({ id: r.id, value: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" style={{ width: 64 }} accessibilityLabel={`Accounts limit for ${r.address}`} />
                      <Button title="Save" onPress={() => void saveLimit()} loading={busy === 'wl-limit'} />
                      <TouchableOpacity onPress={() => setLimitEdit(null)} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8}><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => setLimitEdit({ id: r.id, value: String(r.accountsLimit) })} accessibilityRole="button" accessibilityLabel={`Edit limit for ${r.address}`} hitSlop={8}><Ionicons name="create-outline" size={20} color={Colors.primary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmRemove(r)} accessibilityRole="button" accessibilityLabel={`Remove ${r.address}`} hitSlop={8}><Ionicons name="trash-outline" size={20} color={Colors.error} /></TouchableOpacity>
                    </>
                  )}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {tab === 'emails' ? (
          <>
            {templates.map((t) => (
              <Card key={t.templateType} style={styles.card}>
                <TouchableOpacity onPress={() => setExpandedTemplate(expandedTemplate === t.templateType ? null : t.templateType)} accessibilityRole="button" accessibilityLabel={t.label}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{t.label}{t.isCustom ? ' · custom' : ''}</Text>
                    <Ionicons name={expandedTemplate === t.templateType ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                  </View>
                  {t.description ? <Text style={styles.muted}>{t.description}</Text> : null}
                </TouchableOpacity>
                {expandedTemplate === t.templateType ? (
                  editing?.templateType === t.templateType ? (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={styles.label}>Subject</Text>
                      <Input value={editing.subject} onChangeText={(v) => setEditing({ ...editing, subject: v })} accessibilityLabel="Subject" />
                      <Text style={[styles.label, { marginTop: Spacing.sm }]}>Body ({t.bodyFormat === 'text' ? 'plain text' : 'HTML source'})</Text>
                      <Input value={editing.bodyHtml} onChangeText={(v) => setEditing({ ...editing, bodyHtml: v })} multiline style={styles.editor} autoCapitalize="none" accessibilityLabel="Body" />
                      {t.availableVariables?.length ? <Text style={styles.muted}>Variables: {t.availableVariables.map((v) => `{{${v}}}`).join(' ')}</Text> : null}
                      <View style={[styles.row, { marginTop: Spacing.sm }]}>
                        <Button title="Save" onPress={() => void saveTemplate()} loading={busy === 'tpl'} style={{ flex: 1 }} />
                        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                      </View>
                    </View>
                  ) : (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={styles.name}>{t.subject}</Text>
                      <Text style={styles.preview}>{t.bodyFormat === 'text' ? t.bodyHtml : htmlToDisplayText(t.bodyHtml)}</Text>
                      <View style={[styles.row, { marginTop: Spacing.sm }]}>
                        <Button title="Edit" variant="secondary" onPress={() => setEditing({ templateType: t.templateType, subject: t.subject, bodyHtml: t.bodyHtml })} style={{ flex: 1 }} />
                        {t.isCustom ? <Button title="Reset to default" variant="destructive" onPress={() => confirmResetTemplate(t)} style={{ flex: 1 }} /> : null}
                      </View>
                    </View>
                  )
                ) : null}
              </Card>
            ))}
          </>
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
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  name: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600', marginTop: Spacing.xs },
  preview: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  editor: { minHeight: 220, textAlignVertical: 'top' },
  bulkEditor: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  historyRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.xs },
  wlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
});
