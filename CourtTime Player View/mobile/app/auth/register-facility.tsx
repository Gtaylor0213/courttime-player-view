/**
 * Register a facility — opens the full web registration wizard in the device browser.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Link, Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../src/api/client';
import { Colors, Gradients, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { useAuth } from '../../src/contexts/AuthContext';
import { showAlert } from '../../src/utils/alert';
import {
  getFacilityRegistrationUrl,
  openFacilityRegistration,
} from '../../src/utils/facilityRegistration';

export const ErrorBoundary = createRouteErrorBoundary('Register Facility');

const STEPS = [
  'Create or sign in to your admin account',
  'Enter facility details, courts, and booking rules',
  'Complete subscription payment (if required)',
];

export default function RegisterFacilityScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const registrationUrl = useMemo(
    () => getFacilityRegistrationUrl(API_BASE_URL, process.env.EXPO_PUBLIC_WEB_URL),
    []
  );
  const [opening, setOpening] = useState(false);

  const handleContinue = useCallback(async () => {
    setOpening(true);
    const opened = await openFacilityRegistration(registrationUrl);
    setOpening(false);

    if (!opened) {
      showAlert(
        'Could not open browser',
        'Please open this link in Safari or Chrome:\n\n' + registrationUrl
      );
    }
  }, [registrationUrl]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Register Facility', headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={[...Gradients.login]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
                return;
              }
              router.replace(isAuthenticated ? '/(tabs)/profile' : '/auth/login');
            }}
            accessibilityRole="button"
            accessibilityLabel={isAuthenticated ? 'Go back' : 'Back to sign in'}
          >
            <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.95)" />
            <Text style={styles.backText}>
              {isAuthenticated ? 'Back' : 'Back to sign in'}
            </Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.logoCard}>
              <Image
                source={require('../../assets/splash-logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="CourtTime logo"
              />
            </View>
            <Text style={styles.title}>Register your facility</Text>
            <Text style={styles.subtitle}>
              Set up courts, booking rules, and admin access on the web — then sign in here to manage
              bookings from the app.
            </Text>
          </View>

          <Card style={styles.card}>
            <View style={styles.iconRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="business-outline" size={28} color={Colors.primary} />
              </View>
              <Text style={styles.cardTitle}>What happens next</Text>
            </View>

            {STEPS.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}

            <Button
              style={styles.primaryButton}
              title={opening ? 'Opening browser…' : 'Continue in browser'}
              onPress={handleContinue}
              disabled={opening}
            />

            <Text style={styles.hint}>
              After registration, return to this app and sign in with the admin account you created.
              {Platform.OS === 'ios' ? ' Use the app switcher to come back.' : ''}
            </Text>
          </Card>

          <View style={styles.playerFooter}>
            <Text style={styles.playerFooterText}>Looking to play as a member? </Text>
            <Link href="/auth/register" style={styles.playerLink}>
              <Text style={styles.playerLinkText}>Create a player account</Text>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#022018',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
  },
  blob1: {
    width: 280,
    height: 280,
    backgroundColor: '#4FFFB0',
    top: -80,
    right: -100,
  },
  blob2: {
    width: 220,
    height: 220,
    backgroundColor: '#0EA5E9',
    bottom: 120,
    left: -90,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  backText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
  },
  logoImage: {
    width: 200,
    height: 50,
  },
  title: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: Spacing.md,
  },
  hint: {
    marginTop: Spacing.md,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
  playerFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
  },
  playerFooterText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
  },
  playerLink: {},
  playerLinkText: {
    color: '#4FFFB0',
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
  },
});
