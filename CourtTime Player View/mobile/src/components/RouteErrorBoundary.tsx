import type { ErrorBoundaryProps } from 'expo-router';
import { View, Text, StyleSheet, Linking, Platform } from 'react-native';
import { Colors, Spacing, FontSize, FontFamily } from '../constants/theme';
import { Card } from './Card';
import { Button } from './Button';

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
        <Card style={styles.card} padded>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {screenLabel} crashed. You can retry this screen without restarting the app.
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" title="Report issue" onPress={reportIssue} />
            <Button title="Retry" onPress={retry} />
          </View>
        </Card>
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
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  message: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    gap: Spacing.sm,
  },
});
