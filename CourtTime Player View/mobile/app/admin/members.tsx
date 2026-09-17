/**
 * Admin Members: search/list, roles, suspension, strikes, and payment lockout.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getFacilityMembers,
  updateMember,
  setMemberAdmin,
  setMemberSubAdmin,
  setMemberViewOnly,
  removeMember,
  getStrikesForUser,
  issueStrike,
  revokeStrike,
  type AdminMemberRow,
  type AdminStrikeRow,
  type StrikeType,
} from '../../src/api/admin';
import { parseAdminLockoutMembers } from '../../src/utils/adminPaymentLockout';
import { AdminPaymentLockoutCard } from '../../src/components/AdminPaymentLockoutCard';
import { isStripeConnectReadyFromResponse } from '../../../shared/api/core';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';

export const ErrorBoundary = createRouteErrorBoundary('Admin Members');

const SUSPEND_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Indefinite', days: null },
];

const STRIKE_TYPES: { type: StrikeType; label: string }[] = [
  { type: 'no_show', label: 'No Show' },
  { type: 'late_cancel', label: 'Late Cancellation' },
  { type: 'manual', label: 'Manual' },
];

export default function AdminMembersScreen() {
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<AdminMemberRow[]>([]);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminMemberRow | null>(null);

  const loadData = useCallback(async () => {
    if (!facilityId) return;
    const [membersRes, stripeRes] = await Promise.all([
      getFacilityMembers(facilityId),
      api.get(`/api/stripe/connect/status?clubId=${encodeURIComponent(facilityId)}`),
    ]);
    if (membersRes.success && membersRes.data) {
      setMembers(membersRes.data.members || []);
    } else {
      showApiErrorAlert(membersRes, 'Could not load members');
    }
    setStripeConnected(isStripeConnectReadyFromResponse(stripeRes));
  }, [facilityId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? members.filter((m) => m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      : members;
    return list.slice(0, 60);
  }, [members, search]);
  const lockoutMembers = useMemo(() => parseAdminLockoutMembers(members), [members]);

  // Keep the modal's member fresh after any change (e.g. after a role toggle).
  useEffect(() => {
    if (!selected) return;
    const fresh = members.find((m) => m.userId === selected.userId);
    if (fresh) setSelected(fresh);
  }, [members, selected]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Members ({members.length})</Text>
        <Input value={search} onChangeText={setSearch} placeholder="Search name or email" />
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>No members match your search.</Text>
        ) : (
          filtered.map((m) => (
            <TouchableOpacity key={m.userId} style={styles.memberRow} onPress={() => setSelected(m)}>
              <View style={styles.memberMain}>
                <Text style={styles.memberName}>{m.fullName}</Text>
                <Text style={styles.memberEmail}>{m.email}</Text>
                <View style={styles.badgeRow}>
                  <StatusBadge status={m.status} />
                  {m.isFacilityAdmin ? <Badge label="Admin" color={Colors.primary} /> : null}
                  {m.isSubAdmin ? <Badge label="Sub-Admin" color={Colors.secondary} /> : null}
                  {m.isViewOnly ? <Badge label="View-only" color={Colors.textMuted} /> : null}
                  {m.isPaymentLocked ? <Badge label="Locked" color={Colors.error} /> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </Card>

      <AdminPaymentLockoutCard
        facilityId={facilityId}
        members={lockoutMembers}
        stripeConnected={stripeConnected}
        onChanged={loadData}
      />

      <MemberDetailModal
        member={selected}
        facilityId={facilityId}
        onClose={() => setSelected(null)}
        onChanged={loadData}
      />
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active' ? Colors.success : status === 'suspended' ? Colors.error : Colors.warning;
  return <Badge label={status} color={color} />;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function MemberDetailModal({
  member,
  facilityId,
  onClose,
  onChanged,
}: {
  member: AdminMemberRow | null;
  facilityId: string | null | undefined;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [strikes, setStrikes] = useState<AdminStrikeRow[]>([]);
  const [strikeType, setStrikeType] = useState<StrikeType>('manual');
  const [strikeReason, setStrikeReason] = useState('');

  useEffect(() => {
    if (!member || !facilityId) {
      setStrikes([]);
      return;
    }
    void (async () => {
      const res = await getStrikesForUser(facilityId, member.userId);
      if (res.success && res.data) setStrikes(res.data.strikes || []);
    })();
  }, [member, facilityId]);

  if (!member || !facilityId) return null;

  async function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.success) {
      showAlert('Failed', res.error || 'Something went wrong.');
      return false;
    }
    await onChanged();
    return true;
  }

  const suspend = (days: number | null) =>
    run(async () => {
      const suspendedUntil = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
      return updateMember(facilityId, member.userId, { status: 'suspended', suspendedUntil });
    });

  const reactivate = () =>
    run(() => updateMember(facilityId, member.userId, { status: 'active', suspendedUntil: null }));

  const approve = () => run(() => updateMember(facilityId, member.userId, { status: 'active' }));

  const toggleAdmin = () => run(() => setMemberAdmin(facilityId, member.userId, !member.isFacilityAdmin));
  const toggleSubAdmin = () => run(() => setMemberSubAdmin(facilityId, member.userId, !member.isSubAdmin));
  const toggleViewOnly = () => run(() => setMemberViewOnly(facilityId, member.userId, !member.isViewOnly));

  const doRemove = () =>
    showAlert('Remove member?', `Remove ${member.fullName} from this facility?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void run(() => removeMember(facilityId, member.userId)).then((ok) => {
            if (ok) onClose();
          }),
      },
    ]);

  const doIssueStrike = () =>
    run(async () => {
      const res = await issueStrike(facilityId, member.userId, strikeType, strikeReason.trim());
      if (res.success) {
        setStrikeReason('');
        const refreshed = await getStrikesForUser(facilityId, member.userId);
        if (refreshed.success && refreshed.data) setStrikes(refreshed.data.strikes || []);
      }
      return res;
    });

  const doRevoke = (strikeId: string) =>
    run(async () => {
      const res = await revokeStrike(strikeId, 'Revoked by admin');
      if (res.success) {
        const refreshed = await getStrikesForUser(facilityId, member.userId);
        if (refreshed.success && refreshed.data) setStrikes(refreshed.data.strikes || []);
      }
      return res;
    });

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{member.fullName}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetDesc}>{member.email}</Text>

            <View style={styles.badgeRow}>
              <StatusBadge status={member.status} />
              {member.isFacilityAdmin ? <Badge label="Admin" color={Colors.primary} /> : null}
              {member.isSubAdmin ? <Badge label="Sub-Admin" color={Colors.secondary} /> : null}
              {member.isViewOnly ? <Badge label="View-only" color={Colors.textMuted} /> : null}
            </View>

            <Text style={styles.sectionLabel}>Membership</Text>
            <View style={styles.actionGrid}>
              {member.status === 'pending' ? (
                <Button title="Approve" onPress={approve} loading={busy} style={styles.gridBtn} />
              ) : null}
              {member.status === 'suspended' ? (
                <Button title="Reactivate" onPress={reactivate} loading={busy} style={styles.gridBtn} />
              ) : null}
            </View>
            {member.status !== 'suspended' ? (
              <>
                <Text style={styles.label}>Suspend for</Text>
                <View style={styles.chipsWrap}>
                  {SUSPEND_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={styles.chip}
                      disabled={busy}
                      onPress={() => void suspend(opt.days)}
                    >
                      <Text style={styles.chipText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Roles</Text>
            <View style={styles.actionGrid}>
              <Button
                title={member.isFacilityAdmin ? 'Remove Admin' : 'Make Admin'}
                variant="secondary"
                onPress={toggleAdmin}
                loading={busy}
                style={styles.gridBtn}
              />
              <Button
                title={member.isSubAdmin ? 'Remove Sub-Admin' : 'Make Sub-Admin'}
                variant="secondary"
                onPress={toggleSubAdmin}
                loading={busy}
                style={styles.gridBtn}
              />
              <Button
                title={member.isViewOnly ? 'Remove View-only' : 'Set View-only'}
                variant="secondary"
                onPress={toggleViewOnly}
                loading={busy}
                style={styles.gridBtn}
              />
            </View>

            <Text style={styles.sectionLabel}>Strikes</Text>
            {strikes.length === 0 ? (
              <Text style={styles.emptyText}>No strikes on record.</Text>
            ) : (
              strikes.map((s) => (
                <View key={s.id} style={styles.strikeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strikeType}>
                      {s.strike_type} {s.revoked ? '(revoked)' : ''}
                    </Text>
                    {s.strike_reason ? <Text style={styles.strikeReason}>{s.strike_reason}</Text> : null}
                  </View>
                  {!s.revoked ? (
                    <TouchableOpacity disabled={busy} onPress={() => void doRevoke(s.id)}>
                      <Text style={styles.actionCancel}>Revoke</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
            <Text style={styles.label}>Issue a strike</Text>
            <View style={styles.chipsWrap}>
              {STRIKE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.type}
                  style={[styles.chip, strikeType === t.type && styles.chipSelected]}
                  onPress={() => setStrikeType(t.type)}
                >
                  <Text style={[styles.chipText, strikeType === t.type && styles.chipTextSelected]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Input value={strikeReason} onChangeText={setStrikeReason} placeholder="Reason (optional)" />
            <Button title="Issue Strike" variant="warning" onPress={doIssueStrike} loading={busy} style={{ marginTop: Spacing.sm }} />

            <Text style={styles.sectionLabel}>Danger zone</Text>
            <Button title="Remove from facility" variant="destructive" onPress={doRemove} loading={busy} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  memberMain: { flex: 1 },
  memberName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  memberEmail: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.md,
    maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  sheetDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
  gridBtn: { flexGrow: 1 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  strikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  strikeType: { fontSize: FontSize.sm, color: Colors.text, textTransform: 'capitalize', fontWeight: '600' },
  strikeReason: { fontSize: FontSize.xs, color: Colors.textSecondary },
  actionCancel: { fontSize: FontSize.xs, color: Colors.error, fontWeight: '700' },
});
