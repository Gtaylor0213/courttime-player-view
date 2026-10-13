import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors, BorderRadius, Spacing, FontSize, FontFamily, TouchTarget } from '../constants/theme';

interface InputProps extends TextInputProps {
  hasError?: boolean;
}

export function Input({ style, hasError = false, placeholderTextColor, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      placeholderTextColor={placeholderTextColor || Colors.textMuted}
      style={[styles.input, focused && styles.focused, hasError && styles.error, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TouchTarget.min,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md, // web: rounded-md
    backgroundColor: Colors.inputBackground,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  // web: focus-visible:border-ring
  focused: {
    borderColor: Colors.ring,
  },
  error: {
    borderColor: Colors.destructive,
  },
});
