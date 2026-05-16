import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { Card } from './Card';
import { Input } from './Input';
import { Button } from './Button';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { showAlert } from '../utils/alert';
import {
  type AdminLockoutMember,
  filterMembersBySearch,
  parseLockoutAmountCents,
  paymentLockBadgeLabel,
} from '../utils/adminPaymentLockout';

type LockTarget = Pick<AdminLockoutMember, 'userId' | 'fullName' | 'email'>;

type Props = {
  facilityId: string | null | undefined;
  members: AdminLockoutMember[];
  stripeConnected: boolean;
  onChanged: () => Promise<void>;
};

const LIST_LIMIT = 50;

export function AdminPaymentLockoutCard({
  facilityId,
  members,
  stripeConnected,
  onChanged,
}: Props) {
  const [search, setSearch] = useState('');
  const [lockTarget, setLockTarget] = useState<LockTarget | null>(null);
  const [amountDollars, setAmountDollars] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterMembersBySearch(members, search).slice(0, LIST_LIMIT),
    [members, search]
  );

  const closeLockModal = useCallback(() => {
    setLockTarget(null);
    setAmountDollars('');
    setDescription('');
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!lockTarget) {
      setAmountDollars('');
      setDescription('');
      setSubmitting(false);
    }
  }, [lockTarget]);

  const openLockModal = (member: AdminLockoutMember) => {
    if (!stripeConnected) {
      showAlert(
        'Stripe required',
        'Complete Stripe Connect setup under Facility Management → Payments before members can pay to unlock.'
      );
      return;
    }
    setLockTarget({
      userId: member.userId,
      fullName: member.fullName,
      email: member.email,
    });
  };

  const handlePaymentLockAction = (member: AdminLockoutMember) => {
    if (member.isPaymentLocked) {
      showAlert(
        'Clear payment lockout?',
        `Clear payment lockout for ${member.fullName}? They will regain app access immediately.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear lockout',
            style: 'destructive',
            onPress: () => void clearPaymentLockout(member.userId, member.fullName),
          },
        ]
      );
    } else {
      openLockModal(member);
    }
  };

  const clearPaymentLockout = async (userId: string, memberName: string) => {
    if (!facilityId) return;
    setActionUserId(userId);
    const res = await api.put(`/api/members/${facilityId}/${userId}/payment-lockout`, {
      isPaymentLocked: false,
    });
    setActionUserId(null);
    if (res.success) {
      showAlert('Lockout cleared', `${memberName} can now access the app.`);
      await onChanged();
    } else {
      showAlert('Failed', res.error || 'Could not clear payment lockout.');
    }
  };

  const submitLock = async () => {
    if (!facilityId || !lockTarget) return;
    const parsed = parseLockoutAmountCents(amountDollars);
    if (!parsed.ok) {
      showAlert('Invalid amount', parsed.message);
      return;
    }

    setSubmitting(true);
    const res = await api.post(
      `/api/members/${facilityId}/${lockTarget.userId}/lockout-payment`,
      {
        amountCents: parsed.cents,
        description: description.trim() || 'Account balance due',
      }
    );
    setSubmitting(false);

    if (res.success) {
      showAlert(
        'Member locked',
        `${lockTarget.fullName} will be prompted to pay before accessing the app.`
      );
      closeLockModal();
      await onChanged();
    } else {
      showAlert('Failed', res.error || 'Could not lock member.');
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.cardTitle}>Payment lockout</Text>
            <Text style={styles.cardSubtitle}>Search a member to lock or unlock app access</Text>
          </View>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed-outline" size={22} color={Colors.error} />
          </View>
        </View>

        {!stripeConnected && (
          <View style={styles.stripeWarning}>
            <Ionicons name="warning-outline" size={18} color={Colors.warning} />
            <Text style={styles.stripeWarningText}>
              Stripe Connect must be set up on web (Facility Management → Payments) before you can
              lock members and require payment.
            </Text>
          </View>
        )}

        <Text style={styles.label}>Search members</Text>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Name or email"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {members.length === 0 ? 'No members loaded.' : 'No members match your search.'}
          </Text>
        ) : (
          <View style={styles.list}>
            {filtered.map((member) => {
              const badge = paymentLockBadgeLabel(member);
              const busy = actionUserId === member.userId;
              return (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.memberMain}>
                    <Text style={styles.memberName}>{member.fullName}</Text>
                    {member.email ? (
                      <Text style={styles.memberEmail}>{member.email}</Text>
                    ) : null}
                    {badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.lockBtn,
                      member.isPaymentLocked && styles.lockBtnClear,
                    ]}
                    onPress={() => handlePaymentLockAction(member)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      member.isPaymentLocked
                        ? `Clear payment lockout for ${member.fullName}`
                        : `Lock and require payment for ${member.fullName}`
                    }
                  >
                    {busy ? (
                      <ActivityIndicator
                        size="small"
                        color={member.isPaymentLocked ? Colors.error : Colors.primary}
                      />
                    ) : (
                      <Ionicons
                        name={member.isPaymentLocked ? 'lock-open-outline' : 'lock-closed-outline'}
                        size={20}
                        color={member.isPaymentLocked ? Colors.error : Colors.textSecondary}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {search.trim() && filterMembersBySearch(members, search).length > LIST_LIMIT ? (
          <Text style={styles.limitHint}>Showing first {LIST_LIMIT} matches. Refine your search.</Text>
        ) : null}
      </Card>

      <Modal
        visible={lockTarget !== null}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={closeLockModal}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Lock member & require payment</Text>
              <TouchableOpacity onPress={closeLockModal} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {lockTarget ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.sheetDesc}>
                  <Text style={styles.sheetDescBold}>{lockTarget.fullName}</Text>
                  {lockTarget.email ? ` (${lockTarget.email})` : ''} will be blocked from the app
                  until they pay via Stripe.
                </Text>

                <Text style={styles.label}>Amount owed (USD)</Text>
                <Input
                  value={amountDollars}
                  onChangeText={setAmountDollars}
                  placeholder="25.00"
                  keyboardType="decimal-pad"
                  editable={!submitting}
                />

                <Text style={styles.label}>Description (optional)</Text>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Court damage fee"
                  editable={!submitting}
                />

                <View style={styles.sheetActions}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={closeLockModal}
                    disabled={submitting}
                    style={styles.sheetBtn}
                  />
                  <Button
                    title={submitting ? 'Locking…' : 'Lock & require payment'}
                    variant="destructive"
                    onPress={() => void submitLock()}
                    loading={submitting}
                    disabled={submitting}
                    leftIcon={<Ionicons name="lock-closed" size={16} color="#fff" />}
                    style={styles.sheetBtn}
                  />
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerText: { flex: 1, paddingRight: Spacing.sm },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.error + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  stripeWarning: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '18',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stripeWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  list: { marginTop: Spacing.sm, gap: Spacing.xs },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  memberMain: { flex: 1, paddingRight: Spacing.sm },
  memberName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  memberEmail: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.error + '66',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '600', color: Colors.error },
  lockBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  lockBtnClear: {
    borderColor: Colors.error + '44',
    backgroundColor: Colors.error + '10',
  },
  limitHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, flex: 1 },
  sheetDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  sheetDescBold: { fontWeight: '700', color: Colors.text },
  sheetActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  sheetBtn: { flex: 1 },
});
