import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

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
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    elevation: 2,
  },
  padded: {
    padding: Spacing.md,
  },
});
