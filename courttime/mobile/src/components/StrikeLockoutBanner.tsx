import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StrikeLockoutStatus } from '../../../shared/utils/strikeLockout';
import {
  formatLockoutEndDate,
  strikeLockoutMessage,
  strikeWarningMessage,
} from '../../../shared/utils/strikeLockout';
import { Colors, Spacing, FontSize } from '../constants/theme';

interface StrikeLockoutBannerProps {
  status: StrikeLockoutStatus | null;
}

export function StrikeLockoutBanner({ status }: StrikeLockoutBannerProps) {
  if (!status) return null;

  if (status.isLockedOut) {
    return (
      <View style={styles.lockoutBanner}>
        <Ionicons name="lock-closed" size={20} color={Colors.error} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lockoutTitle}>Account Locked</Text>
          <Text style={styles.lockoutMessage}>{strikeLockoutMessage(status)}</Text>
        </View>
      </View>
    );
  }

  if (status.activeStrikes > 0) {
    return (
      <View style={styles.strikeWarning}>
        <Ionicons name="warning" size={18} color={Colors.warning} />
        <Text style={styles.strikeWarningText}>{strikeWarningMessage(status)}</Text>
      </View>
    );
  }

  return null;
}

export function FacilityLockoutRow({
  facilityName,
  status,
}: {
  facilityName: string;
  status: StrikeLockoutStatus;
}) {
  const isLocked = status.isLockedOut;
  return (
    <View style={[styles.facilityRow, isLocked && styles.facilityRowLocked]}>
      <Text style={styles.facilityName}>{facilityName}</Text>
      {isLocked ? (
        <Text style={styles.facilityLocked}>
          Locked · {status.activeStrikes}/{status.threshold} strikes
          {status.lockoutEndsAt ? ` · until ${formatLockoutEndDate(status.lockoutEndsAt)}` : ''}
        </Text>
      ) : status.activeStrikes > 0 ? (
        <Text style={styles.facilityWarning}>
          {status.activeStrikes} of {status.threshold} strikes
        </Text>
      ) : (
        <Text style={styles.facilityOk}>No active strikes</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockoutBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  lockoutTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.error },
  lockoutMessage: { fontSize: FontSize.sm, color: '#7F1D1D', marginTop: 2 },
  strikeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  strikeWarningText: { flex: 1, fontSize: FontSize.sm, color: '#92400E' },
  facilityRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  facilityRowLocked: { backgroundColor: '#FEF2F2' },
  facilityName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  facilityLocked: { fontSize: FontSize.xs, color: Colors.error, marginTop: 2 },
  facilityWarning: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 2 },
  facilityOk: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
});
