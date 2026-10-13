import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, BorderRadius, Spacing, FontSize, FontFamily, Shadows, TouchTarget } from '../constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'warning';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Shown to the left of the title when not loading */
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leftIcon,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const isSecondary = variant === 'secondary';
  const isWarning = variant === 'warning';
  const spinnerColor =
    isSecondary ? Colors.primary : Colors.textInverse;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'destructive' && styles.destructive,
        isWarning && styles.warning,
        pressed && !disabled && !loading && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon}
          <Text
            style={[
              styles.text,
              isSecondary ? styles.secondaryText : styles.primaryText,
              isWarning && styles.warningText,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // Taller than the web button (h-9): 44px+ touch target on a phone.
    minHeight: TouchTarget.min,
    borderRadius: BorderRadius.md, // web: rounded-md
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm, // web: shadow-sm
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  // web: bg-secondary text-secondary-foreground, no border
  secondary: {
    backgroundColor: Colors.secondary,
  },
  destructive: {
    backgroundColor: Colors.destructive,
  },
  warning: {
    backgroundColor: Colors.warning,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  // web: hover:bg-primary/90
  pressed: {
    opacity: 0.9,
  },
  // web: disabled:opacity-50
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.medium, // web: font-medium
  },
  primaryText: {
    color: Colors.textInverse,
  },
  secondaryText: {
    color: Colors.secondaryForeground,
  },
  warningText: {
    color: Colors.textInverse,
  },
});
