import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../constants/theme';

/** Shown on the Book tab when the selected date is past the club's days-in-advance window. */
export function BookingWindowBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="information-circle" size={18} color={Colors.warning} />
      <Text style={styles.text}>This date isn't open for booking yet. {message}</Text>
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
