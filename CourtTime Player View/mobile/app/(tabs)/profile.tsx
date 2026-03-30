/**
 * Profile Tab
 * View and edit player profile, preferences, and logout
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { PlayerProfile, BookingWithDetails } from '../../src/types/database';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [bookingCount, setBookingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const [profileRes, bookingsRes] = await Promise.all([
      api.get(`/api/player-profile/${user.id}`),
      api.get(`/api/bookings/user/${user.id}`),
    ]);

    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data);
    }
    if (bookingsRes.success && bookingsRes.data) {
      const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : bookingsRes.data.bookings || [];
      setBookingCount(bookings.length);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  function handleLogout() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarText}>{getInitials()}</Text>
        </View>
        <Text style={styles.name}>{user?.fullName || `${user?.firstName} ${user?.lastName}`}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {profile?.skillLevel && (
          <View style={styles.skillBadge}>
            <Text style={styles.skillText}>{profile.skillLevel}</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{bookingCount}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{profile?.ustaRating || '-'}</Text>
          <Text style={styles.statLabel}>USTA Rating</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{profile?.skillLevel?.[0] || '-'}</Text>
          <Text style={styles.statLabel}>Level</Text>
        </View>
      </View>

      {/* Bio */}
      {profile?.bio && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{profile.bio}</Text>
        </View>
      )}

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailCard}>
          {user?.phone && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>{user.phone}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Member since</Text>
            <Text style={styles.detailValue}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* Admin Note */}
      {user?.userType === 'admin' && (
        <View style={styles.adminNote}>
          <Text style={styles.adminNoteText}>
            You have admin access. Use the web app to manage your facility.
          </Text>
        </View>
      )}

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.card,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: {
    color: Colors.textInverse,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  email: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  skillBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  skillText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  bioText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  detailCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  adminNote: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
  },
  adminNoteText: {
    fontSize: FontSize.sm,
    color: Colors.info,
  },
  logoutButton: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  logoutText: {
    color: Colors.error,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
