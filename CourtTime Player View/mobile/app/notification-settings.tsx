/**
 * Notification Settings Screen
 * Lets a player opt out of specific push notification categories from their device.
 *
 * Flips post immediately (optimistic) then PATCH to server. If a write fails
 * we revert and surface a toast — keeps the UI responsive without lying about
 * persistence.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showApiErrorAlert } from '../src/utils/alert';
import { api } from '../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { useAuth } from '../src/contexts/AuthContext';

export const ErrorBoundary = createRouteErrorBoundary('Notification Settings');

interface NotificationPreferences {
  emailNotificationsEnabled: boolean;
  emailBookingConfirmations: boolean;
  emailMembershipRequestAlerts: boolean;
  pushEnabled: boolean;
  pushBookingUpdates: boolean;
  pushBookingReminders: boolean;
  pushStrikes: boolean;
  pushAnnouncements: boolean;
  pushWeather: boolean;
}

interface ToggleConfig {
  key: keyof NotificationPreferences;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const CATEGORY_TOGGLES: ToggleConfig[] = [
  {
    key: 'pushBookingUpdates',
    title: 'Booking updates',
    description: 'Confirmations, cancellations, and court changes',
    icon: 'checkmark-circle-outline',
  },
  {
    key: 'pushBookingReminders',
    title: 'Booking reminders',
    description: 'Heads-up before your court time starts',
    icon: 'alarm-outline',
  },
  {
    key: 'pushAnnouncements',
    title: 'Facility announcements',
    description: 'News, events, and admin posts',
    icon: 'megaphone-outline',
  },
  {
    key: 'pushWeather',
    title: 'Weather alerts',
    description: 'Court closures or warnings due to weather',
    icon: 'thunderstorm-outline',
  },
];

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const canManageMembershipRequestEmailAlerts =
    (user?.adminFacilities?.length ?? 0) > 0 || user?.userType === 'admin';
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  async function loadPrefs() {
    setLoading(true);
    const res = await api.get('/api/user-preferences/notifications');
    if (res.success && res.data?.preferences) {
      const p = res.data.preferences;
      setPrefs({
        emailNotificationsEnabled: p.emailNotificationsEnabled !== false,
        emailBookingConfirmations: p.emailBookingConfirmations !== false,
        emailMembershipRequestAlerts: p.emailMembershipRequestAlerts !== false,
        pushEnabled: p.pushEnabled !== false,
        pushBookingUpdates: p.pushBookingUpdates !== false,
        pushBookingReminders: p.pushBookingReminders !== false,
        pushStrikes: p.pushStrikes !== false,
        pushAnnouncements: p.pushAnnouncements !== false,
        pushWeather: p.pushWeather !== false,
      });
    } else {
      showApiErrorAlert(res);
    }
    setLoading(false);
  }

  async function toggle(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return;
    // Optimistic update
    const previous = prefs[key];
    setPrefs({ ...prefs, [key]: value });

    const res = await api.patch('/api/user-preferences/notifications', { [key]: value });
    if (!res.success) {
      // Revert
      setPrefs(p => (p ? { ...p, [key]: previous } : p));
      showApiErrorAlert(res);
    } else if (res.data?.preferences) {
      setPrefs(res.data.preferences);
    }
  }

  if (loading || !prefs) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Notifications',
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: Colors.textInverse,
          }}
        />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.textInverse,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.masterRow, { marginBottom: Spacing.md }]}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>General transactional email</Text>
            <Text style={styles.rowDescription}>
              Facility messages to members and similar alerts. Strike and lockout emails are always sent.
            </Text>
          </View>
          <Switch
            value={prefs.emailNotificationsEnabled}
            onValueChange={(v) => toggle('emailNotificationsEnabled', v)}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            accessibilityLabel="General transactional email"
          />
        </View>

        <View style={[styles.masterRow, { marginBottom: Spacing.md }]}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Court booking email</Text>
            <Text style={styles.rowDescription}>
              Confirmations and cancellations when you book or release a court.
            </Text>
          </View>
          <Switch
            value={prefs.emailBookingConfirmations}
            onValueChange={(v) => toggle('emailBookingConfirmations', v)}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            accessibilityLabel="Court booking email"
          />
        </View>

        {canManageMembershipRequestEmailAlerts && (
          <View style={[styles.masterRow, { marginBottom: Spacing.md }]}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>New member requests</Text>
              <Text style={styles.rowDescription}>
                When you are a facility admin, email when a player requests to join your facility.
              </Text>
            </View>
            <Switch
              value={prefs.emailMembershipRequestAlerts}
              onValueChange={(v) => toggle('emailMembershipRequestAlerts', v)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              accessibilityLabel="New member request emails"
            />
          </View>
        )}

        {/* Master toggle */}
        <View style={styles.masterRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Push notifications</Text>
            <Text style={styles.rowDescription}>
              When off, you won't get any push alerts on this device. In-app notifications still appear in the Alerts tab.
            </Text>
          </View>
          <Switch
            value={prefs.pushEnabled}
            onValueChange={(v) => toggle('pushEnabled', v)}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            accessibilityLabel="Push notifications"
          />
        </View>

        <View style={styles.mandatoryRow}>
          <View style={styles.rowIcon}>
            <Ionicons name="warning-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Strikes & lockouts</Text>
            <Text style={styles.rowDescription}>
              Always on — issued, revoked, or account lockout warnings cannot be disabled.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Categories</Text>
        <View style={[styles.categoriesBox, !prefs.pushEnabled && styles.categoriesBoxDisabled]}>
          {CATEGORY_TOGGLES.map((cfg, idx) => (
            <View key={cfg.key}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name={cfg.icon} size={20} color={Colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{cfg.title}</Text>
                  <Text style={styles.rowDescription}>{cfg.description}</Text>
                </View>
                <Switch
                  value={prefs[cfg.key] as boolean}
                  onValueChange={(v) => toggle(cfg.key, v)}
                  disabled={!prefs.pushEnabled}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  accessibilityLabel={cfg.title}
                />
              </View>
              {idx < CATEGORY_TOGGLES.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          {canManageMembershipRequestEmailAlerts
            ? 'Strike and lockout alerts are always delivered. Other email categories are independent. Push categories only affect optional alerts on this device.'
            : 'Strike and lockout alerts are always delivered. Other email categories are independent. Push categories only affect optional alerts on this device.'}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    padding: Spacing.md,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  mandatoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  categoriesBox: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  categoriesBoxDisabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  rowDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 36 + Spacing.md,
  },
  footnote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    lineHeight: 18,
  },
});
