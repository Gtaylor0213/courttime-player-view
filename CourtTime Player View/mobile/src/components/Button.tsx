import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  type AccessibilityProps,
} from 'react-native';
import { Colors, BorderRadius, Spacing, FontSize, FontFamily, TouchTarget } from '../constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'warning';

interface ButtonProps extends Pick<AccessibilityProps, 'accessibilityLabel' | 'testID'> {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Shown to the left of the title when not loading */
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
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
    minHeight: TouchTarget.min,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: Colors.border,
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
  },
  primaryText: {
    color: Colors.textInverse,
  },
  secondaryText: {
    color: Colors.text,
  },
  warningText: {
    color: Colors.textInverse,
  },
});
