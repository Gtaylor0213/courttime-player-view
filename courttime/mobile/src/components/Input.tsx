import React from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors, BorderRadius, Spacing, FontSize, FontFamily, TouchTarget } from '../constants/theme';

interface InputProps extends TextInputProps {
  hasError?: boolean;
}

export function Input({ style, hasError = false, placeholderTextColor, ...props }: InputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={placeholderTextColor || Colors.textMuted}
      style={[styles.input, hasError && styles.error, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TouchTarget.min,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.inputBackground,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  error: {
    borderColor: Colors.destructive,
  },
});
