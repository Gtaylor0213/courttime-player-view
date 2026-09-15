/**
 * Member number gate.
 *
 * Facilities with the `member_number` flag on require a member number before
 * the player can continue. Mirrors web's `MemberNumberDialog`, which
 * `CourtCalendarView` shows as a mandatory, non-dismissible dialog — mobile
 * had no equivalent, so members at those clubs were never asked.
 *
 * Deliberately not dismissible: there is no cancel, and the Android back
 * button is a no-op. The only way past it is to supply a number.
 */

import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { memberEndpoints } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { FEATURE_FLAGS } from '../../../shared/constants/featureFlags';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { Button } from './Button';
import { Input } from './Input';

/**
 * Whether this member still owes a member number for the selected facility.
 * Exported for tests — the same four conditions web checks.
 */
export function needsMemberNumber(params: {
  userType?: string;
  facilityId: string | null;
  flagEnabled: boolean;
  memberNumbers?: Record<string, string>;
}): boolean {
  const { userType, facilityId, flagEnabled, memberNumbers } = params;
  if (userType !== 'player') return false;
  if (!facilityId) return false;
  if (!flagEnabled) return false;
  return !memberNumbers?.[facilityId];
}

export function MemberNumberGate() {
  const { user, facilityId, facilities, updateUser } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const [memberNumber, setMemberNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = needsMemberNumber({
    userType: user?.userType,
    facilityId,
    flagEnabled: isFeatureEnabled(FEATURE_FLAGS.MEMBER_NUMBER),
    memberNumbers: user?.memberNumbers,
  });

  if (!required || !facilityId) return null;

  const facilityName = facilities?.find((f) => f.id === facilityId)?.name;

  const handleSubmit = async () => {
    const trimmed = memberNumber.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await memberEndpoints.saveMyMemberNumber(facilityId, trimmed);
    setSubmitting(false);

    if (res.success) {
      await updateUser({
        memberNumbers: { ...(user?.memberNumbers || {}), [facilityId]: trimmed },
      });
      setMemberNumber('');
    } else {
      setError(res.error || 'Could not save your member number. Please try again.');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { /* mandatory */ }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Member Number Required</Text>
          <Text style={styles.subtitle}>
            {facilityName ? `${facilityName} requires` : 'This club requires'} your member number
            before you can continue.
          </Text>

          <Text style={styles.label}>Member Number</Text>
          <Input
            value={memberNumber}
            onChangeText={setMemberNumber}
            placeholder="Enter your member number"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            hasError={Boolean(error)}
            accessibilityLabel="Member number"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={submitting ? 'Saving…' : 'Save & Continue'}
            onPress={handleSubmit}
            disabled={!memberNumber.trim() || submitting}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  error: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
});
