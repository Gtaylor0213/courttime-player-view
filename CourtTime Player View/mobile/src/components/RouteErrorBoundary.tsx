import type { ErrorBoundaryProps } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export function createRouteErrorBoundary(screenLabel: string) {
  return function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
    console.error(`[${screenLabel}] route crashed`, error);

    const reportIssue = async () => {
      const subject = encodeURIComponent(`Mobile crash report: ${screenLabel}`);
      const body = encodeURIComponent(
        [
          'A route crash occurred in the mobile app.',
          '',
          `Screen: ${screenLabel}`,
          `Platform: ${Platform.OS}`,
          `Error: ${error?.name ?? 'Error'}: ${error?.message ?? 'Unknown message'}`,
          '',
          'Stack trace:',
          error?.stack ?? 'No stack trace available.',
        ].join('\n')
      );

      const mailtoUrl = `mailto:reidbissell@courttimeapp.com?subject=${subject}&body=${body}`;
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (!canOpen) {
        return;
      }

      await Linking.openURL(mailtoUrl);
    };

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {screenLabel} crashed. You can retry this screen without restarting the app.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={reportIssue}>
              <Text style={styles.secondaryButtonText}>Report issue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    gap: Spacing.sm,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
