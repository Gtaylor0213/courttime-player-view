import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../constants/theme';

/** Book tab notice when the selected date is fully or partly past the days-in-advance cutoff. */
export function BookingWindowBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="information-circle" size={18} color={Colors.warning} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
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
  text: { flex: 1, fontSize: FontSize.sm, color: '#92400E' },
});
