import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, Palette, BorderRadius } from '../constants/theme';

/** Book tab notice when the selected date is fully or partly past the days-in-advance cutoff. */
export function BookingWindowBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="information-circle-outline" size={18} color={Colors.warning} />
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
    backgroundColor: Palette.amber50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Palette.amber200,
  },
  text: { flex: 1, fontSize: FontSize.sm, color: Palette.amber900 },
});
