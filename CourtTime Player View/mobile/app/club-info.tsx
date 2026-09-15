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
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { useAuth } from '../src/contexts/AuthContext';
import { useFeatureFlags } from '../src/contexts/FeatureFlagContext';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  getClubInfoRuleRows,
  getPeakHoursSlotDisplays,
  parseBookingRules,
} from '../../shared/utils/clubInfoRules';
import { htmlToDisplayText } from '../src/utils/htmlToText';
import { OperatingHoursCard } from '../src/components/OperatingHoursCard';
import { EmptyState } from '../src/components/EmptyState';
import { CardSkeleton } from '../src/components/LoadingSkeleton';
import {
  courtScheduleRowsToOperatingHoursMap,
  groupOperatingHoursForCompactDisplay,
  type OperatingHoursMap,
} from '../../shared/utils/operatingHours';

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
  /** Plain text or HTML, authored in the General Rules admin editor. */
  generalRules?: string;
  /** Stored as an object or a JSON string — see parseBookingRules. */
  bookingRules?: unknown;
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

function CourtWeeklyHours({ hours }: { hours: OperatingHoursMap }) {
  if (!hours || Object.keys(hours).length === 0) {
    return <Text style={styles.courtHoursEmpty}>Hours not available</Text>;
  }
  const groups = groupOperatingHoursForCompactDisplay(hours, 'full');
  return (
    <View style={styles.courtHoursBlock}>
      <Text style={styles.courtHoursTitle}>Court Hours</Text>
      {groups.map((row, idx) => (
        <View key={`${row.dayRangeLabel}-${idx}`} style={styles.courtHoursRow}>
          <Text style={styles.courtHoursDay}>{row.dayRangeLabel}</Text>
          <Text style={row.closed ? styles.courtHoursClosed : styles.courtHoursTime}>
            {row.hoursLabel}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function ClubInfoScreen() {
  const router = useRouter();
  const { facilityId: routeFacilityId } = useLocalSearchParams<{ facilityId: string }>();
  const { user, facilityId: authFacilityId, isLoading: authLoading } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const resolvedFacilityId = routeFacilityId || authFacilityId || null;
  const [facility, setFacility] = useState<FacilityData | null>(null);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [courtOperatingHours, setCourtOperatingHours] = useState<Record<string, OperatingHoursMap>>({});
  const [courtHoursLoading, setCourtHoursLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadCourtOperatingHours = useCallback(async (courtList: CourtData[]) => {
    if (!courtList.length) {
      setCourtOperatingHours({});
      return;
    }
    setCourtHoursLoading(true);
    try {
      const results = await Promise.all(
        courtList.map(async (court) => {
          try {
            const res = await api.get(`/api/court-config/${court.id}/schedule`);
            const schedule = (res.data as { schedule?: unknown })?.schedule;
            if (res.success && Array.isArray(schedule)) {
              return {
                courtId: court.id,
                hours: courtScheduleRowsToOperatingHoursMap(schedule),
              };
            }
          } catch {
            /* omit on failure */
          }
          return { courtId: court.id, hours: {} as OperatingHoursMap };
        })
      );
      const byCourtId: Record<string, OperatingHoursMap> = {};
      results.forEach(({ courtId, hours }) => {
        byCourtId[courtId] = hours;
      });
      setCourtOperatingHours(byCourtId);
    } finally {
      setCourtHoursLoading(false);
    }
  }, []);

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
      await loadCourtOperatingHours(list);
    } else {
      setCourts([]);
      setCourtOperatingHours({});
    }
    setLoading(false);
  }, [resolvedFacilityId, loadCourtOperatingHours]);

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
        <View style={styles.loadingWrap}>
          <CardSkeleton count={4} />
        </View>
      </>
    );
  }

  if (!resolvedFacilityId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Club Info', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
        <EmptyState
          icon="business-outline"
          title="You're not a member of a club yet"
          description="Join a club to view contact details, courts, and operating hours."
          actionLabel="Find a Club"
          onAction={() => router.push('/(tabs)/profile')}
        />
      </>
    );
  }

  if (!facility) {
    return (
      <>
        <Stack.Screen options={{ title: 'Club Info', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.textInverse }} />
        <EmptyState
          icon={notFound ? 'search-outline' : 'alert-circle-outline'}
          title={notFound ? 'No facility found' : 'Could not load club info'}
          description={
            notFound
              ? 'This facility link may be invalid or you may not have access.'
              : 'Pull to refresh or try again later.'
          }
        />
      </>
    );
  }

  const address = [facility.streetAddress, facility.city, facility.state, facility.zipCode].filter(Boolean).join(', ');
  // Booking rules are members-only on web; match that here.
  const isMember =
    (user?.memberFacilities?.includes(facility.id) ?? false) ||
    (user?.adminFacilities?.includes(facility.id) ?? false);
  const generalRulesEnabled = isFeatureEnabled(FEATURE_FLAGS.GENERAL_RULES);
  const bookingRules = parseBookingRules(facility.bookingRules);
  const ruleRows = getClubInfoRuleRows(bookingRules);
  const peakHoursSlots = bookingRules?.hasPeakHours
    ? getPeakHoursSlotDisplays(bookingRules.peakHoursSlots)
    : [];

  const canViewClubDescription = Boolean(
    resolvedFacilityId &&
      user &&
      (user.adminFacilities?.includes(resolvedFacilityId) ||
        user.memberFacilities?.includes(resolvedFacilityId))
  );

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
          {canViewClubDescription ? (
            facility.description ? (
              <Text style={styles.description}>{facility.description}</Text>
            ) : null
          ) : (
            <Text style={styles.descriptionPlaceholder}>Join this facility to view the club description</Text>
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

        {/* Booking Rules & Policies — members only, as on web */}
        {isMember && (bookingRules || facility.generalRules) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Booking Rules &amp; Policies</Text>
            <View style={styles.card}>
              {facility.generalRules && generalRulesEnabled ? (
                <View style={styles.generalRulesBox}>
                  <Text style={styles.generalRulesText}>
                    {htmlToDisplayText(facility.generalRules)}
                  </Text>
                </View>
              ) : null}

              {ruleRows.map((row) => (
                <View key={row.label} style={styles.ruleRow}>
                  <Text style={styles.ruleLabel}>{row.label}:</Text>
                  <Text style={styles.ruleValue}>{row.value}</Text>
                </View>
              ))}

              {peakHoursSlots.length > 0 ? (
                <View style={styles.peakSection}>
                  <Text style={styles.ruleLabel}>Peak Hours</Text>
                  {peakHoursSlots.map((slot, idx) => (
                    <View key={`${slot.heading}-${idx}`} style={styles.peakSlot}>
                      <Text style={styles.peakHeading}>{slot.heading}</Text>
                      {slot.details.map((detail) => (
                        <Text key={detail} style={styles.peakDetail}>
                          {detail}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}

              {ruleRows.length === 0 && peakHoursSlots.length === 0 && !facility.generalRules ? (
                <Text style={styles.rulesEmpty}>
                  No booking rules have been configured for this facility.
                </Text>
              ) : null}
            </View>
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
                  {courtHoursLoading ? (
                    <Text style={styles.courtHoursLoading}>Loading hours...</Text>
                  ) : (
                    <CourtWeeklyHours hours={courtOperatingHours[court.id] || {}} />
                  )}
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
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  facilityType: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontFamily: FontFamily.semiBold,
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
  descriptionPlaceholder: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
  generalRulesBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  generalRulesText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 21,
  },
  ruleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  ruleLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  ruleValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  peakSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  peakSlot: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: 2,
  },
  peakHeading: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  peakDetail: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  rulesEmpty: {
    padding: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingTop: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    minHeight: TouchTarget.min,
  },
  contactText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  courtMeta: {
    flexDirection: 'row',
    marginTop: 2,
  },
  courtMetaText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: Spacing.sm,
  },
  courtHoursBlock: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  courtHoursTitle: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  courtHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  courtHoursDay: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    flexShrink: 1,
    marginRight: Spacing.sm,
  },
  courtHoursTime: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  courtHoursClosed: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
  },
  courtHoursEmpty: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  courtHoursLoading: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
