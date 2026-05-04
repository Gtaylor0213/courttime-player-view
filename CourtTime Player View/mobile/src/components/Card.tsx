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
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  padded: {
    padding: Spacing.md,
  },
});
