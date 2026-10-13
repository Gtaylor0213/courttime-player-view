import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { Colors, BorderRadius, Shadows, Spacing } from '../constants/theme';

interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ style, padded = true, ...props }: CardProps) {
  return (
    <View
      {...props}
      style={[styles.card, padded && styles.padded, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl, // web: rounded-xl
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm, // web: shadow-sm
  },
  padded: {
    padding: Spacing.md,
  },
});
