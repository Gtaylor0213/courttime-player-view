/**
 * Admin hub: a menu of dedicated admin screens (mirrors the More tab's pattern).
 */
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Admin');

const ADMIN_MENU_ITEMS = [
  {
    key: 'dashboard',
    route: '/admin/dashboard',
    icon: 'stats-chart',
    label: 'Dashboard',
    description: 'Revenue, bookings, and member activity at a glance.',
  },
  {
    key: 'bookings',
    route: '/admin/bookings',
    icon: 'calendar',
    label: 'Bookings',
    description: 'Manage reservations, or create one for a member.',
  },
  {
    key: 'members',
    route: '/admin/members',
    icon: 'people',
    label: 'Members',
    description: 'Search members, roles, strikes, and payment lockouts.',
  },
  {
    key: 'courts',
    route: '/admin/courts',
    icon: 'tennisball',
    label: 'Courts & Facility',
    description: 'Court list, schedules, and maintenance blackouts.',
  },
  {
    key: 'communication',
    route: '/admin/communication',
    icon: 'megaphone',
    label: 'Communication',
    description: 'Send an email blast or post a facility announcement.',
  },
] as const;

export default function AdminScreen() {
  const router = useRouter();
  const { user, facilityId } = useAuth();
  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={34} color={Colors.textMuted} />
        <Text style={styles.centeredTitle}>Admin Access Only</Text>
        <Text style={styles.centeredBody}>This tab is visible to facility admins only.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {ADMIN_MENU_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.row}
          onPress={() => router.push(item.route as never)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon as never} size={22} color={Colors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowDescription}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.sm },
  centeredTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  centeredBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  rowDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
