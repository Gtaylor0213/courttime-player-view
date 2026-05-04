/**
 * Club Info Screen
 * Displays facility details, courts, operating hours, and contact info.
 * Accessed via navigation push from Home or Profile.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { useAuth } from '../src/contexts/AuthContext';
import { OperatingHoursCard } from '../src/components/OperatingHoursCard';

export const ErrorBoundary = createRouteErrorBoundary('Club Info');

interface FacilityData {
  id: string;
  name: string;
  type?: string;
  description?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  timezone?: string;
  operatingHours?: Record<string, { open: string; close: string; closed?: boolean }>;
  memberCount?: number;
  status?: string;
}

interface CourtData {
  id: string;
  name: string;
  courtNumber?: number;
  courtType?: string;
  surfaceType?: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: string;
}

export default function ClubInfoScreen() {
  const router = useRouter();
  const { facilityId: routeFacilityId } = useLocalSearchParams<{ facilityId: string }>();
  const { facilityId: authFacilityId, isLoading: authLoading } = useAuth();
  const resolvedFacilityId = routeFacilityId || authFacilityId || null;
  const [facility, setFacility] = useState<FacilityData | null>(null);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = useCallback(async () => {
    if (!resolvedFacilityId) {
      setFacility(null);
      setCourts([]);
      setNotFound(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);

    const [facRes, courtsRes] = await Promise.all([
      api.get(`/api/facilities/${resolvedFacilityId}`),
      api.get(`/api/facilities/${resolvedFacilityId}/courts`),
    ]);

    if (facRes.success && facRes.data) {
      const fac = facRes.data.facility || facRes.data;
      setFacility(fac);
    } else {
      setFacility(null);
      setNotFound(Boolean(facRes.error?.toLowerCase().includes('not found')));
    }
    if (courtsRes.success && courtsRes.data) {
      const list = Array.isArray(courtsRes.data) ? courtsRes.data : courtsRes.data.courts || [];
      setCourts(list);
    } else {
      setCourts([]);
    }
    setLoading(false);
  }, [resolvedFacilityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const getCourtStatusColor = (status: string) => {
    switch (status) {
      case 'available': return Colors.success;
      case 'maintenance': return Colors.warning;
      case 'closed': return Colors.error;
      default: return Colors.textMuted;
    }
  };

  if (authLoading || loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Club Info', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface }}>
          <Text style={{ color: Colors.textMuted }}>Loading...</Text>
        </View>
      </>
    );
  }

  if (!resolvedFacilityId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Club Info', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>You're not a member of a club yet</Text>
          <Text style={styles.emptyStateBody}>Join a club to view contact details, courts, and operating hours.</Text>
          <TouchableOpacity style={styles.joinButton} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.joinButtonText}>Find a Club</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!facility) {
    return (
      <>
        <Stack.Screen options={{ title: 'Club Info', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface }}>
          <Text style={{ color: Colors.textMuted }}>{notFound ? 'No facility found' : 'Could not load club info'}</Text>
        </View>
      </>
    );
  }

  const address = [facility.streetAddress, facility.city, facility.state, facility.zipCode].filter(Boolean).join(', ');

  return (
    <>
      <Stack.Screen options={{ title: facility.name, headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.facilityName}>{facility.name}</Text>
          {facility.type && <Text style={styles.facilityType}>{facility.type}</Text>}
          {facility.description && (
            <Text style={styles.description}>{facility.description}</Text>
          )}
        </View>

        {/* Contact & Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.card}>
            {address && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`)}
              >
                <Ionicons name="location-outline" size={18} color={Colors.primary} />
                <Text style={styles.contactText}>{address}</Text>
                <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            {facility.phone && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`tel:${facility.phone}`)}
              >
                <Ionicons name="call-outline" size={18} color={Colors.primary} />
                <Text style={styles.contactText}>{facility.phone}</Text>
              </TouchableOpacity>
            )}
            {facility.email && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`mailto:${facility.email}`)}
              >
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                <Text style={styles.contactText}>{facility.email}</Text>
              </TouchableOpacity>
            )}
            {facility.website && (
              <TouchableOpacity
                style={[styles.contactRow, { borderBottomWidth: 0 }]}
                onPress={() => Linking.openURL(facility.website!.startsWith('http') ? facility.website! : `https://${facility.website}`)}
              >
                <Ionicons name="globe-outline" size={18} color={Colors.primary} />
                <Text style={styles.contactText}>{facility.website}</Text>
                <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Operating Hours */}
        {facility.operatingHours && Object.keys(facility.operatingHours).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operating Hours</Text>
            <OperatingHoursCard operatingHours={facility.operatingHours as any} timezone={facility.timezone} />
          </View>
        )}

        {/* Courts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Courts ({courts.length})</Text>
          {courts.length === 0 ? (
            <View style={styles.card}>
              <Text style={{ padding: Spacing.md, color: Colors.textMuted, textAlign: 'center', fontSize: FontSize.sm }}>
                No courts listed
              </Text>
            </View>
          ) : (
            courts.map((court) => (
              <View key={court.id} style={styles.courtCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courtName}>{court.name}</Text>
                  <View style={styles.courtMeta}>
                    <Text style={styles.courtMetaText}>{court.courtType || 'Tennis'}</Text>
                    {court.surfaceType && (
                      <Text style={styles.courtMetaText}> · {court.surfaceType}</Text>
                    )}
                    {court.isIndoor && (
                      <Text style={styles.courtMetaText}> · Indoor</Text>
                    )}
                    {court.hasLights && (
                      <Text style={styles.courtMetaText}> · Lights</Text>
                    )}
                  </View>
                </View>
                <View style={[styles.statusDot, { backgroundColor: getCourtStatusColor(court.status) }]} />
              </View>
            ))
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  facilityName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  facilityType: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.sm,
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
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  contactText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  courtCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  courtName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  courtMeta: {
    flexDirection: 'row',
    marginTop: 2,
  },
  courtMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
  },
  emptyStateTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptyStateBody: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  joinButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
  joinButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
